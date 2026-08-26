/**
 * Branch document series — client Edge para GET /api/branches/:id/series (§5.5).
 * Offline-first con cache localStorage; zero-dep Web Platform.
 */
import { resolveApiAuth, resolveApiBase } from '../auth/api-client.js';

export interface BranchSeries {
  readonly id: string;
  readonly series: string;
  readonly documentTypeCode: string;
  readonly currentNumber: number;
  readonly isActive: boolean;
  readonly authorizationStatus: string;
}

const CACHE_PREFIX = 'kipuspay.branch.series.';

function storageFor(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function cacheKey(branchId: string): string {
  return `${CACHE_PREFIX}${branchId}`;
}

export function readCachedBranchSeries(
  branchId: string,
  storage: Pick<Storage, 'getItem'> | null = storageFor(),
): BranchSeries[] | null {
  try {
    const raw = storage?.getItem(cacheKey(branchId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BranchSeries[];
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCachedBranchSeries(
  branchId: string,
  series: readonly BranchSeries[],
  storage: Pick<Storage, 'setItem'> | null = storageFor(),
): void {
  try {
    storage?.setItem(cacheKey(branchId), JSON.stringify(series));
  } catch {
    // storage lleno/bloqueado: no bloquea cobro
  }
}

export interface FetchBranchSeriesOpts {
  readonly apiBase?: string;
  readonly storage?: Pick<Storage, 'getItem'> | null;
  readonly fetcher?: typeof fetch;
  readonly cacheStorage?: Pick<Storage, 'getItem' | 'setItem'> | null;
}

function buildSeriesHeaders(storage: Pick<Storage, 'getItem'> | null): Record<string, string> {
  const auth = resolveApiAuth(storage);
  const headers: Record<string, string> = { accept: 'application/json' };
  if (auth.authorization) headers.authorization = auth.authorization;
  if (auth['x-tenant-id']) headers['x-tenant-id'] = auth['x-tenant-id'];
  return headers;
}

function parseSeriesPayload(data: unknown): BranchSeries[] {
  if (Array.isArray(data)) return data as BranchSeries[];
  if (data && typeof data === 'object' && Array.isArray((data as { series?: unknown }).series)) {
    return (data as { series: BranchSeries[] }).series;
  }
  return [];
}

function normalizeSeries(list: BranchSeries[]): BranchSeries[] {
  return list.filter(
    (s) => typeof s?.series === 'string' && typeof s?.documentTypeCode === 'string',
  );
}

export async function fetchBranchSeries(
  branchId: string,
  opts: FetchBranchSeriesOpts = {},
): Promise<readonly BranchSeries[]> {
  if (!branchId?.trim()) return [];
  const apiBase = opts.apiBase ?? resolveApiBase(opts.storage ?? storageFor());
  const doFetch = opts.fetcher ?? fetch;
  const headers = buildSeriesHeaders(opts.storage ?? storageFor());
  const url = `${apiBase.replace(/\/$/, '')}/api/branches/${encodeURIComponent(branchId)}/series`;
  try {
    const res = await doFetch(url, { method: 'GET', headers });
    if (!res.ok) throw new Error(`SERIES_FETCH_${res.status}`);
    const data: unknown = await res.json();
    const parsed = parseSeriesPayload(data);
    const normalized = normalizeSeries(parsed);
    writeCachedBranchSeries(branchId, normalized, opts.cacheStorage ?? storageFor());
    return normalized;
  } catch {
    const cached = readCachedBranchSeries(
      branchId,
      opts.cacheStorage ?? storageFor() ?? opts.storage ?? null,
    );
    if (cached) return cached;
    return [];
  }
}

/**
 * Resuelve serie autorizada para el tipo de documento desde branch_document_series.
 * Prioriza AUTHORIZED sobre INTERNAL/PENDING; para NV admite INTERNAL.
 * Si no hay match activo, retorna null (el caller decide fallback o bloqueo).
 */
export function resolveSeriesForBranch(
  branchSeries: readonly BranchSeries[],
  documentType: string,
): string | null {
  const code = documentType === 'NV_RETURN' ? 'NV_RETURN' : documentType;
  const actives = branchSeries.filter((s) => s.isActive && s.documentTypeCode === code);
  if (actives.length === 0) return null;
  // Prefer AUTHORIZED, fallback to any active (INTERNAL for NV, PENDING for CPE en formalizando)
  const authorized = actives.find((s) => s.authorizationStatus === 'AUTHORIZED');
  if (authorized) return authorized.series;
  const internal = actives.find((s) => s.authorizationStatus === 'INTERNAL');
  if (internal) return internal.series;
  // fallback: first active sorted by series asc
  const sorted = [...actives].sort((a, b) => a.series.localeCompare(b.series));
  return sorted[0]?.series ?? null;
}

/**
 * Fallback hardcodeado solo para entornos dev sin series en DB ni cache.
 * No es fuente de verdad; el servidor resuelve folio autoritativo.
 */
export function fallbackSeriesForDocumentType(documentType: string): string {
  if (documentType === '01') return 'F001';
  if (documentType === '03') return 'B001';
  return 'NV01';
}

/** Resolución offline-first: cache → red → fallback. */
export async function resolveSeriesForBranchWithFallback(
  branchId: string,
  documentType: string,
  opts: FetchBranchSeriesOpts & { branchSeries?: readonly BranchSeries[] } = {},
): Promise<string> {
  const list = opts.branchSeries ?? (await fetchBranchSeries(branchId, opts));
  const resolved = resolveSeriesForBranch(list, documentType);
  return resolved ?? fallbackSeriesForDocumentType(documentType);
}
