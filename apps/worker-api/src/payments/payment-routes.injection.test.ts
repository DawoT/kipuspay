/**
 * US-04 acceptance — inyección SQL vía la ruta payment con el adapter REAL
 * (sin vi.mock de @kipuspay/adapters-d1): el payload `x' OR 1=1 --` como
 * idempotencyKey y `\u202E` (RIGHT-TO-LEFT OVERRIDE) como metadata deben
 * llegar a D1 SOLO como bind: prepare recibe '?' y el valor malicioso jamás
 * aparece interpolado en el texto SQL (SEC-01/SEC-04, V-02/V-04/V-22).
 */
import { describe, expect, it } from 'vitest';
import { runPaymentChargeHttp } from './payment-routes.js';
import type { WorkerEnv } from '../auth/control-plane.js';

interface BindCall {
  sql: string;
  args: unknown[];
}

/** D1 espía: graba cada prepare/bind como journal-routes.test.ts. */
function envWithBindCaptureGlobal(): { env: WorkerEnv; calls: BindCall[] } {
  const calls: BindCall[] = [];
  const meta = {
    duration: 0,
    size_after: 0,
    rows_read: 0,
    rows_written: 0,
    last_row_id: 0,
    changed_db: false,
    changes: 0,
  };
  const ok = <T>(results: T[] = []) => ({ success: true as const, meta, results });
  const stmt = {
    bind(...args: unknown[]) {
      calls[calls.length - 1]!.args = args;
      return stmt;
    },
    first: <T>() => {
      const sql = calls[calls.length - 1]!.sql;
      if (sql.includes('FROM payment_methods')) {
        return Promise.resolve({ code: 'yape' } as T);
      }
      if (sql.includes('idempotency_key')) {
        // Sin capture previo → el INSERT de PENDING se ejecuta (path real).
        return Promise.resolve(null as T | null);
      }
      if (sql.includes('FROM payment_captures') && sql.includes('WHERE id = ?')) {
        return Promise.resolve({ id: 'cap1', tenant_id: 't1', status: 'PENDING' } as T);
      }
      return Promise.resolve(null as T | null);
    },
    all: <T>() => Promise.resolve(ok([] as T[])),
    run: () => Promise.resolve(ok()),
  };
  const env = {
    FEATURE_PAYMENTS_QR_WALLETS: '1',
    FEATURE_PAYMENTS_CARD_ACQUIRER: '1',
    DB: {
      prepare(sql: string) {
        calls.push({ sql, args: [] });
        return stmt;
      },
      batch: () => Promise.resolve([]),
    },
  } as unknown as WorkerEnv;
  return { env, calls };
}

describe('US-04: inyección por la ruta payment con adapter real (prepare ? + bind)', () => {
  it('idempotencyKey `x\' OR 1=1 --` y metadata \u202E llegan por bind; prepare recibe \'?\'', async () => {
    const idempotencyKey = "x' OR 1=1 --";
    const rtlMetadata = 'sp1\u202E'; // RIGHT-TO-LEFT OVERRIDE embebido en metadata
    const { env, calls } = envWithBindCaptureGlobal();
    const res = await runPaymentChargeHttp(env, 't1', {
      saleId: 's1',
      salePaymentId: rtlMetadata,
      paymentMethodId: 'pm1',
      amountCents: 1000,
      idempotencyKey,
    });
    // El flujo completo con el adapter real terminó 201 (ruta no mockeada).
    expect(res.status).toBe(201);

    // Ningún texto SQL lleva el payload interpolado: prepare SIEMPRE con '?'.
    for (const call of calls) {
      expect(call.sql).not.toContain(idempotencyKey);
      expect(call.sql).not.toContain('\u202E');
    }

    // El lookup de idempotencia existe con placeholder y el payload por bind.
    const idemSelect = calls.find((c) => c.sql.includes('idempotency_key = ?'));
    expect(idemSelect).toBeDefined();
    expect(idemSelect!.sql).toContain('WHERE tenant_id = ? AND idempotency_key = ?');
    expect(idemSelect!.args).toContain(idempotencyKey);

    // El INSERT de payment_captures bindea la key maliciosa y la metadata.
    const insert = calls.find((c) => c.sql.includes('INSERT INTO payment_captures'));
    expect(insert).toBeDefined();
    expect(insert!.sql).not.toContain(idempotencyKey);
    expect(insert!.sql).not.toContain('\u202E');
    expect(insert!.args).toContain(idempotencyKey);
    expect(insert!.args).toContain(rtlMetadata);

    // La metadata \u202E también va por bind en el lookup de idempotencia.
    expect(idemSelect!.args).not.toContain(rtlMetadata);
    expect(calls.some((c) => c.args.includes(rtlMetadata))).toBe(true);
  });
});