export interface D1Result<T> {
  readonly results: readonly T[];
  readonly success: boolean;
  readonly meta: Record<string, unknown>;
}

export interface D1Bound {
  bind(...params: unknown[]): D1Bound;
  all<T = unknown>(): Promise<D1Result<T>>;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<D1Result<unknown>>;
}

export interface D1Prepared {
  bind(...params: unknown[]): D1Bound;
}

export interface D1DatabaseLike {
  prepare(sql: string): D1Prepared;
  batch(statements: readonly D1Bound[]): Promise<readonly D1Result<unknown>[]>;
  exec?(sql: string): Promise<unknown>;
}

export function isD1Success(result: D1Result<unknown>): boolean {
  return result.success;
}

/** Resuelve shard_id de un tenant (Sprint 1 — router mínimo). */
export function resolveShardId(shardId: string | null | undefined): string {
  if (shardId === null || shardId === undefined || shardId.trim() === '') {
    throw new Error('tenant sin shard_id: no se puede enrutar');
  }
  return shardId;
}

/**
 * Ejecuta un lote de statements preparados. Fallar uno debe dejar el batch
 * sin efectos parciales en D1 (contrato de atomicidad del motor).
 */
export async function runBatch(
  db: D1DatabaseLike,
  statements: readonly D1Bound[],
): Promise<readonly D1Result<unknown>[]> {
  return db.batch(statements);
}

/**
 * Plan atómico D1 (Arquitectura §6 / SYN-12): wrappea escrituras con
 * `atomic_guards` (CHECK ok=1). Una sola `db.batch([...])`; preflight fuera.
 */
export class AtomicPlanBuilder {
  private readonly statements: D1Bound[] = [];
  private readonly db: D1DatabaseLike;
  private readonly guardId: string;

  constructor(db: D1DatabaseLike, guardId: string = crypto.randomUUID()) {
    this.db = db;
    this.guardId = guardId;
  }

  add(statement: D1Bound): this {
    this.statements.push(statement);
    return this;
  }

  get size(): number {
    return this.statements.length;
  }

  /**
   * Inserta guard → statements → delete guard.
   * Si `ok` es false, el CHECK falla y D1 revierte toda la secuencia.
   */
  async commit(ok: boolean = true): Promise<readonly D1Result<unknown>[]> {
    const guardInsert = this.db
      .prepare(`INSERT INTO atomic_guards (id, ok) VALUES (?, ?)`)
      .bind(this.guardId, ok ? 1 : 0);
    const guardDelete = this.db
      .prepare(`DELETE FROM atomic_guards WHERE id = ?`)
      .bind(this.guardId);
    return runBatch(this.db, [guardInsert, ...this.statements, guardDelete]);
  }
}

/**
 * Compila un plan vía callback y lo ejecuta en un único batch con guard.
 * Las lecturas de preflight deben hacerse fuera de este callback.
 */
export async function runD1AtomicPlan(
  db: D1DatabaseLike,
  build: (plan: AtomicPlanBuilder) => void | Promise<void>,
  options?: { ok?: boolean; guardId?: string },
): Promise<readonly D1Result<unknown>[]> {
  const plan = new AtomicPlanBuilder(db, options?.guardId);
  await build(plan);
  return plan.commit(options?.ok ?? true);
}

export * from './process-offline-sale-atomic.js';
export * from './process-credit-note-atomic.js';
export * from './process-fiscal-deadlines.js';
export * from './build-daily-summary.js';
export * from './void-boleta-atomic.js';
export * from './rollup-rematerialize.js';
export * from './sync-sales-batch.js';
