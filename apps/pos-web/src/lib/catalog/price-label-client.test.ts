import { describe, expect, it, vi } from 'vitest';
import {
  createPriceLabelClient,
  isCatalogPriceLabelsEnabled,
  priceLabelUiState,
} from './price-label-client.js';

describe('catalog.price_labels POS seams', () => {
  const terminalContext = () => ({
    verified: true as const,
    terminalId: 'terminal-1',
    terminalSessionId: 'terminal-session-1',
  });
  const batchDto = (batchId: string) => ({
    batchId,
    branchId: 'branch-1',
    templateId: 'template-1',
    priceListId: 'list-1',
    priceListIdentity: 'EXPLICIT',
    reprintOfBatchId: null,
    snapshotHash: 'snapshot-hash',
    status: 'PENDING',
    items: [],
  });

  it('defaults the public capability off', () => {
    vi.stubEnv('PUBLIC_FEATURE_CATALOG_PRICE_LABELS', '');
    expect(isCatalogPriceLabelsEnabled()).toBe(false);
    vi.unstubAllEnvs();
  });

  it('submits only product identities and optional list, never a price or customer', async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify(batchDto('batch-1')), { status: 201 })),
    );
    const client = createPriceLabelClient({ fetcher, online: () => true, terminalContext });
    await client.createBatch({
      products: [{ productId: 'product-1', copies: 2 }],
      templateId: 'template-1',
      priceListId: 'list-1',
      idempotencyKey: 'request-1',
    });
    const calls = fetcher.mock.calls as unknown as readonly [unknown, RequestInit][];
    const rawBody = calls[0]?.[1]?.body;
    if (typeof rawBody !== 'string') throw new Error('expected JSON request body');
    const body = JSON.parse(rawBody) as Record<string, unknown>;
    expect(body).toEqual({
      products: [{ productId: 'product-1', copies: 2 }],
      templateId: 'template-1',
      priceListId: 'list-1',
      idempotencyKey: 'request-1',
    });
    expect(body).not.toHaveProperty('priceCents');
    expect(body).not.toHaveProperty('customerId');
    const headers = new Headers(calls[0]?.[1]?.headers);
    expect([...headers.keys()].sort()).toEqual([
      'content-type',
      'x-terminal-id',
      'x-terminal-session-id',
    ]);
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('x-terminal-id')).toBe('terminal-1');
    expect(headers.get('x-terminal-session-id')).toBe('terminal-session-1');
  });

  it('fails locally when verified terminal context is absent', async () => {
    const fetcher = vi.fn();
    const client = createPriceLabelClient({
      fetcher,
      online: () => true,
      terminalContext: () => null,
    });
    await expect(
      client.createBatch({
        products: [{ productId: 'product-1', copies: 1 }],
        templateId: 'template-1',
        idempotencyKey: 'request-1',
      }),
    ).rejects.toThrow('PRICE_LABEL_TERMINAL_CONTEXT_REQUIRED');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('uses registered reprint and ACK routes with exact server DTOs', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(batchDto('batch-2')), { status: 201 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ batchStatus: 'PARTIAL', retryItemIds: ['item-2'] }), {
          status: 200,
        }),
      );
    const client = createPriceLabelClient({ fetcher, online: () => true, terminalContext });
    await client.reprintBatch({ batchId: 'batch-1', idempotencyKey: 'reprint-1' });
    await client.acknowledgeItems({
      batchId: 'batch-2',
      acknowledgements: [
        { itemId: 'item-1', status: 'ACKED' },
        { itemId: 'item-2', status: 'FAILED', errorCode: 'PRINTER_JAM' },
      ],
    });
    const calls = fetcher.mock.calls as unknown as readonly [string, RequestInit][];
    const reprintBody = calls[0]?.[1]?.body;
    const ackBody = calls[1]?.[1]?.body;
    if (typeof reprintBody !== 'string' || typeof ackBody !== 'string') {
      throw new Error('expected JSON request bodies');
    }
    expect(calls[0]?.[0]).toBe('/api/catalog/price-labels/batches/reprint');
    expect(JSON.parse(reprintBody)).toEqual({
      batchId: 'batch-1',
      idempotencyKey: 'reprint-1',
    });
    expect(calls[1]?.[0]).toBe('/api/catalog/price-labels/batches/ack');
    expect(JSON.parse(ackBody)).toEqual({
      batchId: 'batch-2',
      acknowledgements: [
        { itemId: 'item-1', status: 'ACKED' },
        { itemId: 'item-2', status: 'FAILED', errorCode: 'PRINTER_JAM' },
      ],
    });
  });

  it('offline permits retry only and disables create/reprint UI seams', async () => {
    const client = createPriceLabelClient({
      fetcher: vi.fn(),
      online: () => false,
      terminalContext,
    });
    await expect(client.createBatch({})).rejects.toThrow('PRICE_LABEL_ONLINE_REQUIRED');
    await expect(
      client.reprintBatch({ batchId: 'batch-1', idempotencyKey: 'offline-reprint' }),
    ).rejects.toThrow(
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
