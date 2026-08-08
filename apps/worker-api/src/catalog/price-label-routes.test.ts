import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isCatalogPriceLabelsEnabled,
  runCreatePriceLabelBatchHttp,
  runReprintPriceLabelBatchHttp,
  runUpsertPriceLabelTemplateHttp,
} from './price-label-routes.js';
import type { WorkerEnv } from '../auth/control-plane.js';

const adapters = vi.hoisted(() => ({
  createPriceLabelBatchAtomic: vi.fn(),
  reprintPriceLabelBatchAtomic: vi.fn(),
  upsertPriceLabelTemplate: vi.fn(),
}));

vi.mock('@kipuspay/adapters-d1', () => adapters);

function env(flag?: string): WorkerEnv {
  return { FEATURE_CATALOG_PRICE_LABELS: flag, DB: {} } as unknown as WorkerEnv;
}

const supervisor = {
  tenantId: 'tenant-jwt',
  userId: 'supervisor-1',
  role: 'supervisor',
  branchId: 'branch-jwt',
};

describe('catalog.price_labels Worker routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adapters.createPriceLabelBatchAtomic.mockResolvedValue({ batchId: 'batch-1' });
    adapters.reprintPriceLabelBatchAtomic.mockResolvedValue({ batchId: 'batch-2' });
  });

  it('is default-off and hides all routes', async () => {
    expect(isCatalogPriceLabelsEnabled(env())).toBe(false);
    await expect(
      runCreatePriceLabelBatchHttp(env(), supervisor, {
        productIds: ['product-1'],
        templateId: 'template-1',
        idempotencyKey: 'request-1',
      }),
    ).resolves.toMatchObject({ status: 404, body: { code: 'FEATURE_OFF' } });
  });

  it('passes only verified tenant/branch and rejects client prices', async () => {
    const response = await runCreatePriceLabelBatchHttp(env('1'), supervisor, {
      tenantId: 'tenant-attacker',
      branchId: 'branch-attacker',
      productIds: ['product-1'],
      templateId: 'template-1',
      priceListId: 'list-1',
      priceCents: 1,
      customerId: 'customer-1',
      idempotencyKey: 'request-1',
    });
    expect(response.status).toBe(201);
    expect(adapters.createPriceLabelBatchAtomic).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: 'tenant-jwt', branchId: 'branch-jwt' }),
    );
    const trusted = adapters.createPriceLabelBatchAtomic.mock.calls[0]?.[1];
    expect(trusted).not.toHaveProperty('priceCents');
    expect(trusted).not.toHaveProperty('customerId');
  });

  it('enforces RBAC for template configuration and explicit reprint', async () => {
    const cashier = { ...supervisor, role: 'cashier' };
    await expect(runUpsertPriceLabelTemplateHttp(env('1'), cashier, {})).resolves.toMatchObject({
      status: 403,
    });
    await expect(
      runReprintPriceLabelBatchHttp(env('1'), cashier, {
        batchId: 'batch-1',
        idempotencyKey: 'reprint-1',
      }),
    ).resolves.toMatchObject({ status: 403 });
    await expect(
      runReprintPriceLabelBatchHttp(env('1'), supervisor, {
        batchId: 'batch-1',
        idempotencyKey: 'reprint-1',
      }),
    ).resolves.toMatchObject({ status: 201 });
  });

  it.each(['product', 'price list', 'template'])('fails closed for cross-tenant %s', async () => {
    adapters.createPriceLabelBatchAtomic.mockRejectedValueOnce(
      new Error('PRICE_LABEL_SCOPE_MISMATCH'),
    );
    await expect(
      runCreatePriceLabelBatchHttp(env('1'), supervisor, {
        productIds: ['foreign'],
        templateId: 'foreign',
        priceListId: 'foreign',
        idempotencyKey: 'cross-tenant',
      }),
    ).resolves.toMatchObject({ status: 404, body: { code: 'PRICE_LABEL_SCOPE_MISMATCH' } });
  });
});
