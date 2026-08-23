/**
 * M1 anti-fork estructural del encadenado de `audit_events` (Arquitectura §6).
 *
 * Problema: la ventana carrera prev-read→insert (SELECT tail … luego INSERT)
 * permitió el fork histórico de staging (staff-ledger 0005, rowids 22-23).
 *
 * Garantía estructural: `audit_chain_heads` guarda la cabeza por tenant y
 * TODO append hace el claim por CAS en la MISMA db.batch que el INSERT:
 *   1. INSERT INTO audit_events (… prev_hash = head leída …)
 *   2. UPDATE audit_chain_heads SET last_hash=<row_hash nuevo>
 *      WHERE tenant_id=? AND last_hash=<head leída>        ← CAS
 *   3. guard atomic_guards: ok = (last_hash == row_hash)   ← CHECK aborta el
 *      batch COMPLETO si el CAS perdió (otro escritor ganó) → sin efectos
 *      parciales, sin fork.
 * Génesis (cabeza inexistente): INSERT … ON CONFLICT(tenant_id) DO NOTHING +
 * guard equivalente. El batch entero se revierte ante pérdida; el llamador
 * reintenta (puerto standalone) o repite la operación idempotente (planes
 * compuestos), igual que cualquier guardState del motor.
 */

import type { D1Bound } from './index.js';

interface AuditChainBoundRow {
  first<T = unknown>(): Promise<T | null>;
}

/** Puerto estructural mínimo: lo satisfacen D1 real, D1DatabaseLike y BackupD1. */
export interface AuditChainDb {
  prepare(sql: string): {
    bind(...values: unknown[]): AuditChainBoundRow;
  };
  batch(statements: readonly unknown[]): Promise<unknown>;
}

/** Los statements producidos son bounds completos en runtime (D1/D1DatabaseLike). */
function asBoundStatement(statement: AuditChainBoundRow): D1Bound {
  return statement as unknown as D1Bound;
}

export const AUDIT_CHAIN_CONTENTION = 'AUDIT_CHAIN_CONTENTION';
export const AUDIT_CHAIN_PREV_MISMATCH = 'AUDIT_CHAIN_PREV_MISMATCH';

const AUDIT_CHAIN_MAX_ATTEMPTS = 3;

/** Valores completos de la fila (el escritor conserva SU formato canónico). */
export interface AuditEventRowValues {
  readonly id: string;
  readonly branchId: string | null;
  readonly actorUserId: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly payloadJson: string;
  readonly prevHash: string | null;
  readonly rowHash: string;
  /** Opcional: DEFAULT CURRENT_TIMESTAMP cuando se omite. */
  readonly createdAt?: string | null;
}

export interface AuditChainAppendParams {
  readonly tenantId: string;
}

function codedError(
  code: string,
  details: Readonly<Record<string, unknown>> = {},
): Error & { readonly code: string } {
  return Object.assign(new Error(code), { code, ...details });
}

/**
 * Cabeza de la cadena del tenant (`null` = génesis / tenant sin eventos).
 * ÚNICO lookup autorizado para prev — reemplaza los lookups inline duplicados.
 */
export async function readAuditChainHead(
  db: AuditChainDb,
  tenantId: string,
): Promise<string | null> {
  const row = await db
    .prepare(`SELECT last_hash FROM audit_chain_heads WHERE tenant_id = ?`)
    .bind(tenantId)
    .first<{ last_hash: string | null }>();
  return row?.last_hash ?? null;
}

function auditChainGuardStatements(
  db: AuditChainDb,
  tenantId: string,
  expectedHeadHash: string,
): readonly D1Bound[] {
  const guardId = crypto.randomUUID();
  return [
    db
      .prepare(
        `INSERT INTO atomic_guards (id, ok)
         SELECT ?, CASE WHEN last_hash = ? THEN 1 ELSE 0 END
         FROM audit_chain_heads WHERE tenant_id = ?`,
      )
      .bind(guardId, expectedHeadHash, tenantId),
    db.prepare(`DELETE FROM atomic_guards WHERE id = ?`).bind(guardId),
  ].map(asBoundStatement);
}

/**
 * Statements de claim de cabeza para colgar AL FINAL de un batch atómico
 * compuesto (después de los INSERT INTO audit_events del plan). La cadena es
 * interna al batch: los hashes vienen en orden y solo la PUNTA avanza la
 * cabeza (los enlaces intermedios son intra-batch, sin concurrencia posible).
 * Sin filas de auditoría no hay claim (head queda intacto). Genérico: con D1
 * real devuelve D1PreparedStatement; con fakes/D1DatabaseLike, su bound.
 */
export function auditChainClaimStatements<DB extends AuditChainDb>(
  db: DB,
  tenantId: string,
  prevHeadHash: string | null,
  chainedRowHashes: readonly string[],
): readonly ReturnType<ReturnType<DB['prepare']>['bind']>[] {
  type Bound = ReturnType<ReturnType<DB['prepare']>['bind']>;
  if (chainedRowHashes.length === 0) return [];
  const finalHash = chainedRowHashes[chainedRowHashes.length - 1];
  if (finalHash === undefined) return [];
  const claim =
    prevHeadHash === null
      ? db
          .prepare(
            `INSERT INTO audit_chain_heads (tenant_id, last_hash)
             VALUES (?, ?) ON CONFLICT (tenant_id) DO NOTHING`,
          )
          .bind(tenantId, finalHash)
      : db
          .prepare(
            `UPDATE audit_chain_heads
             SET last_hash = ?, updated_at = CURRENT_TIMESTAMP
             WHERE tenant_id = ? AND last_hash = ?`,
          )
          .bind(finalHash, tenantId, prevHeadHash);
  return [
    claim as Bound,
    ...auditChainGuardStatements(db, tenantId, finalHash).map((s) => s as Bound),
  ];
}

function insertAuditEventStatement(
  db: AuditChainDb,
  tenantId: string,
  row: AuditEventRowValues,
): D1Bound {
  if (row.createdAt !== undefined && row.createdAt !== null) {
    return asBoundStatement(
      db
        .prepare(
          `INSERT INTO audit_events (
             id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
             payload_json, prev_hash, row_hash, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          row.id,
          tenantId,
          row.branchId,
          row.actorUserId,
          row.action,
          row.entityType,
          row.entityId,
          row.payloadJson,
          row.prevHash,
          row.rowHash,
          row.createdAt,
        ),
    );
  }
  return asBoundStatement(
    db
      .prepare(
        `INSERT INTO audit_events (
           id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
           payload_json, prev_hash, row_hash
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        row.id,
        tenantId,
        row.branchId,
        row.actorUserId,
        row.action,
        row.entityType,
        row.entityId,
        row.payloadJson,
        row.prevHash,
        row.rowHash,
      ),
  );
}

/**
 * Puerto único de append de auditoría (escritores standalone). Lee la cabeza,
 * delega el formato canónico del hash al `buildRow` del escritor y commitea
 * INSERT+claim(CAS+guard) en UNA db.batch con reintento ≤3. Contención tras
 * agotar reintentos → error codificado AUDIT_CHAIN_CONTENTION.
 */
export async function appendAuditEvent(
  db: AuditChainDb,
  params: AuditChainAppendParams,
  buildRow: (prevHash: string | null) => AuditEventRowValues | Promise<AuditEventRowValues>,
): Promise<void> {
  let lastCause: unknown = null;
  for (let attempt = 0; attempt < AUDIT_CHAIN_MAX_ATTEMPTS; attempt += 1) {
    const prevHash = await readAuditChainHead(db, params.tenantId);
    const row = await buildRow(prevHash);
    if (row.prevHash !== prevHash) {
      throw codedError(AUDIT_CHAIN_PREV_MISMATCH, {
        tenantId: params.tenantId,
        expected: prevHash,
        received: row.prevHash,
      });
    }
    try {
      await db.batch([
        insertAuditEventStatement(db, params.tenantId, row),
        ...auditChainClaimStatements(db, params.tenantId, prevHash, [row.rowHash]),
      ]);
      return;
    } catch (cause) {
      lastCause = cause;
      // Backoff corto: desincroniza al rebaño de perdedores para que la
      // siguiente lectura de cabeza no vuelva a colisionar en bloque.
      if (attempt < AUDIT_CHAIN_MAX_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, 5 * 2 ** attempt + Math.random() * 10));
      }
    }
  }
  throw codedError(AUDIT_CHAIN_CONTENTION, {
    tenantId: params.tenantId,
    cause: lastCause instanceof Error ? lastCause.message : String(lastCause),
  });
}
