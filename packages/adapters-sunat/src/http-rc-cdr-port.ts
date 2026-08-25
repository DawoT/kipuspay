/**
 * RcCdrPort HTTP — envía el resumen diario (RC) al PSE KipusPay (spec §5.2).
 * C6: reemplaza el mock en buildDailySummary cuando FISCAL_PSE_ENDPOINT_URL
 * está configurado. Nunca hardcodea credenciales; fail-closed sin endpoint.
 * 2xx no afirma aceptación: exige `accepted === true` y `cdrCode` no vacío.
 */
import type { RcCdrPort } from '@kipuspay/domain-fiscal-pe';
import type { FetchLike } from './fiscal-transport.js';

export interface HttpRcCdrPortOptions {
  readonly endpointUrl: string;
  readonly fetchImpl?: FetchLike;
}

type RcSubmitResult = Awaited<ReturnType<RcCdrPort['submit']>>;

interface PseRcBody {
  cdrCode?: string;
  cdrDescription?: string;
  accepted?: boolean;
  cdrZipB64?: string;
}

/**
 * H3 (auditoría 0031): el zip del CDR viaja al caller para su archivo en R2
 * (conservación SUNAT). Si el PSE no lo entrega, queda undefined y el caller
 * archiva el receipt JSON del envelope.
 */
function cdrZipFromPseBody(body: PseRcBody | null): string | undefined {
  return typeof body?.cdrZipB64 === 'string' && body.cdrZipB64.length > 0
    ? body.cdrZipB64
    : undefined;
}

/** 2xx → resultado tipado; fail-closed sin `accepted===true` + `cdrCode`. */
function resultFromPse2xx(body: PseRcBody | null): RcSubmitResult {
  const cdrCode =
    typeof body?.cdrCode === 'string' && body.cdrCode.trim() ? body.cdrCode.trim() : '';
  const accepted = body?.accepted === true && cdrCode.length > 0;
  const zip = cdrZipFromPseBody(body);
  return {
    accepted,
    status: accepted ? 'ACCEPTED' : 'REJECTED',
    cdrCode: accepted ? cdrCode : cdrCode || '99',
    cdrMessage: accepted ? (body?.cdrDescription ?? 'ok') : 'CDR_MISSING',
    ...(zip !== undefined ? { cdrZipB64: zip } : {}),
  };
}

export function createHttpRcCdrPort(opts: HttpRcCdrPortOptions): RcCdrPort {
  const fetchImpl = opts.fetchImpl ?? fetch;
  return {
    async submit(input) {
      if (!input.xml.trim()) {
        return {
          accepted: false,
          status: 'REJECTED',
          cdrCode: '99',
          cdrMessage: 'empty RC xml',
          ublId: input.ublId,
        };
      }
      try {
        const res = await fetchImpl(opts.endpointUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/xml' },
          body: input.xml,
        });
        if (res.status >= 500 || res.status === 0) {
          return {
            accepted: false,
            status: 'UNREACHABLE',
            cdrCode: String(res.status),
            cdrMessage: 'PSE unreachable',
            ublId: input.ublId,
          };
        }
        if (res.status >= 400) {
          return {
            accepted: false,
            status: 'REJECTED',
            cdrCode: String(res.status),
            cdrMessage: 'business_reject',
            ublId: input.ublId,
          };
        }
        const body = (await res.json().catch(() => null)) as PseRcBody | null;
        const result = resultFromPse2xx(body);
        return { ...result, ...(input.ublId ? { ublId: input.ublId } : {}) };
      } catch {
        return {
          accepted: false,
          status: 'UNREACHABLE',
          cdrCode: '503',
          cdrMessage: 'PSE unreachable',
          ublId: input.ublId,
        };
      }
    },
  };
}
