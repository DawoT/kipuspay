import { processSyncSalesBatch } from '@kipuspay/adapters-d1';
import type * as AdaptersD1 from '@kipuspay/adapters-d1';
import { describe, expect, it, vi } from 'vitest';
import type { WorkerEnv } from '../auth/control-plane.js';
import { isOfflineSyncEnabled, runSyncSalesHttp } from './sync-sales-route.js';

vi.mock('@kipuspay/adapters-d1', async (importOriginal) => ({
  ...(await importOriginal<typeof AdaptersD1>()),
  processSyncSalesBatch: vi.fn(() => Promise.resolve({ results: [] })),
}));

describe('sync-sales-route flags', () => {
  it('FEATURE_OFFLINE_SYNC solo actúa como kill switch', () => {
    expect(isOfflineSyncEnabled({} as WorkerEnv)).toBe(true);
    expect(isOfflineSyncEnabled({ FEATURE_OFFLINE_SYNC: '0' } as WorkerEnv)).toBe(false);
    expect(isOfflineSyncEnabled({ FEATURE_OFFLINE_SYNC: '1' } as WorkerEnv)).toBe(true);
  });

  it('flag off → 404', async () => {
    const res = await runSyncSalesHttp({ FEATURE_OFFLINE_SYNC: '0' } as WorkerEnv, 't1', 'u1', {
      sales: [],
    });
    expect(res.status).toBe(404);
  });

  it('flag on sin DB → 503; sales vacío → 400', async () => {
    const noDb = await runSyncSalesHttp({ FEATURE_OFFLINE_SYNC: '1' } as WorkerEnv, 't1', 'u1', {
      sales: [{ offlineSaleId: 'x' } as never],
    });
    expect(noDb.status).toBe(503);

    const empty = await runSyncSalesHttp(
      { FEATURE_OFFLINE_SYNC: 'true', DB: {} as WorkerEnv['DB'] } as WorkerEnv,
      't1',
      'u1',
      { sales: [] },
    );
    expect(empty.status).toBe(400);
  });

  it('passes the same inventory.scale capability and trusted terminal to sync reconciliation', async () => {
    await runSyncSalesHttp(
      {
        FEATURE_OFFLINE_SYNC: '1',
        FEATURE_POS_CHECKOUT: '1',
        FEATURE_INVENTORY_SCALE: '1',
        FEATURE_INVENTORY_BATCHES: '1',
        DB: {
          prepare: () => ({
            bind: () => ({ first: async () => ({ enabled: 1, config_json: '{}', epoch: 0 }) }),
          }),
        },
      } as WorkerEnv,
      't1',
      'u1',
      {
        sales: [
          {
            offlineSaleId: 'off-weight',
            branchId: 'b1',
            cashRegisterSessionId: 's1',
            documentType: 'NV',
            series: 'NV01',
            clientDocumentType: '1',
            clientDocumentNumber: '1',
            clientName: 'C',
            items: [{ productId: 'p1', quantity: 1 }],
            payments: [{ paymentMethodId: 'pm', amountCents: 118 }],
          },
        ],
      },
      Date.now(),
      'terminal-trusted',
    );

    expect(vi.mocked(processSyncSalesBatch)).toHaveBeenLastCalledWith(
      expect.anything(),
      't1',
      'u1',
      expect.anything(),
      expect.any(Number),
      undefined,
      true,
      'terminal-trusted',
      expect.objectContaining({
        inventoryScaleEnabled: true,
        terminalId: 'terminal-trusted',
      }),
    );
    const options = vi.mocked(processSyncSalesBatch).mock.calls.at(-1)?.[8];
    expect(options?.s18?.inventoryBatches).toBe(true);
  });

  it('ignora un flag público cuando el capability tenant está revocado', async () => {
    const db = {
      prepare: () => ({
        bind: (_tenantId: string, capability: string) => ({
          first: async () => ({
            enabled: capability === 'ledger.store_credit' ? 0 : 1,
            config_json: '{}',
            epoch: 0,
          }),
        }),
      }),
    };
    await runSyncSalesHttp(
      {
        FEATURE_OFFLINE_SYNC: '1',
        FEATURE_POS_CHECKOUT: '1',
        FEATURE_LEDGER_STORE_CREDIT: '1',
        DB: db,
      } as unknown as WorkerEnv,
      't1',
      'u1',
      {
        sales: [
          {
            offlineSaleId: 'revoked',
            branchId: 'b1',
            cashRegisterSessionId: 's1',
            documentType: 'NV',
            series: 'NV01',
            clientDocumentType: '1',
            clientDocumentNumber: '1',
            clientName: 'C',
            items: [{ productId: 'p1', quantity: 1 }],
            payments: [{ paymentMethodId: 'pm', amountCents: 100 }],
          },
        ],
      },
    );
    expect(vi.mocked(processSyncSalesBatch).mock.calls.at(-1)?.[6]).toBe(false);
  });
});
