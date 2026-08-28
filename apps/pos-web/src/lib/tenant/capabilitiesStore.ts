/**
 * CapabilitiesStore — SoT reactivo tenant-isolated (ADR-ARCH-003).
 * Svelte store puro, zero npm, Web Platform APIs (CAL-06).
 * - writable Set<string> + epoch/fetchedAt/tenantId
 * - has() fail-closed, offline stale con banner >1h
 * - LS+IDB con epoch, revalidación epoch, tenant isolation, quota guard
 */
type Subscriber<T> = (value: T) => void;
type Unsubscriber = () => void;
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type Writable<T> = {
  subscribe: (run: Subscriber<T>) => Unsubscriber;
  set: (v: T) => void;
  update: (fn: (v: T) => T) => void;
};

function writable<T>(initial: T): Writable<T> {
  let value = initial;
  const subs = new Set<Subscriber<T>>();
  return {
    subscribe(run) {
      run(value);
      subs.add(run);
      return () => subs.delete(run);
    },
    set(v) {
      value = v;
      for (const s of subs) s(value);
    },
    update(fn) {
      value = fn(value);
      for (const s of subs) s(value);
    },
  };
}
function get<T>(store: Writable<T>): T {
  let v!: T;
  const unsub = store.subscribe((val) => (v = val));
  unsub();
  return v;
}

export const CAPS_LS_PREFIX = 'kipuspay.capabilities.v1:';
export const CAPS_IDB_DB_NAME = 'kipus-capabilities';
export const CAPS_IDB_STORE = 'caps';
export const STALE_THRESHOLD_MS = 60 * 60 * 1000;

export interface CapabilitiesCache {
  readonly caps: string[];
  readonly epoch: number;
  readonly fetchedAt: number;
  readonly tenantId: string;
}
export interface CapabilitiesIdbPort {
  get(key: string): Promise<CapabilitiesCache | undefined>;
  set(key: string, value: CapabilitiesCache): Promise<void>;
  del(key: string): Promise<void>;
}
type FetchPort = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export const capabilities: Writable<Set<string>> = writable<Set<string>>(new Set());
export const capabilitiesEpoch: Writable<number> = writable<number>(0);
export const capabilitiesFetchedAt: Writable<number | null> = writable<number | null>(null);
export const capabilitiesTenantId: Writable<string | null> = writable<string | null>(null);

export function has(cap: string): boolean {
  return get(capabilities).has(cap);
}
export function hasCapability(cap: string): boolean {
  return has(cap);
}
function fmtBanner(cachedAtMs: number, nowMs: number): string {
  const hours = Math.max(0, Math.floor((nowMs - cachedAtMs) / 3_600_000));
  if (hours < 1) {
    const mins = Math.max(0, Math.floor((nowMs - cachedAtMs) / 60_000));
    return `Datos de hace ${mins} min (no en vivo)`;
  }
  return `Datos de hace ${hours} horas (no en vivo)`;
}
export function getStaleBanner(nowMs = Date.now()): string | null {
  const fetchedAt = get(capabilitiesFetchedAt);
  if (fetchedAt === null) return null;
  const age = nowMs - fetchedAt;
  if (age <= STALE_THRESHOLD_MS) return null;
  return fmtBanner(fetchedAt, nowMs);
}
export function isCapabilitiesStale(nowMs = Date.now()): boolean {
  const fetchedAt = get(capabilitiesFetchedAt);
  if (fetchedAt === null) return false;
  return nowMs - fetchedAt > STALE_THRESHOLD_MS;
}

function safeLS(storage?: Storage | null): Storage | null {
  if (storage) return storage;
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    void 0;
  }
  return null;
}
function lsKey(tenantId: string): string {
  return CAPS_LS_PREFIX + tenantId;
}
function isQuotaExceeded(error: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' &&
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) ||
    (error instanceof Error &&
      /(QuotaExceeded|NS_ERROR_DOM_QUOTA_REACHED)/i.test(error.name + error.message))
  );
}
function readLs(tenantId: string, storage?: Storage | null): CapabilitiesCache | null {
  const ls = safeLS(storage);
  if (!ls || !tenantId) return null;
  try {
    const raw = ls.getItem(lsKey(tenantId));
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<CapabilitiesCache>;
    if (!Array.isArray(p.caps) || typeof p.epoch !== 'number' || typeof p.fetchedAt !== 'number')
      return null;
    if (typeof p.tenantId === 'string' && p.tenantId !== tenantId) return null;
    return {
      caps: p.caps.map(String).sort(),
      epoch: Number.isFinite(p.epoch) ? p.epoch : 0,
      fetchedAt: Number.isFinite(p.fetchedAt) ? p.fetchedAt : 0,
      tenantId,
    };
  } catch {
    return null;
  }
}
function writeLs(cache: CapabilitiesCache, storage?: Storage | null): void {
  const ls = safeLS(storage);
  if (!ls || !cache.tenantId) return;
  try {
    ls.setItem(lsKey(cache.tenantId), JSON.stringify(cache));
  } catch (error) {
    if (isQuotaExceeded(error)) {
      try {
        console.warn('[capabilitiesStore] QuotaExceeded LS', error);
      } catch {
        void 0;
      }
      return;
    }
    throw error;
  }
}
function clearLs(tenantId: string, storage?: Storage | null): void {
  const ls = safeLS(storage);
  if (!ls || !tenantId) return;
  try {
    ls.removeItem(lsKey(tenantId));
  } catch {
    void 0;
  }
}

export function createMemoryCapabilitiesIdb(): CapabilitiesIdbPort & {
  readonly store: Map<string, CapabilitiesCache>;
} {
  const store = new Map<string, CapabilitiesCache>();
  return {
    store,
    get(key) {
      return Promise.resolve(store.get(key));
    },
    set(key, value) {
      store.set(key, value);
      return Promise.resolve();
    },
    del(key) {
      store.delete(key);
      return Promise.resolve();
    },
  };
}
export function createBrowserCapabilitiesIdb(
  dbName = CAPS_IDB_DB_NAME,
  storeName = CAPS_IDB_STORE,
): CapabilitiesIdbPort {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined')
    return createMemoryCapabilitiesIdb();
  const openDb = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IDB_OPEN_FAILED'));
    });
  return {
    async get(key) {
      const db = await openDb();
      return new Promise<CapabilitiesCache | undefined>((resolve, reject) => {
        const tx = db['transaction'](storeName, 'readonly');
        const req = tx.objectStore(storeName).get(key) as IDBRequest<unknown>;
        req.onsuccess = () => {
          const v = req.result as CapabilitiesCache | undefined;
          if (!v || !Array.isArray(v.caps) || typeof v.epoch !== 'number') resolve(undefined);
          else resolve(v);
        };
        req.onerror = () => reject(req.error ?? new Error('IDB_GET_FAILED'));
      });
    },
    async set(key, value) {
      const db = await openDb();
      return new Promise<void>((resolve, reject) => {
        const tx = db['transaction'](storeName, 'readwrite');
        const req = tx.objectStore(storeName).put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = () => {
          const err = req.error;
          if (err && isQuotaExceeded(err)) {
            try {
              console.warn('[capabilitiesStore] QuotaExceeded IDB', err);
            } catch {
              void 0;
            }
            resolve();
            return;
          }
          reject(err ?? new Error('IDB_SET_FAILED'));
        };
      });
    },
    async del(key) {
      const db = await openDb();
      return new Promise<void>((resolve, reject) => {
        const tx = db['transaction'](storeName, 'readwrite');
        const req = tx.objectStore(storeName).delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error ?? new Error('IDB_DEL_FAILED'));
      });
    },
  };
}
let browserIdbSingleton: CapabilitiesIdbPort | null = null;
function getDefaultIdb(): CapabilitiesIdbPort | null {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') return null;
  if (!browserIdbSingleton) browserIdbSingleton = createBrowserCapabilitiesIdb();
  return browserIdbSingleton;
}

function apply(cache: CapabilitiesCache): void {
  capabilities.set(new Set(cache.caps));
  capabilitiesEpoch.set(cache.epoch);
  capabilitiesFetchedAt.set(cache.fetchedAt);
  capabilitiesTenantId.set(cache.tenantId);
}
function toCache(
  caps: string[],
  epoch: number,
  fetchedAt: number,
  tenantId: string,
): CapabilitiesCache {
  return {
    caps: [...caps].map(String).sort(),
    epoch: Number.isFinite(epoch) ? epoch : 0,
    fetchedAt,
    tenantId,
  };
}
async function writeBoth(
  cache: CapabilitiesCache,
  storage?: Storage | null,
  idb?: CapabilitiesIdbPort | null,
): Promise<void> {
  try {
    writeLs(cache, storage);
  } catch {
    void 0;
  }
  const port = idb ?? getDefaultIdb();
  if (port) {
    try {
      await port.set(lsKey(cache.tenantId), cache);
    } catch (e) {
      if (isQuotaExceeded(e)) {
        try {
          console.warn('[capabilitiesStore] QuotaExceeded writeBoth', e);
        } catch {
          void 0;
        }
        return;
      }
      throw e;
    }
  }
}
async function readBoth(
  tenantId: string,
  storage?: Storage | null,
  idb?: CapabilitiesIdbPort | null,
): Promise<CapabilitiesCache | null> {
  const ls = readLs(tenantId, storage);
  if (ls) return ls;
  const port = idb ?? getDefaultIdb();
  if (port) {
    try {
      const v = await port.get(lsKey(tenantId));
      if (v) {
        try {
          writeLs(v, storage);
        } catch {
          void 0;
        }
        return v;
      }
    } catch {
      void 0;
    }
  }
  return null;
}
export async function hydrateCapabilities(input: {
  readonly tenantId: string;
  readonly storage?: Storage | null;
  readonly idb?: CapabilitiesIdbPort | null;
}): Promise<CapabilitiesCache | null> {
  if (!input.tenantId) return null;
  const c = await readBoth(input.tenantId, input.storage, input.idb);
  if (c) apply(c);
  return c;
}
export async function setCapabilities(input: {
  readonly caps: readonly string[];
  readonly epoch: number;
  readonly tenantId: string;
  readonly fetchedAt?: number;
  readonly storage?: Storage | null;
  readonly idb?: CapabilitiesIdbPort | null;
}): Promise<void> {
  if (!input.tenantId) return;
  const fetchedAt = input.fetchedAt ?? Date.now();
  const cache = toCache([...input.caps], input.epoch, fetchedAt, input.tenantId);
  apply(cache);
  await writeBoth(cache, input.storage, input.idb);
}
export async function clearCapabilities(input?: {
  readonly tenantId?: string;
  readonly storage?: Storage | null;
  readonly idb?: CapabilitiesIdbPort | null;
}): Promise<void> {
  const tenantId = input?.tenantId ?? get(capabilitiesTenantId) ?? '';
  capabilities.set(new Set());
  capabilitiesEpoch.set(0);
  capabilitiesFetchedAt.set(null);
  if (tenantId) {
    capabilitiesTenantId.set(null);
    clearLs(tenantId, input?.storage);
    const port = input?.idb ?? getDefaultIdb();
    if (port)
      try {
        await port.del(lsKey(tenantId));
      } catch {
        void 0;
      }
  } else capabilitiesTenantId.set(null);
}
export async function clear(input?: {
  readonly tenantId?: string;
  readonly storage?: Storage | null;
  readonly idb?: CapabilitiesIdbPort | null;
}): Promise<void> {
  await clearCapabilities(input);
}
// eslint-disable-next-line complexity
export async function loadCapabilities(input: {
  readonly fetcher: FetchPort;
  readonly tenantId?: string;
  readonly storage?: Storage | null;
  readonly idb?: CapabilitiesIdbPort | null;
  readonly apiBase?: string;
  readonly nowMs?: number;
}): Promise<{
  fromCache: boolean;
  stale: boolean;
  banner: string | null;
  caps: string[];
  epoch: number;
}> {
  const nowMs = input.nowMs ?? Date.now();
  let tenantId = input.tenantId ?? get(capabilitiesTenantId) ?? '';
  if (!tenantId) {
    const ls = safeLS(input.storage);
    try {
      tenantId = ls?.getItem('kipuspay_tenant_id')?.trim() ?? '';
    } catch {
      tenantId = '';
    }
  }
  const apiBase = (input.apiBase ?? '').replace(/\/$/, '');
  const url = `${apiBase}/api/auth/session`;
  try {
    const res = await input.fetcher(url, {
      method: 'GET',
      credentials: 'include',
      headers: (() => {
        const h = new Headers();
        if (tenantId) h.set('x-tenant-id', tenantId);
        return h;
      })(),
    });
    if (res.ok) {
      const body = (await res.json()) as { capabilities?: unknown; capabilitiesEpoch?: unknown };
      const capsRaw = Array.isArray(body.capabilities) ? body.capabilities : [];
      const caps = capsRaw.map((c) => String(c)).sort();
      const epoch =
        typeof body.capabilitiesEpoch === 'number' && Number.isFinite(body.capabilitiesEpoch)
          ? body.capabilitiesEpoch
          : 0;
      if (tenantId) {
        const cache = toCache(caps, epoch, nowMs, tenantId);
        apply(cache);
        await writeBoth(cache, input.storage, input.idb);
      } else {
        capabilities.set(new Set(caps));
        capabilitiesEpoch.set(epoch);
        capabilitiesFetchedAt.set(nowMs);
        capabilitiesTenantId.set(null);
      }
      return { fromCache: false, stale: false, banner: null, caps, epoch };
    }
    if (tenantId) {
      const cached = await readBoth(tenantId, input.storage, input.idb);
      if (cached) {
        apply(cached);
        const age = nowMs - cached.fetchedAt;
        const stale = age > STALE_THRESHOLD_MS;
        return {
          fromCache: true,
          stale,
          banner: stale ? fmtBanner(cached.fetchedAt, nowMs) : null,
          caps: cached.caps,
          epoch: cached.epoch,
        };
      }
    }
    if (tenantId) {
      capabilities.set(new Set());
      capabilitiesEpoch.set(0);
      capabilitiesFetchedAt.set(null);
      capabilitiesTenantId.set(tenantId);
    }
    return { fromCache: false, stale: false, banner: null, caps: [], epoch: 0 };
  } catch {
    if (tenantId) {
      const cached = await readBoth(tenantId, input.storage, input.idb);
      if (cached) {
        apply(cached);
        const age = nowMs - cached.fetchedAt;
        const stale = age > STALE_THRESHOLD_MS;
        return {
          fromCache: true,
          stale,
          banner: stale ? fmtBanner(cached.fetchedAt, nowMs) : null,
          caps: cached.caps,
          epoch: cached.epoch,
        };
      }
    }
    if (tenantId) {
      const cur = get(capabilitiesTenantId);
      if (cur !== tenantId) {
        capabilities.set(new Set());
        capabilitiesEpoch.set(0);
        capabilitiesFetchedAt.set(null);
        capabilitiesTenantId.set(tenantId);
      }
    }
    return {
      fromCache: true,
      stale: true,
      banner: tenantId ? fmtBanner(nowMs - STALE_THRESHOLD_MS - 1000, nowMs) : null,
      caps: [...get(capabilities)],
      epoch: get(capabilitiesEpoch),
    };
  }
}
if (typeof window !== 'undefined') {
  try {
    const ls = safeLS(null);
    const tid = ls?.getItem('kipuspay_tenant_id')?.trim() ?? '';
    if (tid) {
      const c = readLs(tid, ls);
      if (c) apply(c);
    }
  } catch {
    void 0;
  }
}
export const __test__ = { formatStaleBanner: fmtBanner, lsKey, isQuotaExceeded };
