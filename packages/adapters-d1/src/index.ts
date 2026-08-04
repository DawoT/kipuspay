export interface D1Result<T> {
  readonly results: readonly T[];
  readonly success: boolean;
  readonly meta: Record<string, unknown>;
}

export interface D1Bound {
  bind(...params: unknown[]): D1Bound;
  all<T = unknown>(): Promise<D1Result<T>>;
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
