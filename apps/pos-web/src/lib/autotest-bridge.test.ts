import { beforeEach, describe, expect, it, vi } from 'vitest';

function setupWindow(search: string, store: Map<string, string>) {
  const localStorageMock = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    length: 0,
  } as unknown as Storage;
  vi.stubGlobal('localStorage', localStorageMock);
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    length: 0,
  } as unknown as Storage);
  vi.stubGlobal('location', { search } as unknown as Location);
  vi.stubGlobal('window', {
    location: { search, href: `https://app.kipuspay.com/?${search}`, toString: () => `https://app.kipuspay.com/?${search}` },
    history: { replaceState: () => {} },
  } as unknown as Window);
  vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-1' } as unknown as Crypto);
  return { store, localStorageMock };
}

function cleanupWindow() {
  vi.unstubAllGlobals();
}

describe('autotest-bridge (H1)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    cleanupWindow();
    delete process.env.PUBLIC_E2E_AUTOTEST;
  });

  it('no hace nada sin ?autotest=boleta', async () => {
    const store = new Map<string, string>([['kipuspay_tenant_id', 't1']]);
    setupWindow('', store);
    const { maybeRunMarketingAutotest } = await import('./autotest-bridge.js');
    const fetchSpy = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ saleId: 's1' }) } as Response));
    vi.stubGlobal('fetch', fetchSpy);
    await maybeRunMarketingAutotest();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('emite boleta 03 S/0.01 a DNI 10715001701 con autotest habilitado', async () => {
    const store = new Map<string, string>([['kipuspay_tenant_id', 't1']]);
    setupWindow('autotest=boleta', store);
    process.env.PUBLIC_E2E_AUTOTEST = '1';
    const { maybeRunMarketingAutotest } = await import('./autotest-bridge.js');
    const fetchSpy = vi.fn((url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(init.body as string) : {};
      if (url.includes('/api/pos/offline-sale')) {
        expect(body.documentType).toBe('03');
        expect(body.customer.documentNumber).toBe('10715001701');
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ saleId: 'sale-1' }) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });
    vi.stubGlobal('fetch', fetchSpy);
    await maybeRunMarketingAutotest();
    expect(fetchSpy).toHaveBeenCalled();
  });
});
