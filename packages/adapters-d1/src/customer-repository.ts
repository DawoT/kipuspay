/**
 * Repositorio LPDP de clientes (Arquitectura §5.3 regla 32a / ADR-0031).
 *
 * Adaptador D1: traduce el dominio puro @kipuspay/domain-customers a SQL. Toda
 * consulta/escritura fuerza `tenant_id` del JWT (LPDP-04); jamás del payload.
 * El erase es un solo `db.batch([...])` (invariante D1). Nunca UPSERT INTO.
 */
import {
  ANONYMIZED_DOCUMENT,
  ANONYMIZED_NAME,
  CUSTOMER_ERASED,
  assertNotErased,
  buildCustomerExport,
  planConsentChange,
  planCustomerErase,
  projectPiiInventory,
  type ConsentChangePlan,
  type ConsentRecord,
  type CustomerExportPayload,
  type ErasePlan,
  type PiiInventoryEntry,
} from '@kipuspay/domain-customers';
import type { D1Bound, D1DatabaseLike } from './index.js';
import { sha256HexOf } from './crypto.js';

export interface CustomerInventoryRow {
  readonly document_type_code: string;
  readonly document_number: string;
  readonly name: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly address: string | null;
  readonly pii_erased: number;
}

export interface CustomerForEraseRow {
  readonly id: string;
  readonly pii_erased: number;
  readonly deleted_at: string | null;
}

export interface ConsentRow {
  readonly id: string;
  readonly purpose: string;
  readonly granted: number;
  readonly granted_at: string | null;
  readonly revoked_at: string | null;
}

export interface CustomerExportProfileRow {
  readonly id: string;
  readonly document_type_code: string;
  readonly document_number: string;
  readonly name: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly address: string | null;
  readonly pii_erased: number;
}

export interface CustomerExportSaleRow {
  readonly sale_id: string;
  readonly document_type: string;
  readonly series: string;
  readonly number: number;
  readonly issued_at_lima: string;
  readonly total_amount_cents: number;
}

export interface EraseInput {
  readonly tenantId: string;
  readonly branchId: string | null;
  readonly actorUserId: string;
  readonly customerId: string;
  readonly nowIso: string;
}

export interface EraseResult {
  readonly customerId: string;
  readonly tenantId: string;
  readonly fiscalSnapshotsAnonymized: number;
  readonly consentsRevoked: number;
}

function toConsentRecord(row: ConsentRow): ConsentRecord {
  return {
    purpose: row.purpose,
    granted: row.granted === 1,
    grantedAtIso: row.granted_at,
    revokedAtIso: row.revoked_at,
  };
}

function toInventoryEntry(row: CustomerInventoryRow): PiiInventoryEntry {
  return projectPiiInventory({
    tenantId: '',
    documentTypeCode: row.document_type_code,
    documentNumber: row.document_number,
    name: row.name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    piiErased: row.pii_erased === 1,
    deleted: false,
  });
}

/** Lista el inventario PII de clientes de un tenant (LPDP-04: tenant del JWT). */
export async function listCustomers(
  db: D1DatabaseLike,
  tenantId: string,
  limit = 100,
  offset = 0,
): Promise<readonly PiiInventoryEntry[]> {
  const rows = await db
    .prepare(
      `SELECT document_type_code, document_number, name, email, phone, address, pii_erased
       FROM customers
       WHERE tenant_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(tenantId, limit, offset)
    .all<CustomerInventoryRow>();
  return (rows.results ?? []).map(toInventoryEntry);
}

/** Devuelve un cliente por id (para detalle, export y erase). tenant_id forzado. */
export async function getCustomer(
  db: D1DatabaseLike,
  tenantId: string,
  customerId: string,
): Promise<CustomerInventoryRow | null> {
  return db
    .prepare(
      `SELECT document_type_code, document_number, name, email, phone, address, pii_erased
       FROM customers
       WHERE tenant_id = ? AND id = ?`,
    )
    .bind(tenantId, customerId)
    .first<CustomerInventoryRow>();
}

/** Lee consentimientos activos/inactivos de un cliente (tenant forzado). */
export async function listConsents(
  db: D1DatabaseLike,
  tenantId: string,
  customerId: string,
): Promise<readonly ConsentRecord[]> {
  const rows = await db
    .prepare(
      `SELECT id, purpose, granted, granted_at, revoked_at
       FROM consent_records
       WHERE tenant_id = ? AND customer_id = ?`,
    )
    .bind(tenantId, customerId)
    .all<ConsentRow>();
  return (rows.results ?? []).map(toConsentRecord);
}

/**
 * LPDP-02 — Export por-cliente del titular (derecho de acceso). Tenant forzado;
 * rechaza clientes anonimizados. Coexiste con el export tenant-wide de data_backups.
 */
export async function exportCustomer(
  db: D1DatabaseLike,
  tenantId: string,
  customerId: string,
): Promise<CustomerExportPayload> {
  const profile = await db
    .prepare(
      `SELECT id, document_type_code, document_number, name, email, phone, address, pii_erased
       FROM customers
       WHERE tenant_id = ? AND id = ?`,
    )
    .bind(tenantId, customerId)
    .first<CustomerExportProfileRow>();
  if (!profile) throw new Error('CUSTOMER_NOT_FOUND');
  if (profile.pii_erased === 1) throw new Error(CUSTOMER_ERASED);

  const consents = (await listConsents(db, tenantId, customerId)).map((c) => ({
    purpose: c.purpose,
    granted: c.granted,
    grantedAtIso: c.grantedAtIso,
    revokedAtIso: c.revokedAtIso,
  }));

  const sales = await db
    .prepare(
      `SELECT id AS sale_id, document_type, series, number, issued_at_lima, total_amount_cents
       FROM sales
       WHERE tenant_id = ? AND customer_id = ?
       ORDER BY issued_at_lima ASC`,
    )
    .bind(tenantId, customerId)
    .all<CustomerExportSaleRow>();

  return buildCustomerExport(
    {
      id: profile.id,
      tenantId,
      documentTypeCode: profile.document_type_code,
      documentNumber: profile.document_number,
      name: profile.name,
      email: profile.email,
      phone: profile.phone,
      address: profile.address,
      piiErased: false,
    },
    consents,
    (sales.results ?? []).map((s) => ({
      saleId: s.sale_id,
      tenantId,
      documentType: s.document_type,
      series: s.series,
      number: s.number,
      issuedAtLimaIso: s.issued_at_lima,
      totalAmountCents: s.total_amount_cents,
    })),
  );
}

function consentUpdateStatements(
  db: D1DatabaseLike,
  tenantId: string,
  customerId: string,
  consentId: string,
  purpose: string,
  plan: ConsentChangePlan,
): D1Bound {
  if (plan.kind === 'NOOP') {
    throw new Error('CONSENT_NOOP');
  }
  const stmt = db.prepare(
    `INSERT INTO consent_records (
       id, tenant_id, customer_id, purpose, granted,
       granted_at, revoked_at, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(tenant_id, customer_id, purpose)
     DO UPDATE SET
       granted = excluded.granted,
       granted_at = excluded.granted_at,
       revoked_at = excluded.revoked_at`,
  );
  if (plan.kind === 'GRANT') {
    return stmt.bind(consentId, tenantId, customerId, purpose, 1, plan.grantedAtIso, null);
  }
  return stmt.bind(consentId, tenantId, customerId, purpose, 0, null, plan.revokedAtIso);
}

/** Registra o revoca un consentimiento por propósito (LPDP-01), un solo batch. */
export async function writeConsent(
  db: D1DatabaseLike,
  tenantId: string,
  customerId: string,
  purpose: string,
  granted: boolean,
  nowIso: string,
): Promise<{ kind: 'GRANT' | 'REVOKE' | 'NOOP' }> {
  const current = await listConsents(db, tenantId, customerId);
  const existing = current.find((c) => c.purpose === purpose);
  const plan = planConsentChange(purpose, granted, nowIso, existing);
  if (plan.kind === 'NOOP') return { kind: 'NOOP' };
  const consentId = [tenantId, customerId, purpose].join(':');
  await db.batch([consentUpdateStatements(db, tenantId, customerId, consentId, purpose, plan)]);
  return { kind: plan.kind };
}

/**
 * Ejecuta el erase/anonimización (LPDP-03) en un solo db.batch: anula el perfil
 * PII, sella los snapshots fiscales y revoca consentimientos. Nunca destruye CPE/XML.
 */
export async function eraseCustomer(db: D1DatabaseLike, input: EraseInput): Promise<EraseResult> {
  const customer = await db
    .prepare(
      `SELECT id, pii_erased, deleted_at
       FROM customers
       WHERE tenant_id = ? AND id = ?`,
    )
    .bind(input.tenantId, input.customerId)
    .first<CustomerForEraseRow>();

  if (!customer) throw new Error('CUSTOMER_NOT_FOUND');
  assertNotErased({
    id: customer.id,
    tenantId: input.tenantId,
    piiErased: customer.pii_erased === 1,
    deleted: customer.deleted_at !== null,
  });

  const prevAudit = await db
    .prepare(
      `SELECT row_hash FROM audit_events
       WHERE tenant_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
    )
    .bind(input.tenantId)
    .first<{ row_hash: string }>();

  const fiscalRows = await db
    .prepare(
      `SELECT id AS sale_id, tenant_id, client_name, client_document_number
       FROM sales
       WHERE tenant_id = ? AND customer_id = ?`,
    )
    .bind(input.tenantId, input.customerId)
    .all<{
      sale_id: string;
      tenant_id: string;
      client_name: string;
      client_document_number: string;
    }>();

  const consentRows = await db
    .prepare(
      `SELECT id, tenant_id, customer_id, purpose
       FROM consent_records
       WHERE tenant_id = ? AND customer_id = ?`,
    )
    .bind(input.tenantId, input.customerId)
    .all<{ id: string; tenant_id: string; customer_id: string; purpose: string }>();

  const plan: ErasePlan = planCustomerErase(
    { id: customer.id, tenantId: input.tenantId, piiErased: false, deleted: false },
    (fiscalRows.results ?? []).map((r) => ({
      saleId: r.sale_id,
      tenantId: r.tenant_id,
      clientName: r.client_name,
      clientDocumentNumber: r.client_document_number,
    })),
    (consentRows.results ?? []).map((r) => ({
      consentId: r.id,
      purpose: r.purpose,
      tenantId: r.tenant_id,
      customerId: r.customer_id,
    })),
  );

  const statements: D1Bound[] = [];

  const profileSets: string[] = [];
  const profileParams: (null | string)[] = [];
  for (const f of plan.profileFields) {
    profileSets.push(`${f.field} = ?`);
    profileParams.push(f.value);
  }
  profileSets.push('pii_erased = 1');
  profileSets.push('erased_at = ?');
  profileParams.push(input.nowIso);
  statements.push(
    db
      .prepare(
        `UPDATE customers SET ${profileSets.join(', ')}
         WHERE tenant_id = ? AND id = ?`,
      )
      .bind(...profileParams, input.tenantId, input.customerId),
  );

  for (const snapshot of plan.fiscalSnapshots) {
    statements.push(
      db
        .prepare(
          `UPDATE sales
           SET client_name = ?, client_document_number = ?
           WHERE tenant_id = ? AND id = ?`,
        )
        .bind(ANONYMIZED_NAME, ANONYMIZED_DOCUMENT, input.tenantId, snapshot.saleId),
    );
  }

  for (const consent of plan.consentRevocations) {
    statements.push(
      db
        .prepare(
          `UPDATE consent_records
           SET granted = 0, revoked_at = ?
           WHERE tenant_id = ? AND id = ?`,
        )
        .bind(input.nowIso, input.tenantId, consent.consentId),
    );
  }

  const auditId = crypto.randomUUID();
  const payloadJson = JSON.stringify({
    customerId: input.customerId,
    fiscalSnapshots: plan.fiscalSnapshots.length,
    consentsRevoked: plan.consentRevocations.length,
  });
  const rowHash = await sha256HexOf({
    action: 'LPDP_ERASE',
    entity_id: input.customerId,
    tenant_id: input.tenantId,
    payload: payloadJson,
    prev: prevAudit?.row_hash ?? null,
  });
  statements.push(
    db
      .prepare(
        `INSERT INTO audit_events (
           id, tenant_id, branch_id, actor_user_id, action,
           entity_type, entity_id, payload_json, prev_hash, row_hash, created_at
         ) VALUES (?, ?, ?, ?, 'LPDP_ERASE', 'customer', ?, ?, ?, ?, ?)`,
      )
      .bind(
        auditId,
        input.tenantId,
        input.branchId,
        input.actorUserId,
        input.customerId,
        payloadJson,
        prevAudit?.row_hash ?? null,
        rowHash,
        input.nowIso,
      ),
  );

  await db.batch(statements);

  return {
    customerId: input.customerId,
    tenantId: input.tenantId,
    fiscalSnapshotsAnonymized: plan.fiscalSnapshots.length,
    consentsRevoked: plan.consentRevocations.length,
  };
}
