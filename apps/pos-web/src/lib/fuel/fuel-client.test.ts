import { describe, expect, it, vi } from 'vitest';
import { createFuelDispatch, fetchFuelCatalog, fetchFuelIslandShiftReport } from './fuel-client.js';

const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  expect(String(input)).toBe('https://api.test/api/fuel/catalog');
  expect(init?.method).toBe('GET');
  return new Response(
    JSON.stringify({ items: [{ code: 'DIESEL_B5', priceCentsPerGallon: 1620, igvRateBps: 1800 }] }),
    {
      status: 200,
    },
  );
});

describe('fuel-client', () => {
  it('lee el reporte de turno por isleta desde el servidor', async () => {
    const reportFetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.test/api/fuel/island-shift-report?islandId=isla-2');
      expect(init?.method).toBe('GET');
      return new Response(
        JSON.stringify({
          reports: [
            {
              islandId: 'isla-2',
              dispatchCount: 3,
              volumeMicrounits: 4_000_000,
              totalCents: 7_500,
              byPayment: { cash: 7_500 },
            },
          ],
          cashRegisterSessionIds: ['session-2'],
        }),
        { status: 200 },
      );
    });

    await expect(
      fetchFuelIslandShiftReport('isla-2', { apiBase: 'https://api.test', fetcher: reportFetcher }),
    ).resolves.toEqual({
      reports: [
        {
          islandId: 'isla-2',
          dispatchCount: 3,
          volumeMicrounits: 4_000_000,
          totalCents: 7_500,
          byPayment: { cash: 7_500 },
        },
      ],
      cashRegisterSessionIds: ['session-2'],
    });
  });

  it('loads the server-authoritative catalog', async () => {
    await expect(fetchFuelCatalog({ apiBase: 'https://api.test', fetcher })).resolves.toEqual([
      { code: 'DIESEL_B5', priceCentsPerGallon: 1620, igvRateBps: 1800 },
    ]);
  });

  it('sends volume and idempotency to the authoritative dispatch endpoint', async () => {
    const dispatchFetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.test/api/fuel/dispatches');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toMatchObject({ volumeMicrounits: 2_000_000 });
      return new Response(JSON.stringify({ dispatchId: 'd1', totalCents: 3823 }), { status: 201 });
    });

    await expect(
      createFuelDispatch(
        {
          dispatchId: 'd1',
          idempotencyKey: 'idem-1',
          fuelCode: 'DIESEL_B5',
          volumeMicrounits: 2_000_000,
          businessInvoice: true,
          documentType: '01',
          islandId: 'isla-1',
          nozzleId: 'm1',
          paymentMethod: 'cash',
        },
        { apiBase: 'https://api.test', fetcher: dispatchFetcher },
      ),
    ).resolves.toEqual({ dispatchId: 'd1', totalCents: 3823 });
  });
});
