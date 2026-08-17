/**
 * RcCdrPort HTTP — envía el resumen diario (RC) al PSE KipusPay (spec §5.2).
 * C6: reemplaza el mock en buildDailySummary cuando FISCAL_PSE_ENDPOINT_URL
 * está configurado. Nunca hardcodea credenciales; fail-closed sin endpoint.
 */
import type { RcCdrPort } from '@kipuspay/domain-fiscal-pe';
import type { FetchLike } from './fiscal-transport.js';

export interface HttpRcCdrPortOptions {
  readonly endpointUrl: string;
  readonly fetchImpl?: FetchLike;
}

export function createHttpRcCdrPort(opts: HttpRcCdrPortOptions): RcCdrPort {
  const fetchImpl = opts.fetchImpl ?? fetch;
  return {
    async submit(input) {
      if (!input.xml.trim()) {
        return { accepted: false, cdrCode: '99', cdrMessage: 'empty RC xml' };
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
            cdrCode: String(res.status),
            cdrMessage: 'PSE unreachable',
          };
        }
        if (res.status >= 400) {
          return {
            accepted: false,
            cdrCode: String(res.status),
            cdrMessage: 'business_reject',
          };
        }
        const body = (await res.json().catch(() => null)) as {
          cdrCode?: string;
          cdrDescription?: string;
          accepted?: boolean;
        } | null;
        return {
          accepted: body?.accepted !== false,
          cdrCode: body?.cdrCode ?? '0',
          cdrMessage: body?.cdrDescription ?? 'ok',
        };
      } catch {
        return { accepted: false, cdrCode: '503', cdrMessage: 'PSE unreachable' };
      }
    },
  };
}
