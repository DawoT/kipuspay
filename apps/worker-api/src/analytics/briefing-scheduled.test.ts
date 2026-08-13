import { describe, expect, it } from 'vitest';
import type { D1Bound, D1DatabaseLike, D1Result } from '@kipuspay/adapters-d1';
import { isBriefingEnabled, runBriefingScheduled, type BriefingEnv } from './briefing-scheduled.js';

function memoryKv(): BriefingEnv['TENANT_KV'] & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get: (key) => Promise.resolve(map.get(key) ?? null),
    put: (key, value) => {
      map.set(key, value);
      return Promise.resolve();
    },
    delete: (key) => {
      map.delete(key);
      return Promise.resolve();
    },
  };
}

function memoryDb(tenants: string[]): D1DatabaseLike {
  const meta: Record<string, unknown> = {
    changes: 1,
    duration: 0,
    rows_read: 0,
    rows_written: 0,
    last_row_id: 0,
    size_after: 0,
  };
  const d1Result = <T>(results: T[]): D1Result<T> => ({ results, success: true, meta });
  const bound = (sql: string): D1Bound => ({
    bind: () => bound(sql),
    all: <T = unknown>() => {
      if (sql.includes('SELECT DISTINCT tenant_id')) {
        return Promise.resolve(
          d1Result(tenants.map((tenantId) => ({ tenant_id: tenantId })) as T[]),
        );
      }
      return Promise.resolve(d1Result([] as T[]));
    },
    first: <T = unknown>() => {
      if (sql.includes('SELECT COALESCE(SUM(gross_sales_cents)')) {
        return Promise.resolve({ gross_sales_cents: 118000, doc_count: 42 } as T | null);
      }
      if (sql.includes('FROM forecast_outputs')) {
        return Promise.resolve({ p: 0, n: 0 } as T | null);
      }
      return Promise.resolve(null as T | null);
    },
    run: () => Promise.resolve(d1Result([])),
  });
  return {
    prepare: (sql: string) => ({ bind: () => bound(sql) }),
    batch: () => Promise.resolve([]),
  };
}

describe('briefing cron (Sprint 49)', () => {
  it('flag off → FEATURE_OFF sin tocar KV', async () => {
    const kv = memoryKv();
    const res = await runBriefingScheduled(
      { FEATURE_ANALYTICS_AGENTIC_INSIGHTS: '0', DB: memoryDb(['t1']), TENANT_KV: kv },
      { scheduledTime: Date.parse('2026-08-04T03:30:00.000Z') },
    );
    expect(res.status).toBe('FEATURE_OFF');
    expect(kv.map.size).toBe(0);
  });

  it('genera briefing del día cerrado y lo cachea en KV', async () => {
    const kv = memoryKv();
    const res = await runBriefingScheduled(
      { FEATURE_ANALYTICS_AGENTIC_INSIGHTS: '1', DB: memoryDb(['t1']), TENANT_KV: kv },
      { scheduledTime: Date.parse('2026-08-04T03:30:00.000Z') },
    );
    expect(res.status).toBe('COMPLETE');
    expect(res.written).toBe(1);
    const key = [...kv.map.keys()][0] ?? '';
    expect(key).toBe('insights:t1:2026-08-02');
    const value = JSON.parse(kv.map.get(key) ?? '{}') as {
      bullets?: unknown[];
      reportDate?: string;
    };
    expect(value.bullets).toHaveLength(3);
    expect(value.reportDate).toBe('2026-08-02');
  });

  it('isBriefingEnabled es estricto', () => {
    expect(isBriefingEnabled({ FEATURE_ANALYTICS_AGENTIC_INSIGHTS: '1' })).toBe(true);
    expect(isBriefingEnabled({ FEATURE_ANALYTICS_AGENTIC_INSIGHTS: 'true' })).toBe(false);
    expect(isBriefingEnabled(undefined)).toBe(false);
  });

  it('F6-4: briefing regenerado tras invalidación KV refleja cifras integradas (edge D)', async () => {
    const kv = memoryKv();
    // Estado previo: cache de briefing con cifras DESACTUALIZADAS (venta del
    // día cerrado aún no integrada). El rematerialize del sync borró la key.
    kv.map.set(
      'insights:t1:2026-08-02',
      JSON.stringify({ bullets: ['cifras viejas'], reportDate: '2026-08-02' }),
    );
    void kv.delete('insights:t1:2026-08-02'); // invalida (rollup-rematerialize)

    // El cron de briefing regenera DESPUÉS del sync tardío: debe leer los
    // rollups ya rematerializados (gross 118000) y NO las cifras viejas.
    const res = await runBriefingScheduled(
      { FEATURE_ANALYTICS_AGENTIC_INSIGHTS: '1', DB: memoryDb(['t1']), TENANT_KV: kv },
      { scheduledTime: Date.parse('2026-08-04T03:30:00.000Z') },
    );
    expect(res.status).toBe('COMPLETE');
    expect(res.written).toBe(1);

    const fresh = JSON.parse(kv.map.get('insights:t1:2026-08-02') ?? '{}') as {
      bullets?: unknown[];
      reportDate?: string;
    };
    expect(fresh.reportDate).toBe('2026-08-02');
    expect(fresh.bullets).toHaveLength(3);
    // El briefing se construye sobre facts del rollup integrado (mock devuelve
    // gross_sales_cents 118000 → bullet de ventas presente).
    const bullets = fresh.bullets!.map((b) => JSON.stringify(b));
    expect(bullets.some((b) => b.includes('venta') || b.includes('Ventas'))).toBe(true);
  });
});
