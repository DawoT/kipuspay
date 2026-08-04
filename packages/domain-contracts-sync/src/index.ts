export interface SyncOp {
  readonly id: string;
  readonly entity: string;
  readonly version: number;
}

export interface SyncEnvelope<T> {
  readonly tenantId: string;
  readonly lastSeenLsn: number;
  readonly ops: readonly SyncOp[];
  readonly payloads: ReadonlyMap<string, T>;
}

export function maxLsn(envelope: SyncEnvelope<unknown>): number {
  let max = envelope.lastSeenLsn;
  for (const op of envelope.ops) {
    if (op.version > max) {
      max = op.version;
    }
  }
  return max;
}
