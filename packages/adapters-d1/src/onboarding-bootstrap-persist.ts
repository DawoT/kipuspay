/**
 * Persistencia del bootstrap de onboarding (M6A, Sprint 11 / GTM §6.2).
 * Reserva KV primero (auth snapshot) y escribe el batch atómico después;
 * si el batch falla, revierte el KV para reintentos seguros (idempotencia
 * por tenantId en la ruta). La sesión de caja queda OPEN para la primera
 * venta; el owner se crea con badge y PIN argon2id (nunca en claro en D1).
 */
import type { D1DatabaseLike } from './index.js';

export interface BootstrapPersistenceInput {
  readonly tenantId: string;
  readonly tradeName: string;
  readonly verticalType: string;
  readonly formalizationMode: string;
  readonly ruc: string | null;
  readonly enabledDocumentTypes: readonly string[];
  readonly trialEndsAtIso: string;
  readonly branchId: string;
  readonly registerId: string;
  readonly sessionId: string;
  readonly ownerUserId: string;
  readonly ownerEmail: string;
  readonly ownerBadge: string;
  readonly ownerPinHash: string;
  readonly nowIso: string;
}

export type BootstrapKvPut = (
  key: string,
  value: string,
  opts?: { expirationTtl?: number },
) => Promise<void>;

export type BootstrapKvDelete = (key: string) => Promise<void>;

/** Serie por tipo de documento habilitado en el bootstrap (SUNAT/practica). */
export function seriesSeedFor(docType: string): { series: string; status: string } {
  switch (docType) {
    case '01':
      return { series: 'F001', status: 'PENDING_SUNAT' };
    case '03':
      return { series: 'B001', status: 'PENDING_SUNAT' };
    case '07':
      return { series: 'FC01', status: 'PENDING_SUNAT' };
    case '08':
      return { series: 'FD01', status: 'PENDING_SUNAT' };
    default:
      return { series: 'NV01', status: 'INTERNAL' };
  }
}

/** Snapshot de auth para TENANT_KV `tenant:${id}` (mapTenantRow del plano de control). */
export function tenantAuthSnapshot(input: {
  readonly tenantId: string;
  readonly trialEndsAtIso: string;
}): string {
  return JSON.stringify({
    id: input.tenantId,
    status: 'active',
    subscriptionStatus: 'trial',
    trialEndsAt: input.trialEndsAtIso,
  });
}

export async function persistBootstrap(
  db: D1DatabaseLike,
  kvPut: BootstrapKvPut,
  kvDelete: BootstrapKvDelete,
  input: BootstrapPersistenceInput,
): Promise<void> {
  await kvPut(`tenant:${input.tenantId}`, tenantAuthSnapshot(input));
  const documents = JSON.stringify(input.enabledDocumentTypes);
  const seriesStatements = input.enabledDocumentTypes.map((docType) => {
    const seed = seriesSeedFor(docType);
    return db
      .prepare(
        `INSERT INTO branch_document_series (
           id, tenant_id, branch_id, document_type_code, series, authorization_status, is_active
         ) VALUES (?, ?, ?, ?, ?, ?, 1)`,
      )
      .bind(crypto.randomUUID(), input.tenantId, input.branchId, docType, seed.series, seed.status);
  });
  const paymentMethodStatements = [
    // El POS cobra con pm-cash por defecto (método canónico, no adquirente).
    db
      .prepare(
        `INSERT INTO payment_methods (id, tenant_id, code, name, is_active)
         VALUES ('pm-cash', ?, 'cash', 'Efectivo', 1)`,
      )
      .bind(input.tenantId),
  ];
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO tenants (
             id, ruc, business_name, trade_name, vertical_type, tax_regime,
             formalization_mode, pse_mode, enabled_document_types, plan_id,
             subscription_status, trial_ends_at, is_active
           ) VALUES (?, ?, ?, ?, ?, 'UNKNOWN', ?, 'KIPUSPAY_PSE', ?, 'arranque', 'trial', ?, 1)`,
        )
        .bind(
          input.tenantId,
          input.ruc,
          input.tradeName,
          input.tradeName,
          input.verticalType,
          input.formalizationMode,
          documents,
          input.trialEndsAtIso,
        ),
      db
        .prepare(
          `INSERT INTO branches (id, tenant_id, code, name, address, is_active)
           VALUES (?, ?, '0001', ?, ?, 1)`,
        )
        .bind(input.branchId, input.tenantId, 'Local principal', input.tradeName),
      db
        .prepare(
          `INSERT INTO cash_registers (id, tenant_id, branch_id, name, is_active)
           VALUES (?, ?, ?, 'Caja principal', 1)`,
        )
        .bind(input.registerId, input.tenantId, input.branchId),
      db
        .prepare(
          `INSERT INTO users (
             id, tenant_id, branch_id, email, role, pin_hash, badge_barcode,
             permissions, is_active
           ) VALUES (?, ?, ?, ?, 'owner', ?, ?, '[]', 1)`,
        )
        .bind(
          input.ownerUserId,
          input.tenantId,
          input.branchId,
          input.ownerEmail,
          input.ownerPinHash,
          input.ownerBadge,
        ),
      db
        .prepare(
          `INSERT INTO cash_register_sessions (
             id, tenant_id, branch_id, cash_register_id, user_id,
             opening_balance_cents, status
           ) VALUES (?, ?, ?, ?, ?, 0, 'OPEN')`,
        )
        .bind(input.sessionId, input.tenantId, input.branchId, input.registerId, input.ownerUserId),
      db
        .prepare(
          `INSERT INTO growth_events (id, tenant_id, event_type, occurred_at, meta_json)
           VALUES (?, ?, 'onboarding_started', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          input.tenantId,
          input.nowIso,
          JSON.stringify({ vertical: input.verticalType, mode: input.formalizationMode }),
        ),
      ...seriesStatements,
      ...paymentMethodStatements,
    ]);
  } catch (err) {
    await kvDelete(`tenant:${input.tenantId}`);
    throw err;
  }
}
