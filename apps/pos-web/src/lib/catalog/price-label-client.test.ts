import { describe, expect, it, vi } from 'vitest';
import {
  createPriceLabelClient,
  isCatalogPriceLabelsEnabled,
  priceLabelUiState,
} from './price-label-client.js';

describe('catalog.price_labels POS seams', () => {
  it('defaults the public capability off', () => {
    vi.stubEnv('PUBLIC_FEATURE_CATALOG_PRICE_LABELS', '');
    expect(isCatalogPriceLabelsEnabled()).toBe(false);
    vi.unstubAllEnvs();
  });

  it('submits only product identities and optional list, never a price or customer', async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ batchId: 'batch-1' }), { status: 201 })),
    );
    const client = createPriceLabelClient({ fetcher, online: () => true });
    await client.createBatch({
      productIds: ['product-1'],
      templateId: 'template-1',
      priceListId: 'list-1',
      idempotencyKey: 'request-1',
    });
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(body).toEqual({
      productIds: ['product-1'],
      templateId: 'template-1',
      priceListId: 'list-1',
      idempotencyKey: 'request-1',
    });
    expect(body).not.toHaveProperty('priceCents');
    expect(body).not.toHaveProperty('customerId');
  });

  it('offline permits retry only and disables create/reprint UI seams', async () => {
    const client = createPriceLabelClient({ fetcher: vi.fn(), online: () => false });
    await expect(client.createBatch({})).rejects.toThrow('PRICE_LABEL_ONLINE_REQUIRED');
    await expect(client.reprintBatch({ batchId: 'batch-1' })).rejects.toThrow(
      'PRICE_LABEL_ONLINE_REQUIRED',
    );
    await expect(client.retryBatch({ batchId: 'batch-1' })).resolves.toMatchObject({
      batchId: 'batch-1',
      mode: 'RETRY_SNAPSHOT',
    });
    expect(priceLabelUiState({ online: false })).toMatchObject({
      canCreate: false,
      canReprint: false,
      canRetry: true,
    });
  });
});
