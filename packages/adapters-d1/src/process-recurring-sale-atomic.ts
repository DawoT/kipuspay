/* eslint-disable complexity -- Sprint 44 ACID orchestration */
import {
  computeRecurringPeriod,
  computeRecurringProration,
  computeRecurringRetry,
  decideRecurringDelinquency,
  resolveRecurringOccurrenceItems,
  type RecurringAfterGracePolicy,
  type RecurringFrequency,
  type RecurringPlanVersion,
  type RecurringPricingPolicy,
} from '@kipuspay/domain-sales';
import {
  assertEmissionAllowed,
  computeMustSubmitByIso,
  defaultSunatStatus,
  type FormalizationMode,
  type TaxRegime,
} from '@kipuspay/domain-fiscal-pe';
import { runD1AtomicPlan, type AtomicPlanBuilder, type D1DatabaseLike } from './index.js';
import { appendUsageMeterToPlan } from './usage-meter-batch.js';
import { sha256Hex } from './crypto.js';

const MICROS = 1_000_000;
const MAX_LEASE_SECONDS = 300;
const MAX_PAGE_SIZE = 100;
const SAFE_ERROR_CODES = new Set([
  'RECURRING_CONFLICT',
  'RECURRING_INSUFFICIENT_STOCK',
  'RECURRING_INVALID_RECEIVER',
  'RECURRING_PRICE_UNAVAILABLE',
  'RECURRING_SERIES_UNAVAILABLE',
  'RECURRING_LEASE_INVALID',
  'RECURRING_INTERNAL_RETRY',
]);

export class RecurringSaleError extends Error {
  readonly code: string;

  constructor(code: string, options?: ErrorOptions) {
    super(code, options);
    this.name = 'RecurringSaleError';
    this.code = code;
  }
}

function fail(code: string, cause?: unknown): never {
  throw new RecurringSaleError(code, cause === undefined ? undefined : { cause });
}

function required(value: string | undefined, code: string): string {
  const clean = value?.trim() ?? '';
  if (!clean) fail(code);
  return clean;
}

function safePositive(value: number | undefined, code: string): number {
  if (!Number.isSafeInteger(value) || (value ?? 0) <= 0) fail(code);
  return value!;
}

function safeErrorCode(error: unknown): string {
  const candidate =
    error instanceof RecurringSaleError
      ? error.code
      : error instanceof Error && error.message.startsWith('RECURRING_')
        ? error.message
        : 'RECURRING_INTERNAL_RETRY';
  return SAFE_ERROR_CODES.has(candidate) ? candidate : 'RECURRING_INTERNAL_RETRY';
}

function opaqueToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function toLimaTimestamp(ms: number): string {
  const shifted = new Date(ms - 5 * 60 * 60 * 1000);
  return `${shifted.toISOString().slice(0, 19)}-05:00`;
}

function parseTimestamp(value: string, code: string): number {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) fail(code);
  return ms;
}

async function previousAuditHash(db: D1DatabaseLike, tenantId: string): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT row_hash FROM audit_events
       WHERE tenant_id = ? ORDER BY rowid DESC LIMIT 1`,
    )
    .bind(tenantId)
    .first<{ row_hash: string }>();
  return row?.row_hash ?? null;
}

async function auditHash(input: Record<string, unknown>): Promise<string> {
  return sha256Hex(JSON.stringify(input, Object.keys(input).sort()));
}

async function guardedMutation(
  db: D1DatabaseLike,
  code: string,
  build: (plan: AtomicPlanBuilder) => void | Promise<void>,
): Promise<void> {
  try {
    await runD1AtomicPlan(db, build);
  } catch (error) {
    if (error instanceof RecurringSaleError) throw error;
    fail(code, error);
  }
}

export interface RecurringPlanItemInput {
  readonly productId: string;
  readonly productUomId: string;
  readonly enteredQuantityMicrounits: number;
  readonly priceListId?: string | null;
}

export interface CreateRecurringPlanInput {
  readonly tenantId: string;
  readonly planKey: string;
  readonly customerId: string;
  readonly branchId: string;
  readonly actorUserId: string;
  readonly documentType: 'NV' | '03' | '01';
  readonly pricingPolicy?: RecurringPricingPolicy;
  readonly frequency: RecurringFrequency;
  readonly anchorDay: number;
  readonly anchorIsLastDay?: boolean;
  readonly anchorTime: string;
  readonly graceDays?: number;
  readonly afterGracePolicy?: RecurringAfterGracePolicy;
  readonly catchUpLimit?: number;
  readonly effectiveFrom: string;
  readonly nextRunAt: string;
  readonly items: readonly RecurringPlanItemInput[];
}

interface ResolvedPlanItem {
  readonly input: RecurringPlanItemInput;
  readonly factor_numerator: number;
  readonly factor_denominator: number;
  readonly base_quantity_microunits: number;
  readonly fixed_unit_price_cents: number | null;
}

async function resolvePlanItems(
  db: D1DatabaseLike,
  input: Pick<CreateRecurringPlanInput, 'tenantId' | 'branchId' | 'pricingPolicy' | 'items'>,
): Promise<readonly ResolvedPlanItem[]> {
  if (input.items.length === 0) fail('RECURRING_ITEMS_REQUIRED');
  return Promise.all(
    input.items.map(async (item) => {
      const entered = safePositive(item.enteredQuantityMicrounits, 'RECURRING_INVALID_QUANTITY');
      const row = await db
        .prepare(
          `SELECT u.factor_numerator, u.factor_denominator,
                  COALESCE(pp.price_cents, p.price_cents) AS unit_price_cents
           FROM products p
           JOIN product_uoms u ON u.tenant_id = p.tenant_id
             AND u.product_id = p.id AND u.id = ?
           LEFT JOIN product_prices pp ON pp.tenant_id = p.tenant_id
             AND pp.product_id = p.id AND pp.price_list_id = ?
           WHERE p.tenant_id = ? AND p.id = ? AND p.is_active = 1
             AND p.deleted_at IS NULL AND p.is_sellable = 1 LIMIT 1`,
        )
        .bind(item.productUomId, item.priceListId ?? '', input.tenantId, item.productId)
        .first<{
          factor_numerator: number;
          factor_denominator: number;
          unit_price_cents: number;
        }>();
      if (!row) fail('RECURRING_PRODUCT_NOT_FOUND');
      const scaled = entered * row.factor_numerator;
      if (
        !Number.isSafeInteger(scaled) ||
        scaled % row.factor_denominator !== 0 ||
        !Number.isSafeInteger(row.unit_price_cents) ||
        row.unit_price_cents < 0
      ) {
        fail('RECURRING_INVALID_ITEM');
      }
      return {
        input: item,
        factor_numerator: row.factor_numerator,
        factor_denominator: row.factor_denominator,
        base_quantity_microunits: scaled / row.factor_denominator,
        fixed_unit_price_cents:
          (input.pricingPolicy ?? 'FIXED') === 'FIXED' ? row.unit_price_cents : null,
      };
    }),
  );
}

export async function createRecurringPlanAtomic(
  db: D1DatabaseLike,
  input: CreateRecurringPlanInput,
): Promise<{ planId: string; planVersion: 1; alreadyApplied: false }> {
  const planKey = required(input.planKey, 'RECURRING_PLAN_KEY_REQUIRED');
  const resolved = await resolvePlanItems(db, input);
  const planId = crypto.randomUUID();
  const prevHash = await previousAuditHash(db, input.tenantId);
  const rowHash = await auditHash({
    action: 'RECURRING_CREATED',
    entityId: planId,
    planKey,
    prevHash,
  });
  await guardedMutation(db, 'RECURRING_CONFLICT', (plan) => {
    plan.guardState(
      `SELECT 1 WHERE EXISTS (
         SELECT 1 FROM customers
         WHERE tenant_id = ? AND id = ? AND is_active = 1
           AND deleted_at IS NULL AND pii_erased = 0
       ) AND EXISTS (
         SELECT 1 FROM branches WHERE tenant_id = ? AND id = ?
       ) AND EXISTS (
         SELECT 1 FROM users
         WHERE tenant_id = ? AND id = ? AND is_active = 1 AND deleted_at IS NULL
       ) AND NOT EXISTS (
         SELECT 1 FROM recurring_plans WHERE tenant_id = ? AND plan_key = ?
       )`,
      [
        input.tenantId,
        input.customerId,
        input.tenantId,
        input.branchId,
        input.tenantId,
        input.actorUserId,
        input.tenantId,
        planKey,
      ],
    );
    plan.add(
      db
        .prepare(
          `INSERT INTO recurring_plans (
             id, tenant_id, plan_key, plan_version, customer_id, branch_id,
             created_by_user_id, document_type, pricing_policy, frequency,
             anchor_day, anchor_is_last_day, anchor_time, after_grace_policy,
             grace_days, catch_up_limit, next_run_at, effective_from
           ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          planId,
          input.tenantId,
          planKey,
          input.customerId,
          input.branchId,
          input.actorUserId,
          input.documentType,
          input.pricingPolicy ?? 'FIXED',
          input.frequency,
          input.anchorDay,
          input.anchorIsLastDay ? 1 : 0,
          input.anchorTime,
          input.afterGracePolicy ?? 'CONTINUE',
          input.graceDays ?? 3,
          input.catchUpLimit ?? 3,
          input.nextRunAt,
          input.effectiveFrom,
        ),
    );
    resolved.forEach((item, index) => {
      plan.add(
        db
          .prepare(
            `INSERT INTO recurring_plan_items (
               id, tenant_id, plan_id, line_number, product_id, product_uom_id,
               entered_quantity_microunits, factor_numerator, factor_denominator,
               base_quantity_microunits, fixed_unit_price_cents, price_list_id
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            input.tenantId,
            planId,
            index + 1,
            item.input.productId,
            item.input.productUomId,
            item.input.enteredQuantityMicrounits,
            item.factor_numerator,
            item.factor_denominator,
            item.base_quantity_microunits,
            item.fixed_unit_price_cents,
            item.input.priceListId ?? null,
          ),
      );
    });
    plan.add(
      db
        .prepare(
          `INSERT INTO audit_events (
             id, tenant_id, branch_id, actor_user_id, action, entity_type,
             entity_id, payload_json, prev_hash, row_hash
           ) VALUES (?, ?, ?, ?, 'RECURRING_CREATED', 'recurring_plan', ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          input.tenantId,
          input.branchId,
          input.actorUserId,
          planId,
          JSON.stringify({ planKey, planVersion: 1 }),
          prevHash,
          rowHash,
        ),
    );
  });
  return { planId, planVersion: 1, alreadyApplied: false };
}

interface PlanHeader {
  id: string;
  tenant_id: string;
  plan_key: string;
  plan_version: number;
  customer_id: string;
  branch_id: string;
  created_by_user_id: string;
  document_type: 'NV' | '03' | '01';
  pricing_policy: RecurringPricingPolicy;
  frequency: RecurringFrequency;
  anchor_day: number;
  anchor_is_last_day: number;
  anchor_time: string;
  status: string;
  after_grace_policy: RecurringAfterGracePolicy;
  grace_days: number;
  catch_up_limit: number;
  next_run_at: string;
  retry_count: number;
  version: number;
  effective_from: string;
}

async function loadPlanHeader(
  db: D1DatabaseLike,
  tenantId: string,
  planId: string,
): Promise<PlanHeader> {
  const row = await db
    .prepare(
      `SELECT * FROM recurring_plans
       WHERE tenant_id = ? AND id = ? LIMIT 1`,
    )
    .bind(tenantId, planId)
    .first<PlanHeader>();
  if (!row) fail('RECURRING_PLAN_NOT_FOUND');
  return row;
}

export async function versionRecurringPlanAtomic(
  db: D1DatabaseLike,
  input: Omit<CreateRecurringPlanInput, 'planKey' | 'customerId' | 'branchId' | 'actorUserId'> & {
    readonly tenantId: string;
    readonly planId: string;
    readonly expectedVersion: number;
    readonly actorUserId: string;
  },
): Promise<{ planId: string; planVersion: number }> {
  const current = await loadPlanHeader(db, input.tenantId, input.planId);
  const resolved = await resolvePlanItems(db, {
    tenantId: input.tenantId,
    branchId: current.branch_id,
    ...(input.pricingPolicy ? { pricingPolicy: input.pricingPolicy } : {}),
    items: input.items,
  });
  const nextId = crypto.randomUUID();
  const nextPlanVersion = current.plan_version + 1;
  await guardedMutation(db, 'RECURRING_CONFLICT', (plan) => {
    plan.guardState(
      `SELECT 1 FROM recurring_plans
       WHERE tenant_id = ? AND id = ? AND version = ?
         AND status IN ('ACTIVE','PAUSED','GRACE')`,
      [input.tenantId, input.planId, input.expectedVersion],
    );
    plan.add(
      db
        .prepare(
          `UPDATE recurring_plans
           SET effective_until = ?, status = 'CANCEL_AT_PERIOD_END',
               version = version + 1, updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = ? AND id = ? AND version = ?`,
        )
        .bind(input.effectiveFrom, input.tenantId, input.planId, input.expectedVersion),
    );
    plan.add(
      db
        .prepare(
          `INSERT INTO recurring_plans (
             id, tenant_id, plan_key, plan_version, supersedes_plan_id,
             customer_id, branch_id, created_by_user_id, document_type,
             pricing_policy, frequency, anchor_day, anchor_is_last_day,
             anchor_time, after_grace_policy, grace_days, catch_up_limit,
             next_run_at, effective_from
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          nextId,
          input.tenantId,
          current.plan_key,
          nextPlanVersion,
          current.id,
          current.customer_id,
          current.branch_id,
          input.actorUserId,
          input.documentType,
          input.pricingPolicy ?? 'FIXED',
          input.frequency,
          input.anchorDay,
          input.anchorIsLastDay ? 1 : 0,
          input.anchorTime,
          input.afterGracePolicy ?? current.after_grace_policy,
          input.graceDays ?? current.grace_days,
          input.catchUpLimit ?? current.catch_up_limit,
          input.nextRunAt,
          input.effectiveFrom,
        ),
    );
    resolved.forEach((item, index) => {
      plan.add(
        db
          .prepare(
            `INSERT INTO recurring_plan_items (
               id, tenant_id, plan_id, line_number, product_id, product_uom_id,
               entered_quantity_microunits, factor_numerator, factor_denominator,
               base_quantity_microunits, fixed_unit_price_cents, price_list_id
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            input.tenantId,
            nextId,
            index + 1,
            item.input.productId,
            item.input.productUomId,
            item.input.enteredQuantityMicrounits,
            item.factor_numerator,
            item.factor_denominator,
            item.base_quantity_microunits,
            item.fixed_unit_price_cents,
            item.input.priceListId ?? null,
          ),
      );
    });
  });
  return { planId: nextId, planVersion: nextPlanVersion };
}

export async function listDueRecurringPlans(
  db: D1DatabaseLike,
  input: {
    readonly tenantId?: string;
    readonly branchId?: string;
    readonly planId?: string;
    readonly now: string;
    readonly limit?: number;
    readonly cursor?: {
      readonly nextRunAt: string;
      readonly tenantId: string;
      readonly planId: string;
    };
  },
): Promise<readonly PlanHeader[]> {
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, input.limit ?? 25));
  const rows = await db
    .prepare(
      `SELECT * FROM recurring_plans
       WHERE status IN ('ACTIVE','GRACE','CANCEL_AT_PERIOD_END')
         AND (? = '' OR tenant_id = ?)
         AND (? = '' OR branch_id = ?)
         AND (? = '' OR id = ?)
         AND julianday(next_run_at) <= julianday(?)
         AND (next_retry_at IS NULL OR julianday(next_retry_at) <= julianday(?))
         AND (lease_expires_at IS NULL OR julianday(lease_expires_at) <= julianday(?))
         AND (
           ? = '' OR next_run_at > ? OR
           (next_run_at = ? AND tenant_id > ?) OR
           (next_run_at = ? AND tenant_id = ? AND id > ?)
         )
       ORDER BY next_run_at, tenant_id, branch_id, id LIMIT ?`,
    )
    .bind(
      input.tenantId ?? '',
      input.tenantId ?? '',
      input.branchId ?? '',
      input.branchId ?? '',
      input.planId ?? '',
      input.planId ?? '',
      input.now,
      input.now,
      input.now,
      input.cursor?.nextRunAt ?? '',
      input.cursor?.nextRunAt ?? '',
      input.cursor?.nextRunAt ?? '',
      input.cursor?.tenantId ?? '',
      input.cursor?.nextRunAt ?? '',
      input.cursor?.tenantId ?? '',
      input.cursor?.planId ?? '',
      limit,
    )
    .all<PlanHeader>();
  return rows.results ?? [];
}

export async function claimDueRecurringPlanAtomic(
  db: D1DatabaseLike,
  input: {
    readonly tenantId: string;
    readonly planId: string;
    readonly expectedVersion: number;
    readonly now: string;
    readonly requestedLeaseSeconds?: number;
    readonly catchUpLimit?: number;
    readonly schedulerId?: string;
  },
): Promise<{
  readonly scope: 'RECURRING_PLAN_EXECUTION';
  readonly leaseToken: string;
  readonly leaseSeconds: number;
  readonly catchUpLimit: number;
}> {
  parseTimestamp(input.now, 'RECURRING_INVALID_TIME');
  const leaseSeconds = Math.min(
    MAX_LEASE_SECONDS,
    Math.max(1, Math.floor(input.requestedLeaseSeconds ?? MAX_LEASE_SECONDS)),
  );
  const catchUpLimit = Math.min(31, Math.max(1, input.catchUpLimit ?? 3));
  const leaseToken = opaqueToken();
  const leaseHash = await sha256Hex(leaseToken);
  const expiresAt = toLimaTimestamp(
    parseTimestamp(input.now, 'RECURRING_INVALID_TIME') + leaseSeconds * 1000,
  );
  await guardedMutation(db, 'RECURRING_LEASE_CONFLICT', (plan) => {
    plan.guardState(
      `SELECT 1 FROM recurring_plans
       WHERE tenant_id = ? AND id = ? AND version = ?
         AND status IN ('ACTIVE','GRACE','CANCEL_AT_PERIOD_END')
         AND julianday(next_run_at) <= julianday(?)
         AND (next_retry_at IS NULL OR julianday(next_retry_at) <= julianday(?))
         AND (lease_expires_at IS NULL OR julianday(lease_expires_at) <= julianday(?))
         AND (effective_until IS NULL OR julianday(next_run_at) < julianday(effective_until))`,
      [input.tenantId, input.planId, input.expectedVersion, input.now, input.now, input.now],
    );
    plan.add(
      db
        .prepare(
          `UPDATE recurring_plans
           SET lease_owner_hash = ?, lease_expires_at = ?,
               version = version + 1, updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = ? AND id = ? AND version = ?
             AND (lease_expires_at IS NULL OR julianday(lease_expires_at) <= julianday(?))`,
        )
        .bind(leaseHash, expiresAt, input.tenantId, input.planId, input.expectedVersion, input.now),
    );
  });
  return {
    scope: 'RECURRING_PLAN_EXECUTION',
    leaseToken,
    leaseSeconds,
    catchUpLimit,
  };
}

interface SettlementRow extends PlanHeader {
  tenant_formalization_mode: string;
  tenant_tax_regime: string;
  customer_document_type: string;
  customer_document_number: string;
  customer_name: string;
  customer_active: number;
  customer_erased: number;
  plan_item_id: string;
  line_number: number;
  product_id: string;
  product_uom_id: string;
  entered_quantity_microunits: number;
  factor_numerator: number;
  factor_denominator: number;
  base_quantity_microunits: number;
  fixed_unit_price_cents: number | null;
  price_list_id: string | null;
  product_name: string;
  product_type: string;
  current_unit_price_cents: number;
  promotion_rule_json: string | null;
  cost_cents: number;
  igv_affectation_code_default: string;
  branch_stock_microunits: number;
  branch_stock_version: number;
  location_id: string | null;
  location_stock_microunits: number | null;
  batch_id: string | null;
  batch_stock_microunits: number | null;
  serial_id: string | null;
  serial_version: number | null;
  series_id: string;
  series: string;
  current_number: number;
}

async function loadSettlement(
  db: D1DatabaseLike,
  tenantId: string,
  planId: string,
  priceAt: string,
): Promise<readonly SettlementRow[]> {
  const rows = await db
    .prepare(
      `SELECT rp.*,
              t.formalization_mode AS tenant_formalization_mode,
              t.tax_regime AS tenant_tax_regime,
              c.document_type_code AS customer_document_type,
              c.document_number AS customer_document_number,
              c.name AS customer_name, c.is_active AS customer_active,
              c.pii_erased AS customer_erased,
              rpi.id AS plan_item_id, rpi.line_number, rpi.product_id,
              rpi.product_uom_id, rpi.entered_quantity_microunits,
              rpi.factor_numerator, rpi.factor_denominator,
              rpi.base_quantity_microunits, rpi.fixed_unit_price_cents,
              rpi.price_list_id, p.name AS product_name, p.product_type,
              COALESCE(pp.price_cents, p.price_cents) AS current_unit_price_cents,
              (
                SELECT promo.rule_json
                FROM product_promotions pmap
                JOIN promotions promo ON promo.tenant_id = pmap.tenant_id
                  AND promo.id = pmap.promotion_id
                WHERE pmap.tenant_id = rp.tenant_id
                  AND pmap.product_id = rpi.product_id
                  AND (pmap.price_list_id IS NULL OR pmap.price_list_id = rpi.price_list_id)
                  AND promo.active = 1
                  AND (promo.starts_at IS NULL OR julianday(promo.starts_at) <= julianday(?))
                  AND (promo.ends_at IS NULL OR julianday(promo.ends_at) > julianday(?))
                ORDER BY promo.created_at DESC, promo.id
                LIMIT 1
              ) AS promotion_rule_json,
              COALESCE(bps.pmp_unit_cost_cents, p.cost_cents) AS cost_cents,
              p.igv_affectation_code_default,
              COALESCE(bps.stock_microunits, 0) AS branch_stock_microunits,
              COALESCE(bps.version, 0) AS branch_stock_version,
              ils.location_id, ils.quantity_microunits AS location_stock_microunits,
              ib.id AS batch_id, ilbs.quantity_microunits AS batch_stock_microunits,
              sn.id AS serial_id, sn.version AS serial_version,
              bds.id AS series_id, bds.series, bds.current_number
       FROM recurring_plans rp
       JOIN tenants t ON t.id = rp.tenant_id
       JOIN customers c ON c.tenant_id = rp.tenant_id AND c.id = rp.customer_id
       JOIN recurring_plan_items rpi ON rpi.tenant_id = rp.tenant_id
         AND rpi.plan_id = rp.id
       JOIN products p ON p.tenant_id = rpi.tenant_id AND p.id = rpi.product_id
       LEFT JOIN product_prices pp ON pp.tenant_id = rpi.tenant_id
         AND pp.product_id = rpi.product_id AND pp.price_list_id = rpi.price_list_id
       LEFT JOIN branch_product_stock bps ON bps.tenant_id = rp.tenant_id
         AND bps.branch_id = rp.branch_id AND bps.product_id = rpi.product_id
       LEFT JOIN inventory_location_stock ils ON ils.tenant_id = rp.tenant_id
         AND ils.branch_id = rp.branch_id AND ils.product_id = rpi.product_id
       LEFT JOIN inventory_batches ib ON ib.tenant_id = rp.tenant_id
         AND ib.branch_id = rp.branch_id AND ib.product_id = rpi.product_id
         AND ib.is_active = 1 AND ib.deleted_at IS NULL
         AND (ib.expiration_date IS NULL OR ib.expiration_date >= date('now'))
       LEFT JOIN inventory_location_batch_stock ilbs ON ilbs.tenant_id = rp.tenant_id
         AND ilbs.branch_id = rp.branch_id AND ilbs.product_id = rpi.product_id
         AND ilbs.location_id = ils.location_id AND ilbs.batch_id = ib.id
       LEFT JOIN serial_numbers sn ON sn.tenant_id = rp.tenant_id
         AND sn.branch_id = rp.branch_id AND sn.product_id = rpi.product_id
         AND sn.location_id = ils.location_id AND sn.status = 'AVAILABLE'
       JOIN branch_document_series bds ON bds.tenant_id = rp.tenant_id
         AND bds.branch_id = rp.branch_id AND bds.document_type_code = rp.document_type
         AND bds.is_active = 1
         AND (bds.authorization_status = 'AUTHORIZED'
           OR (rp.document_type = 'NV' AND bds.authorization_status = 'INTERNAL'))
       WHERE rp.tenant_id = ? AND rp.id = ?
       GROUP BY rpi.id
       ORDER BY rpi.line_number`,
    )
    .bind(priceAt, priceAt, tenantId, planId)
    .all<SettlementRow>();
  return rows.results ?? [];
}

function planVersionFromRows(rows: readonly SettlementRow[]): RecurringPlanVersion {
  const first = rows[0]!;
  return {
    id: first.id,
    planKey: first.plan_key,
    planVersion: first.plan_version,
    effectiveFrom: first.effective_from,
    timezone: 'America/Lima',
    frequency: first.frequency,
    anchorDay: first.anchor_day,
    anchorIsLastDay: first.anchor_is_last_day === 1,
    anchorTime: first.anchor_time,
    pricingPolicy: first.pricing_policy,
    graceDays: first.grace_days,
    afterGracePolicy: first.after_grace_policy,
    items: rows.map((row) => ({
      productId: row.product_id,
      productUomId: row.product_uom_id,
      quantityMicrounits: row.entered_quantity_microunits,
      ...(row.fixed_unit_price_cents === null
        ? {}
        : { fixedUnitPriceCents: row.fixed_unit_price_cents }),
    })),
  };
}

function validateReceiver(row: SettlementRow, totalCents: number): void {
  if (!row.customer_active || row.customer_erased || !row.customer_name?.trim()) {
    fail('RECURRING_INVALID_RECEIVER');
  }
  try {
    assertEmissionAllowed({
      formalizationMode: row.tenant_formalization_mode as FormalizationMode,
      taxRegime: row.tenant_tax_regime as TaxRegime,
      documentType: row.document_type,
      totalAmountCents: totalCents,
      clientDocumentType: row.customer_document_type,
      clientDocumentNumber: row.customer_document_number,
      clientName: row.customer_name,
    });
  } catch (error) {
    fail('RECURRING_INVALID_RECEIVER', error);
  }
}

function assertSettlementStock(rows: readonly SettlementRow[]): void {
  for (const row of rows) {
    if (row.product_type === 'service') continue;
    const requiredMicros = row.base_quantity_microunits;
    if (row.branch_stock_microunits < requiredMicros) fail('RECURRING_INSUFFICIENT_STOCK');
    if (row.location_id && (row.location_stock_microunits ?? 0) < requiredMicros) {
      fail('RECURRING_INSUFFICIENT_STOCK');
    }
    if (row.batch_id && (row.batch_stock_microunits ?? 0) < requiredMicros) {
      fail('RECURRING_INSUFFICIENT_STOCK');
    }
  }
}

function currentOccurrencePrice(row: SettlementRow): number {
  const base = row.current_unit_price_cents;
  if (!row.promotion_rule_json) return base;
  try {
    const rule = JSON.parse(row.promotion_rule_json) as Record<string, unknown>;
    if (Number.isSafeInteger(rule.fixed_price_cents) && (rule.fixed_price_cents as number) >= 0) {
      return rule.fixed_price_cents as number;
    }
    if (
      typeof rule.percent_off === 'number' &&
      Number.isFinite(rule.percent_off) &&
      rule.percent_off >= 0 &&
      rule.percent_off <= 100
    ) {
      return Math.round((base * (100 - rule.percent_off)) / 100);
    }
  } catch {
    fail('RECURRING_PRICE_UNAVAILABLE');
  }
  return base;
}

export interface ProcessRecurringSaleInput {
  readonly tenantId: string;
  readonly planId: string;
  readonly periodStart: string;
  readonly leaseToken: string;
  readonly now?: string;
}

export interface ProcessRecurringSaleResult {
  readonly status: 'SUCCESS' | 'ALREADY_SETTLED';
  readonly occurrenceId: string;
  readonly saleId: string;
  readonly accountsReceivableId: string;
  readonly totalAmountCents: number;
  readonly nextRunAt: string;
}

async function loadOccurrenceReplay(
  db: D1DatabaseLike,
  input: ProcessRecurringSaleInput,
): Promise<ProcessRecurringSaleResult | null> {
  const row = await db
    .prepare(
      `SELECT id, sale_id, accounts_receivable_id, total_amount_cents, period_end
       FROM recurring_occurrences
       WHERE tenant_id = ? AND plan_id = ? AND period_start = ? LIMIT 1`,
    )
    .bind(input.tenantId, input.planId, input.periodStart)
    .first<{
      id: string;
      sale_id: string;
      accounts_receivable_id: string;
      total_amount_cents: number;
      period_end: string;
    }>();
  return row
    ? {
        status: 'ALREADY_SETTLED',
        occurrenceId: row.id,
        saleId: row.sale_id,
        accountsReceivableId: row.accounts_receivable_id,
        totalAmountCents: row.total_amount_cents,
        nextRunAt: row.period_end,
      }
    : null;
}

function appendPhysicalStock(
  plan: AtomicPlanBuilder,
  db: D1DatabaseLike,
  row: SettlementRow,
  input: {
    tenantId: string;
    saleId: string;
    saleItemId: string;
  },
): void {
  if (row.product_type === 'service') return;
  const quantity = row.base_quantity_microunits;
  plan.add(
    db
      .prepare(
        `UPDATE branch_product_stock
         SET stock_microunits = stock_microunits - ?,
             stock = (stock_microunits - ?) * 0.000001,
             version = version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = ? AND branch_id = ? AND product_id = ?
           AND version = ? AND stock_microunits >= ?`,
      )
      .bind(
        quantity,
        quantity,
        input.tenantId,
        row.branch_id,
        row.product_id,
        row.branch_stock_version,
        quantity,
      ),
  );
  if (row.location_id) {
    plan.add(
      db
        .prepare(
          `UPDATE inventory_location_stock
           SET quantity_microunits = quantity_microunits - ?,
               version = version + 1, updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = ? AND branch_id = ? AND location_id = ?
             AND product_id = ? AND quantity_microunits >= ?`,
        )
        .bind(quantity, input.tenantId, row.branch_id, row.location_id, row.product_id, quantity),
    );
  }
  if (row.batch_id) {
    plan.add(
      db
        .prepare(
          `UPDATE inventory_batches
           SET stock_microunits = stock_microunits - ?,
               stock = (stock_microunits - ?) * 0.000001
           WHERE tenant_id = ? AND branch_id = ? AND id = ?
             AND product_id = ? AND stock_microunits >= ?`,
        )
        .bind(
          quantity,
          quantity,
          input.tenantId,
          row.branch_id,
          row.batch_id,
          row.product_id,
          quantity,
        ),
    );
    if (row.location_id) {
      plan.add(
        db
          .prepare(
            `UPDATE inventory_location_batch_stock
             SET quantity_microunits = quantity_microunits - ?,
                 version = version + 1, updated_at = CURRENT_TIMESTAMP
             WHERE tenant_id = ? AND branch_id = ? AND location_id = ?
               AND product_id = ? AND batch_id = ? AND quantity_microunits >= ?`,
          )
          .bind(
            quantity,
            input.tenantId,
            row.branch_id,
            row.location_id,
            row.product_id,
            row.batch_id,
            quantity,
          ),
      );
    }
  }
  if (row.serial_id) {
    plan.add(
      db
        .prepare(
          `UPDATE serial_numbers
           SET status = 'SOLD', current_sale_item_id = ?,
               version = version + 1, updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = ? AND id = ? AND version = ? AND status = 'AVAILABLE'`,
        )
        .bind(input.saleItemId, input.tenantId, row.serial_id, row.serial_version),
    );
  }
  plan.add(
    db
      .prepare(
        `INSERT INTO inventory_movements (
           id, tenant_id, branch_id, product_id, batch_id, movement_type,
           quantity_delta, quantity_delta_microunits, unit_cost_cents,
           stock_after, stock_after_microunits, user_id, reference_id, location_id
         ) SELECT ?, ?, ?, ?, ?, 'VENTA', ? * -0.000001, ?, ?,
                  stock, stock_microunits, ?, ?, ?
           FROM branch_product_stock
          WHERE tenant_id = ? AND branch_id = ? AND product_id = ?`,
      )
      .bind(
        crypto.randomUUID(),
        input.tenantId,
        row.branch_id,
        row.product_id,
        row.batch_id,
        quantity,
        -quantity,
        row.cost_cents,
        row.created_by_user_id,
        input.saleId,
        row.location_id,
        input.tenantId,
        row.branch_id,
        row.product_id,
      ),
  );
}

// Settlement is deliberately independent of processOfflineSaleAtomic: every write is compiled here
// and committed with occurrence/plan state in the same db.batch.
export async function processRecurringSaleAtomic(
  db: D1DatabaseLike,
  input: ProcessRecurringSaleInput,
): Promise<ProcessRecurringSaleResult> {
  const replay = await loadOccurrenceReplay(db, input);
  if (replay) return replay;
  const rows = await loadSettlement(db, input.tenantId, input.planId, input.periodStart);
  if (rows.length === 0) fail('RECURRING_PLAN_NOT_FOUND');
  const first = rows[0]!;
  if (input.periodStart !== first.next_run_at) fail('RECURRING_PERIOD_CONFLICT');
  const tokenHash = await sha256Hex(required(input.leaseToken, 'RECURRING_LEASE_INVALID'));
  const period = computeRecurringPeriod(planVersionFromRows(rows), input.periodStart);
  const applied = resolveRecurringOccurrenceItems({
    plan: planVersionFromRows(rows),
    serverCatalog: rows.map((row) => {
      const price =
        first.pricing_policy === 'FIXED'
          ? (row.fixed_unit_price_cents ?? row.current_unit_price_cents)
          : currentOccurrencePrice(row);
      return {
        productId: row.product_id,
        currentUnitPriceCents: price,
        taxCents:
          row.igv_affectation_code_default !== '10'
            ? 0
            : Math.round(((row.entered_quantity_microunits * price) / MICROS) * 0.18),
      };
    }),
    periodStart: input.periodStart,
  });
  const total = applied.reduce((sum, line) => sum + line.appliedTotalCents, 0);
  if (!Number.isSafeInteger(total)) fail('RECURRING_PRICE_UNAVAILABLE');
  validateReceiver(first, total);
  assertSettlementStock(rows);
  const occurrenceId = crypto.randomUUID();
  const saleId = crypto.randomUUID();
  const arId = crypto.randomUUID();
  const now = input.now ?? toLimaTimestamp(Date.now());
  const issuedMs = parseTimestamp(now, 'RECURRING_INVALID_TIME');
  const mustSubmitBy = computeMustSubmitByIso(first.document_type, issuedMs);
  const sunatStatus = defaultSunatStatus(first.document_type);
  const saleItemIds = rows.map(() => crypto.randomUUID());
  const subtotal = applied.reduce((sum, line) => sum + line.appliedSubtotalCents, 0);
  const tax = applied.reduce((sum, line) => sum + line.appliedTaxCents, 0);
  const cogs = rows.reduce(
    (sum, row) => sum + Math.round((row.base_quantity_microunits * row.cost_cents) / MICROS),
    0,
  );
  const prevHash = await previousAuditHash(db, input.tenantId);
  const rowHash = await auditHash({
    action: 'RECURRING_CREATED',
    entityId: occurrenceId,
    saleId,
    periodStart: input.periodStart,
    prevHash,
  });
  try {
    await runD1AtomicPlan(db, (plan) => {
      let guardSql = `SELECT 1 FROM recurring_plans rp
        WHERE rp.tenant_id = ? AND rp.id = ? AND rp.version = ?
          AND rp.next_run_at = ? AND rp.lease_owner_hash = ?
          AND julianday(rp.lease_expires_at) > julianday(?)
          AND rp.status IN ('ACTIVE','GRACE','CANCEL_AT_PERIOD_END')
          AND (rp.effective_until IS NULL OR julianday(?) < julianday(rp.effective_until))
          AND NOT EXISTS (
            SELECT 1 FROM recurring_occurrences ro
            WHERE ro.tenant_id = rp.tenant_id AND ro.plan_id = rp.id
              AND ro.period_start = ?
          )`;
      const guardParams: unknown[] = [
        input.tenantId,
        input.planId,
        first.version,
        input.periodStart,
        tokenHash,
        now,
        input.periodStart,
        input.periodStart,
      ];
      const pricingPolicy = first.pricing_policy;
      rows.forEach((row) => {
        if (row.product_type === 'service') return;
        // S44-H2: para pricing CURRENT el precio NO puede cambiar entre la
        // lectura y el batch — el guard re-verifica el precio vigente.
        if (pricingPolicy === 'CURRENT') {
          guardSql += ` AND EXISTS (
            SELECT 1 FROM products prod
            LEFT JOIN product_prices pp2 ON pp2.tenant_id = prod.tenant_id
              AND pp2.product_id = prod.id AND pp2.price_list_id = ?
            WHERE prod.tenant_id = ? AND prod.id = ?
              AND COALESCE(pp2.price_cents, prod.price_cents) = ?
          )`;
          guardParams.push(
            row.price_list_id ?? '',
            input.tenantId,
            row.product_id,
            row.current_unit_price_cents,
          );
        }
        guardSql += ` AND EXISTS (
          SELECT 1 FROM branch_product_stock
          WHERE tenant_id = ? AND branch_id = ? AND product_id = ?
            AND version = ? AND stock_microunits >= ?
        )`;
        guardParams.push(
          input.tenantId,
          row.branch_id,
          row.product_id,
          row.branch_stock_version,
          row.base_quantity_microunits,
        );
        if (row.location_id) {
          guardSql += ` AND EXISTS (
            SELECT 1 FROM inventory_location_stock
            WHERE tenant_id = ? AND branch_id = ? AND location_id = ?
              AND product_id = ? AND quantity_microunits >= ?
          )`;
          guardParams.push(
            input.tenantId,
            row.branch_id,
            row.location_id,
            row.product_id,
            row.base_quantity_microunits,
          );
        }
        if (row.batch_id) {
          guardSql += ` AND EXISTS (
            SELECT 1 FROM inventory_batches
            WHERE tenant_id = ? AND branch_id = ? AND id = ? AND product_id = ?
              AND is_active = 1 AND deleted_at IS NULL AND stock_microunits >= ?
          )`;
          guardParams.push(
            input.tenantId,
            row.branch_id,
            row.batch_id,
            row.product_id,
            row.base_quantity_microunits,
          );
        }
      });
      plan.guardState(guardSql, guardParams);
      plan.add(
        db
          .prepare(
            `UPDATE branch_document_series
             SET current_number = current_number + 1
             WHERE tenant_id = ? AND id = ? AND current_number = ?`,
          )
          .bind(input.tenantId, first.series_id, first.current_number),
      );
      plan.add(
        db
          .prepare(
            `INSERT INTO sales (
               id, tenant_id, branch_id, cash_register_session_id, user_id, customer_id,
               offline_client_sale_id, client_document_type, client_document_number,
               client_name, document_type, series, number, currency, exchange_rate,
               total_taxable_cents, total_exempt_cents, total_igv_cents,
               total_icbper_cents, total_discount_cents, total_cogs_cents,
               total_amount_cents, issued_at_lima, must_submit_by, sunat_status
             )
             SELECT ?, ?, ?, crs.id, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PEN', 1,
                    ?, 0, ?, 0, 0, ?, ?, ?, ?, ?
             FROM cash_register_sessions crs
             WHERE crs.tenant_id = ? AND crs.branch_id = ? AND crs.status = 'OPEN'
             ORDER BY crs.opened_at DESC LIMIT 1`,
          )
          .bind(
            saleId,
            input.tenantId,
            first.branch_id,
            first.created_by_user_id,
            first.customer_id,
            `recurring:${input.planId}:${input.periodStart}`,
            first.customer_document_type,
            first.customer_document_number,
            first.customer_name,
            first.document_type,
            first.series,
            first.current_number + 1,
            subtotal,
            tax,
            cogs,
            total,
            now,
            mustSubmitBy,
            sunatStatus,
            input.tenantId,
            first.branch_id,
          ),
      );
      rows.forEach((row, index) => {
        const line = applied[index]!;
        const saleItemId = saleItemIds[index]!;
        plan.add(
          db
            .prepare(
              `INSERT INTO sale_items (
                 id, tenant_id, sale_id, product_id, product_name, product_type,
                 quantity, unit_price_cents, unit_cost_cents, discount_amount_cents,
                 subtotal_cents, igv_affectation_code, igv_amount_cents,
                 icbper_amount_cents, total_amount_cents, batch_id,
                 inventory_location_id, sold_uom_id, sold_uom_code,
                 entered_quantity_microunits, factor_numerator, factor_denominator,
                 base_quantity_microunits
               ) VALUES (?, ?, ?, ?, ?, ?, ? * 0.000001, ?, ?, 0, ?, ?, ?, 0,
                         ?, ?, ?, ?, 'REC', ?, ?, ?, ?)`,
            )
            .bind(
              saleItemId,
              input.tenantId,
              saleId,
              row.product_id,
              row.product_name,
              row.product_type,
              row.base_quantity_microunits,
              line.appliedUnitPriceCents,
              row.cost_cents,
              line.appliedSubtotalCents,
              row.igv_affectation_code_default,
              line.appliedTaxCents,
              line.appliedTotalCents,
              row.batch_id,
              row.location_id,
              row.product_uom_id,
              row.entered_quantity_microunits,
              row.factor_numerator,
              row.factor_denominator,
              row.base_quantity_microunits,
            ),
        );
        appendPhysicalStock(plan, db, row, {
          tenantId: input.tenantId,
          saleId,
          saleItemId,
        });
      });
      plan.add(
        db
          .prepare(
            `INSERT INTO accounts_receivable (
               id, tenant_id, customer_id, sale_id, original_amount_cents,
               balance_due_cents, due_date, status, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)`,
          )
          .bind(
            arId,
            input.tenantId,
            first.customer_id,
            saleId,
            total,
            total,
            period.periodEnd,
            now,
          ),
      );
      if (first.document_type !== 'NV') {
        plan.add(
          db
            .prepare(
              `INSERT INTO fiscal_outbox (
                 id, tenant_id, sale_id, status, must_submit_by, next_attempt_at
               ) VALUES (?, ?, ?, 'PENDING', ?, CURRENT_TIMESTAMP)`,
            )
            .bind(crypto.randomUUID(), input.tenantId, saleId, mustSubmitBy),
        );
      }
      appendUsageMeterToPlan(plan, db, {
        tenantId: input.tenantId,
        documentId: saleId,
        documentType: first.document_type,
        nowMs: issuedMs,
      });
      plan.add(
        db
          .prepare(
            `INSERT INTO recurring_occurrences (
               id, tenant_id, plan_id, plan_version, period_start, period_end,
               status, sale_id, accounts_receivable_id, document_type,
               total_amount_cents, idempotency_key, settled_at
             ) VALUES (?, ?, ?, ?, ?, ?, 'SETTLED', ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            occurrenceId,
            input.tenantId,
            input.planId,
            first.plan_version,
            input.periodStart,
            period.periodEnd,
            saleId,
            arId,
            first.document_type,
            total,
            `${input.tenantId}:${input.planId}:${input.periodStart}`,
            now,
          ),
      );
      rows.forEach((row, index) => {
        const line = applied[index]!;
        plan.add(
          db
            .prepare(
              `INSERT INTO recurring_occurrence_items (
                 id, tenant_id, occurrence_id, plan_item_id, sale_item_id,
                 line_number, product_id, product_uom_id,
                 applied_quantity_microunits, applied_unit_price_cents,
                 applied_subtotal_cents, applied_tax_cents, applied_total_cents,
                 price_source, price_resolved_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              crypto.randomUUID(),
              input.tenantId,
              occurrenceId,
              row.plan_item_id,
              saleItemIds[index],
              row.line_number,
              row.product_id,
              row.product_uom_id,
              row.entered_quantity_microunits,
              line.appliedUnitPriceCents,
              line.appliedSubtotalCents,
              line.appliedTaxCents,
              line.appliedTotalCents,
              line.priceSource,
              now,
            ),
        );
      });
      plan.add(
        db
          .prepare(
            `UPDATE recurring_plans
             SET next_run_at = ?, retry_count = 0, next_retry_at = NULL,
                 last_error_code = NULL, lease_owner_hash = NULL,
                 lease_expires_at = NULL, version = version + 1,
                 status = CASE
                   WHEN effective_until IS NOT NULL
                     AND julianday(?) >= julianday(effective_until)
                   THEN 'CANCELLED' ELSE status END,
                 updated_at = CURRENT_TIMESTAMP
             WHERE tenant_id = ? AND id = ? AND version = ?
               AND lease_owner_hash = ?`,
          )
          .bind(
            period.nextRunAt,
            period.nextRunAt,
            input.tenantId,
            input.planId,
            first.version,
            tokenHash,
          ),
      );
      plan.add(
        db
          .prepare(
            `INSERT INTO audit_events (
               id, tenant_id, branch_id, actor_user_id, action, entity_type,
               entity_id, payload_json, prev_hash, row_hash
             ) VALUES (?, ?, ?, ?, 'RECURRING_CREATED', 'recurring_occurrence',
                       ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            input.tenantId,
            first.branch_id,
            first.created_by_user_id,
            occurrenceId,
            JSON.stringify({ planId: input.planId, periodStart: input.periodStart, saleId }),
            prevHash,
            rowHash,
          ),
      );
    });
  } catch (error) {
    const replayAfterRace = await loadOccurrenceReplay(db, input);
    if (replayAfterRace) return replayAfterRace;
    throw new RecurringSaleError(safeErrorCode(error), { cause: error });
  }
  return {
    status: 'SUCCESS',
    occurrenceId,
    saleId,
    accountsReceivableId: arId,
    totalAmountCents: total,
    nextRunAt: period.nextRunAt,
  };
}

export async function recordRecurringFailureAtomic(
  db: D1DatabaseLike,
  input: {
    readonly tenantId: string;
    readonly planId: string;
    readonly leaseToken: string;
    readonly failedAt: string;
    readonly error: unknown;
    readonly baseDelaySeconds?: number;
    readonly maxDelaySeconds?: number;
  },
): Promise<{ retryCount: number; nextRetryAt: string; errorCode: string }> {
  const plan = await loadPlanHeader(db, input.tenantId, input.planId);
  const tokenHash = await sha256Hex(required(input.leaseToken, 'RECURRING_LEASE_INVALID'));
  const retry = computeRecurringRetry({
    failedAt: input.failedAt,
    retryCount: plan.retry_count,
    baseDelaySeconds: input.baseDelaySeconds ?? 30,
    maxDelaySeconds: input.maxDelaySeconds ?? 3600,
  });
  const errorCode = safeErrorCode(input.error);
  await guardedMutation(db, 'RECURRING_LEASE_INVALID', (batch) => {
    batch.guardState(
      `SELECT 1 FROM recurring_plans
       WHERE tenant_id = ? AND id = ? AND version = ?
         AND lease_owner_hash = ? AND julianday(lease_expires_at) > julianday(?)`,
      [input.tenantId, input.planId, plan.version, tokenHash, input.failedAt],
    );
    batch.add(
      db
        .prepare(
          `UPDATE recurring_plans
           SET retry_count = ?, next_retry_at = ?, last_error_code = ?,
               lease_owner_hash = NULL, lease_expires_at = NULL,
               version = version + 1, updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = ? AND id = ? AND version = ?
             AND lease_owner_hash = ?`,
        )
        .bind(
          retry.retryCount,
          retry.nextRetryAt,
          errorCode,
          input.tenantId,
          input.planId,
          plan.version,
          tokenHash,
        ),
    );
  });
  return { retryCount: retry.retryCount, nextRetryAt: retry.nextRetryAt, errorCode };
}

export async function transitionRecurringPlanAtomic(
  db: D1DatabaseLike,
  input: {
    readonly tenantId: string;
    readonly planId: string;
    readonly expectedVersion: number;
    readonly actorUserId: string;
    readonly target: 'ACTIVE' | 'PAUSED';
    readonly reason?: string;
  },
): Promise<{ status: 'ACTIVE' | 'PAUSED' }> {
  const current = await loadPlanHeader(db, input.tenantId, input.planId);
  const allowed =
    input.target === 'PAUSED'
      ? ['ACTIVE', 'GRACE'].includes(current.status)
      : ['PAUSED', 'GRACE'].includes(current.status);
  if (!allowed) fail('RECURRING_INVALID_STATUS_TRANSITION');
  await guardedMutation(db, 'RECURRING_CONFLICT', (plan) => {
    plan.guardState(
      `SELECT 1 FROM recurring_plans
       WHERE tenant_id = ? AND id = ? AND version = ? AND status = ?`,
      [input.tenantId, input.planId, input.expectedVersion, current.status],
    );
    plan.add(
      db
        .prepare(
          `UPDATE recurring_plans
           SET status = ?, version = version + 1,
               updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = ? AND id = ? AND version = ?`,
        )
        .bind(input.target, input.tenantId, input.planId, input.expectedVersion),
    );
    plan.add(
      db
        .prepare(
          `INSERT INTO audit_events (
             id, tenant_id, branch_id, actor_user_id, action, entity_type,
             entity_id, payload_json, row_hash
           ) VALUES (?, ?, ?, ?, ?, 'recurring_plan', ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          input.tenantId,
          current.branch_id,
          input.actorUserId,
          input.target === 'PAUSED' ? 'RECURRING_PAUSED' : 'RECURRING_RESUMED',
          input.planId,
          JSON.stringify({ reason: input.reason ?? null }),
          crypto.randomUUID(),
        ),
    );
  });
  return { status: input.target };
}

export async function evaluateRecurringGraceAtomic(
  db: D1DatabaseLike,
  input: { readonly tenantId: string; readonly planId: string; readonly now: string },
): Promise<{ status: 'ACTIVE' | 'GRACE' | 'PAUSED' }> {
  const plan = await loadPlanHeader(db, input.tenantId, input.planId);
  const ar = await db
    .prepare(
      `SELECT ar.due_date, ar.balance_due_cents
       FROM recurring_occurrences ro
       JOIN accounts_receivable ar ON ar.tenant_id = ro.tenant_id
         AND ar.id = ro.accounts_receivable_id
       WHERE ro.tenant_id = ? AND ro.plan_id = ? AND ar.balance_due_cents > 0
       ORDER BY ar.due_date LIMIT 1`,
    )
    .bind(input.tenantId, input.planId)
    .first<{ due_date: string; balance_due_cents: number }>();
  const decision = ar
    ? decideRecurringDelinquency({
        dueAt: ar.due_date,
        now: input.now,
        graceDays: plan.grace_days,
        afterGracePolicy: plan.after_grace_policy,
      })
    : null;
  const status: 'ACTIVE' | 'GRACE' | 'PAUSED' =
    decision?.membershipState === 'PAUSED_AFTER_GRACE'
      ? 'PAUSED'
      : decision?.membershipState === 'GRACE'
        ? 'GRACE'
        : plan.status === 'GRACE'
          ? 'GRACE'
          : 'ACTIVE';
  if (status === plan.status) return { status };
  await guardedMutation(db, 'RECURRING_CONFLICT', (batch) => {
    batch.guardState(
      `SELECT 1 FROM recurring_plans
       WHERE tenant_id = ? AND id = ? AND version = ? AND status = ?`,
      [input.tenantId, input.planId, plan.version, plan.status],
    );
    batch.add(
      db
        .prepare(
          `UPDATE recurring_plans SET status = ?, version = version + 1,
             updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = ? AND id = ? AND version = ?`,
        )
        .bind(status, input.tenantId, input.planId, plan.version),
    );
  });
  return { status };
}

interface CancellationOccurrence {
  occurrence_id: string;
  period_start: string;
  period_end: string;
  sale_id: string;
  document_type: 'NV' | '03' | '01';
  accounts_receivable_id: string;
  branch_id: string;
  actor_user_id: string;
  cash_register_session_id: string;
  customer_id: string;
  client_document_type: string;
  client_document_number: string;
  client_name: string;
  original_sunat_status: string;
  original_total_cents: number;
  sale_item_id: string;
  product_id: string;
  product_type: string;
  batch_id: string | null;
  quantity: number;
  unit_price_cents: number;
  igv_affectation_code: string;
  igv_amount_cents: number;
  icbper_amount_cents: number;
  line_total_cents: number;
}

export async function cancelRecurringPlanAtomic(
  db: D1DatabaseLike,
  input: {
    readonly tenantId: string;
    readonly planId: string;
    readonly expectedVersion?: number;
    readonly actorUserId?: string;
    readonly mode?: 'IMMEDIATE' | 'AT_PERIOD_END';
    readonly cancelledAt?: string;
    readonly idempotencyKey?: string;
  },
): Promise<{
  status: 'CANCELLED' | 'CANCEL_AT_PERIOD_END';
  adjustmentSaleId: string | null;
  creditAmountCents: number;
  alreadyApplied: boolean;
}> {
  const mode = input.mode ?? 'AT_PERIOD_END';
  const now = input.cancelledAt ?? toLimaTimestamp(Date.now());
  const existing = await db
    .prepare(
      `SELECT adjustment_sale_id, credit_amount_cents
       FROM recurring_proration_adjustments
       WHERE tenant_id = ? AND plan_id = ? AND idempotency_key = ? LIMIT 1`,
    )
    .bind(input.tenantId, input.planId, input.idempotencyKey ?? `cancel:${input.planId}:${now}`)
    .first<{ adjustment_sale_id: string; credit_amount_cents: number }>();
  if (existing) {
    return {
      status: 'CANCELLED',
      adjustmentSaleId: existing.adjustment_sale_id,
      creditAmountCents: existing.credit_amount_cents,
      alreadyApplied: true,
    };
  }
  const plan = await loadPlanHeader(db, input.tenantId, input.planId);
  const expectedVersion = input.expectedVersion ?? plan.version;
  const cancelPrevHash = await previousAuditHash(db, input.tenantId);
  const cancelRowHash = await auditHash({
    action: 'RECURRING_CANCELLED',
    entityId: input.planId,
    mode,
    idempotencyKey: input.idempotencyKey ?? null,
    prevHash: cancelPrevHash,
  });
  if (mode === 'AT_PERIOD_END') {
    const boundary = computeRecurringPeriod(
      {
        timezone: 'America/Lima',
        frequency: plan.frequency,
        anchorDay: plan.anchor_day,
        anchorIsLastDay: plan.anchor_is_last_day === 1,
        anchorTime: plan.anchor_time,
        pricingPolicy: plan.pricing_policy,
        graceDays: plan.grace_days,
        afterGracePolicy: plan.after_grace_policy,
        items: [],
      },
      plan.next_run_at,
    ).periodEnd;
    await guardedMutation(db, 'RECURRING_CONFLICT', (batch) => {
      batch.guardState(
        `SELECT 1 FROM recurring_plans
         WHERE tenant_id = ? AND id = ? AND version = ?
           AND status IN ('ACTIVE','GRACE','PAUSED')`,
        [input.tenantId, input.planId, expectedVersion],
      );
      batch.add(
        db
          .prepare(
            `UPDATE recurring_plans
             SET status = 'CANCEL_AT_PERIOD_END', effective_until = ?,
                 cancelled_at = ?, lease_owner_hash = NULL, lease_expires_at = NULL,
                 version = version + 1, updated_at = CURRENT_TIMESTAMP
             WHERE tenant_id = ? AND id = ? AND version = ?`,
          )
          .bind(boundary, now, input.tenantId, input.planId, expectedVersion),
      );
      batch.add(
        db
          .prepare(
            `INSERT INTO audit_events (
               id, tenant_id, branch_id, actor_user_id, action, entity_type,
               entity_id, payload_json, prev_hash, row_hash
             ) VALUES (?, ?, ?, ?, 'RECURRING_CANCELLED', 'recurring_plan', ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            input.tenantId,
            plan.branch_id,
            input.actorUserId ?? plan.created_by_user_id,
            input.planId,
            JSON.stringify({ mode, effectiveUntil: boundary }),
            cancelPrevHash,
            cancelRowHash,
          ),
      );
    });
    return {
      status: 'CANCEL_AT_PERIOD_END',
      adjustmentSaleId: null,
      creditAmountCents: 0,
      alreadyApplied: false,
    };
  }
  const occurrenceRows = await db
    .prepare(
      `SELECT ro.id AS occurrence_id, ro.period_start, ro.period_end, ro.sale_id,
              ro.document_type, ro.accounts_receivable_id, s.branch_id,
              s.user_id AS actor_user_id, s.cash_register_session_id, s.customer_id,
              s.client_document_type, s.client_document_number, s.client_name,
              s.sunat_status AS original_sunat_status,
              s.total_amount_cents AS original_total_cents,
              si.id AS sale_item_id, si.product_id, si.product_type, si.batch_id,
              si.quantity, si.unit_price_cents, si.igv_affectation_code,
              si.igv_amount_cents, si.icbper_amount_cents,
              si.total_amount_cents AS line_total_cents
       FROM recurring_occurrences ro
       JOIN sales s ON s.tenant_id = ro.tenant_id AND s.id = ro.sale_id
       JOIN sale_items si ON si.tenant_id = s.tenant_id AND si.sale_id = s.id
       WHERE ro.tenant_id = ? AND ro.plan_id = ?
         AND julianday(?) >= julianday(ro.period_start)
         AND julianday(?) < julianday(ro.period_end)
       ORDER BY si.id`,
    )
    .bind(input.tenantId, input.planId, now, now)
    .all<CancellationOccurrence>();
  const occurrences = occurrenceRows.results ?? [];
  const first = occurrences[0];
  const credits = occurrences.map((row) =>
    computeRecurringProration({
      lineTotalCents: row.line_total_cents,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      cancelledAt: now,
      mode: 'IMMEDIATE',
    }),
  );
  const creditAmount = credits.reduce((sum, credit) => sum + credit.creditAmountCents, 0);
  const adjustmentSaleId = first && creditAmount > 0 ? crypto.randomUUID() : null;
  const returnId = first && creditAmount > 0 ? crypto.randomUUID() : null;
  const adjustmentType = first?.document_type === 'NV' ? 'NV_RETURN' : '07';
  const adjustmentId = crypto.randomUUID();
  const idempotencyKey = input.idempotencyKey ?? `cancel:${input.planId}:${now}`;
  await guardedMutation(db, 'RECURRING_CONFLICT', (batch) => {
    batch.guardState(
      `SELECT 1 FROM recurring_plans
       WHERE tenant_id = ? AND id = ? AND version = ?
         AND status IN ('ACTIVE','GRACE','PAUSED','CANCEL_AT_PERIOD_END')
         AND NOT EXISTS (
           SELECT 1 FROM recurring_proration_adjustments
           WHERE tenant_id = ? AND plan_id = ? AND idempotency_key = ?
         )`,
      [input.tenantId, input.planId, expectedVersion, input.tenantId, input.planId, idempotencyKey],
    );
    batch.add(
      db
        .prepare(
          `UPDATE recurring_plans
           SET status = 'CANCELLED', effective_until = ?, cancelled_at = ?,
               lease_owner_hash = NULL, lease_expires_at = NULL,
               version = version + 1, updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = ? AND id = ? AND version = ?`,
        )
        .bind(now, now, input.tenantId, input.planId, expectedVersion),
    );
    if (first && adjustmentSaleId && creditAmount > 0) {
      batch.add(
        db
          .prepare(
            `UPDATE branch_document_series SET current_number = current_number + 1
             WHERE tenant_id = ? AND branch_id = ? AND document_type_code = ?
               AND is_active = 1 AND (
                 authorization_status = 'AUTHORIZED'
                 OR (? = 'NV_RETURN' AND authorization_status = 'INTERNAL')
               )`,
          )
          .bind(input.tenantId, first.branch_id, adjustmentType, adjustmentType),
      );
      batch.add(
        db
          .prepare(
            `INSERT INTO sales (
               id, tenant_id, branch_id, cash_register_session_id, user_id, customer_id,
               client_document_type, client_document_number, client_name,
               document_type, series, number, currency, exchange_rate,
               total_amount_cents, referenced_sale_id, credit_note_motive_code,
               issued_at_lima, sunat_status
             )
             SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, bds.series, bds.current_number,
                    'PEN', 1, ?, ?, ?, ?,
                    CASE WHEN ? = 'NV_RETURN' THEN 'NOT_APPLICABLE' ELSE 'PENDING' END
             FROM branch_document_series bds
             WHERE bds.tenant_id = ? AND bds.branch_id = ?
               AND bds.document_type_code = ? AND bds.is_active = 1
             ORDER BY bds.series LIMIT 1`,
          )
          .bind(
            adjustmentSaleId,
            input.tenantId,
            first.branch_id,
            first.cash_register_session_id,
            input.actorUserId ?? first.actor_user_id,
            first.customer_id,
            first.client_document_type,
            first.client_document_number,
            first.client_name,
            adjustmentType,
            creditAmount,
            first.sale_id,
            adjustmentType === '07' ? '07' : null,
            now,
            adjustmentType,
            input.tenantId,
            first.branch_id,
            adjustmentType,
          ),
      );
      batch.add(
        db
          .prepare(
            `INSERT INTO sales_returns (
               id, tenant_id, branch_id, sale_id, doc_type, doc_series, doc_number,
               refund_amount_cents, refund_payment_method, reason,
               authorized_by_user_id, created_by_user_id
             )
             SELECT ?, ?, ?, ?, ?, series, CAST(number AS TEXT), ?,
                    'credit', 'RECURRING_PRORATION', ?, ?
             FROM sales WHERE tenant_id = ? AND id = ?`,
          )
          .bind(
            returnId,
            input.tenantId,
            first.branch_id,
            first.sale_id,
            adjustmentType,
            creditAmount,
            input.actorUserId ?? first.actor_user_id,
            input.actorUserId ?? first.actor_user_id,
            input.tenantId,
            adjustmentSaleId,
          ),
      );
      occurrences.forEach((line, index) => {
        const credit = credits[index]!;
        if (credit.creditAmountCents <= 0) return;
        const fraction = credit.unusedServiceDays / credit.serviceDays;
        const returnedQuantity = line.quantity * fraction;
        const returnedIgv = Math.round(line.igv_amount_cents * fraction);
        const returnedIcbper = Math.round(line.icbper_amount_cents * fraction);
        batch.add(
          db
            .prepare(
              `INSERT INTO sale_return_items (
                 id, tenant_id, return_id, original_sale_item_id, batch_id, qty,
                 unit_price_cents, igv_affectation_code, igv_amount_cents,
                 icbper_amount_cents, unit_price_without_tax_cents, line_total_cents
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              crypto.randomUUID(),
              input.tenantId,
              returnId,
              line.sale_item_id,
              line.batch_id,
              returnedQuantity,
              line.unit_price_cents,
              line.igv_affectation_code,
              returnedIgv,
              returnedIcbper,
              line.unit_price_cents,
              credit.creditAmountCents,
            ),
        );
      });
      batch.add(
        db
          .prepare(
            `UPDATE accounts_receivable
             SET balance_due_cents = MAX(0, balance_due_cents - ?),
                 status = CASE WHEN balance_due_cents - ? <= 0
                               THEN 'PAID' ELSE 'PARTIALLY_PAID' END
             WHERE tenant_id = ? AND id = ?`,
          )
          .bind(creditAmount, creditAmount, input.tenantId, first.accounts_receivable_id),
      );
      if (adjustmentType === '07') {
        batch.add(
          db
            .prepare(
              `INSERT INTO fiscal_outbox (id, tenant_id, sale_id, status, next_attempt_at)
               VALUES (?, ?, ?, 'PENDING', CURRENT_TIMESTAMP)`,
            )
            .bind(crypto.randomUUID(), input.tenantId, adjustmentSaleId),
        );
      }
      appendUsageMeterToPlan(batch, db, {
        tenantId: input.tenantId,
        documentId: adjustmentSaleId,
        documentType: adjustmentType,
        nowMs: parseTimestamp(now, 'RECURRING_INVALID_TIME'),
      });
      const firstCredit = credits[0]!;
      batch.add(
        db
          .prepare(
            `INSERT INTO recurring_proration_adjustments (
               id, tenant_id, plan_id, occurrence_id, original_sale_id,
               adjustment_sale_id, adjustment_document_type, cancellation_mode,
               service_days, unused_service_days, rational_numerator,
               rational_denominator, credit_amount_cents, idempotency_key
             ) VALUES (?, ?, ?, ?, ?, ?, ?, 'IMMEDIATE', ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            adjustmentId,
            input.tenantId,
            input.planId,
            first.occurrence_id,
            first.sale_id,
            adjustmentSaleId,
            adjustmentType,
            firstCredit.serviceDays,
            firstCredit.unusedServiceDays,
            credits.reduce((sum, credit) => sum + credit.rationalNumerator, 0),
            firstCredit.rationalDenominator,
            creditAmount,
            idempotencyKey,
          ),
      );
      batch.add(
        db
          .prepare(
            `UPDATE recurring_occurrences SET status = 'RETURNED'
             WHERE tenant_id = ? AND id = ? AND status = 'SETTLED'`,
          )
          .bind(input.tenantId, first.occurrence_id),
      );
    }
    batch.add(
      db
        .prepare(
          `INSERT INTO audit_events (
             id, tenant_id, branch_id, actor_user_id, action, entity_type,
             entity_id, payload_json, prev_hash, row_hash
           ) VALUES (?, ?, ?, ?, 'RECURRING_CANCELLED', 'recurring_plan', ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          input.tenantId,
          first?.branch_id ?? plan.branch_id,
          input.actorUserId ?? plan.created_by_user_id,
          input.planId,
          JSON.stringify({ mode, adjustmentSaleId, creditAmount }),
          cancelPrevHash,
          cancelRowHash,
        ),
    );
  });
  return {
    status: 'CANCELLED',
    adjustmentSaleId,
    creditAmountCents: creditAmount,
    alreadyApplied: false,
  };
}

export async function runRecurringScheduler(
  db: D1DatabaseLike,
  input: {
    readonly now: string;
    readonly tenantId?: string;
    readonly branchId?: string;
    readonly planId?: string;
    readonly pageSize?: number;
    readonly schedulerId?: string;
    readonly globalCatchUpLimit?: number;
  },
): Promise<{
  readonly processedPeriods: readonly string[];
  readonly selectionStatus: 'COMPLETE' | 'NOT_DUE' | 'NOT_FOUND';
  readonly hasMore: boolean;
  readonly failures: number;
}> {
  const due = await listDueRecurringPlans(db, {
    now: input.now,
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    ...(input.branchId ? { branchId: input.branchId } : {}),
    ...(input.planId ? { planId: input.planId } : {}),
    limit: input.pageSize ?? 25,
  });
  if (input.planId && due.length === 0) {
    if (!input.tenantId) {
      return { processedPeriods: [], selectionStatus: 'NOT_FOUND', hasMore: false, failures: 0 };
    }
    const plan = await db
      .prepare(`SELECT status FROM recurring_plans WHERE tenant_id = ? AND id = ? LIMIT 1`)
      .bind(input.tenantId, input.planId)
      .first<{ status: string }>();
    return {
      processedPeriods: [],
      selectionStatus: plan ? 'NOT_DUE' : 'NOT_FOUND',
      hasMore: false,
      failures: 0,
    };
  }
  const processedPeriods: string[] = [];
  let failures = 0;
  let hasBacklog = false;
  const globalLimit = Math.max(1, input.globalCatchUpLimit ?? 100);
  // One period per plan per round gives old plans catch-up without starving other tenants/branches.
  let round = [...due];
  while (round.length > 0 && processedPeriods.length < globalLimit) {
    const nextRound: PlanHeader[] = [];
    for (const candidate of round) {
      if (processedPeriods.length >= globalLimit) break;
      const perPlanDone = processedPeriods.filter((period) =>
        period.startsWith(`${candidate.tenant_id}|${candidate.id}|`),
      ).length;
      if (perPlanDone >= candidate.catch_up_limit) continue;
      // S44-H1: política post-gracia ANTES de liquidar — un plan con AR
      // vencido más allá de la gracia se pausa (PAUSE_FUTURE_EXECUTION) y
      // NO sigue liquidando períodos.
      if (candidate.status === 'GRACE') {
        try {
          const grace = await evaluateRecurringGraceAtomic(db, {
            tenantId: candidate.tenant_id,
            planId: candidate.id,
            now: input.now,
          });
          if (grace.status === 'PAUSED') continue;
        } catch {
          continue; // conflicto de carrera: se reintenta el próximo tick
        }
      }
      let lease: Awaited<ReturnType<typeof claimDueRecurringPlanAtomic>>;
      try {
        lease = await claimDueRecurringPlanAtomic(db, {
          tenantId: candidate.tenant_id,
          planId: candidate.id,
          expectedVersion: candidate.version,
          now: input.now,
          catchUpLimit: candidate.catch_up_limit,
          ...(input.schedulerId ? { schedulerId: input.schedulerId } : {}),
        });
      } catch {
        continue;
      }
      try {
        const periodStart = candidate.next_run_at;
        const result = await processRecurringSaleAtomic(db, {
          tenantId: candidate.tenant_id,
          planId: candidate.id,
          periodStart,
          leaseToken: lease.leaseToken,
          now: input.now,
        });
        processedPeriods.push(`${candidate.tenant_id}|${candidate.id}|${periodStart}`);
        if (
          processedPeriods.length < globalLimit &&
          perPlanDone + 1 < candidate.catch_up_limit &&
          result.nextRunAt <= input.now
        ) {
          nextRound.push({
            ...candidate,
            next_run_at: result.nextRunAt,
            version: candidate.version + 2,
          });
        } else if (result.nextRunAt <= input.now) {
          hasBacklog = true;
        }
      } catch (error) {
        failures += 1;
        await recordRecurringFailureAtomic(db, {
          tenantId: candidate.tenant_id,
          planId: candidate.id,
          leaseToken: lease.leaseToken,
          failedAt: input.now,
          error,
        }).catch(() => undefined);
      }
    }
    round = nextRound;
  }
  return {
    processedPeriods: processedPeriods.map((entry) => entry.split('|').slice(2).join('|')),
    selectionStatus: 'COMPLETE',
    hasMore: due.length >= (input.pageSize ?? 25) || round.length > 0 || hasBacklog,
    failures,
  };
}
