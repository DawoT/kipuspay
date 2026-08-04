/**
 * Cron multi-shard daily rollups (Arquitectura §9) — Promise.all, idempotente.
 * Escritura DELETE+INSERT vía rematerializeDailyRollup. Nunca UPSERT INTO.
 */
import type { D1DatabaseLike } from './index.js';
import { rematerializeDailyRollup, type InsightsKv } from './rollup-rematerialize.js';

export interface ShardBinding {
  readonly shardKey: string;
  readonly db: D1DatabaseLike;
}

export interface ClosedLimaWindow {
  readonly reportDateLima: string;
  readonly startOfLimaDay: string;
  readonly endOfLimaDay: string;
}

/** Día Lima cerrado = día calendario Lima anterior a `scheduledTime`. */
export function closedLimaWindow(scheduledTimeMs: number): ClosedLimaWindow {
  const lima = new Date(scheduledTimeMs - 5 * 3600 * 1000);
  lima.setUTCDate(lima.getUTCDate() - 1);
  const y = lima.getUTCFullYear();
  const m = String(lima.getUTCMonth() + 1).padStart(2, '0');
  const d = String(lima.getUTCDate()).padStart(2, '0');
  const reportDateLima = `${y}-${m}-${d}`;
  return {
    reportDateLima,
    startOfLimaDay: `${reportDateLima} 00:00:00`,
    endOfLimaDay: `${reportDateLima} 23:59:59`,
  };
}

export function parseActiveShards(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return ['D1_SHARD_01'];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
      return parsed.length > 0 ? parsed : ['D1_SHARD_01'];
    }
  } catch {
    /* fallthrough */
  }
  return ['D1_SHARD_01'];
}

export interface TenantBranchPair {
  readonly tenantId: string;
  readonly branchId: string;
}

async function listTenantBranchesForDay(
  db: D1DatabaseLike,
  reportDate: string,
): Promise<readonly TenantBranchPair[]> {
  const rows = await db
    .prepare(
      `SELECT DISTINCT tenant_id, branch_id
       FROM sales
       WHERE deleted_at IS NULL AND date(issued_at_lima) = ?`,
    )
    .bind(reportDate)
    .all<{ tenant_id: string; branch_id: string }>();
  return (rows.results ?? []).map((r) => ({
    tenantId: r.tenant_id,
    branchId: r.branch_id,
  }));
}

export interface ShardRollupResult {
  readonly shardKey: string;
  readonly reportDate: string;
  readonly pairs: number;
  readonly grossSalesCents: number;
  readonly productRowCount: number;
}

export async function runRollupsForShard(
  shard: ShardBinding,
  reportDate: string,
  kv?: InsightsKv,
): Promise<ShardRollupResult> {
  const pairs = await listTenantBranchesForDay(shard.db, reportDate);
  let grossSalesCents = 0;
  let productRowCount = 0;
  for (const pair of pairs) {
    const r = await rematerializeDailyRollup(
      shard.db,
      pair.tenantId,
      pair.branchId,
      reportDate,
      kv,
    );
    grossSalesCents += r.grossSalesCents;
    productRowCount += r.productRowCount;
  }
  return {
    shardKey: shard.shardKey,
    reportDate,
    pairs: pairs.length,
    grossSalesCents,
    productRowCount,
  };
}

export interface DailyRollupsCronResult {
  readonly reportDate: string;
  readonly shards: readonly ShardRollupResult[];
  readonly elapsedMs: number;
}

/**
 * Agregador paralelo por shard. Fail-soft por shard ausente (skip).
 * 2× ejecución → mismo SoT (idempotente).
 */
export async function runDailyRollupsCron(
  shards: readonly ShardBinding[],
  scheduledTimeMs: number,
  kv?: InsightsKv,
): Promise<DailyRollupsCronResult> {
  const started = Date.now();
  const { reportDateLima } = closedLimaWindow(scheduledTimeMs);
  const results = await Promise.all(
    shards.map((shard) => runRollupsForShard(shard, reportDateLima, kv)),
  );
  return {
    reportDate: reportDateLima,
    shards: results,
    elapsedMs: Date.now() - started,
  };
}
