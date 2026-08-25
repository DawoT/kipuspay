/**
 * FiscalTransport SOAP billService SUNAT (canal dual staging/producción) —
 * ADR-FISCAL-007 / §5.2. 01/07/08 → sendBill; boleta 03 / RC → sendSummary.
 * Nunca POST JSON al PSE. El endpoint se resuelve por canal con allowlist
 * (sunat-channel.ts): producción solo acepta la URL oficial exacta.
 */
import type { CPEInvoiceDTO, CPESummaryDTO, RcCdrPort } from '@kipuspay/domain-fiscal-pe';
import { assertCpeInvoiceDto, assertCpeSummaryDto } from '@kipuspay/domain-fiscal-pe';
import { classifySunatResponse, type SunatOutcome } from './classify-sunat.js';
import { classifyFiscalError, type FiscalErrorClass } from './fiscal-error.js';
import type {
  FetchLike,
  FiscalSubmitRequest,
  FiscalSubmitResult,
  FiscalTransport,
  FiscalTransportMode,
} from './fiscal-transport.js';
import {
  buildSunatSoapEnvelope,
  cdrFromApplicationResponseZip,
  identityFromDto,
  isSoapFaultBusiness,
  parseCpeZipIdentity,
  parseSunatSoapBody,
  soapAction,
  SUNAT_BETA_BILL_SERVICE_URL,
  zipBaseName,
  zipUblXml,
  type SunatSoapOperation,
} from './sunat-bill-soap.js';
import { resolveSunatBillEndpoint } from './sunat-channel.js';

export { SUNAT_BETA_BILL_SERVICE_URL };
export { SUNAT_PRODUCTION_BILL_SERVICE_URL } from './sunat-channel.js';

export interface SunatBillTransportOptions {
  readonly solUser: string;
  readonly solPassword: string;
  readonly endpointUrl?: string;
  /** Canal del billService: 'staging' (default) | 'production'. Se valida con allowlist. */
  readonly channel?: string | undefined;
  readonly fetchImpl?: FetchLike;
}

async function outcomeFromZipB64(zipB64: string): Promise<SunatOutcome> {
  try {
    const cdr = await cdrFromApplicationResponseZip(zipB64);
    return classifySunatResponse({ httpStatus: 200, cdr });
  } catch {
    return { kind: 'unreachable' };
  }
}

function outcomeFromSoapFault(parsed: ReturnType<typeof parseSunatSoapBody>): SunatOutcome {
  const fromFaultCode = /\.(\d{3,4})\b/.exec(parsed.faultCode ?? '');
  const fromString = /(?:^|[^\d#&])(\d{4})(?:\D|$)/.exec(parsed.faultString ?? '');
  return {
    kind: 'rejected',
    cdr: {
      cdrCode: fromFaultCode?.[1] ?? fromString?.[1] ?? '99',
      cdrDescription: parsed.faultString ?? 'soap_fault',
      accepted: false,
    },
  };
}

function outcomeFromHttpReject(
  status: number,
  parsed: ReturnType<typeof parseSunatSoapBody>,
  body: string,
): SunatOutcome {
  if (status >= 500 || status === 0) return { kind: 'unreachable' };
  if (status >= 400) {
    const snippet = (parsed.faultString ?? body).replace(/\s+/g, ' ').slice(0, 240);
    return {
      kind: 'rejected',
      cdr: {
        cdrCode: String(status),
        cdrDescription: snippet || 'business_reject',
        accepted: false,
      },
    };
  }
  return { kind: 'unreachable' };
}

function resultOf(
  outcome: SunatOutcome,
  httpStatus: number,
  cdrAccepted?: boolean,
): FiscalSubmitResult {
  const errorClass: FiscalErrorClass = classifyFiscalError({
    httpStatus,
    ...(cdrAccepted !== undefined ? { cdrAccepted } : {}),
    ...(httpStatus === 0 ? { networkError: true as const } : {}),
  });
  return { outcome, errorClass };
}

export function rcZipBaseName(xml: string, solUser: string, summaryId: string): string {
  const parsed = parseCpeZipIdentity(xml, 'RC');
  if (parsed) return zipBaseName(parsed);
  const ruc = /^\d{11}/.exec(solUser.trim())?.[0] ?? '00000000000';
  const dateAttr = /date="(\d{4}-\d{2}-\d{2})"/.exec(xml)?.[1]?.replaceAll('-', '');
  const ymd = dateAttr ?? '19700101';
  const corr = summaryId.replace(/\D/g, '').slice(-3).padStart(3, '0') || '001';
  return `${ruc}-RC-${ymd}-${corr}`;
}

export function createSunatBillTransport(opts: SunatBillTransportOptions): FiscalTransport {
  const solUser = opts.solUser.trim();
  const solPassword = opts.solPassword;
  if (!solUser || !solPassword) {
    throw new Error('SUNAT_SOL_CREDENTIALS_MISSING');
  }
  // Allowlist del canal: en producción solo pasa la URL oficial exacta
  // (resolveSunatBillEndpoint lanza SunatChannelError si no).
  const { channel, endpointUrl } = resolveSunatBillEndpoint({
    channel: opts.channel,
    endpointUrl: opts.endpointUrl,
  });
  const mode: FiscalTransportMode =
    channel === 'production' ? 'sunat_bill_production' : 'sunat_bill_beta';
  const fetchImpl = opts.fetchImpl ?? fetch;

  const postSoap = async (
    operation: SunatSoapOperation,
    envelope: string,
  ): Promise<{ readonly status: number; readonly body: string }> => {
    const res = await fetchImpl(endpointUrl, {
      method: 'POST',
      headers: {
        'content-type': 'text/xml; charset=utf-8',
        SOAPAction: soapAction(operation),
      },
      body: envelope,
    });
    return { status: res.status, body: await res.text() };
  };

  const classifyBody = async (
    status: number,
    body: string,
    followTicket: boolean,
  ): Promise<SunatOutcome> => {
    const parsed = parseSunatSoapBody(body);
    if (parsed.applicationResponseB64) {
      return outcomeFromZipB64(parsed.applicationResponseB64);
    }
    if (parsed.statusContentB64 && (parsed.statusCode === '0' || parsed.statusCode === '00')) {
      return outcomeFromZipB64(parsed.statusContentB64);
    }
    if (parsed.statusCode === '98') return { kind: 'unreachable' };
    if (followTicket && parsed.ticket) {
      return queryStatus(parsed.ticket);
    }
    if (isSoapFaultBusiness(parsed)) {
      return outcomeFromSoapFault(parsed);
    }
    return outcomeFromHttpReject(status, parsed, body);
  };

  const queryStatus = async (ticketId: string): Promise<SunatOutcome> => {
    try {
      const envelope = buildSunatSoapEnvelope('getStatus', {
        solUser,
        solPassword,
        ticket: ticketId,
      });
      const res = await postSoap('getStatus', envelope);
      return classifyBody(res.status, res.body, false);
    } catch {
      return { kind: 'unreachable' };
    }
  };

  const sendZipped = async (
    xml: string,
    fileBase: string,
    operation: SunatSoapOperation,
  ): Promise<SunatOutcome> => {
    if (!xml.trim() || !fileBase) return { kind: 'unreachable' };
    try {
      const envelope = buildSunatSoapEnvelope(operation, {
        solUser,
        solPassword,
        fileName: `${fileBase}.zip`,
        zipBytes: zipUblXml(fileBase, xml),
      });
      const res = await postSoap(operation, envelope);
      return classifyBody(res.status, res.body, true);
    } catch {
      return { kind: 'unreachable' };
    }
  };

  const submitXml = (
    xml: string,
    documentType: FiscalSubmitRequest['documentType'],
    saleId: string,
    identityHint?: ReturnType<typeof identityFromDto>,
  ): Promise<SunatOutcome> => {
    if (documentType === '03') {
      return sendZipped(xml, rcZipBaseName(xml, solUser, saleId), 'sendSummary');
    }
    const identity = identityHint ?? parseCpeZipIdentity(xml, documentType);
    if (!identity) return Promise.resolve({ kind: 'unreachable' });
    return sendZipped(xml, zipBaseName(identity), 'sendBill');
  };

  return {
    mode,
    submit(request) {
      return submitXml(request.xml, request.documentType, request.saleId);
    },
    async submitInvoice(dto: CPEInvoiceDTO) {
      assertCpeInvoiceDto(dto);
      const hint = identityFromDto({
        issuerRuc: dto.issuerRuc,
        documentType: dto.documentType,
        series: dto.series,
        number: dto.number,
      });
      const outcome = await submitXml(dto.xml, dto.documentType, dto.saleId, hint);
      if (outcome.kind === 'accepted') return resultOf(outcome, 200, true);
      if (outcome.kind === 'rejected') return resultOf(outcome, 400, false);
      return resultOf(outcome, 503);
    },
    async queryCdr(ticketId: string) {
      const outcome = await queryStatus(ticketId);
      if (outcome.kind === 'accepted' || outcome.kind === 'rejected') return outcome.cdr;
      return { cdrCode: '0', cdrDescription: 'unreachable', accepted: false };
    },
  };
}

export function createSunatRcCdrPort(opts: SunatBillTransportOptions): RcCdrPort {
  const transport = createSunatBillTransport(opts);
  return {
    async submit(input) {
      if (!input.xml.trim()) {
        return { accepted: false, cdrCode: '99', cdrMessage: 'empty RC xml' };
      }
      const dto: CPESummaryDTO = {
        tenantId: input.tenantId,
        summaryDateLima: '1970-01-01',
        documentType: 'RC',
        xml: input.xml,
        xmlHash: 'rc',
        saleIds: [],
      };
      assertCpeSummaryDto(dto);
      const outcome = await transport.submit({
        tenantId: input.tenantId,
        saleId: input.summaryId,
        xml: input.xml,
        xmlHash: dto.xmlHash,
        documentType: '03',
      });
      if (outcome.kind === 'accepted') {
        return {
          accepted: true,
          cdrCode: outcome.cdr.cdrCode,
          cdrMessage: outcome.cdr.cdrDescription,
        };
      }
      if (outcome.kind === 'rejected') {
        return {
          accepted: false,
          cdrCode: outcome.cdr.cdrCode,
          cdrMessage: outcome.cdr.cdrDescription,
        };
      }
      return { accepted: false, cdrCode: '503', cdrMessage: 'SUNAT unreachable' };
    },
  };
}
