import { cdrIsAccepted } from '@kipuspay/domain-fiscal-pe';

export interface CdrPayload {
  readonly cdrCode: string;
  readonly cdrDescription: string;
  readonly accepted: boolean;
}

export function cdrVerdict(payload: CdrPayload): 'aceptada' | 'rechazada' {
  return cdrIsAccepted(payload) ? 'aceptada' : 'rechazada';
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/cdr' || request.method !== 'POST') {
      return new Response('not found', { status: 404 });
    }
    const payload = (await request.json()) as CdrPayload;
    return new Response(JSON.stringify({ verdict: cdrVerdict(payload) }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  },
};
