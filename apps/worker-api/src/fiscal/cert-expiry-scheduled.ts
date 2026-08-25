/**
 * SEC-03 — alerta T-30d de vencimiento del certificado SUNAT del tenant.
 * Corre diaria en el cron fiscal RC (worker.ts, FISCAL_RC_CRON), best-effort.
 * Dedup histórica (patrón F5b-4): idempotency_key_hash estable por
 * certificado (`cert-expiry:<tenant>:<fingerprint>`) → UNA alerta por
 * certificado aunque el barrido corra cada día; la rotación (huella nueva)
 * dispara una alerta nueva. push_events no tiene pruning → dedup duradera.
 */
import type { D1Database } from '@cloudflare/workers-types';

export interface CertExpiryEnv {
  readonly DB?: D1Database;
}

const WINDOW_DAYS = 30;

interface CertRow {
  tenant_id: string;
  fingerprint_sha256: string;
  expires_at: string;
}

/** 'YYYY-MM-DD HH:MM:SS' (D1 DATETIME UTC) o ISO → epoch ms; NaN si inválido. */
function expiresAtMs(raw: string): number {
  const normalized = raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`;
  const ms = Date.parse(normalized);
  return Number.isNaN(ms) ? Number.NaN : ms;
}

export async function runCertExpiryScheduled(
  env: CertExpiryEnv,
  input: { nowMs?: number },
): Promise<{ certsScanned: number; alertsEmitted: number }> {
  if (!env?.DB) return { certsScanned: 0, alertsEmitted: 0 };
  const nowMs = input.nowMs ?? Date.now();
  const from = new Date(nowMs).toISOString().slice(0, 19).replace('T', ' ');
  const to = new Date(nowMs + WINDOW_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');

  // Ventana [hoy, hoy+30d] sobre idx_tenant_certificates_expires. Defensa en
  // profundidad: el módulo re-valida los límites aunque el SQL ya filtre.
  const emptyResult: { results: CertRow[] } = { results: [] };
  const rows = await env.DB.prepare(
    `SELECT tc.tenant_id, tc.fingerprint_sha256, tc.expires_at
     FROM tenant_certificates tc
     JOIN tenants t ON t.id = tc.tenant_id AND t.deleted_at IS NULL
     WHERE tc.expires_at >= ? AND tc.expires_at <= ?
     ORDER BY tc.expires_at ASC`,
  )
    .bind(from, to)
    .all<CertRow>()
    .catch(() => emptyResult);

  let emitted = 0;
  for (const row of rows.results ?? []) {
    const daysLeft = Math.ceil((expiresAtMs(row.expires_at) - nowMs) / 86_400_000);
    if (!Number.isFinite(daysLeft) || daysLeft < 0 || daysLeft > WINDOW_DAYS) continue;

    const owner = await env.DB.prepare(
      `SELECT u.id FROM users u
       JOIN tenant_capabilities tc ON tc.tenant_id = u.tenant_id
       WHERE u.tenant_id = ? AND u.role = 'owner' AND u.deleted_at IS NULL
         AND tc.capability = 'mobile.push' AND tc.enabled = 1
       LIMIT 1`,
    )
      .bind(row.tenant_id)
      .first<{ id: string }>()
      .catch(() => null);
    if (!owner) continue;

    try {
      const { appendPushEventAtomic } = await import('@kipuspay/adapters-d1');
      const result = await appendPushEventAtomic(env.DB, {
        tenantId: row.tenant_id,
        userId: owner.id,
        purpose: 'OWNER_ALERTS',
        eventType: 'CERT_EXPIRY_WARNING',
        sourceEntityId: `tenant-cert:${row.tenant_id}:${row.fingerprint_sha256}`,
        sourceEntityType: 'FISCAL_CERT',
        idempotencyKeyHash: `cert-expiry:${row.tenant_id}:${row.fingerprint_sha256}`,
        payloadRedactedJson: JSON.stringify({
          daysLeft,
          expiresAt: row.expires_at,
          fingerprintSha256: row.fingerprint_sha256,
          message: `Tu certificado SUNAT vence en ${daysLeft} día(s): renuévalo a tiempo para no bloquear la emisión electrónica.`,
        }),
        deepLinkKind: 'cert_expiry',
        deepLinkEntityId: row.tenant_id,
        ttlSeconds: 604800,
        collapseKey: `cert-expiry:${row.tenant_id}`,
      });
      if (!result.alreadyApplied) emitted += 1;
    } catch {
      // Best-effort: un fallo de push no debe tumbar el cron fiscal.
    }
  }
  return { certsScanned: rows.results?.length ?? 0, alertsEmitted: emitted };
}
