import { describe, expect, it, vi } from 'vitest';
import { createInsightsClient } from './insights-client.js';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('insights POS seams (Sprint 49)', () => {
  const fetcher = vi.fn();
  const client = createInsightsClient({
    authenticatedFetch: fetcher,
    apiBase: 'https://api.kipuspay.local/',
  });

  it('briefing: 404 → null; 200 → payload con fecha', async () => {
    fetcher.mockResolvedValueOnce(jsonResponse({ error: 'NOT_FOUND' }, 404));
    expect(await client.briefing('2026-08-03')).toBeNull();

    fetcher.mockResolvedValueOnce(
      jsonResponse({ reportDate: '2026-08-03', briefing: '{"bullets":[]}', staleAt: '2026-08-03' }),
    );
    const found = await client.briefing('2026-08-03');
    expect(found?.reportDate).toBe('2026-08-03');
    const [url] = fetcher.mock.calls.at(-1) as [string];
    expect(url).toContain('/api/insights/briefing?date=2026-08-03');
  });

  it('chat: parsea el evento SSE data:', async () => {
    fetcher.mockResolvedValueOnce(
      new Response('data: {"text":"Ventas: S/ 118000."}\n\n', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
    );
    const text = await client.chat('¿cómo van las ventas?', 'idem-1');
    expect(text).toBe('Ventas: S/ 118000.');
    const [, init] = fetcher.mock.calls.at(-1) as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.body).toEqual(
      JSON.stringify({
        question: '¿cómo van las ventas?',
        idempotencyKey: 'idem-1',
      }),
    );
  });

  it('chat: propaga errores semánticos (402 cupo)', async () => {
    fetcher.mockResolvedValueOnce(jsonResponse({ code: 'AI_QUOTA_EXCEEDED' }, 402));
    await expect(client.chat('x', 'idem-2')).rejects.toThrow('AI_QUOTA_EXCEEDED');
  });
});
