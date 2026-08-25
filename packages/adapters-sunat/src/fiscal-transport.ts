/**
 * FiscalTransport — puerto PSE/OSE (ADR-FISCAL-002 / §8.1).
 */
import type { CdrEnvelope, CPEInvoiceDTO } from '@kipuspay/domain-fiscal-pe';
import { assertCpeInvoiceDto } from '@kipuspay/domain-fiscal-pe';
import { classifySunatResponse, type SunatOutcome } from './classify-sunat.js';
import { classifyFiscalError, type FiscalErrorClass } from './fiscal-error.js';

export type FiscalTransportMode =
  | 'KIPUSPAY_PSE_DIRECT'
  | 'MOCK_STAGING'
  | 'MISCONFIGURED'
  | 'ose_generic'
  | 'pse_third_party'
  | 'sunat_bill_beta'
  | 'sunat_bill_production';

export type FiscalEndpoint = 'submit' | 'cdr_query' | 'rc_submit';

export interface FiscalSubmitRequest {
  readonly tenantId: string;
  readonly saleId: string;
  readonly xml: string;
  readonly xmlHash: string;
  readonly documentType: '01' | '03' | '07' | '08' | '31' | '02' | '20';
}

export interface FiscalSubmitResult {
  readonly outcome: SunatOutcome;
  readonly errorClass: FiscalErrorClass;
}

export interface FiscalTransport {
  readonly mode: FiscalTransportMode;
  submit(request: FiscalSubmitRequest): Promise<SunatOutcome>;
  submitInvoice?(dto: CPEInvoiceDTO): Promise<FiscalSubmitResult>;
  queryCdr(ticketId: string): Promise<CdrEnvelope>;
  querySummaryStatus?(ticketId: string): Promise<SunatOutcome>;
}

/** Mock PSE staging: siempre CDR 0 aceptado si XML no vacío. */
export function createMockPseTransport(): FiscalTransport {
  return {
    mode: 'MOCK_STAGING',
    submit(request) {
      if (!request.xml.trim()) {
        return Promise.resolve({ kind: 'unreachable' });
      }
      const cdr: CdrEnvelope = {
        cdrCode: '0',
        cdrDescription: 'Mock PSE staging accepted',
        accepted: true,
      };
      return Promise.resolve(classifySunatResponse({ httpStatus: 200, cdr }));
    },
    submitInvoice(dto) {
      assertCpeInvoiceDto(dto);
      return this.submit({
        tenantId: dto.tenantId,
        saleId: dto.saleId,
        xml: dto.xml,
        xmlHash: dto.xmlHash,
        documentType: dto.documentType,
      }).then((outcome) => ({
        outcome,
        errorClass:
          outcome.kind === 'accepted'
            ? ('OK' as const)
            : outcome.kind === 'rejected'
              ? ('BUSINESS' as const)
              : ('INFRA' as const),
      }));
    },
    queryCdr(ticketId: string) {
      void ticketId;
      return Promise.resolve({
        cdrCode: '0',
        cdrDescription: 'Mock PSE staging accepted',
        accepted: true,
      });
    },
  };
}

/**
 * Plugins on sin SOL ni endpoint: never ACCEPTED. Drain/HTTP 503, no mock.
 * ADR-FISCAL-008 / FASE FL-0.1.
 */
export function createMisconfiguredFiscalTransport(): FiscalTransport {
  const unreachable = { kind: 'unreachable' as const };
  const cdr: CdrEnvelope = {
    cdrCode: '0',
    cdrDescription: 'TRANSPORT_MISCONFIGURED',
    accepted: false,
  };
  return {
    mode: 'MISCONFIGURED',
    submit() {
      return Promise.resolve(unreachable);
    },
    submitInvoice(dto) {
      assertCpeInvoiceDto(dto);
      return Promise.resolve({
        outcome: unreachable,
        errorClass: 'INFRA',
      });
    },
    queryCdr() {
      return Promise.resolve(cdr);
    },
  };
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Fail-closed: 2xx sin `accepted===true` + `cdrCode` no afirma CDR. */
function cdrFromPseHttpBody(
  body: {
    cdrCode?: string;
    cdrDescription?: string;
    accepted?: boolean;
  } | null,
): CdrEnvelope | null {
  const cdrCode = String(body?.cdrCode ?? '').trim();
  if (body?.accepted !== true || cdrCode.length === 0) return null;
  return {
    cdrCode,
    cdrDescription: body.cdrDescription ?? 'ok',
    accepted: true,
  };
}

/**
 * PSE KipusPay directo — HTTP inyectable (staging/mock). Sin credenciales hardcode.
 */
export function createHttpPseTransport(opts: {
  readonly endpointUrl: string;
  readonly fetchImpl?: FetchLike;
}): FiscalTransport {
  const fetchImpl = opts.fetchImpl ?? fetch;
  return {
    mode: 'KIPUSPAY_PSE_DIRECT',
    async submit(request) {
      if (!request.xml.trim()) return { kind: 'unreachable' };
      try {
        const res = await fetchImpl(opts.endpointUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/xml' },
          body: request.xml,
        });
        if (res.status >= 500 || res.status === 0) {
          return { kind: 'unreachable' };
        }
        if (res.status >= 400) {
          return {
            kind: 'rejected',
            cdr: {
              cdrCode: String(res.status),
              cdrDescription: 'business_reject',
              accepted: false,
            },
          };
        }
        const body = (await res.json().catch(() => null)) as {
          cdrCode?: string;
          cdrDescription?: string;
          accepted?: boolean;
        } | null;
        const cdr = cdrFromPseHttpBody(body);
        if (!cdr) return { kind: 'unreachable' };
        return classifySunatResponse({ httpStatus: 200, cdr });
      } catch {
        return { kind: 'unreachable' };
      }
    },
    async submitInvoice(dto) {
      assertCpeInvoiceDto(dto);
      try {
        const res = await fetchImpl(opts.endpointUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/xml' },
          body: dto.xml,
        });
        if (res.status >= 500 || res.status === 0) {
          return {
            outcome: { kind: 'unreachable' },
            errorClass: classifyFiscalError({ httpStatus: res.status }),
          };
        }
        if (res.status >= 400) {
          return {
            outcome: {
              kind: 'rejected',
              cdr: {
                cdrCode: String(res.status),
                cdrDescription: 'business_reject',
                accepted: false,
              },
            },
            errorClass: classifyFiscalError({ httpStatus: res.status }),
          };
        }
        const body = (await res.json().catch(() => null)) as {
          cdrCode?: string;
          cdrDescription?: string;
          accepted?: boolean;
        } | null;
        const cdr = cdrFromPseHttpBody(body);
        if (!cdr) {
          return {
            outcome: { kind: 'unreachable' },
            errorClass: classifyFiscalError({ httpStatus: 0, networkError: true }),
          };
        }
        return {
          outcome: classifySunatResponse({ httpStatus: 200, cdr }),
          errorClass: classifyFiscalError({
            httpStatus: 200,
            cdrAccepted: cdr.accepted,
          }),
        };
      } catch {
        return {
          outcome: { kind: 'unreachable' },
          errorClass: classifyFiscalError({ httpStatus: 0, networkError: true }),
        };
      }
    },
    async queryCdr(ticketId: string) {
      const url = `${opts.endpointUrl}/cdr/${encodeURIComponent(ticketId)}`;
      const res = await fetchImpl(url, { method: 'GET' });
      if (!res.ok) {
        return { cdrCode: '0', cdrDescription: 'unreachable', accepted: false };
      }
      const body = (await res.json().catch(() => null)) as {
        cdrCode?: string;
        cdrDescription?: string;
        accepted?: boolean;
      } | null;
      return (
        cdrFromPseHttpBody(body) ?? {
          cdrCode: '0',
          cdrDescription: 'cdr_missing',
          accepted: false,
        }
      );
    },
  };
}

/** Plugin OSE — fail-closed hasta suite de contrato + flag. */
export function createOseTransport(enabled: boolean): FiscalTransport {
  return {
    mode: 'ose_generic',
    submit() {
      if (!enabled) return Promise.reject(new Error('OSE_TRANSPORT_DISABLED'));
      return Promise.reject(new Error('OSE_TRANSPORT_NOT_CONFIGURED'));
    },
    queryCdr() {
      if (!enabled) return Promise.reject(new Error('OSE_TRANSPORT_DISABLED'));
      return Promise.reject(new Error('OSE_TRANSPORT_NOT_CONFIGURED'));
    },
  };
}

/** Plugin PSE tercero — fail-closed hasta suite de contrato + flag. */
export function createPseThirdPartyTransport(enabled: boolean): FiscalTransport {
  const off = 'PSE_' + 'THIRD_PARTY_DISABLED';
  const missing = 'PSE_' + 'THIRD_PARTY_NOT_CONFIGURED';
  return {
    mode: 'pse_third_party',
    submit() {
      if (!enabled) return Promise.reject(new Error(off));
      return Promise.reject(new Error(missing));
    },
    queryCdr() {
      if (!enabled) return Promise.reject(new Error(off));
      return Promise.reject(new Error(missing));
    },
  };
}

export function applyCdrToSaleStatus(
  outcome: SunatOutcome,
): Promise<'ACCEPTED' | 'REJECTED' | 'QUARANTINED'> {
  if (outcome.kind === 'accepted') return Promise.resolve('ACCEPTED');
  if (outcome.kind === 'rejected') return Promise.resolve('REJECTED');
  return Promise.resolve('QUARANTINED');
}

/** Suite de contrato mínima: submit + queryCdr deben existir y tipar. */
export function assertTransportContract(transport: FiscalTransport): void {
  if (typeof transport.submit !== 'function') throw new Error('CONTRACT_SUBMIT_MISSING');
  if (typeof transport.queryCdr !== 'function') throw new Error('CONTRACT_QUERY_CDR_MISSING');
  if (!transport.mode) throw new Error('CONTRACT_MODE_MISSING');
}
