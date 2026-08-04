export interface D1Result<T> {
  readonly results: readonly T[];
  readonly success: boolean;
  readonly meta: Record<string, unknown>;
}

export interface D1Bound {
  bind(...params: unknown[]): D1Bound;
  all<T = unknown>(): Promise<D1Result<T>>;
}

export interface D1Prepared {
  bind(...params: unknown[]): D1Bound;
}

export interface D1DatabaseLike {
  prepare(sql: string): D1Prepared;
  batch(statements: readonly D1Bound[]): Promise<readonly D1Result<unknown>[]>;
}

export function isD1Success(result: D1Result<unknown>): boolean {
  return result.success;
}
