/**
 * owner.offline_rollup — cache IDB read-only del último rollup (edge D UI).
 * Nunca mutaciones offline; banner de antigüedad; refresh al reconectar.
 */

export interface OwnerRollupSnapshot {
  readonly tenantId: string;
  readonly branchId: string;
  readonly reportDate: string;
  readonly grossSalesCents: number;
  readonly netSalesCents: number;
  readonly docCount: number;
  /** Epoch ms cuando se cacheó (server fetch). */
  readonly cachedAtMs: number;
}

export interface OwnerRollupIdbPort {
  get(key: string): Promise<OwnerRollupSnapshot | undefined>;
  set(key: string, value: OwnerRollupSnapshot): Promise<void>;
}

export function rollupCacheKey(tenantId: string, branchId: string, reportDate: string): string {
  return `owner-rollup:${tenantId}:${branchId}:${reportDate}`;
}

/** Banner: nunca presentar como en vivo. */
export function formatStaleBanner(cachedAtMs: number, nowMs: number): string {
  const hours = Math.max(0, Math.floor((nowMs - cachedAtMs) / 3_600_000));
  if (hours < 1) {
    const mins = Math.max(0, Math.floor((nowMs - cachedAtMs) / 60_000));
    return `Datos de hace ${mins} min (no en vivo)`;
  }
  return `Datos de hace ${hours} horas (no en vivo)`;
}

export async function readCachedRollup(
  idb: OwnerRollupIdbPort,
  tenantId: string,
  branchId: string,
  reportDate: string,
): Promise<OwnerRollupSnapshot | null> {
  const row = await idb.get(rollupCacheKey(tenantId, branchId, reportDate));
  return row ?? null;
}

export async function writeCachedRollup(
  idb: OwnerRollupIdbPort,
  snap: OwnerRollupSnapshot,
): Promise<void> {
  await idb.set(rollupCacheKey(snap.tenantId, snap.branchId, snap.reportDate), snap);
}

export interface RefreshRollupDeps {
  readonly idb: OwnerRollupIdbPort;
  readonly fetchDaySummary: (reportDate: string) => Promise<{
    totals: { grossSalesCents: number; netSalesCents: number; docCount: number };
    branches: ReadonlyArray<{ branch_id: string }>;
  }>;
  readonly online: boolean;
  readonly nowMs: number;
}

/**
 * Si online → fetch + cache; si offline → lectura IDB + banner.
 * Nunca inventa cifras "en vivo".
 */
export async function loadOwnerDayView(
  deps: RefreshRollupDeps,
  tenantId: string,
  branchId: string,
  reportDate: string,
): Promise<{
  snapshot: OwnerRollupSnapshot | null;
  banner: string | null;
  fromCache: boolean;
}> {
  if (deps.online) {
    const remote = await deps.fetchDaySummary(reportDate);
    const snap: OwnerRollupSnapshot = {
      tenantId,
      branchId,
      reportDate,
      grossSalesCents: remote.totals.grossSalesCents,
      netSalesCents: remote.totals.netSalesCents,
      docCount: remote.totals.docCount,
      cachedAtMs: deps.nowMs,
    };
    await writeCachedRollup(deps.idb, snap);
    return {
      snapshot: snap,
      banner: null,
      fromCache: false,
    };
  }
  const cached = await readCachedRollup(deps.idb, tenantId, branchId, reportDate);
  if (!cached) return { snapshot: null, banner: null, fromCache: true };
  return {
    snapshot: cached,
    banner: formatStaleBanner(cached.cachedAtMs, deps.nowMs),
    fromCache: true,
  };
}

export function createMemoryOwnerRollupIdb(): OwnerRollupIdbPort & {
  readonly store: Map<string, OwnerRollupSnapshot>;
} {
  const store = new Map<string, OwnerRollupSnapshot>();
  return {
    store,
    get(key) {
      return Promise.resolve(store.get(key));
    },
    set(key, value) {
      store.set(key, value);
      return Promise.resolve();
    },
  };
}
