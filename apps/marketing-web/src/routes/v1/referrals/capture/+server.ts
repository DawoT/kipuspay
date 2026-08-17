import { json } from '@sveltejs/kit';
import { env as dynamicEnv } from '$env/dynamic/private';

/** M6B — proxy mismo origen del referido (solo captura; nunca credenciales). */
export const prerender = false;

export async function POST({ request }: { request: Request }): Promise<Response> {
  const target = (dynamicEnv.WORKER_API_ORIGIN ?? '').replace(/\/$/, '');
  if (!target) {
    return json({ error: 'API unavailable', code: 'API_UNAVAILABLE' }, { status: 502 });
  }
  try {
    const upstream = await fetch(`${target}/v1/referrals/capture`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: await request.text(),
    });
    const payload = await upstream.arrayBuffer();
    return new Response(payload, {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
    });
  } catch {
    return json({ error: 'API unreachable', code: 'API_UNREACHABLE' }, { status: 502 });
  }
}
