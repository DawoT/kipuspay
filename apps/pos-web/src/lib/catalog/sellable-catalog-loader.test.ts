import { describe, expect, it, vi } from 'vitest';
import type { SellableCatalogItem } from './sellable-catalog-client.js';
import { createSellableCatalogLoader } from './sellable-catalog-loader.js';

const ITEM: SellableCatalogItem = {
  productId: 'product-a',
  sku: 'SKU-A',
  barcode: null,
  name: 'Producto A',
  productType: 'physical',
  unitPriceCents: 1180,
  costCents: 700,
  stockMicrounits: 1_000_000,
  uomCode: 'NIU',
  parentProductId: null,
  chargesIcbper: false,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe('sellable catalog loader', () => {
  it('loads when catalog.sellable arrives after the tenant session', async () => {
    const fetchCatalog = vi.fn(async () => [ITEM]);
    const loader = createSellableCatalogLoader({ fetchCatalog });

    await loader.refresh({ tenantId: 'tenant-a', enabled: false });
    await loader.refresh({ tenantId: 'tenant-a', enabled: true });

    expect(fetchCatalog).toHaveBeenCalledOnce();
    expect(loader.state).toEqual({ items: [ITEM], loading: false, error: '' });
  });

  it('ignores a late response after the tenant changes', async () => {
    const first = deferred<readonly SellableCatalogItem[]>();
    const fetchCatalog = vi
      .fn<
        (input: {
          tenantId: string;
          signal: AbortSignal;
        }) => Promise<readonly SellableCatalogItem[]>
      >()
      .mockImplementationOnce(async () => first.promise)
      .mockImplementationOnce(async () => [
        { ...ITEM, productId: 'product-b', name: 'Producto B' },
      ]);
    const loader = createSellableCatalogLoader({ fetchCatalog });

    const tenantA = loader.refresh({ tenantId: 'tenant-a', enabled: true });
    await loader.refresh({ tenantId: 'tenant-b', enabled: true });
    first.resolve([ITEM]);
    await tenantA;

    expect(loader.state.items).toEqual([{ ...ITEM, productId: 'product-b', name: 'Producto B' }]);
  });

  it('clears catalog and does not let a revoked capability restore it', async () => {
    const pending = deferred<readonly SellableCatalogItem[]>();
    const fetchCatalog = vi.fn(async () => pending.promise);
    const loader = createSellableCatalogLoader({ fetchCatalog });

    const request = loader.refresh({ tenantId: 'tenant-a', enabled: true });
    await loader.refresh({ tenantId: 'tenant-a', enabled: false });
    pending.resolve([ITEM]);
    await request;

    expect(loader.state).toEqual({ items: [], loading: false, error: '' });
  });
});
