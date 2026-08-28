import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  capabilities,
  capabilitiesEpoch,
  capabilitiesFetchedAt,
  capabilitiesTenantId,
  has,
  setCapabilities,
  clearCapabilities,
  loadCapabilities,
  hydrateCapabilities,
  createMemoryCapabilitiesIdb,
  CAPS_LS_PREFIX,
  getStaleBanner,
  isCapabilitiesStale,
  __test__,
} from './capabilitiesStore.js';
import { get } from 'svelte/store';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => data.clear(),
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    get length() {
      return data.size;
    },
  } as Storage;
}

function quotaStorage(inner: Storage): Storage {
  return {
    getItem: (k) => inner.getItem(k),
    setItem: () => {
      const e = new Error('QuotaExceededError');
      e.name = 'QuotaExceededError';
      throw e;
    },
    removeItem: (k) => inner.removeItem(k),
    clear: () => inner.clear(),
    key: (i) => inner.key(i),
    get length() {
      return inner.length;
    },
  } as Storage;
}

function idbQuotaFail(): ReturnType<typeof createMemoryCapabilitiesIdb> {
  const base = createMemoryCapabilitiesIdb();
  return {
    ...base,
    set: () => {
      const e = new Error('QuotaExceededError');
      e.name = 'QuotaExceededError';
      return Promise.reject(e);
    },
  };
}

describe('capabilitiesStore — has, load, cache, stale, tenant isolation', () => {
  beforeEach(async () => {
    await clearCapabilities();
    vi.unstubAllEnvs();
  });
  afterEach(async () => {
    await clearCapabilities();
  });

  it('fail-closed: has() false cuando vacío', () => {
    expect(has('owner.mode')).toBe(false);
    expect(has('pos.checkout')).toBe(false);
    expect(get(capabilities).size).toBe(0);
  });

  it('setCapabilities + has (sorted, epoch, fetchedAt, tenant isolation)', async () => {
    const storage = memoryStorage();
    const idb = createMemoryCapabilitiesIdb();
    await setCapabilities({
      caps: ['owner.mode', 'pos.checkout', 'inventory.batches'],
      epoch: 42,
      tenantId: 'tenant-a',
      fetchedAt: 1_000,
      storage,
      idb,
    });
    expect(has('owner.mode')).toBe(true);
    expect(has('pos.checkout')).toBe(true);
    expect(has('cash.blind_z')).toBe(false);
    expect(get(capabilitiesEpoch)).toBe(42);
    expect(get(capabilitiesFetchedAt)).toBe(1_000);
    expect(get(capabilitiesTenantId)).toBe('tenant-a');
    // Persistencia LS: sorted
    const raw = storage.getItem(CAPS_LS_PREFIX + 'tenant-a');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed.caps).toEqual(['inventory.batches', 'owner.mode', 'pos.checkout']);
    expect(parsed.epoch).toBe(42);
    // IDB también
    const fromIdb = await idb.get(CAPS_LS_PREFIX + 'tenant-a');
    expect(fromIdb?.caps).toEqual(['inventory.batches', 'owner.mode', 'pos.checkout']);
  });

  it('tenant isolation: tenant-a no ve caps de tenant-b', async () => {
    const storage = memoryStorage();
    const idb = createMemoryCapabilitiesIdb();
    await setCapabilities({
      caps: ['pos.checkout'],
      epoch: 10,
      tenantId: 'tenant-a',
      storage,
      idb,
    });
    expect(has('pos.checkout')).toBe(true);
    await setCapabilities({ caps: ['owner.mode'], epoch: 99, tenantId: 'tenant-b', storage, idb });
    expect(has('owner.mode')).toBe(true);
    expect(has('pos.checkout')).toBe(false);
    // tenant-a sigue en LS/IDB aislado
    const aCache = storage.getItem(CAPS_LS_PREFIX + 'tenant-a');
    expect(JSON.parse(aCache as string).caps).toEqual(['pos.checkout']);
    const bCache = storage.getItem(CAPS_LS_PREFIX + 'tenant-b');
    expect(JSON.parse(bCache as string).caps).toEqual(['owner.mode']);
    // hydrate tenant-a restaura solo a
    await clearCapabilities({ tenantId: 'tenant-b', storage, idb });
    // clear b shouldn't affect a's LS
    expect(storage.getItem(CAPS_LS_PREFIX + 'tenant-a')).not.toBeNull();
    await hydrateCapabilities({ tenantId: 'tenant-a', storage, idb });
    expect(has('pos.checkout')).toBe(true);
    expect(has('owner.mode')).toBe(false);
  });

  it('loadCapabilities success: fetch sorted + persist + stores', async () => {
    const storage = memoryStorage({ kipuspay_tenant_id: 'tenant-a' });
    const idb = createMemoryCapabilitiesIdb();
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            capabilities: ['pos.checkout', 'cash.blind_z', 'owner.mode'],
            capabilitiesEpoch: 7,
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
    );
    const res = await loadCapabilities({
      fetcher,
      tenantId: 'tenant-a',
      storage,
      idb,
      nowMs: 5_000,
    });
    expect(res.fromCache).toBe(false);
    expect(res.stale).toBe(false);
    expect(res.banner).toBeNull();
    expect(res.caps).toEqual(['cash.blind_z', 'owner.mode', 'pos.checkout']); // sorted
    expect(res.epoch).toBe(7);
    expect(has('owner.mode')).toBe(true);
    expect(get(capabilitiesEpoch)).toBe(7);
    expect(get(capabilitiesFetchedAt)).toBe(5_000);
  });

  it('stale banner: fetchedAt >1h genera banner "hace X horas (no en vivo)"', async () => {
    const storage = memoryStorage();
    const idb = createMemoryCapabilitiesIdb();
    const old = Date.now() - 2 * 60 * 60 * 1000 - 5_000; // 2h atrás
    await setCapabilities({
      caps: ['owner.mode'],
      epoch: 5,
      tenantId: 'tenant-a',
      fetchedAt: old,
      storage,
      idb,
    });
    expect(isCapabilitiesStale()).toBe(true);
    const banner = getStaleBanner();
    expect(banner).toContain('2 horas');
    expect(banner).toContain('no en vivo');
    // Banner <1h es mins
    const recentStale = Date.now() - 70 * 60 * 1000; // 70 min
    await setCapabilities({
      caps: ['owner.mode'],
      epoch: 5,
      tenantId: 'tenant-a',
      fetchedAt: recentStale,
      storage,
      idb,
    });
    const banner2 = getStaleBanner();
    expect(banner2).toContain('1 horas'); // floor 1h
    // Fresh <1h no banner
    const fresh = Date.now() - 30 * 60 * 1000;
    await setCapabilities({
      caps: ['owner.mode'],
      epoch: 5,
      tenantId: 'tenant-a',
      fetchedAt: fresh,
      storage,
      idb,
    });
    expect(getStaleBanner()).toBeNull();
    expect(isCapabilitiesStale()).toBe(false);
  });

  it('offline stale fallback: fetch falla pero cache existe → fromCache true con banner si viejo', async () => {
    const storage = memoryStorage({ kipuspay_tenant_id: 'tenant-a' });
    const idb = createMemoryCapabilitiesIdb();
    const old = Date.now() - 3 * 60 * 60 * 1000;
    await setCapabilities({
      caps: ['owner.mode', 'pos.checkout'],
      epoch: 3,
      tenantId: 'tenant-a',
      fetchedAt: old,
      storage,
      idb,
    });
    const failingFetcher = vi.fn(async () => {
      throw new Error('offline');
    });
    const res = await loadCapabilities({
      fetcher: failingFetcher,
      tenantId: 'tenant-a',
      storage,
      idb,
    });
    expect(res.fromCache).toBe(true);
    expect(res.caps).toContain('owner.mode');
    expect(has('owner.mode')).toBe(true);
    expect(res.banner).toContain('no en vivo');
    expect(res.stale).toBe(true);
  });

  it('offline fail-closed sin cache: fetch falla y sin cache → has false', async () => {
    const storage = memoryStorage({ kipuspay_tenant_id: 'tenant-new' });
    const idb = createMemoryCapabilitiesIdb();
    const failingFetcher = vi.fn(async () => {
      throw new Error('offline');
    });
    const res = await loadCapabilities({
      fetcher: failingFetcher,
      tenantId: 'tenant-new',
      storage,
      idb,
    });
    expect(has('owner.mode')).toBe(false);
    // caps vacíos
    expect(res.caps).toEqual([]);
  });

  it('revalidación por epoch: server epoch nuevo actualiza cache', async () => {
    const storage = memoryStorage({ kipuspay_tenant_id: 'tenant-a' });
    const idb = createMemoryCapabilitiesIdb();
    await setCapabilities({ caps: ['pos.checkout'], epoch: 1, tenantId: 'tenant-a', storage, idb });
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ capabilities: ['pos.checkout', 'owner.mode'], capabilitiesEpoch: 2 }),
          { status: 200 },
        ),
    );
    const res = await loadCapabilities({
      fetcher,
      tenantId: 'tenant-a',
      storage,
      idb,
      nowMs: 9_000,
    });
    expect(res.epoch).toBe(2);
    expect(has('owner.mode')).toBe(true);
    const raw = JSON.parse(storage.getItem(CAPS_LS_PREFIX + 'tenant-a') as string);
    expect(raw.epoch).toBe(2);
  });

  it('QuotaExceededError en LS no rompe store (invariante 7)', async () => {
    const inner = memoryStorage();
    const quotaLs = quotaStorage(inner);
    const idb = createMemoryCapabilitiesIdb();
    // No debe lanzar
    await expect(
      setCapabilities({
        caps: ['owner.mode'],
        epoch: 1,
        tenantId: 'tenant-a',
        storage: quotaLs,
        idb,
      }),
    ).resolves.toBeUndefined();
    expect(has('owner.mode')).toBe(true); // en memoria sí
    // LS no guardó pero IDB sí
    const fromIdb = await idb.get(CAPS_LS_PREFIX + 'tenant-a');
    expect(fromIdb?.caps).toEqual(['owner.mode']);
  });

  it('QuotaExceededError en IDB no rompe store', async () => {
    const storage = memoryStorage();
    const quotaIdb = idbQuotaFail();
    await expect(
      setCapabilities({
        caps: ['owner.mode'],
        epoch: 1,
        tenantId: 'tenant-a',
        storage,
        idb: quotaIdb,
      }),
    ).resolves.toBeUndefined();
    expect(has('owner.mode')).toBe(true);
    // LS sí guardó
    const raw = storage.getItem(CAPS_LS_PREFIX + 'tenant-a');
    expect(JSON.parse(raw as string).caps).toEqual(['owner.mode']);
  });

  it('clear tenant-isolated: borra solo tenant indicado', async () => {
    const storage = memoryStorage();
    const idb = createMemoryCapabilitiesIdb();
    await setCapabilities({ caps: ['owner.mode'], epoch: 1, tenantId: 'tenant-a', storage, idb });
    await setCapabilities({ caps: ['pos.checkout'], epoch: 2, tenantId: 'tenant-b', storage, idb });
    await clearCapabilities({ tenantId: 'tenant-a', storage, idb });
    expect(storage.getItem(CAPS_LS_PREFIX + 'tenant-a')).toBeNull();
    expect(storage.getItem(CAPS_LS_PREFIX + 'tenant-b')).not.toBeNull();
    expect(await idb.get(CAPS_LS_PREFIX + 'tenant-a')).toBeUndefined();
    expect(await idb.get(CAPS_LS_PREFIX + 'tenant-b')).toBeDefined();
  });

  it('loadCapabilities con storage tenant hint fallback', async () => {
    const storage = memoryStorage({ kipuspay_tenant_id: 'tenant-a' });
    const idb = createMemoryCapabilitiesIdb();
    await setCapabilities({ caps: ['owner.mode'], epoch: 1, tenantId: 'tenant-a', storage, idb });
    // load sin tenantId explícito pero con LS hint debe hidratar
    const failingFetcher = vi.fn(async () => {
      throw new Error('offline');
    });
    await clearCapabilities(); // limpia memoria pero no LS
    // Ahora memoria vacía, pero LS tiene tenant-a
    const res = await loadCapabilities({ fetcher: failingFetcher, storage, idb });
    expect(res.fromCache).toBe(true);
    expect(has('owner.mode')).toBe(true);
  });

  it('__test__ helpers: lsKey y isQuotaExceeded y formatStaleBanner', () => {
    expect(__test__.lsKey('tenant-x')).toBe(CAPS_LS_PREFIX + 'tenant-x');
    const qe = new DOMException('QuotaExceededError', 'QuotaExceededError');
    expect(__test__.isQuotaExceeded(qe)).toBe(true);
    const banner = __test__.formatStaleBanner(0, 3_600_000);
    expect(banner).toContain('1 horas');
    expect(banner).toContain('no en vivo');
    const bannerMins = __test__.formatStaleBanner(0, 120_000);
    expect(bannerMins).toContain('2 min');
  });
});

describe('capabilitiesStore — integración con app-shell-session (mock)', () => {
  beforeEach(async () => {
    await clearCapabilities();
  });
  afterEach(async () => {
    await clearCapabilities();
  });

  it('loadAuthenticatedAppShellSession pobla store en bootstrap (owner)', async () => {
    const { loadAuthenticatedAppShellSession } = await import('../admin/app-shell-session.js');
    const storage = memoryStorage({
      kipuspay_tenant_id: 'tenant-a',
      'kipuspay:pos-terminal-id': '',
    });
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            userId: 'owner-a',
            role: 'owner',
            branchId: '',
            terminal: null,
            capabilities: ['owner.mode', 'pos.checkout'],
            capabilitiesEpoch: 5,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    const session = await loadAuthenticatedAppShellSession({
      fetcher,
      storage,
      authorization: 'Bearer test',
    });
    expect(session).not.toBeNull();
    expect(session?.capabilities).toEqual(['owner.mode', 'pos.checkout']);
    expect(session?.capabilitiesEpoch).toBe(5);
    // Store poblado
    expect(has('owner.mode')).toBe(true);
    expect(has('pos.checkout')).toBe(true);
    expect(get(capabilitiesEpoch)).toBe(5);
    // Persistencia LS
    const raw = storage.getItem(CAPS_LS_PREFIX + 'tenant-a');
    expect(raw).not.toBeNull();
  });

  it('app-shell fallback offline con cache stale (banner) aun cuando fetch 503', async () => {
    const { loadAuthenticatedAppShellSession } = await import('../admin/app-shell-session.js');
    const storage = memoryStorage({ kipuspay_tenant_id: 'tenant-a' });
    const idb = createMemoryCapabilitiesIdb(); // app-shell usará LS por defecto, pero probamos hydrate manual
    // Preparar cache vieja
    const old = Date.now() - 2 * 60 * 60 * 1000;
    await setCapabilities({
      caps: ['owner.mode'],
      epoch: 3,
      tenantId: 'tenant-a',
      fetchedAt: old,
      storage,
      idb,
    });
    // Limpiar memoria para simular reload
    await clearCapabilities();
    // Pero LS sigue teniendo old, ahora fetch falla con 503
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ code: 'CAPABILITIES_UNAVAILABLE' }), { status: 503 }),
    );
    const session = await loadAuthenticatedAppShellSession({ fetcher, storage });
    expect(session).toBeNull();
    // Pero store debe haberse hidratado con stale
    // hydrateCapabilities es llamado internamente con LS, que aún tiene el old
    // Esperar un tick para que hydrate async complete? load ya awaited hydrate
    expect(has('owner.mode')).toBe(true);
    expect(getStaleBanner()).toContain('no en vivo');
  });

  it('features.ts delegación: dynamic 0 usa flag, dynamic 1 usa store', async () => {
    const mod = await import('../features.js');
    // dynamic 0: flagOn true aunque store vacío
    vi.stubEnv('PUBLIC_FEATURE_TENANT_CAPABILITIES_DYNAMIC', '0');
    vi.stubEnv('PUBLIC_FEATURE_OWNER_MODE', '1');
    await setCapabilities({ caps: [], epoch: 0, tenantId: 'tenant-a' });
    expect(mod.isOwnerModeEnabled()).toBe(true);
    vi.stubEnv('PUBLIC_FEATURE_OWNER_MODE', '0');
    expect(mod.isOwnerModeEnabled()).toBe(false);
    // dynamic 1, flag 0 pero store tiene cap => true
    vi.stubEnv('PUBLIC_FEATURE_TENANT_CAPABILITIES_DYNAMIC', '1');
    vi.stubEnv('PUBLIC_FEATURE_OWNER_MODE', '0');
    await setCapabilities({ caps: ['owner.mode'], epoch: 1, tenantId: 'tenant-a' });
    expect(mod.isOwnerModeEnabled()).toBe(true);
    await setCapabilities({ caps: [], epoch: 1, tenantId: 'tenant-a' });
    expect(mod.isOwnerModeEnabled()).toBe(false);
    // reset to flag mode for other tests
    vi.stubEnv('PUBLIC_FEATURE_TENANT_CAPABILITIES_DYNAMIC', '0');
    vi.stubEnv('PUBLIC_FEATURE_OWNER_MODE', '');
    vi.unstubAllEnvs();
  });

  it('features.ts isInventoryOpsEnabled OR logic con dynamic', async () => {
    const mod = await import('../features.js');
    vi.stubEnv('PUBLIC_FEATURE_TENANT_CAPABILITIES_DYNAMIC', '1');
    await setCapabilities({ caps: ['inventory.batches'], epoch: 1, tenantId: 'tenant-a' });
    expect(mod.isInventoryOpsEnabled()).toBe(true);
    await setCapabilities({ caps: ['inventory.bom'], epoch: 1, tenantId: 'tenant-a' });
    expect(mod.isInventoryOpsEnabled()).toBe(true);
    await setCapabilities({ caps: [], epoch: 1, tenantId: 'tenant-a' });
    expect(mod.isInventoryOpsEnabled()).toBe(false);
    // fallback flag OR
    vi.stubEnv('PUBLIC_FEATURE_TENANT_CAPABILITIES_DYNAMIC', '0');
    vi.stubEnv('PUBLIC_FEATURE_INVENTORY_BATCHES', '1');
    vi.stubEnv('PUBLIC_FEATURE_INVENTORY_BOM', '');
    expect(mod.isInventoryOpsEnabled()).toBe(true);
    vi.stubEnv('PUBLIC_FEATURE_INVENTORY_BATCHES', '');
    vi.stubEnv('PUBLIC_FEATURE_INVENTORY_BOM', '1');
    expect(mod.isInventoryOpsEnabled()).toBe(true);
    vi.stubEnv('PUBLIC_FEATURE_INVENTORY_BATCHES', '');
    vi.stubEnv('PUBLIC_FEATURE_INVENTORY_BOM', '');
    expect(mod.isInventoryOpsEnabled()).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe('capabilitiesStore — QuotaExceededError e inyección adversa (chaos)', () => {
  it('loadCapabilities con QuotaExceeded en persistencia no pierde has() (fail-closed pero con memoria)', async () => {
    const storage = memoryStorage({ kipuspay_tenant_id: 'tenant-a' });
    const quotaLs = quotaStorage(storage);
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ capabilities: ['owner.mode'], capabilitiesEpoch: 9 }), {
          status: 200,
        }),
    );
    const res = await loadCapabilities({
      fetcher,
      tenantId: 'tenant-a',
      storage: quotaLs,
      nowMs: 1_000,
    });
    expect(has('owner.mode')).toBe(true);
    expect(res.caps).toEqual(['owner.mode']);
  });

  it('inyección de cuota IDB durante load no corrompe cola (offline stale preservado)', async () => {
    const storage = memoryStorage({ kipuspay_tenant_id: 'tenant-a' });
    const idb = createMemoryCapabilitiesIdb();
    await setCapabilities({
      caps: ['owner.mode'],
      epoch: 1,
      tenantId: 'tenant-a',
      fetchedAt: Date.now() - 1000,
      storage,
      idb,
    });
    const quotaIdb = idbQuotaFail();
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ capabilities: ['owner.mode', 'pos.checkout'], capabilitiesEpoch: 2 }),
          { status: 200 },
        ),
    );
    const res = await loadCapabilities({
      fetcher,
      tenantId: 'tenant-a',
      storage,
      idb: quotaIdb,
      nowMs: Date.now(),
    });
    expect(has('owner.mode')).toBe(true);
    expect(res.caps).toContain('pos.checkout');
  });
});
