/**
 * Sprint 48 — platform.dr (Arquitectura §5.3 regla 32b / §5.9 regla 27).
 *
 * Restore APPLY a un shard DR aislado: reutiliza las filas YA validadas por
 * verifyRestoreDryRun (hashes, FK, checks, cadena de auditoría) vía el port
 * collectRestoreRows — nunca vuelve a descifrar ni duplica la lógica de
 * validación. El destino es un binding D1 de DR separado (composición, jamás
 * producción viva). Idempotencia por PK: INSERT OR IGNORE — re-ejecutar un
 * simulacro completa filas faltantes sin duplicar efectos.
 *
 * Dinero: INTEGER cents (los snapshots ya lo garantizan). D1: db.batch por
 * lote de ≤100 statements; cero UPSERT INTO (ON CONFLICT DO NOTHING vía OR
 * IGNORE). RTO objetivo ≤ 30 min por shard; RPO=0 tx ACID y RPO≤1d rollups
 * verificados por verifyDrReplay.
 */
import type { BackupRow } from '@kipuspay/domain-integrations';

export const RTO_TARGET_MS = 30 * 60 * 1000;
export const DR_BATCH_STATEMENTS = 100;

export interface DrTargetDb {
  prepare(sql: string): {
    bind(...params: unknown[]): {
      first<T>(): Promise<T | null>;
      run(): Promise<{ meta?: { changes?: number } }>;
    };
  };
  batch(statements: readonly unknown[]): Promise<unknown>;
}

export interface DrRestoreResult {
  readonly backupId: string;
  readonly tenantId: string;
  readonly tables: number;
  readonly rowsInserted: number;
  readonly rtoMs: number;
  readonly salesRestored: number;
  readonly rollupLatestDay: string | null;
  readonly replayDuplicates: number;
}

interface TopoInput {
  readonly rowsByTable: ReadonlyMap<string, readonly BackupRow[]>;
  readonly foreignKeys: readonly { readonly table: string; readonly parentTable: string }[];
  readonly tableOrder?: readonly string[];
}

/** Orden topológico (padres primero) para INSERT con FKs activas (Kahn). */
export function restoreTableOrder(input: TopoInput): readonly string[] {
  const tables = [...input.rowsByTable.keys()];
  const order: string[] = [];
  const remaining = new Set(tables);
  while (remaining.size > 0) {
    let progressed = false;
    for (const table of remaining) {
      const depends = input.foreignKeys
        .filter((fk) => fk.table === table && remaining.has(fk.parentTable))
        .map((fk) => fk.parentTable);
      if (depends.length === 0) {
        order.push(table);
        remaining.delete(table);
        progressed = true;
      }
    }
    if (!progressed) {
      // Ciclo inesperado en el registry: fallar cerrado, nunca orden arbitrario.
      throw new Error('DR_RESTORE_FK_CYCLE');
    }
  }
  return order;
}

function insertOrIgnoreStatement(db: DrTargetDb, table: string, row: BackupRow): unknown {
  const columns = Object.keys(row);
  const placeholders = columns.map(() => '?').join(', ');
  const quoted = columns.map((column) => `"${column}"`).join(', ');
  const stmt = db.prepare(`INSERT OR IGNORE INTO "${table}" (${quoted}) VALUES (${placeholders})`);
  return stmt.bind(...columns.map((column) => row[column] ?? null));
}

/**
 * Aplica las filas validadas al shard DR en orden topológico, por lotes de
 * ≤100 statements (límite D1). Idempotente: re-ejecutar no duplica (PK).
 */
export async function applyRestoreRowsToShard(input: {
  readonly db: DrTargetDb;
  readonly rowsByTable: ReadonlyMap<string, readonly BackupRow[]>;
  readonly foreignKeys?: readonly { readonly table: string; readonly parentTable: string }[];
}): Promise<{ readonly tables: number; readonly rowsInserted: number }> {
  const order = restoreTableOrder({
    rowsByTable: input.rowsByTable,
    foreignKeys: input.foreignKeys ?? [],
  });
  let rowsInserted = 0;
  for (const table of order) {
    const rows = input.rowsByTable.get(table) ?? [];
    for (let offset = 0; offset < rows.length; offset += DR_BATCH_STATEMENTS) {
      const chunk = rows.slice(offset, offset + DR_BATCH_STATEMENTS);
      const statements = chunk.map((row) => insertOrIgnoreStatement(input.db, table, row));
      await input.db.batch(statements);
      rowsInserted += chunk.length;
    }
  }
  return { tables: order.length, rowsInserted };
}

export interface DrReplayVerification {
  readonly salesCount: number;
  readonly expectedSalesCount: number;
  readonly rollupLatestDay: string | null;
  readonly duplicatesBlocked: number;
  readonly rpoTxZero: boolean;
  readonly rpoRollupOneDay: boolean;
}

/**
 * Verificación DR post-restore (determinista, sobre el shard DR):
 * - RPO=0 tx: conteo de `sales` restauradas == esperado (manifiesto).
 * - RPO≤1d rollups: `daily_financial_rollups` con día ≥ ayer (Lima).
 * - Replay de colas sin duplicados: re-insertar PK/UNIQUE existentes
 *   (offline sale, store-credit source_ref, fiscal outbox) → 0 cambios.
 */
export async function verifyDrReplay(input: {
  readonly db: DrTargetDb;
  readonly tenantId: string;
  readonly expectedSalesCount: number;
  readonly nowMs?: number;
}): Promise<DrReplayVerification> {
  const sales = await input.db
    .prepare(`SELECT COUNT(*) AS n FROM sales WHERE tenant_id = ?`)
    .bind(input.tenantId)
    .first<{ n: number }>();
  const salesCount = sales?.n ?? -1;
  const rollup = await input.db
    .prepare(`SELECT MAX(report_date) AS day FROM daily_financial_rollups WHERE tenant_id = ?`)
    .bind(input.tenantId)
    .first<{ day: string | null }>();
  const rollupLatestDay = rollup?.day ?? null;
  // RPO≤1d: el último rollup debe cubrir ayer (Lima, UTC-5).
  const nowMs = input.nowMs ?? Date.now();
  const yesterdayLima = new Date(nowMs - 5 * 3600 * 1000 - 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  const rpoRollupOneDay = rollupLatestDay !== null && rollupLatestDay >= yesterdayLima;

  let duplicatesBlocked = 0;
  const replayOne = async (table: string): Promise<void> => {
    // Re-insertar la fila completa: el duplicado choca contra la PK/UNIQUE y
    // OR IGNORE devuelve changes=0 (efecto bloqueado, 0 duplicados).
    const res = await input.db
      .prepare(`INSERT OR IGNORE INTO ${table} SELECT * FROM ${table} WHERE tenant_id = ? LIMIT 1`)
      .bind(input.tenantId)
      .run();
    if ((res.meta?.changes ?? 0) === 0) duplicatesBlocked += 1;
  };
  // Cada superficie idempotente debe bloquear el duplicado (changes=0).
  await replayOne('store_credit_transactions');
  await replayOne('fiscal_outbox');
  await replayOne('sales');

  return {
    salesCount,
    expectedSalesCount: input.expectedSalesCount,
    rollupLatestDay,
    duplicatesBlocked,
    rpoTxZero: salesCount === input.expectedSalesCount,
    rpoRollupOneDay,
  };
}
