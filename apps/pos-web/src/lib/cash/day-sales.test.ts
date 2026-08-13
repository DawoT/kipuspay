import { describe, expect, it, vi } from 'vitest';
import { fetchDaySales } from './day-sales.js';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('historial del día del cajero (F3)', () => {
  it('trae ventas de hoy con totales en cents y documentType', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({
        items: [
          {
            id: 's-2',
            series: 'B001',
            number: 2,
            documentType: '03',
            totalCents: 2500,
            issuedAtLima: '2026-08-14 09:15:00',
            clientName: 'CLIENTE GENERICO',
            voidStatus: 'NONE',
          },
        ],
        countToday: 1,
        totalTodayCents: 2500,
        scopeBranch: 'b1',
      }),
    );
    const res = await fetchDaySales({
      fetcher,
      apiBase: 'https://api.test',
      authorization: 'Bearer jwt-cashier',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.countToday).toBe(1);
    expect(res.totalTodayCents).toBe(2500);
    expect(res.items[0]).toMatchObject({ id: 's-2', series: 'B001', number: 2 });
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.test/api/pos/day-sales');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer jwt-cashier');
  });

  it('falla offline sin reventar', async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const res = await fetchDaySales({
      fetcher,
      apiBase: 'https://api.test',
      authorization: 'Bearer jwt-cashier',
    });
    expect(res.ok).toBe(false);
  });
});
