/**
 * S12-H1: persistencia D1 del pipeline de referidos (migración 0010).
 * El soft-launch in-memory se reemplaza por escrituras en referral_codes /
 * referral_attributions / growth_events — atribución end-to-end sin gaps.
 */
import type { D1DatabaseLike } from './index.js';

export interface ReferralCodeRow {
  readonly tenant_id: string;
  readonly code: string;
}

export interface ReferralAttributionRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly referrer_tenant_id: string;
  readonly referral_code: string;
  readonly status: 'captured' | 'qualified' | 'credited';
  readonly credit_days: number;
}

/** Crea el código de referido del tenant si no existe (idempotente). */
export async function ensureReferralCodeD1(
  db: D1DatabaseLike,
  tenantId: string,
  code: string,
): Promise<ReferralCodeRow> {
  const existing = await db
    .prepare(`SELECT tenant_id, code FROM referral_codes WHERE tenant_id = ?`)
    .bind(tenantId)
    .first<ReferralCodeRow>();
  if (existing) return existing;
  await db
    .prepare(`INSERT INTO referral_codes (id, tenant_id, code) VALUES (?, ?, ?)`)
    .bind(crypto.randomUUID(), tenantId, code)
    .run();
  return { tenant_id: tenantId, code };
}

/** Registra la atribución capturada (1 por referido — UNIQUE tenant_id). */
export async function captureAttributionD1(
  db: D1DatabaseLike,
  input: {
    readonly id: string;
    readonly referredTenantId: string;
    readonly referrerTenantId: string;
    readonly code: string;
    readonly creditDays?: number;
  },
): Promise<ReferralAttributionRow> {
  const creditDays = input.creditDays ?? 30;
  await db
    .prepare(
      `INSERT INTO referral_attributions
         (id, tenant_id, referrer_tenant_id, referral_code, status, credit_days)
       VALUES (?, ?, ?, ?, 'captured', ?)`,
    )
    .bind(input.id, input.referredTenantId, input.referrerTenantId, input.code, creditDays)
    .run();
  return {
    id: input.id,
    tenant_id: input.referredTenantId,
    referrer_tenant_id: input.referrerTenantId,
    referral_code: input.code,
    status: 'captured',
    credit_days: creditDays,
  };
}

/** Lee la atribución vigente de un tenant (o null si no tiene). */
export async function loadAttributionForTenant(
  db: D1DatabaseLike,
  tenantId: string,
): Promise<ReferralAttributionRow | null> {
  const row = await db
    .prepare(
      `SELECT id, tenant_id, referrer_tenant_id, referral_code, status, credit_days
       FROM referral_attributions WHERE tenant_id = ?`,
    )
    .bind(tenantId)
    .first<ReferralAttributionRow>();
  return row ?? null;
}

/** Marca la atribución como credited + registra growth_event referral_credited. */
export async function markAttributionCreditedD1(
  db: D1DatabaseLike,
  input: {
    readonly attributionId: string;
    readonly referredTenantId: string;
    readonly referrerTenantId: string;
    readonly nowIso: string;
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE referral_attributions
       SET status = 'credited', credited_at = ?
       WHERE id = ? AND status IN ('captured','qualified')`,
    )
    .bind(input.nowIso, input.attributionId)
    .run();
  await db
    .prepare(
      `INSERT INTO growth_events (id, tenant_id, event_type, occurred_at, meta_json)
       VALUES (?, ?, 'referral_credited', ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      input.referredTenantId,
      input.nowIso,
      JSON.stringify({ referrerTenantId: input.referrerTenantId }),
    )
    .run();
}

/** Inserta un growth_event genérico (first_sale, formalization_upgrade...). */
export async function insertGrowthEventD1(
  db: D1DatabaseLike,
  input: {
    readonly tenantId: string;
    readonly eventType: string;
    readonly occurredAtIso: string;
    readonly meta?: Record<string, unknown>;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO growth_events (id, tenant_id, event_type, occurred_at, meta_json)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      input.tenantId,
      input.eventType,
      input.occurredAtIso,
      input.meta ? JSON.stringify(input.meta) : null,
    )
    .run();
}
