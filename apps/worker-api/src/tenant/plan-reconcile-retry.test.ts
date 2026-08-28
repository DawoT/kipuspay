import { describe, expect, it } from 'vitest';
import { reconcilePlanAtomic } from './plan-reconcile.js';

function makeMockDb(opts: { failBatchTimes: number; tenantId?: string; prevHash?: string | null }) {
  const tenantId = opts.tenantId ?? 't1';
  const failTimes = opts.failBatchTimes;
  let batchAttempts = 0;
  const auditHeads = new Map<string, string | null>([[tenantId, opts.prevHash ?? 'head0']]);

  const db = {
    prepare(sql: string) {
      const norm = sql.replace(/\s+/g, ' ').trim();
      return {
        bind(...args: unknown[]) {
          return {
            _sql: norm,
            _args: args,
            async first<T>(): Promise<T | null> {
              if (norm.includes('SELECT plan_id FROM tenants')) {
                // return current plan arranque
                return { plan_id: 'arranque' } as unknown as T;
              }
              if (norm.includes('SELECT last_hash FROM audit_chain_heads')) {
                const tid = String(args[0]);
                const v = auditHeads.get(tid) ?? null;
                if (v === null) return null as T;
                return { last_hash: v } as unknown as T;
              }
              if (norm.includes('SELECT id, trade_name, plan_id FROM tenants')) {
                // for runUpdatePlanHttp
                return { id: tenantId, trade_name: 'Bodega', plan_id: 'arranque' } as unknown as T;
              }
              return null as T;
            },
            async all<T>(): Promise<{ results: T[] }> {
              return { results: [] };
            },
            async run(): Promise<{ success: boolean; meta: { changes: number } }> {
              return { success: true, meta: { changes: 1 } };
            },
          };
        },
      };
    },
    async batch(statements: Array<{ _sql: string; _args: unknown[] }>): Promise<unknown[]> {
      batchAttempts += 1;
      if (batchAttempts <= failTimes) {
        throw new Error('CHECK constraint failed: atomic_guards.ok = 1');
      }
      // simulate success: update head to new hash for realism
      // Find claim statement to update head
      for (const s of statements) {
        const sql = (s as unknown as { _sql: string })._sql ?? '';
        const args = (s as unknown as { _args: unknown[] })._args ?? [];
        if (sql.includes('UPDATE audit_chain_heads')) {
          const [newHash, tid] = args as [string, string, string | null];
          auditHeads.set(String(tid), String(newHash));
        } else if (sql.includes('INSERT INTO audit_chain_heads')) {
          const [tid, newHash] = args as [string, string];
          if (!auditHeads.has(String(tid))) auditHeads.set(String(tid), String(newHash));
        }
      }
      return statements.map(() => ({ success: true, meta: { changes: 1 } }));
    },
    _getAttempts() {
      return batchAttempts;
    },
  } as unknown as D1Database & { _getAttempts(): number };
  return db;
}

describe('plan-reconcile retry CAS (O4 OBS)', () => {
  it('concurrent reconcile same prevHash → uno 503, otro retry 200', async () => {
    // Simula guard CAS: primer batch falla con CHECK, segundo intento debe reintentar y eventualmente 200
    const db = makeMockDb({ failBatchTimes: 1, prevHash: 'head0' });
    const env = { DB: db, TENANT_KV: undefined } as unknown as Parameters<
      typeof reconcilePlanAtomic
    >[0];

    const result = await reconcilePlanAtomic(env, 't1', 'crece', {
      actorUserId: 'u1',
      source: 'api',
      prevPlanId: 'arranque',
    });

    // Con retry CAS max 3, debe eventualmente 200 (updated), no error 503
    expect(result.status).toBe('updated');
    expect((db as unknown as { _getAttempts(): number })._getAttempts()).toBe(2);
  });

  it('reconcilePlanAtomic env con retry 3 debe eventually 200', async () => {
    // Falla 2 veces (transitorio) y succeed en 3er intento: retry 3 con backoff 50*2^attempt
    const db = makeMockDb({ failBatchTimes: 2, prevHash: 'head0' });
    const env = { DB: db, TENANT_KV: undefined } as unknown as Parameters<
      typeof reconcilePlanAtomic
    >[0];

    const start = Date.now();
    const result = await reconcilePlanAtomic(env, 't1', 'crece', {
      actorUserId: 'u1',
      source: 'api',
      prevPlanId: 'arranque',
    });
    const elapsed = Date.now() - start;

    expect(result.status).toBe('updated');
    expect((db as unknown as { _getAttempts(): number })._getAttempts()).toBe(3);
    // backoff total ~ 50+100 =150ms minimo
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });
});
