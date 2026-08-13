/**
 * S43-H2: expiración automática de pedidos vencidos (cron 5 min).
 * Libera el stock reservado de pedidos con reserved_until vencido y status
 * OPEN/PARTIAL. Idempotente: expireCustomerOrderAtomic devuelve alreadyApplied
 * para estados terminales. Fail-closed: sin DB → 0 expirados, sin error.
 */
import { expireCustomerOrderAtomic } from '@kipuspay/adapters-d1';
import type { WorkerEnv } from '../auth/control-plane.js';

export async function runExpireOrdersScheduled(
  env: WorkerEnv,
  options: { readonly scheduledTime?: number } = {},
): Promise<{ readonly expired: number; readonly scanned: number }> {
  if (!env?.DB) return { expired: 0, scanned: 0 };
  const now = options.scheduledTime ?? Date.now();
  const nowIso = new Date(now).toISOString();
  const rows = await env.DB.prepare(
    `SELECT DISTINCT o.tenant_id, o.id, o.branch_id
     FROM customer_orders o
     JOIN tenant_capabilities tc
       ON tc.tenant_id = o.tenant_id
     WHERE o.status IN ('OPEN','PARTIAL')
       AND o.reserved_until <= ?
       AND tc.capability = 'orders.customer_orders' AND tc.enabled = 1
     ORDER BY o.reserved_until ASC LIMIT 200`,
  )
    .bind(nowIso)
    .all<{ tenant_id: string; id: string; branch_id: string }>();
  let expired = 0;
  for (const row of rows.results ?? []) {
    try {
      const result = await expireCustomerOrderAtomic(env.DB, {
        tenantId: row.tenant_id,
        orderId: row.id,
        branchId: row.branch_id,
        actorUserId: row.branch_id,
        idempotencyKey: `expire-cron:${row.id}:${nowIso}`,
      });
      if (result.status === 'EXPIRED' && !result.alreadyApplied) expired += 1;
    } catch {
      // Pedido ya terminal o conflicto de carrera: se reintenta en el próximo tick.
    }
  }
  return { expired, scanned: (rows.results ?? []).length };
}
