import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * S4 (Sprint 8) — contrato del proxy Pages /v1/onboarding/bootstrap:
 * reenvía al worker con el body intacto y re-encodea sin content-encoding
 * (ERR_CONTENT_DECODING_FAILED), y fail-closed 502 sin WORKER_API_ORIGIN.
 */

async function loadServer() {
  vi.resetModules();
  const mod = await import('./+server.js');
  return mod;
}

async function withPrivateEnv(name: string, value: string | undefined, run: () => Promise<void>) {
  const prev = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    await run();
  } finally {
    if (prev === undefined) delete process.env[name];
    else process.env[name] = prev;
  }
}

describe('proxy /v1/onboarding/bootstrap (S4)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reenvía al worker con el mismo body y re-encodea sin content-encoding', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ tenantId: 't-1', onboardingToken: 'tok' }), {
        status: 201,
        headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await withPrivateEnv('WORKER_API_ORIGIN', 'https://api.kipuspay.com', async () => {
      const { POST } = await loadServer();
      const res = await POST({
        request: new Request('https://kipuspay.com/v1/onboarding/bootstrap', {
          method: 'POST',
          body: JSON.stringify({ tradeName: 'X' }),
        }),
      });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.kipuspay.com/v1/onboarding/bootstrap',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ tradeName: 'X' }),
        }),
      );
      expect(res.status).toBe(201);
      expect(res.headers.get('content-type')).toBe('application/json');
      await expect(res.json()).resolves.toEqual({ tenantId: 't-1', onboardingToken: 'tok' });
    });
  });

  it('sin WORKER_API_ORIGIN → 502 API_UNAVAILABLE (fail-closed)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await withPrivateEnv('WORKER_API_ORIGIN', undefined, async () => {
      const { POST } = await loadServer();
      const res = await POST({
        request: new Request('https://kipuspay.com/v1/onboarding/bootstrap', {
          method: 'POST',
          body: '{}',
        }),
      });
      expect(res.status).toBe(502);
      await expect(res.json()).resolves.toMatchObject({ code: 'API_UNAVAILABLE' });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it('worker caído → 502 API_UNREACHABLE', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    await withPrivateEnv('WORKER_API_ORIGIN', 'https://api.kipuspay.com', async () => {
      const { POST } = await loadServer();
      const res = await POST({
        request: new Request('https://kipuspay.com/v1/onboarding/bootstrap', {
          method: 'POST',
          body: '{}',
        }),
      });
      expect(res.status).toBe(502);
      await expect(res.json()).resolves.toMatchObject({ code: 'API_UNREACHABLE' });
    });
  });
});
