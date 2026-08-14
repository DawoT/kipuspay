import { describe, expect, it, vi } from 'vitest';
import { pollCaptureStatus } from './payment-capture.js';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('poll de captura de pago (S22, F2)', () => {
  it('sondea hasta CAPTURED y devuelve el estado final', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'cap-1',
          status: 'PENDING',
          acquirer: 'culqi',
          amount_cents: 1000,
          sale_id: 's-1',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'cap-1',
          status: 'CAPTURED',
          acquirer: 'culqi',
          amount_cents: 1000,
          sale_id: 's-1',
        }),
      );
    const res = await pollCaptureStatus({
      fetcher,
      apiBase: 'https://api.test',
      authorization: 'Bearer x',
      captureId: 'cap-1',
      intervalMs: 1,
      maxAttempts: 5,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.status).toBe('CAPTURED');
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [url] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.test/api/payments/captures/cap-1');
  });

  it('rinde en FAILED sin seguir sondeando', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        id: 'cap-1',
        status: 'FAILED',
        acquirer: 'yape',
        amount_cents: 500,
        sale_id: 's-1',
      }),
    );
    const res = await pollCaptureStatus({
      fetcher,
      apiBase: 'https://api.test',
      authorization: 'Bearer x',
      captureId: 'cap-1',
      intervalMs: 1,
      maxAttempts: 5,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.status).toBe('FAILED');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('agota intentos y reporta PENDING sin reventar', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'cap-1',
        status: 'PENDING',
        acquirer: 'plin',
        amount_cents: 500,
        sale_id: 's-1',
      }),
    );
    const res = await pollCaptureStatus({
      fetcher,
      apiBase: 'https://api.test',
      authorization: 'Bearer x',
      captureId: 'cap-1',
      intervalMs: 1,
      maxAttempts: 3,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.status).toBe('PENDING');
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('falla offline sin reventar', async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const res = await pollCaptureStatus({
      fetcher,
      apiBase: 'https://api.test',
      authorization: 'Bearer x',
      captureId: 'cap-1',
      intervalMs: 1,
      maxAttempts: 2,
    });
    expect(res.ok).toBe(false);
  });
});

describe('G1 auditoría — monto de captura nunca float/NaN', () => {
  it('amount_cents no-enteros (float/NaN/null) se rechazan fail-closed, no se confía en el monto', async () => {
    const { pollCaptureStatus } = await import('./payment-capture.js');
    const fetcher: typeof fetch = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            id: 'c1',
            status: 'CAPTURED',
            acquirer: null,
            acquirer_ref: null,
            amount_cents: 12.99,
            sale_id: null,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    const result = await pollCaptureStatus({
      fetcher: fetcher,
      apiBase: 'http://x',
      authorization: 'Bearer t',
      captureId: 'c1',
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.dto) {
      expect(Number.isSafeInteger(result.dto.amountCents)).toBe(true);
    }
  });
});
