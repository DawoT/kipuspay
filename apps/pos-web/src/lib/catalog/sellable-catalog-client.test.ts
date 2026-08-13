import { describe, expect, it, vi } from 'vitest';
import { fetchSellableCatalog, SellableCatalogError } from './sellable-catalog-client';

const VALID_ITEM = {
  productId: 'p1',
  sku: 'SKU-1',
  barcode: '1234567890128',
  name: 'Arroz 5kg',
  productType: 'physical',
  unitPriceCents: 1800,
  costCents: 1400,
  stockMicrounits: 5000000,
  uomCode: 'UN',
  parentProductId: null,
  chargesIcbper: false,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('fetchSellableCatalog', () => {
  it('devuelve el catálogo vendible del servidor', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ items: [VALID_ITEM] }));
    const items = await fetchSellableCatalog({
      apiBase: '',
      authorization: 'Bearer x',
      fetcher,
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ productId: 'p1', unitPriceCents: 1800 });
    const url = fetcher.mock.calls[0]?.[0] as string;
    expect(url).toContain('/api/catalog/sellable');
  });

  it('capability off → SellableCatalogError FEATURE_OFF', async () => {
    const fetcher = vi.fn(() => Promise.resolve(jsonResponse({ code: 'FEATURE_OFF' }, 404)));
    await expect(
      fetchSellableCatalog({ apiBase: '', authorization: 'Bearer x', fetcher }),
    ).rejects.toThrow(SellableCatalogError);
    await expect(
      fetchSellableCatalog({ apiBase: '', authorization: 'Bearer x', fetcher }),
    ).rejects.toMatchObject({ code: 'FEATURE_OFF' });
  });

  it('sin red → SellableCatalogError sin lanzar TypeError', async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(
      fetchSellableCatalog({ apiBase: '', authorization: 'Bearer x', fetcher }),
    ).rejects.toMatchObject({ code: 'SELLABLE_OFFLINE' });
  });

  it('descarta filas inválidas (dinero no entero) con fail-closed', async () => {
    const bad = { ...VALID_ITEM, unitPriceCents: 18.5 };
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ items: [VALID_ITEM, bad] }));
    const items = await fetchSellableCatalog({
      apiBase: '',
      authorization: 'Bearer x',
      fetcher,
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.productId).toBe('p1');
  });

  it('sin autorización no envía el header', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ items: [] }));
    await fetchSellableCatalog({ apiBase: '', authorization: '', fetcher });
    const init = fetcher.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.has('authorization')).toBe(false);
  });
});
