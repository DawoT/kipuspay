import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchSetupProgress,
  isTourEligible,
  readTourState,
  recordGrowthEvent,
  writeTourState,
} from './tour-client';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map<string, string>(Object.entries(initial));
  const storage: Partial<Storage> &
    Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'clear' | 'key'> = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  };
  return storage as Storage;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('tour client (Sprint 52)', () => {
  it('isTourEligible: se omite si ya vendió, aunque no haya estado local', () => {
    expect(isTourEligible({ hasSold: true, localState: null })).toBe(false);
    expect(isTourEligible({ hasSold: false, localState: null })).toBe(true);
  });

  it('isTourEligible: no re-aparece si se cerró o completó (persistencia local)', () => {
    expect(isTourEligible({ hasSold: false, localState: 'dismissed' })).toBe(false);
    expect(isTourEligible({ hasSold: false, localState: 'completed' })).toBe(false);
  });

  it('read/writeTourState: clave por rubro y solo estados canónicos', () => {
    const storage = memoryStorage();
    expect(readTourState(storage, 'restaurant')).toBeNull();
    writeTourState(storage, 'restaurant', 'dismissed');
    expect(readTourState(storage, 'restaurant')).toBe('dismissed');
    expect(readTourState(storage, 'pharmacy')).toBeNull();
    writeTourState(storage, 'pharmacy', 'completed');
    expect(readTourState(storage, 'pharmacy')).toBe('completed');
    // un valor corrupto no se interpreta como visto (fail-closed a "ver de nuevo")
    const corrupt = memoryStorage({ 'kipus:tour:retail:state': 'unknown' });
    expect(readTourState(corrupt, 'retail')).toBeNull();
  });

  it('fetchSetupProgress: devuelve el estado server', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              server: { logo: true, invoicing: false, team: true, catalog: false },
              formalizationMode: 'INTERNAL_CONTROL',
            }),
            { status: 200 },
          ),
        ),
      ),
    );
    const res = await fetchSetupProgress();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.server).toEqual({ logo: true, invoicing: false, team: true, catalog: false });
  });

  it('fetchSetupProgress: errores del servidor se traducen sin lanzar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}', { status: 503 }))),
    );
    const res = await fetchSetupProgress();
    expect(res.ok).toBe(false);
  });

  it('recordGrowthEvent: envía el evento y jamás lanza (métrica no rompe el cobro)', async () => {
    let sent: { eventType: unknown; meta: unknown } | null = null;
    const fetchMock = vi.fn((_url: unknown, init?: RequestInit) => {
      const rawBody = init?.body;
      sent = JSON.parse(typeof rawBody === 'string' ? rawBody : '{}') as {
        eventType: unknown;
        meta: unknown;
      };
      return Promise.resolve(new Response('{"ok":true}', { status: 201 }));
    }) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);
    await recordGrowthEvent('setup_checklist_step_completed', { step: 'logo' });
    expect(sent).toEqual({ eventType: 'setup_checklist_step_completed', meta: { step: 'logo' } });
  });

  it('recordGrowthEvent: sin red no lanza (fire-and-forget)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network down'))),
    );
    await expect(recordGrowthEvent('tour_completed')).resolves.toBeUndefined();
  });
});
