import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadServer() {
  vi.resetModules();
  return import('./+server.js');
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

describe('proxy /v1/reclamaciones', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reenvía al worker y re-encodea sin content-encoding', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ caseNumber: 'REC-20260814-AB12CD' }), {
        status: 201,
        headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await withPrivateEnv('WORKER_API_ORIGIN', 'https://api.kipuspay.com', async () => {
      const { POST } = await loadServer();
      const res = await POST({
        request: new Request('https://kipuspay.com/v1/reclamaciones', {
          method: 'POST',
          body: JSON.stringify({ claimantName: 'Ana' }),
        }),
      });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.kipuspay.com/v1/reclamaciones',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(res.status).toBe(201);
      await expect(res.json()).resolves.toEqual({ caseNumber: 'REC-20260814-AB12CD' });
    });
  });

  it('sin WORKER_API_ORIGIN → 502', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await withPrivateEnv('WORKER_API_ORIGIN', undefined, async () => {
      const { POST } = await loadServer();
      const res = await POST({
        request: new Request('https://kipuspay.com/v1/reclamaciones', {
          method: 'POST',
          body: '{}',
        }),
      });
      expect(res.status).toBe(502);
    });
  });
});
