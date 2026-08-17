import { describe, expect, it, vi } from 'vitest';
import { createForecastingClient } from './forecasting-client.js';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('forecasting POS seams (Sprint 46)', () => {
  it('lists forecasts with authorization and maps the DTO from the Worker', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({
        items: [
          {
            product_id: 'p1',
            forecast_date: '2026-08-10',
            predicted_qty: 12,
            predicted_gross_cents: 2400,
            confidence_low_qty: 8,
            confidence_high_qty: 16,
            model_version: 'hw-3p-1.0.0',
          },
        ],
        disclaimer: 'Estimación, no garantía',
      }),
    );
    const client = createForecastingClient({
      fetcher,
      apiBase: 'https://api.kipuspay.local/',
      authorization: 'Bearer demo',
    });
    const res = await client.list('b-demo');
    expect(res.items).toHaveLength(1);
    expect(res.items[0]?.product_id).toBe('p1');
    expect(res.disclaimer).toBe('Estimación, no garantía');
    const calls = fetcher.mock.calls as [string, RequestInit][];
    expect(calls[0]?.[0]).toBe('https://api.kipuspay.local/api/forecasting/b-demo');
    expect(new Headers(calls[0]?.[1].headers).get('authorization')).toBe('Bearer demo');
    expect(new Headers(calls[0]?.[1].headers).get('content-type')).toBe('application/json');
  });

  it('reads stock alerts with leadTime/safety and reports breakage status', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({
        items: [
          {
            product_id: 'p2',
            status: 'STOCKOUT_RISK',
            daysCovered: 2,
            suggestedReorderQty: 10,
            targetDays: 9,
          },
        ],
        disclaimer: 'Estimación, no garantía',
      }),
    );
    const client = createForecastingClient({
      fetcher,
      apiBase: 'https://api.test',
      authorization: '',
    });
    const res = await client.alerts('b-demo', { leadTimeDays: 3, safetyStockDays: 6 });
    expect(res.items[0]?.status).toBe('STOCKOUT_RISK');
    const calls = fetcher.mock.calls as [RequestInfo | URL, RequestInit][];
    const requested = calls[0]?.[0];
    const requestedUrl = requested instanceof URL ? requested.toString() : (requested ?? '');
    expect(requestedUrl).toContain(
      'https://api.test/api/forecasting/alerts/b-demo?leadTimeDays=3&safetyStockDays=6',
    );
  });

  it('refreshes forecasts via POST and maps written/insufficient', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ written: 4, insufficient: 1, disclaimer: 'Estimación, no garantía' }),
      );
    const client = createForecastingClient({
      fetcher,
      apiBase: 'https://api.test',
      authorization: '',
    });
    const res = await client.refresh('b-demo');
    expect(res.written).toBe(4);
    expect(res.insufficient).toBe(1);
    const calls = fetcher.mock.calls as [string, RequestInit][];
    expect(calls[0]?.[1].method).toBe('POST');
    expect(calls[0]?.[0]).toBe('https://api.test/api/forecasting/refresh/b-demo');
  });

  it('surfaces 403 PLAN_REQUIRES_CADENA and 402 Plan Guard codes without auth', async () => {
    for (const code of ['PLAN_REQUIRES_CADENA', 'TRIAL_EXPIRED', 'PLAN_PAST_DUE']) {
      const fetcher = vi.fn().mockResolvedValue(jsonResponse({ error: code, code }, 402));
      const client = createForecastingClient({ fetcher });
      await expect(client.list('b-demo')).rejects.toThrow(code);
    }
  });

  it('throws FEATURE_OFF when the capability is disabled server-side', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ error: 'FEATURE_ANALYTICS_FORECASTING off', code: 'FEATURE_OFF' }, 404),
      );
    const client = createForecastingClient({ fetcher });
    await expect(client.list('b-demo')).rejects.toThrow('FEATURE_OFF');
  });
});
