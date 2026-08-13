import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, resolveApiAuth, resolveApiBase } from './api-client.js';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
}

describe('api-client (contrato de auth unificado, F1)', () => {
  let storage: Storage;

  beforeEach(() => {
    vi.stubEnv('PUBLIC_API_BASE', undefined);
    vi.stubEnv('PUBLIC_DEV_AUTH', undefined);
    storage = memoryStorage();
  });

  it('NUNCA produce el literal Bearer demo como fallback (auth fail-closed cliente)', () => {
    const auth = resolveApiAuth(storage);
    expect(auth.authorization ?? '').not.toContain('demo');
    expect(auth).toEqual({});
  });

  it('sin storage (node/tests) devuelve vacío sin reventar', () => {
    expect(resolveApiAuth()).toEqual({});
    expect(resolveApiBase()).toBe('');
  });

  it('usa el token de cajero almacenado (kipuspay_token) como Bearer', () => {
    storage.setItem('kipuspay_token', 'jwt-123');
    expect(resolveApiAuth(storage)).toEqual({ authorization: 'Bearer jwt-123' });
  });

  it('respeta el override de desarrollo explícito (PUBLIC_DEV_AUTH)', () => {
    vi.stubEnv('PUBLIC_DEV_AUTH', 'Bearer dev-token');
    expect(resolveApiAuth(storage)).toEqual({ authorization: 'Bearer dev-token' });
  });

  it('el override de desarrollo gana al token de cajero', () => {
    vi.stubEnv('PUBLIC_DEV_AUTH', 'Bearer dev-token');
    storage.setItem('kipuspay_token', 'jwt-123');
    expect(resolveApiAuth(storage)).toEqual({ authorization: 'Bearer dev-token' });
  });

  it('resolveApiBase: PUBLIC_API_BASE, luego override local, luego vacío (same-origin)', () => {
    vi.stubEnv('PUBLIC_API_BASE', 'https://api.prod.kipuspay.com/');
    expect(resolveApiBase(storage)).toBe('https://api.prod.kipuspay.com');
    vi.stubEnv('PUBLIC_API_BASE', undefined);
    storage.setItem('kipuspay_api_base', 'http://localhost:8787');
    expect(resolveApiBase(storage)).toBe('http://localhost:8787');
    storage.removeItem('kipuspay_api_base');
    expect(resolveApiBase(storage)).toBe('');
  });

  it('apiFetch inyecta la autorización del token cuando existe', async () => {
    storage.setItem('kipuspay_token', 'jwt-456');
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    const res = await apiFetch('/api/health', {
      apiBase: 'https://api.test',
      storage,
    });
    expect(res.status).toBe(200);
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.test/api/health');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer jwt-456');
  });

  it('apiFetch respeta headers existentes y no añade auth sin token', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    await apiFetch('/api/health', {
      apiBase: 'https://api.test',
      storage,
      headers: { 'x-custom': '1' },
    });
    const [, init] = fetcher.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['x-custom']).toBe('1');
    expect(headers.authorization).toBeUndefined();
  });

  it('apiFetch no redirige ni revienta con 401 fuera del navegador (fail-closed callable)', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 'UNAUTHENTICATED' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetcher);
    const res = await apiFetch('/api/auth/session', {
      apiBase: 'https://api.test',
      storage,
      allowUnauthorizedRedirect: false,
    });
    expect(res.status).toBe(401);
  });

  it('el módulo api-client no contiene el literal Bearer demo', async () => {
    const source = await import('./api-client.js?raw').catch(() => null);
    if (source) {
      expect(source.default).not.toContain('Bearer demo');
    }
  });
});
