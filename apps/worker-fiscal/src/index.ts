import { cdrIsAccepted } from '@kipuspay/domain-fiscal-pe';
import {
  applyCdrToSaleStatus,
  createMockPseTransport,
  type FiscalSubmitRequest,
} from '@kipuspay/adapters-sunat';

export interface CdrPayload {
  readonly cdrCode: string;
  readonly cdrDescription: string;
  readonly accepted: boolean;
}

export function cdrVerdict(payload: CdrPayload): 'aceptada' | 'rechazada' {
  return cdrIsAccepted(payload) ? 'aceptada' : 'rechazada';
}

/** Procesa submit mock PSE → estado SUNAT derivado del CDR. */
export async function submitViaMockPse(request: FiscalSubmitRequest): Promise<{
  verdict: 'aceptada' | 'rechazada' | 'cuarentena';
  sunatStatus: 'ACCEPTED' | 'REJECTED' | 'QUARANTINED';
}> {
  const transport = createMockPseTransport();
  const outcome = await transport.submit(request);
  const sunatStatus = await applyCdrToSaleStatus(outcome);
  const verdict =
    sunatStatus === 'ACCEPTED'
      ? 'aceptada'
      : sunatStatus === 'REJECTED'
        ? 'rechazada'
        : 'cuarentena';
  return { verdict, sunatStatus };
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/cdr' && request.method === 'POST') {
      const payload = (await request.json()) as CdrPayload;
      return new Response(JSON.stringify({ verdict: cdrVerdict(payload) }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.pathname === '/v1/fiscal/submit' && request.method === 'POST') {
      const body = (await request.json()) as FiscalSubmitRequest;
      const result = await submitViaMockPse(body);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('not found', { status: 404 });
  },
};
