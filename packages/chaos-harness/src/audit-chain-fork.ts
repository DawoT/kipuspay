/**
 * M1 anti-fork — escenario de caos del encadenado de audit_events (§13.5).
 *
 * Demuestra, contra D1 real (driver integration en adapters-d1), que:
 *  - RED: el patrón legacy read-then-insert con interleaving inyectado
 *    (barrera entre la lectura del tail y el INSERT) SÍ crea forks.
 *  - GREEN: el puerto `appendAuditEvent` (claim CAS de `audit_chain_heads`
 *    en la misma db.batch) sostiene K escritores × E eventos con cero forks,
 *    todo el DAG alcanzable desde génesis y cabeza == punta final.
 *
 * El db y el append son puertos inyectados (mismo estilo que dr-failover):
 * el harness no depende de adapters-d1.
 */

export type AuditChainForkVerdict = 'PASS' | 'FAIL';

export interface AuditChainChaosBound {
  bind(...values: unknown[]): {
    all<T = Record<string, unknown>>(): Promise<{ results?: readonly T[] }>;
    first<T = Record<string, unknown>>(): Promise<T | null>;
  };
}

export interface AuditChainChaosDb {
  prepare(sql: string): AuditChainChaosBound;
  batch(statements: readonly unknown[]): Promise<unknown>;
}

export type AuditChainAppendPort = (
  db: AuditChainChaosDb,
  params: { readonly tenantId: string },
  buildRow: (prevHash: string | null) =>
    | {
        readonly id: string;
        readonly branchId: string | null;
        readonly actorUserId: string;
        readonly action: string;
        readonly entityType: string;
        readonly entityId: string;
        readonly payloadJson: string;
        readonly prevHash: string | null;
        readonly rowHash: string;
      }
    | Promise<{
        readonly id: string;
        readonly branchId: string | null;
        readonly actorUserId: string;
        readonly action: string;
        readonly entityType: string;
        readonly entityId: string;
        readonly payloadJson: string;
        readonly prevHash: string | null;
        readonly rowHash: string;
      }>,
) => Promise<void>;

export interface AuditChainChaosOptions {
  readonly tenantId: string;
  readonly writers: number;
  readonly eventsPerWriter: number;
}

export interface AuditChainForkStats {
  readonly rows: number;
  readonly expectedRows: number;
  /** prev_hash (o génesis) con más de un hijo directo. */
  readonly forks: number;
  /** Filas no alcanzables caminando el DAG desde los génesis. */
  readonly unreachable: number;
  /** Cabeza registrada == row_hash de la única punta de la cadena. */
  readonly headMatchesTip: boolean;
}

interface ChainRow {
  readonly id: string;
  readonly prev_hash: string | null;
  readonly row_hash: string;
}

function countForks(chain: readonly ChainRow[]): {
  forks: number;
  referencedHashes: ReadonlySet<string>;
} {
  const childrenByPrev = new Map<string, number>();
  const referencedHashes = new Set<string>();
  for (const row of chain) {
    const key = row.prev_hash ?? '__genesis__';
    childrenByPrev.set(key, (childrenByPrev.get(key) ?? 0) + 1);
    if (row.prev_hash !== null) referencedHashes.add(row.prev_hash);
  }
  let forks = 0;
  for (const count of childrenByPrev.values()) {
    if (count > 1) forks += 1;
  }
  return { forks, referencedHashes };
}

function countUnreachable(chain: readonly ChainRow[]): number {
  const childrenById = new Map<string, string[]>();
  const idToRow = new Map(chain.map((row) => [row.id, row]));
  for (const row of chain) {
    const key = row.prev_hash ?? '__genesis__';
    childrenById.set(key, [...(childrenById.get(key) ?? []), row.id]);
  }
  const reachable = new Set<string>();
  const queue = [...(childrenById.get('__genesis__') ?? [])];
  while (queue.length > 0) {
    const id = queue.pop() as string;
    if (reachable.has(id)) continue;
    reachable.add(id);
    const row = idToRow.get(id);
    if (!row) continue;
    for (const child of childrenById.get(row.row_hash) ?? []) queue.push(child);
  }
  return chain.length - reachable.size;
}

async function readHead(db: AuditChainChaosDb, tenantId: string): Promise<string | null> {
  const head = await db
    .prepare(`SELECT last_hash FROM audit_chain_heads WHERE tenant_id = ?`)
    .bind(tenantId)
    .first<{ last_hash: string | null }>();
  return head?.last_hash ?? null;
}

/** Caminata DAG completa sobre audit_events del tenant. */
export async function walkAuditChainDag(
  db: AuditChainChaosDb,
  tenantId: string,
): Promise<Omit<AuditChainForkStats, 'expectedRows'>> {
  const rows = await db
    .prepare(
      `SELECT id, prev_hash, row_hash FROM audit_events
       WHERE tenant_id = ? ORDER BY created_at, id`,
    )
    .bind(tenantId)
    .all<ChainRow>();
  const chain = rows.results ?? [];

  const { forks, referencedHashes } = countForks(chain);

  // Puntas: filas cuyo row_hash nadie referencia como prev. GREEN exige una.
  const tips = chain.filter((row) => !referencedHashes.has(row.row_hash));
  const tip = tips[0];
  const head = await readHead(db, tenantId);
  const headMatchesTip =
    tips.length === 1 && tip !== undefined && head !== null && head === tip.row_hash;

  return {
    rows: chain.length,
    forks,
    unreachable: countUnreachable(chain),
    headMatchesTip,
  };
}

export function judgeAuditChainFork(stats: AuditChainForkStats): AuditChainForkVerdict {
  if (stats.rows !== stats.expectedRows) return 'FAIL';
  if (stats.forks !== 0) return 'FAIL';
  if (stats.unreachable !== 0) return 'FAIL';
  if (!stats.headMatchesTip) return 'FAIL';
  return 'PASS';
}

async function readTail(db: AuditChainChaosDb, tenantId: string): Promise<string | null> {
  const tail = await db
    .prepare(
      `SELECT row_hash FROM audit_events
       WHERE tenant_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
    )
    .bind(tenantId)
    .first<{ row_hash: string }>();
  return tail?.row_hash ?? null;
}

/**
 * Barrera cíclica: cada ronda espera a que TODOS los escritores hayan leído
 * el tail antes de liberar cualquier INSERT (interleaving determinista).
 */
function barrier(writers: number): () => Promise<void> {
  let arrived = 0;
  let open: (() => void) | null = null;
  let gate: Promise<void> = Promise.resolve();
  return () => {
    if (open === null) {
      gate = new Promise<void>((resolve) => {
        open = resolve;
      });
    }
    arrived += 1;
    if (arrived === writers) {
      arrived = 0;
      const release = open as () => void;
      open = null;
      release();
      return Promise.resolve();
    }
    return gate;
  };
}

/**
 * RED: patrón legacy read-then-insert con interleaving FORZADO — todos los
 * escritores leen el tail de la ronda antes de que cualquiera INSERTE.
 * Determinista: cada ronda produce al menos un grupo de hermanos con el
 * mismo prev_hash → forks > 0.
 */
export async function runLegacyConcurrentAuditAppends(
  db: AuditChainChaosDb,
  options: AuditChainChaosOptions,
): Promise<AuditChainForkStats> {
  const wait = barrier(options.writers);
  const tasks: Promise<void>[] = [];
  for (let writer = 0; writer < options.writers; writer += 1) {
    tasks.push(
      (async () => {
        for (let event = 0; event < options.eventsPerWriter; event += 1) {
          const prev = await readTail(db, options.tenantId);
          await wait();
          const rowHash = crypto.randomUUID();
          await db.batch([
            db
              .prepare(
                `INSERT INTO audit_events (
                   id, tenant_id, branch_id, actor_user_id, action, entity_type,
                   entity_id, payload_json, prev_hash, row_hash
                 ) VALUES (?, ?, NULL, ?, 'CHAOS_LEGACY', 'chaos', ?, '{}', ?, ?)`,
              )
              .bind(
                crypto.randomUUID(),
                options.tenantId,
                `writer-${writer}`,
                `${options.tenantId}:${writer}:${event}`,
                prev,
                rowHash,
              ),
          ]);
        }
      })(),
    );
  }
  await Promise.all(tasks);
  return {
    ...(await walkAuditChainDag(db, options.tenantId)),
    expectedRows: options.writers * options.eventsPerWriter,
  };
}

/**
 * GREEN: mismo K×E pero TODO append vía el puerto (claim CAS + guard dentro
 * de una sola db.batch, reintento ≤3). La contención revierte el batch del
 * perdedor y el reintento re-lee cabeza: cero forks estructuralmente.
 */
export async function runPortConcurrentAuditAppends(
  db: AuditChainChaosDb,
  append: AuditChainAppendPort,
  options: AuditChainChaosOptions,
): Promise<AuditChainForkStats> {
  const tasks: Promise<void>[] = [];
  for (let writer = 0; writer < options.writers; writer += 1) {
    tasks.push(
      (async () => {
        for (let event = 0; event < options.eventsPerWriter; event += 1) {
          await append(db, { tenantId: options.tenantId }, (prev) => ({
            id: crypto.randomUUID(),
            branchId: null,
            actorUserId: `writer-${writer}`,
            action: 'CHAOS_PORT',
            entityType: 'chaos',
            entityId: `${options.tenantId}:${writer}:${event}`,
            payloadJson: JSON.stringify({ prev }),
            prevHash: prev,
            rowHash: crypto.randomUUID(),
          }));
        }
      })(),
    );
  }
  await Promise.all(tasks);
  return {
    ...(await walkAuditChainDag(db, options.tenantId)),
    expectedRows: options.writers * options.eventsPerWriter,
  };
}
