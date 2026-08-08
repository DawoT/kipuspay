import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isCatalogPriceLabelsEnabled,
  runAcknowledgePriceLabelItemsHttp,
  runCreatePriceLabelBatchHttp,
  runListPriceLabelTemplatesHttp,
  runReprintPriceLabelBatchHttp,
  runRetirePriceLabelTemplateHttp,
  runUpsertPriceLabelTemplateHttp,
} from './price-label-routes.js';
import type { WorkerEnv } from '../auth/control-plane.js';

const adapters = vi.hoisted(() => ({
  acknowledgePriceLabelItems: vi.fn(),
  createPriceLabelTemplate: vi.fn(),
  createPriceLabelBatchAtomic: vi.fn(),
  listPriceLabelTemplates: vi.fn(),
  reprintPriceLabelBatchAtomic: vi.fn(),
  resolveActiveTerminalSession: vi.fn(),
  retirePriceLabelTemplate: vi.fn(),
  versionPriceLabelTemplate: vi.fn(),
}));

vi.mock('@kipuspay/adapters-d1', () => adapters);

function env(flag?: string): WorkerEnv {
  return {
    FEATURE_CATALOG_PRICE_LABELS: flag,
    DB: {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({ first: vi.fn().mockResolvedValue({ enabled: 1 }) })),
      })),
    },
  } as unknown as WorkerEnv;
}

const supervisor = {
  tenantId: 'tenant-jwt',
  userId: 'supervisor-1',
  role: 'supervisor',
  branchId: 'branch-jwt',
  terminalId: 'terminal-jwt',
  terminalSessionId: 'terminal-session-jwt',
};

describe('catalog.price_labels Worker routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adapters.createPriceLabelBatchAtomic.mockResolvedValue({ batchId: 'batch-1' });
    adapters.createPriceLabelTemplate.mockResolvedValue({ templateId: 'template-1', version: 1 });
    adapters.versionPriceLabelTemplate.mockResolvedValue({ templateId: 'template-2', version: 2 });
    adapters.retirePriceLabelTemplate.mockResolvedValue({
      templateId: 'template-1',
      status: 'RETIRED',
    });
    adapters.listPriceLabelTemplates.mockResolvedValue([]);
    adapters.acknowledgePriceLabelItems.mockResolvedValue({
      batchStatus: 'ACKED',
      retryItemIds: [],
    });
    adapters.reprintPriceLabelBatchAtomic.mockResolvedValue({ batchId: 'batch-2' });
    adapters.resolveActiveTerminalSession.mockResolvedValue({
      branchId: 'branch-jwt',
      terminalId: 'terminal-jwt',
      terminalSessionId: 'terminal-session-jwt',
      cashRegisterSessionId: 'cash-session-jwt',
      userId: 'supervisor-1',
    });
  });

  it('is default-off and hides all routes', async () => {
    expect(isCatalogPriceLabelsEnabled(env())).toBe(false);
    await expect(
      runCreatePriceLabelBatchHttp(env(), supervisor, {
        products: [{ productId: 'product-1', copies: 1 }],
        templateId: 'template-1',
        idempotencyKey: 'request-1',
      }),
    ).resolves.toMatchObject({ status: 404, body: { code: 'FEATURE_OFF' } });
  });

  it('passes only verified tenant/branch and rejects client prices', async () => {
    const response = await runCreatePriceLabelBatchHttp(env('1'), supervisor, {
      tenantId: 'tenant-attacker',
      branchId: 'branch-attacker',
      products: [{ productId: 'product-1', copies: 1 }],
      templateId: 'template-1',
      priceListId: 'list-1',
      priceCents: 1,
      customerId: 'customer-1',
      idempotencyKey: 'request-1',
    });
    expect(response).toMatchObject({
      status: 400,
      body: { code: 'PRICE_LABEL_UNTRUSTED_FIELD' },
    });
    expect(adapters.createPriceLabelBatchAtomic).not.toHaveBeenCalled();

    const accepted = await runCreatePriceLabelBatchHttp(env('1'), supervisor, {
      products: [{ productId: 'product-1', copies: 1 }],
      templateId: 'template-1',
      priceListId: 'list-1',
      idempotencyKey: 'request-2',
    });
    expect(accepted.status).toBe(201);
    expect(adapters.createPriceLabelBatchAtomic).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: 'tenant-jwt',
        branchId: 'branch-jwt',
        terminalId: 'terminal-jwt',
      }),
    );
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

  it.each(['owner', 'admin'])(
    'allows branchless %s template create, version, list and retire',
    async (role) => {
      const actor = {
        tenantId: 'tenant-jwt',
        userId: `${role}-1`,
        role,
        branchId: '',
      };
      const template = {
        dslVersion: 'PRICE_LABEL_V1',
        blocks: [{ type: 'PRICE', field: 'price', align: 'CENTER' }],
      };
      await expect(
        runUpsertPriceLabelTemplateHttp(env('1'), actor, {
          templateKey: 'shelf',
          name: 'Shelf',
          template,
          paperWidthMm: 58,
        }),
      ).resolves.toMatchObject({ status: 201 });
      await expect(
        runUpsertPriceLabelTemplateHttp(env('1'), actor, {
          templateKey: 'shelf',
          name: 'Shelf v2',
          template,
          paperWidthMm: 80,
          newVersion: true,
        }),
      ).resolves.toMatchObject({ status: 201 });
      await expect(runListPriceLabelTemplatesHttp(env('1'), actor)).resolves.toMatchObject({
        status: 200,
      });
      await expect(
        runRetirePriceLabelTemplateHttp(env('1'), actor, { templateId: 'template-1' }),
      ).resolves.toMatchObject({ status: 200 });
    },
  );

  it('rejects untrusted extra fields on template management routes', async () => {
    const owner = { ...supervisor, role: 'owner', branchId: '' };
    await expect(
      runUpsertPriceLabelTemplateHttp(env('1'), owner, {
        templateKey: 'shelf',
        name: 'Shelf',
        template: { dslVersion: 'PRICE_LABEL_V1', blocks: [] },
        paperWidthMm: 58,
        snapshotHash: 'attacker',
      }),
    ).resolves.toMatchObject({
      status: 400,
      body: { code: 'PRICE_LABEL_UNTRUSTED_FIELD' },
    });
    await expect(
      runRetirePriceLabelTemplateHttp(env('1'), owner, {
        templateId: 'template-1',
        priceCents: 1,
      }),
    ).resolves.toMatchObject({
      status: 400,
      body: { code: 'PRICE_LABEL_UNTRUSTED_FIELD' },
    });
    expect(adapters.createPriceLabelTemplate).not.toHaveBeenCalled();
    expect(adapters.retirePriceLabelTemplate).not.toHaveBeenCalled();
  });

  it('keeps batch, reprint and ACK bound to branch and registered terminal', async () => {
    const branchless = { ...supervisor, role: 'owner', branchId: '' };
    const missingTerminal = { ...supervisor, terminalId: '', terminalSessionId: '' };
    const batchBody = {
      products: [{ productId: 'product-1', copies: 1 }],
      templateId: 'template-1',
      idempotencyKey: 'request-branchless',
    };
    await expect(
      runCreatePriceLabelBatchHttp(env('1'), branchless, batchBody),
    ).resolves.toMatchObject({
      status: 403,
    });
    await expect(
      runCreatePriceLabelBatchHttp(env('1'), missingTerminal, batchBody),
    ).resolves.toMatchObject({ status: 403 });
    await expect(
      runReprintPriceLabelBatchHttp(env('1'), missingTerminal, {
        batchId: 'batch-1',
        idempotencyKey: 'reprint-missing-terminal',
      }),
    ).resolves.toMatchObject({ status: 403 });
    await expect(
      runAcknowledgePriceLabelItemsHttp(env('1'), missingTerminal, {
        batchId: 'batch-1',
        acknowledgements: [{ itemId: 'item-1', status: 'ACKED' }],
      }),
    ).resolves.toMatchObject({ status: 403 });
    expect(adapters.resolveActiveTerminalSession).not.toHaveBeenCalled();
  });

  it.each(['product', 'price list', 'template'])('fails closed for cross-tenant %s', async () => {
    adapters.createPriceLabelBatchAtomic.mockRejectedValueOnce(
      new Error('PRICE_LABEL_SCOPE_MISMATCH'),
    );
    await expect(
      runCreatePriceLabelBatchHttp(env('1'), supervisor, {
        products: [{ productId: 'foreign', copies: 1 }],
        templateId: 'foreign',
        priceListId: 'foreign',
        idempotencyKey: 'cross-tenant',
      }),
    ).resolves.toMatchObject({ status: 404, body: { code: 'PRICE_LABEL_SCOPE_MISMATCH' } });
  });
});
