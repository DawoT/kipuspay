/**
 * US-05 — co-ubicación atómica (invariante 2 / D1): el flujo de venta offline
 * pasa el INSERT de idempotencia (sales.offline_client_sale_id, UNIQUE) y el
 * INSERT de journal (journal_entries) en el MISMO array de `db.batch`, y jamás
 * escribe vía `db.prepare(...).run()`.
 *
 * Unit test sobre la ruta real (runOfflineSaleHttp → processOfflineSaleAtomic
 * sin mock de motor): `db.batch` es un spy que graba los statements.
 */
import { describe, expect, it, vi } from 'vitest';
import { SEED_CHART_OF_ACCOUNTS } from '@kipuspay/domain-cash';
import type { D1DatabaseLike } from '@kipuspay/adapters-d1';
import { runOfflineSaleHttp } from './offline-sale-route.js';
import type { WorkerEnv } from '../auth/control-plane.js';

vi.mock('../integrations/integration-routes.js', () => ({
  enqueuePublicEventForTenant: vi.fn(() => Promise.reject(new Error('ENQUEUE_DB_FAILURE'))),
}));

interface RecordedStatement {
  sql: string;
  bindings: unknown[];
}

function okD1Result() {
  return { success: true, results: [], meta: {} };
}

/**
 * Fake D1 "grabador": `prepare` registra SQL + bindings; `batch` es un spy que
 * acumula los arrays; `run` es un spy que NUNCA debe ejecutarse en el flujo de
 * venta (toda escritura va por db.batch). Los reads de preflight devuelven el
 * fixture mínimo de una venta NV de contado con diario (chart of accounts).
 */
function createRecordingDb() {
  const batchCalls: RecordedStatement[][] = [];
  const runSpy = vi.fn(() => Promise.resolve(okD1Result()));
  const batch = vi.fn((stmts: readonly RecordedStatement[]) => {
    batchCalls.push([...stmts]);
    return Promise.resolve(stmts.map(() => okD1Result()));
  });
  const db: D1DatabaseLike = {
    prepare(sql: string) {
      const stmt: RecordedStatement & {
        bind(...args: unknown[]): typeof stmt;
        first<T>(): Promise<T | null>;
        all<T>(): Promise<{ results: T[] }>;
        run(): Promise<unknown>;
      } = {
        sql,
        bindings: [],
        bind(...args: unknown[]) {
          stmt.bindings.push(...args);
          return stmt;
        },
        first<T>(): Promise<T | null> {
          if (sql.includes('offline_client_sale_id')) return Promise.resolve(null); // no sincronizada antes
          if (sql.includes('FROM tenants ')) {
            return Promise.resolve({
              formalization_mode: 'INTERNAL_CONTROL',
              tax_regime: 'GENERAL',
              shard_id: 'D1_SHARD_01',
              enabled_document_types: '["NV"]',
            } as T | null);
          }
          if (sql.includes('FROM cash_register_sessions')) {
            return Promise.resolve({ id: stmt.bindings[0] } as T | null);
          }
          if (sql.includes('FROM payment_methods')) {
            return Promise.resolve({ code: 'cash' } as T | null);
          }
          if (sql.includes('FROM branch_document_series')) {
            return Promise.resolve({ id: 'ser-1', series: 'NV01', current_number: 0 } as T | null);
          }
          if (sql.includes('FROM customers')) return Promise.resolve(null as T | null);
          if (sql.includes('FROM tenant_discount_policies'))
            return Promise.resolve(null as T | null);
          if (sql.includes('FROM audit_events')) return Promise.resolve(null as T | null);
          if (sql.includes('FROM sales WHERE id'))
            return Promise.resolve({ number: 42 } as T | null);
          return Promise.resolve(null as T | null);
        },
        all<T>(): Promise<{ results: T[] }> {
          if (sql.includes('LEFT JOIN branch_product_stock')) {
            return Promise.resolve({
              results: [
                {
                  id: 'p-1',
                  name: 'Servicio Test',
                  product_type: 'service',
                  price_cents: 1000,
                  cost_cents: 500,
                  pmp_unit_cost_cents: 500,
                  allow_negative_stock: 0,
                  parent_product_id: null,
                  branch_stock: 100,
                  branch_stock_microunits: 100_000_000,
                  has_branch_row: 1,
                },
              ] as T[],
            });
          }
          if (sql.includes('serial_tracking_mode')) {
            return Promise.resolve({
              results: [{ id: 'p-1', serial_tracking_mode: 'NONE' }] as T[],
            });
          }
          if (sql.includes('FROM chart_of_accounts')) {
            return Promise.resolve({
              results: SEED_CHART_OF_ACCOUNTS.map((acc) => ({
                id: `coa-${acc.code}`,
                code: acc.code,
              })) as T[],
            });
          }
          return Promise.resolve({ results: [] as T[] });
        },
        run: runSpy,
      };
      return stmt as unknown as ReturnType<D1DatabaseLike['prepare']>;
    },
    batch,
  };
  return { db, batch, batchCalls, runSpy };
}

function nvCashPayload() {
  return {
    offlineSaleId: 'offline-us05-1',
    branchId: 'b-1',
    cashRegisterSessionId: 's-1',
    documentType: 'NV' as const,
    series: 'NV01',
    clientDocumentType: '1',
    clientDocumentNumber: '20000000001',
    clientName: 'Cliente US-05',
    items: [{ productId: 'p-1', quantity: 1 }],
    payments: [{ paymentMethodId: 'pm-1', amountCents: 1180 }],
  };
}

function envWith(db: D1DatabaseLike): WorkerEnv {
  return {
    FEATURE_ACID_OFFLINE_SALE: '1',
    FEATURE_LEDGER_CHART_OF_ACCOUNTS: '1',
    DB: db,
    TENANT_KV: { get: () => Promise.resolve(null) },
  } as unknown as WorkerEnv;
}

describe('US-05: db.batch co-ubica idempotency INSERT + journal INSERT (ruta offline-sale)', () => {
  it('la ruta pasa sales.offline_client_sale_id y journal_entries en el MISMO array de db.batch, sin .run()', async () => {
    const { db, batch, batchCalls, runSpy } = createRecordingDb();

    const res = await runOfflineSaleHttp(envWith(db), 't-1', 'u-1', nvCashPayload());

    expect(res.status).toBe(200);

    // Una sola db.batch para toda la venta (plan atómico; sin escrituras sueltas).
    expect(batch).toHaveBeenCalledTimes(1);

    const stmts = batchCalls[0]!;
    const salesInsert = stmts.find((s) => /INSERT INTO sales/.test(s.sql));
    const journalInsert = stmts.find((s) => /INSERT INTO journal_entries/.test(s.sql));

    // Idempotency INSERT: la venta se inserta con su clave UNIQUE de idempotencia.
    expect(salesInsert).toBeDefined();
    expect(salesInsert!.sql).toMatch(/offline_client_sale_id/);

    // Journal INSERT del mismo hecho operativo.
    expect(journalInsert).toBeDefined();
    expect(journalInsert!.sql).toMatch(/INSERT INTO journal_entries/);

    // Co-ubicación verbatim: ambos statements viven en el MISMO array de la MISMA db.batch.
    expect(stmts).toContain(salesInsert!);
    expect(stmts).toContain(journalInsert!);

    // Invariante D1: ninguna escritura fuera del batch (cero db.prepare(...).run()).
    expect(runSpy).not.toHaveBeenCalled();
  });
});
