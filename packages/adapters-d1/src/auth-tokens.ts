/**
 * Tokens de autorización SEC-09 (regla 2 §5.3): JWT/UUID hasheado emitido
 * server-side tras PIN de supervisor, TTL 90s, un solo uso. Verificación
 * central para todos los motores (venta offline, cuotas, devoluciones).
 */
import type { D1DatabaseLike } from './index.js';

export async function requireLiveAuthToken(
  db: D1DatabaseLike,
  tenantId: string,
  tokenHash: string | null | undefined,
): Promise<string> {
  if (!tokenHash?.trim()) throw new Error('AUTH_TOKEN_REQUIRED');
  const row = await db
    .prepare(
      `SELECT id FROM authorization_tokens
       WHERE tenant_id = ? AND token_hash = ?
         AND used_at IS NULL
         AND expires_at > datetime('now')
       LIMIT 1`,
    )
    .bind(tenantId, tokenHash)
    .first<{ id: string }>();
  if (!row) throw new Error('AUTH_TOKEN_INVALID');
  return row.id;
}

/** Carga un token vivo (no usado, no vencido) con su aprobador, sin lanzar. */
export async function loadLiveAuthToken(
  db: D1DatabaseLike,
  tenantId: string,
  tokenHash: string | null | undefined,
): Promise<{ id: string; approvedByUserId: string } | null> {
  if (!tokenHash?.trim()) return null;
  const row = await db
    .prepare(
      `SELECT id, approved_by_user_id FROM authorization_tokens
       WHERE tenant_id = ? AND token_hash = ?
         AND used_at IS NULL
         AND expires_at > datetime('now')
       LIMIT 1`,
    )
    .bind(tenantId, tokenHash)
    .first<{ id: string; approved_by_user_id: string }>();
  if (!row) return null;
  return { id: row.id, approvedByUserId: row.approved_by_user_id };
}
