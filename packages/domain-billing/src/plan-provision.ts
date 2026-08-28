/**
 * Plan → capabilities mapping (Ola 4 — Plan Upgrade reconciliación).
 * SoT: migration 0064_ola1_tenant_capabilities_backfill.sql.
 * Superset monotónico: arranque ⊂ crece ⊂ cadena ⊂ enterprise.
 *
 * Documenta decisión de downgrade/capabilities:
 * - Upgrade: añade defaults del nuevo plan vía INSERT OR IGNORE source=plan_default.
 * - Downgrade: borra SOLO filas plan_default que ya no pertenecen al nuevo plan
 *   (DELETE WHERE config_json='{"source":"plan_default"}' AND capability NOT IN (…) ).
 *   Overrides platform_override (config_json distinto, source=platform_override) se
 *   preservan siempre, tanto en upgrade como en downgrade. Esto evita que el
 *   control-plane pierda flags habilitados por SuperAdmin y garantiza que el
 *   batch sea idempotente y reversible sin borrar decisiones humanas.
 * - enabled=0 platform_override también se preserva (no se re-habilita vía
 *   INSERT OR IGNORE); el SuperAdmin lo revierte explícitamente por /platform.
 *
 * Invariantes guard: db.batch atómico (V-04), sin UPSERT INTO (V-02), tenant_id
 * NOT NULL (V-05). Money no aplica aquí (config_json es TEXT).
 */

export type PlanId = 'arranque' | 'crece' | 'cadena' | 'enterprise';

const ARRANQUE_CAPS: readonly string[] = [
  'pos.checkout',
  'pos.document_selector',
  'hardware.print_templates',
  'pos.offline_correlative_reserve',
  'display.vitrina',
  'ledger.accounts_receivable',
  'ledger.accounts_payable',
  'purchasing.orders',
  'cash.register_expenses',
  'audit.sensitive_actions',
  'catalog.sellable',
  'auth.cashier_login',
] as const;

const CRECE_CAPS: readonly string[] = [
  ...ARRANQUE_CAPS,
  'owner.mode',
  'owner.offline_rollup',
  'owner.push_alerts',
  'reporting.daily_rollups',
  'reporting.product_rollups',
  'reporting.catalog',
  'reporting.export',
  'reporting.shard_aggregator',
  'cash.blind_z',
  'cash.discount_authz',
  'ledger.credit_limit_cents',
  'inventory.batches',
  'inventory.bom',
  'pricing.lists',
  'pricing.promotions',
  'catalog.variants',
  'catalog.uom',
  'sales.layaway',
] as const;

const CADENA_CAPS: readonly string[] = [
  ...CRECE_CAPS,
  'stock.transfers',
  'purchasing.partial_receive',
  'integrations.catalog_import',
  'payments.qr_wallets',
  'payments.card_acquirer',
  'integrations.accounting_export',
  'integrations.api',
  'messaging.whatsapp_receipt',
  'loyalty.points',
  'sales.returns',
  'purchasing.three_way',
  'ledger.chart_of_accounts',
  'sales.quotes',
  'purchasing.returns',
  'ledger.store_credit',
  'sales.installments',
  'sales.commissions',
  'inventory.locations',
  'inventory.serials',
  'inventory.scale',
  'catalog.price_labels',
  'data.backup',
] as const;

const ENTERPRISE_CAPS: readonly string[] = [
  ...CADENA_CAPS,
  'orders.lifecycle',
  'orders.kds',
  'orders.split_bill',
  'orders.customer_orders',
  'sales.recurring',
  'mobile.push',
  'client.mobile_pos',
  'analytics.forecasting',
  'compliance.lpdp',
  'platform.dr',
  'analytics.agentic_insights',
  'catalog.quick_add',
  'sales.quick_line',
  'ops.shift_handoff',
  'ops.team_invite',
  'onboarding.tour',
  'hardware.diagnostics',
  'marketing.site',
  'marketing.vertical_landing',
  'marketing.compare',
  'marketing.claim_gate',
  'marketing.referrals',
  'marketing.content',
  'pos.brand_qr',
  'analytics.growth_metrics',
] as const;

export const PLAN_CAPABILITIES: Record<PlanId, readonly string[]> = {
  arranque: ARRANQUE_CAPS,
  crece: CRECE_CAPS,
  cadena: CADENA_CAPS,
  enterprise: ENTERPRISE_CAPS,
};

export const ALLOWED_PLANS: ReadonlySet<string> = new Set([
  'arranque',
  'crece',
  'cadena',
  'enterprise',
]);

export const SELF_SERVE_PLANS: ReadonlySet<string> = new Set(['arranque', 'crece', 'cadena']);

export function isAllowedPlan(planId: string): planId is PlanId {
  return (ALLOWED_PLANS as Set<string>).has(planId);
}

export function isSelfServePlan(planId: string): boolean {
  return (SELF_SERVE_PLANS as Set<string>).has(planId);
}

/**
 * Capabilities canónicas del plan (copia defensiva, orden estable).
 * Lanza si planId no es permitido — el llamador debe validar 422 antes.
 */
export function getCapabilitiesForPlan(planId: string): readonly string[] {
  if (!isAllowedPlan(planId)) {
    throw new Error(`INVALID_PLAN:${planId}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  return PLAN_CAPABILITIES[planId as PlanId];
}

/**
 * Alias semántico exigido por la misión Ola 4.
 * Mantiene PATCH /api/tenant/plan existente pero reconcilia tenant_capabilities.
 * Ver tabla de decisión en cabecera de archivo.
 */
export function provisionCapabilitiesForPlan(planId: string): readonly string[] {
  return getCapabilitiesForPlan(planId);
}

/**
 * Diferencia entre planes para logging/auditoría (no D1).
 * Comparación superset: qué caps añadiría el upgrade y qué plan_default borraría el downgrade.
 */
export function diffCapabilities(
  fromPlanId: string,
  toPlanId: string,
): { toAdd: readonly string[]; toRemoveIfPlanDefault: readonly string[] } {
  const from = new Set(getCapabilitiesForPlan(fromPlanId));
  const to = new Set(getCapabilitiesForPlan(toPlanId));
  const toAdd = [...to].filter((c) => !from.has(c));
  const toRemoveIfPlanDefault = [...from].filter((c) => !to.has(c));
  return { toAdd, toRemoveIfPlanDefault };
}

/**
 * Mapeo inverso Stripe price → plan (webhook). Env vars STRIPE_PRICE_*.
 * No hace fetch ni I/O. Retorna null si no hay mapping.
 */
export function planForStripePrice(
  priceId: string | null | undefined,
  env: {
    STRIPE_PRICE_ARRANQUE?: string;
    STRIPE_PRICE_CRECE?: string;
    STRIPE_PRICE_CADENA?: string;
  },
): PlanId | null {
  const p = (priceId ?? '').trim();
  if (!p) return null;
  if (p === env.STRIPE_PRICE_ARRANQUE?.trim()) return 'arranque';
  if (p === env.STRIPE_PRICE_CRECE?.trim()) return 'crece';
  if (p === env.STRIPE_PRICE_CADENA?.trim()) return 'cadena';
  return null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function trimmedString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function tryPrice(candidate: unknown): string | null {
  if (!isRecord(candidate)) return null;
  const priceVal = candidate.price;
  if (isRecord(priceVal)) {
    const pid = trimmedString(priceVal.id);
    if (pid) return pid;
  }
  const planVal = candidate.plan;
  if (isRecord(planVal)) {
    const plid = trimmedString(planVal.id);
    if (plid) return plid;
  }
  const rid = trimmedString(candidate.id);
  if (rid && rid.startsWith('price_')) return rid;
  return null;
}

function fromPlan(obj: Record<string, unknown>): string | null {
  if (!isRecord(obj.plan)) return null;
  const planRec = obj.plan;
  return trimmedString(planRec.id);
}

function fromItems(obj: Record<string, unknown>): string | null {
  const itemsVal = obj.items;
  if (!isRecord(itemsVal) || !Array.isArray(itemsVal.data) || itemsVal.data.length === 0)
    return null;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const first = itemsVal.data[0];
  if (!isRecord(first)) return null;
  const priceId = tryPrice(first);
  if (priceId) return priceId;
  if (isRecord(first.price)) {
    return trimmedString(first.price.id);
  }
  return null;
}

function fromLines(obj: Record<string, unknown>): string | null {
  const linesVal = obj.lines;
  if (!isRecord(linesVal) || !Array.isArray(linesVal.data) || linesVal.data.length === 0)
    return null;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const first = linesVal.data[0];
  if (!isRecord(first)) return null;
  return tryPrice(first);
}

function fromMetadata(obj: Record<string, unknown>): string | null {
  const metadataVal = obj.metadata;
  if (!isRecord(metadataVal)) return null;
  const v = trimmedString(metadataVal.plan_id);
  if (v && isAllowedPlan(v)) return `__plan:${v}`;
  return null;
}

/**
 * Extrae priceId candidato del payload Stripe (subscription/invoice) para plan.
 * Soporta: items.data[0].price.id, items.data[0].plan.id, plan.id, lines.data[0].price.id.
 * Sin I/O, solo navegación segura.
 */
export function extractStripePriceId(eventDataObject: unknown): string | null {
  if (!isRecord(eventDataObject)) return null;
  return (
    fromPlan(eventDataObject) ??
    fromItems(eventDataObject) ??
    fromLines(eventDataObject) ??
    fromMetadata(eventDataObject)
  );
}

/**
 * Resuelve plan desde priceId o marker __plan:xxx.
 * Retorna PlanId o null.
 */
export function resolvePlanFromExtracted(
  extracted: string | null,
  env: {
    STRIPE_PRICE_ARRANQUE?: string;
    STRIPE_PRICE_CRECE?: string;
    STRIPE_PRICE_CADENA?: string;
  },
): PlanId | null {
  if (!extracted) return null;
  if (extracted.startsWith('__plan:')) {
    const plan = extracted.slice('__plan:'.length);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    return isAllowedPlan(plan) ? (plan as PlanId) : null;
  }
  return planForStripePrice(extracted, env);
}
