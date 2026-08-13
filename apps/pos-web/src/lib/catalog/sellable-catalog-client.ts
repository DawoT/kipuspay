export interface SellableCatalogItem {
  readonly productId: string;
  readonly sku: string;
  readonly barcode: string | null;
  readonly name: string;
  readonly productType: string;
  readonly unitPriceCents: number;
  readonly costCents: number;
  readonly stockMicrounits: number;
  readonly uomCode: string | null;
  readonly parentProductId: string | null;
  readonly chargesIcbper: boolean;
}

export class SellableCatalogError extends Error {
  constructor(
    readonly code: string,
    readonly status?: number,
  ) {
    super(code);
    this.name = 'SellableCatalogError';
  }
}

function safeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function isSellableItem(value: unknown): value is SellableCatalogItem {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    hasIdentifiers(row) &&
    hasSafeMoney(row) &&
    hasOptionalStrings(row)
  );
}

function hasIdentifiers(row: Record<string, unknown>): boolean {
  return (
    typeof row.productId === 'string' &&
    row.productId.length > 0 &&
    typeof row.sku === 'string' &&
    typeof row.name === 'string'
  );
}

function hasSafeMoney(row: Record<string, unknown>): boolean {
  return (
    safeInteger(row.unitPriceCents) &&
    row.unitPriceCents >= 0 &&
    safeInteger(row.costCents) &&
    safeInteger(row.stockMicrounits)
  );
}

function hasOptionalStrings(row: Record<string, unknown>): boolean {
  return (
    (row.barcode === null || typeof row.barcode === 'string') &&
    (row.uomCode === null || typeof row.uomCode === 'string') &&
    (row.parentProductId === null || typeof row.parentProductId === 'string')
  );
}

export async function fetchSellableCatalog(input: {
  readonly apiBase: string;
  readonly authorization: string;
  readonly branchId?: string;
  readonly fetcher?: typeof fetch;
}): Promise<SellableCatalogItem[]> {
  const fetcher = input.fetcher ?? fetch;
  const base = input.apiBase.replace(/\/$/, '');
  const headers = new Headers();
  if (input.authorization) headers.set('authorization', input.authorization);
  let response: Response;
  try {
    response = await fetcher(`${base}/api/catalog/sellable`, { headers, credentials: 'include' });
  } catch {
    throw new SellableCatalogError('SELLABLE_OFFLINE');
  }
  if (!response.ok) {
    let code = `HTTP_${response.status}`;
    try {
      const body = (await response.json()) as { code?: string };
      if (typeof body.code === 'string') code = body.code;
    } catch {
      // cuerpo no JSON: el código HTTP es suficiente.
    }
    throw new SellableCatalogError(code, response.status);
  }
  const body = (await response.json()) as { items?: unknown };
  if (!Array.isArray(body.items)) throw new SellableCatalogError('SELLABLE_INVALID');
  return body.items.filter(isSellableItem);
}
