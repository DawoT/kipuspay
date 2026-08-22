import { describe, expect, it } from 'vitest';

import { runCreateInventoryCountHttp, runSubmitCountReviewHttp } from './inventory-ops-routes.js';
import type { WorkerEnv } from '../auth/control-plane.js';

interface StoredRow {
  request_hash: string;
  response_status: number;
  response_body_json: string;
}

/**
 * US-03 — test de reenvío exactamente-una-vez para el canal de idempotencia-key
 * de inventory-ops: un mock D1 con la tabla inventory_ops_idempotency REALMENTE
 * funcional y contadores de efectos, que prueba que el reenvío con la misma key
 * (a) responde idéntico al primer uso y (b) aplica los efectos UNA sola vez.
 */
function opsEnvWithIdempotency(opts: { countStatus?: string; stockFound?: boolean } = {}): {
  env: WorkerEnv;
  countLinesInserted: () => number;
  countsInserted: () => number;
  channelSelects: () => number;
  storedRows: () => number;
} {
  const rows = new Map<string, StoredRow>();
  const countLines: unknown[][] = [];
  const counts: unknown[][] = [];
  let selects = 0;

  const prepare = (sql: string) => {
    const stmt = {
      bind: (...values: unknown[]) => ({
        // El plan atómico ejecuta vía db.batch con statements ya bindeados:
        // etiquetamos cada statement para poder contar efectos en el batch.
        __sql: sql,
        __values: values,
        first: async <T>() => {
          if (sql.includes('FROM inventory_ops_idempotency')) {
            selects++;
            const [tenantId, scope, key] = values as [string, string, string];
            return (rows.get(`${tenantId}|${scope}|${key}`) as T | undefined) ?? null;
          }
          if (sql.includes('tenant_discount_policies')) {
            return Promise.resolve({ max_amount_without_auth_cents: 2000 });
          }
          if (sql.includes('FROM inventory_counts WHERE')) {
            return Promise.resolve({ status: opts.countStatus ?? 'COUNTING', branch_id: 'b1' });
          }
          // Autoridad server-side del submit-review (join branch_product_stock).
          if (sql.includes('FROM branch_product_stock b')) {
            if (opts.stockFound === false) return Promise.resolve(null);
            return Promise.resolve({
              quantity_microunits: 1_000_000,
              pmp_unit_cost_cents: 1500,
              location_id: 'loc-1',
              serial_tracking_mode: 'NONE',
            });
          }
          return Promise.resolve(null);
        },
        run: () => {
          if (sql.includes('INSERT INTO inventory_count_lines')) countLines.push(values);
          if (sql.includes('INSERT INTO inventory_counts')) counts.push(values);
          if (sql.includes('INSERT INTO inventory_ops_idempotency')) {
            const [, tenantId, scope, key, hash, status, bodyJson] = values as [
              string,
              string,
              string,
              string,
              string,
              number,
              string,
            ];
            const mapKey = `${tenantId}|${scope}|${key}`;
            if (rows.has(mapKey)) return Promise.reject(new Error('UNIQUE constraint failed'));
            rows.set(mapKey, {
              request_hash: hash,
              response_status: status,
              response_body_json: bodyJson,
            });
          }
          return Promise.resolve({ results: [], success: true, meta: {} });
        },
        all: () => Promise.resolve({ results: [], success: true, meta: {} }),
      }),
    };
    return stmt;
  };

  const env = {
    FEATURE_INVENTORY_BATCHES: '1',
    DB: {
      prepare,
      batch: (statements: readonly unknown[]) => {
        for (const statement of statements) {
          const tagged = statement as { __sql?: string; __values?: unknown[] };
          if (tagged.__sql?.includes('INSERT INTO inventory_count_lines')) {
            countLines.push(tagged.__values ?? []);
          }
        }
        return Promise.resolve(statements.map(() => ({ results: [], success: true, meta: {} })));
      },
    },
    TENANT_KV: { get: () => Promise.resolve(null) },
    TENANT_STATE_DO: {
      idFromName: (n: string) => ({ toString: () => n }),
      get: () => ({ fetch: () => Promise.resolve(new Response('{}')) }),
    },
  } as unknown as WorkerEnv;

  return {
    env,
    countLinesInserted: () => countLines.length,
    countsInserted: () => counts.length,
    channelSelects: () => selects,
    storedRows: () => rows.size,
  };
}

describe('US-03 canal de idempotencia-key en inventory-ops', () => {
  it('submit-review: reenvío exactamente-una-vez — misma respuesta, líneas insertadas UNA vez', async () => {
    const harness = opsEnvWithIdempotency();
    const body = {
      countId: 'c1',
      idempotencyKey: 'pos-retry-001',
      lines: [{ productId: 'p1', countedQtyMicrounits: 1_500_000 }],
    };

    const first = await runSubmitCountReviewHttp(harness.env, 't1', 'owner', body);
    expect(first.status).toBe(200);
    expect(harness.countLinesInserted()).toBe(1);

    const resend = await runSubmitCountReviewHttp(harness.env, 't1', 'owner', body);
    expect(resend.status).toBe(first.status);
    expect(resend.body).toEqual(first.body);
    expect(harness.channelSelects()).toBe(2); // el canal se consultó en ambos intentos
    expect(harness.countLinesInserted()).toBe(1); // efectos aplicados UNA sola vez
    expect(harness.storedRows()).toBe(1);
  });

  it('submit-review: misma key con payload distinto → 409 idempotency_mismatch sin re-ejecutar', async () => {
    const harness = opsEnvWithIdempotency();
    const base = { countId: 'c1', idempotencyKey: 'pos-retry-002' };
    const first = await runSubmitCountReviewHttp(harness.env, 't1', 'owner', {
      ...base,
      lines: [{ productId: 'p1', countedQtyMicrounits: 1_500_000 }],
    });
    expect(first.status).toBe(200);

    const conflicting = await runSubmitCountReviewHttp(harness.env, 't1', 'owner', {
      ...base,
      lines: [{ productId: 'p1', countedQtyMicrounits: 9_999_999 }],
    });
    expect(conflicting.status).toBe(409);
    expect(conflicting.body.code).toBe('idempotency_mismatch');
    expect(harness.countLinesInserted()).toBe(1);
  });

  it('submit-review: 4xx posterior al gate no se cachea — el reintento con la misma key vuelve a ejecutar', async () => {
    // Stock de autoridad inexistente: el 422 (COUNT_STOCK_NOT_FOUND) ocurre con
    // el gate ya abierto; NO debe memorizarse (el cliente corrige y reintenta).
    const harness = opsEnvWithIdempotency({ stockFound: false });
    const body = {
      countId: 'c1',
      idempotencyKey: 'pos-retry-003',
      lines: [{ productId: 'p1', countedQtyMicrounits: 1_500_000 }],
    };
    const first = await runSubmitCountReviewHttp(harness.env, 't1', 'owner', body);
    expect(first.status).toBe(422);
    const retry = await runSubmitCountReviewHttp(harness.env, 't1', 'owner', body);
    expect(retry.status).toBe(422);
    expect(harness.channelSelects()).toBe(2); // el canal sí se consultó en ambos
    expect(harness.storedRows()).toBe(0); // pero nada quedó cacheado
  });

  it('create-count: el reenvío con la misma key NO crea un conteo duplicado', async () => {
    const harness = opsEnvWithIdempotency();
    const body = { branchId: 'b1', idempotencyKey: 'pos-count-001' };
    const first = await runCreateInventoryCountHttp(harness.env, 't1', 'u1', body);
    const resend = await runCreateInventoryCountHttp(harness.env, 't1', 'u1', body);
    expect(first.status).toBe(200);
    expect(resend.status).toBe(200);
    expect(resend.body).toEqual(first.body); // mismo id del conteo original
    expect(harness.countsInserted()).toBe(1);
  });

  it('sin idempotencyKey el canal es transparente (comportamiento legacy intacto)', async () => {
    const harness = opsEnvWithIdempotency();
    const body = { branchId: 'b1' };
    await runCreateInventoryCountHttp(harness.env, 't1', 'u1', body);
    await runCreateInventoryCountHttp(harness.env, 't1', 'u1', body);
    expect(harness.channelSelects()).toBe(0);
    expect(harness.countsInserted()).toBe(2); // dos conteos, como siempre
  });
});
