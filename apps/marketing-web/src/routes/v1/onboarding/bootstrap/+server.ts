import { json } from '@sveltejs/kit';
import { env as dynamicEnv } from '$env/dynamic/private';

/**
 * M6B — proxy mismo origen del Pages project hacia el worker de API.
 * Activo mientras no exista dominio separado (PUBLIC_API_BASE); el cliente
 * usa esta ruta cuando la base de API es vacía.
 */
export const prerender = false;

export async function POST({ request }: { request: Request }): Promise<Response> {
  const target = (dynamicEnv.WORKER_API_ORIGIN ?? '').replace(/\/$/, '');
  if (!target) {
    return json({ error: 'API unavailable', code: 'API_UNAVAILABLE' }, { status: 502 });
  }
  try {
    const upstream = await fetch(`${target}/v1/onboarding/bootstrap`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: await request.text(),
    });
    // Re-encode sin content-encoding upstream: evita ERR_CONTENT_DECODING_FAILED.
    const payload = await upstream.arrayBuffer();
    return new Response(payload, {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
    });
  } catch {
    return json({ error: 'API unreachable', code: 'API_UNREACHABLE' }, { status: 502 });
  }
}
