import { describe, expect, it } from 'vitest';

import type { D1DatabaseLike } from '@kipuspay/adapters-d1';
import {
  INVENTORY_OPS_SCOPES,
  openIdempotencyGate,
  sha256Hex,
  stableStringify,
} from './idempotency-channel.js';

interface StoredRow {
  request_hash: string;
  response_status: number;
  response_body_json: string;
}

/**
 * D1 falso con la tabla inventory_ops_idempotency REALMENTE funcional
 * (UNIQUE tenant|scope|key incluida): los tests ejercitan el camino completo
 * select→hash→insert del canal, no un eco pre-cocinado.
 */
function idempotentDb(opts: { failSelect?: boolean } = {}): {
  db: D1DatabaseLike;
  rows: Map<string, StoredRow>;
  selects: () => number;
  inserts: () => number;
} {
  const rows = new Map<string, StoredRow>();
  let selects = 0;
  let inserts = 0;
  const db = {
    prepare(sql: string) {
      const stmt = {
        bind: (...values: unknown[]) => ({
          first: <T>() => {
            if (!sql.includes('FROM inventory_ops_idempotency')) {
              return Promise.resolve<T | null>(null);
            }
            selects++;
            if (opts.failSelect) return Promise.reject(new Error('D1 connection lost'));
            const [tenantId, scope, key] = values as [string, string, string];
            return Promise.resolve(
              (rows.get(`${tenantId}|${scope}|${key}`) as T | undefined) ?? null,
            );
          },
          run: () => {
            if (!sql.includes('INSERT INTO inventory_ops_idempotency')) {
              return Promise.resolve({ results: [], success: true, meta: {} });
            }
            inserts++;
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
            if (rows.has(mapKey)) {
              return Promise.reject(
                new Error('UNIQUE constraint failed: inventory_ops_idempotency.tenant_id'),
              );
            }
            rows.set(mapKey, {
              request_hash: hash,
              response_status: status,
              response_body_json: bodyJson,
            });
            return Promise.resolve({ results: [], success: true, meta: {} });
          },
          all: () => Promise.resolve({ results: [], success: true, meta: {} }),
        }),
      };
      return stmt;
    },
    batch: (statements: readonly unknown[]) =>
      Promise.resolve(statements.map(() => ({ results: [], success: true, meta: {} }))),
  } as unknown as D1DatabaseLike;
  return { db, rows, selects: () => selects, inserts: () => inserts };
}

describe('US-03 stableStringify (huella canónica del payload)', () => {
  it('es independiente del orden de claves', () => {
    expect(stableStringify({ a: 1, b: { x: 1, y: 2 } })).toBe(
      stableStringify({ b: { y: 2, x: 1 }, a: 1 }),
    );
  });

  it('omite claves undefined y preserva el orden de arrays', () => {
    expect(stableStringify({ a: undefined, b: 2 })).toBe(stableStringify({ b: 2 }));
    expect(stableStringify([2, 1])).not.toBe(stableStringify([1, 2]));
  });

  it('sha256Hex es estable y hexadecimal', async () => {
    const digest = await sha256Hex(stableStringify({ countId: 'c1' }));
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).toBe(await sha256Hex(stableStringify({ countId: 'c1' })));
  });
});

describe('US-03 openIdempotencyGate (canal de idempotencia-key)', () => {
  const tenantId = 't1';
  const scope = INVENTORY_OPS_SCOPES.countReview;

  it('primer uso: ejecuta y registra el 2xx', async () => {
    const { db, rows, inserts } = idempotentDb();
    const gate = await openIdempotencyGate(db, tenantId, scope, 'key-1', { countId: 'c1' });
    expect(gate.replay).toBeNull();
    await gate.record({ status: 200, body: { id: 'c1', lineCount: 3 } });
    expect(inserts()).toBe(1);
    expect(rows.size).toBe(1);
  });

  it('reenvío exactamente-una-vez: la misma key+payload devuelve la respuesta original SIN re-ejecutar', async () => {
    const { db } = idempotentDb();
    const payload = { countId: 'c1', lines: [{ productId: 'p1' }] };

    const firstGate = await openIdempotencyGate(db, tenantId, scope, 'key-1', payload);
    expect(firstGate.replay).toBeNull();
    const original = { status: 200, body: { id: 'c1', status: 'DIFFERENCE_REVIEW', lineCount: 2 } };
    await firstGate.record(original);

    // El replay cierra el gate: el runner jamás se vuelve a invocar (el caller
    // retorna `gate.replay` antes de tocar D1) y record() queda en no-op.
    const resendGate = await openIdempotencyGate(db, tenantId, scope, 'key-1', payload);
    expect(resendGate.replay).toEqual(original);
    await resendGate.record({ status: 200, body: { mutated: true } });
    const probe = await openIdempotencyGate(db, tenantId, scope, 'key-1', payload);
    expect(probe.replay).toEqual(original); // la fila registrada sigue siendo la original
  });

  it('misma key con payload distinto → 409 idempotency_mismatch, sin ejecutar', async () => {
    const { db } = idempotentDb();
    const gate1 = await openIdempotencyGate(db, tenantId, scope, 'key-1', { countId: 'c1', a: 1 });
    await gate1.record({ status: 200, body: { ok: true } });

    const gate2 = await openIdempotencyGate(db, tenantId, scope, 'key-1', { countId: 'c1', a: 2 });
    expect(gate2.replay).toEqual({
      status: 409,
      body: { error: 'idempotency_mismatch', code: 'idempotency_mismatch' },
    });
  });

  it('fail-closed: SELECT del canal caído → 503 DB_UNAVAILABLE, jamás ejecución a ciegas', async () => {
    const { db } = idempotentDb({ failSelect: true });
    const gate = await openIdempotencyGate(db, tenantId, scope, 'key-1', { countId: 'c1' });
    expect(gate.replay).toEqual({
      status: 503,
      body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' },
    });
  });

  it('los 4xx/5xx no se memorizan: el cliente corrige y reintenta con la misma key', async () => {
    const { db, rows } = idempotentDb();
    const gate = await openIdempotencyGate(db, tenantId, scope, 'key-1', { countId: 'c1' });
    await gate.record({ status: 422, body: { error: 'COUNT_INVALID', code: 'COUNT_INVALID' } });
    expect(rows.size).toBe(0);
  });

  it('sin key el canal es transparente (no toca la tabla)', async () => {
    const { db, selects } = idempotentDb();
    const gate = await openIdempotencyGate(db, tenantId, scope, '', { countId: 'c1' });
    expect(gate.replay).toBeNull();
    await gate.record({ status: 200, body: { ok: true } });
    expect(selects()).toBe(0);
  });

  it('la fila corrupta responde 500 estable IDEMPOTENCY_STATE_INVALID (sin SQL crudo)', async () => {
    const { db, rows } = idempotentDb();
    const gate1 = await openIdempotencyGate(db, tenantId, scope, 'key-x', { p: 1 });
    await gate1.record({ status: 200, body: { ok: true } });
    // Corromper la fila directamente en el storage simulado.
    const stored = [...rows.values()][0]!;
    stored.response_body_json = '{not-json';
    const gate2 = await openIdempotencyGate(db, tenantId, scope, 'key-x', { p: 1 });
    expect(gate2.replay).toEqual({
      status: 500,
      body: { error: 'IDEMPOTENCY_STATE_INVALID', code: 'IDEMPOTENCY_STATE_INVALID' },
    });
  });

  it('record es best-effort: una UNIQUE en carrera no revierte un efecto ya aplicado', async () => {
    const { db } = idempotentDb();
    const gateA = await openIdempotencyGate(db, tenantId, scope, 'dup', { p: 1 });
    const gateB = await openIdempotencyGate(db, tenantId, scope, 'dup', { p: 1 });
    await gateA.record({ status: 200, body: { winner: 'a' } });
    await expect(gateB.record({ status: 200, body: { winner: 'b' } })).resolves.toBeUndefined();
  });

  it('tenant vacío → passthrough (defensa: nunca cache cross-tenant)', async () => {
    const { db, selects } = idempotentDb();
    const gate = await openIdempotencyGate(db, '', scope, 'key-1', { p: 1 });
    expect(gate.replay).toBeNull();
    expect(selects()).toBe(0);
  });
});
