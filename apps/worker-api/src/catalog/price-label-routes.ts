/* Sprint 41 — catalog.price_labels HTTP boundary. */
import {
  acknowledgePriceLabelItems,
  createPriceLabelBatchAtomic,
  createPriceLabelTemplate,
  listPriceLabelTemplates,
  reprintPriceLabelBatchAtomic,
  resolveActiveTerminalSession,
  retirePriceLabelTemplate,
  versionPriceLabelTemplate,
} from '@kipuspay/adapters-d1';
import type { WorkerEnv } from '../auth/control-plane.js';
import { isCatalogPriceLabelsEnabled } from '../auth/features.js';

export { isCatalogPriceLabelsEnabled };

export interface PriceLabelActor {
  readonly tenantId: string;
  readonly userId: string;
  readonly role: string;
  readonly branchId: string;
  readonly terminalId?: string;
  readonly terminalSessionId?: string;
}

interface HttpResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

const TEMPLATE_ROLES = new Set(['owner', 'admin']);
const BATCH_ROLES = new Set(['owner', 'admin', 'supervisor']);
const CLIENT_SNAPSHOT_FIELDS = new Set([
  'tenantId',
  'branchId',
  'actorUserId',
  'terminalId',
  'terminalSessionId',
  'priceCents',
  'price_cents',
  'customerId',
  'promotionId',
  'barcode',
  'barcodeType',
  'template',
  'templateJson',
  'snapshotHash',
  'renderedPayloadHash',
]);

const ERROR_STATUS: Readonly<Record<string, number>> = {
  PRICE_LABEL_REQUEST_INVALID: 400,
  PRICE_LABEL_UNTRUSTED_FIELD: 400,
  PRICE_LABEL_TEMPLATE_INVALID: 400,
  PRICE_LABEL_TEMPLATE_NOT_ALLOWED: 422,
  PRICE_LABEL_TEMPLATE_EXISTS: 409,
  PRICE_LABEL_TEMPLATE_NOT_FOUND: 404,
  PRICE_LABEL_SCOPE_MISMATCH: 404,
  PRICE_LABEL_BATCH_NOT_FOUND: 404,
  PRICE_LABEL_BARCODE_INVALID: 422,
  PRICE_LABEL_PRICE_INVALID: 422,
  PRICE_LABEL_ACK_INVALID: 400,
  TERMINAL_SESSION_FORBIDDEN: 403,
};

function safeFailure(error: unknown): HttpResult {
  const code = error instanceof Error ? error.message : '';
  const status = ERROR_STATUS[code];
  return status ? { status, body: { code } } : { status: 500, body: { code: 'INTERNAL_ERROR' } };
}

function text(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === 'string' ? value.trim() : '';
}

function objectBody(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function hasUntrustedSnapshotField(body: Record<string, unknown>): boolean {
  if (Object.keys(body).some((key) => CLIENT_SNAPSHOT_FIELDS.has(key))) return true;
  const products = body.products;
  if (!Array.isArray(products)) return false;
  return (products as unknown[]).some((product: unknown) => {
    if (!product || typeof product !== 'object' || Array.isArray(product)) return false;
    return Object.keys(product).some((key) => !['productId', 'copies'].includes(key));
  });
}

async function capabilityEnabled(env: WorkerEnv, tenantId: string): Promise<boolean> {
  if (!env.DB || !tenantId) return false;
  const capability = await env.DB.prepare(
    `SELECT 1 AS enabled FROM tenant_capabilities
     WHERE tenant_id = ? AND capability = 'catalog.price_labels' AND enabled = 1 LIMIT 1`,
  )
    .bind(tenantId)
    .first<{ enabled: number }>();
  return capability?.enabled === 1;
}

async function tenantPreflight(
  env: WorkerEnv,
  actor: PriceLabelActor,
  roles: ReadonlySet<string>,
): Promise<HttpResult | null> {
  if (!isCatalogPriceLabelsEnabled(env)) return { status: 404, body: { code: 'FEATURE_OFF' } };
  if (!env.DB) return { status: 503, body: { code: 'DB_UNAVAILABLE' } };
  if (!actor.tenantId || !actor.userId || !roles.has(actor.role.toLowerCase())) {
    return { status: 403, body: { code: 'FORBIDDEN' } };
  }
  try {
    if (!(await capabilityEnabled(env, actor.tenantId))) {
      return { status: 404, body: { code: 'FEATURE_OFF' } };
    }
  } catch {
    return { status: 503, body: { code: 'CAPABILITY_UNAVAILABLE' } };
  }
  return null;
}

async function batchPreflight(env: WorkerEnv, actor: PriceLabelActor): Promise<HttpResult | null> {
  const denied = await tenantPreflight(env, actor, BATCH_ROLES);
  if (denied) return denied;
  if (!actor.branchId || !actor.terminalId || !actor.terminalSessionId) {
    return { status: 403, body: { code: 'FORBIDDEN' } };
  }
  return null;
}

function hasOnlyKeys(body: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = new Set(allowed);
  return Object.keys(body).every((key) => keys.has(key));
}

async function terminalAuthority(env: WorkerEnv, actor: PriceLabelActor) {
  if (!actor.terminalId || !actor.terminalSessionId) throw new Error('TERMINAL_SESSION_FORBIDDEN');
  const binding = await resolveActiveTerminalSession(env.DB!, {
    tenantId: actor.tenantId,
    userId: actor.userId,
    terminalId: actor.terminalId,
    terminalSessionId: actor.terminalSessionId,
    branchId: actor.branchId,
  });
  if (binding.branchId !== actor.branchId) throw new Error('TERMINAL_SESSION_FORBIDDEN');
  return binding;
}

function parseProducts(body: Record<string, unknown>) {
  if (!Array.isArray(body.products)) return null;
  const products = body.products as unknown[];
  return products.map((raw: unknown) => {
    const product = objectBody(raw);
    return { productId: text(product, 'productId'), copies: product.copies };
  });
}

export async function runCreatePriceLabelBatchHttp(
  env: WorkerEnv,
  actor: PriceLabelActor,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  const denied = await batchPreflight(env, actor);
  if (denied) return denied;
  if (hasUntrustedSnapshotField(body)) {
    return { status: 400, body: { code: 'PRICE_LABEL_UNTRUSTED_FIELD' } };
  }
  const products = parseProducts(body);
  if (!products) return { status: 400, body: { code: 'PRICE_LABEL_REQUEST_INVALID' } };
  try {
    const terminal = await terminalAuthority(env, actor);
    const result = await createPriceLabelBatchAtomic(env.DB!, {
      tenantId: actor.tenantId,
      branchId: terminal.branchId,
      actorUserId: actor.userId,
      terminalId: terminal.terminalId,
      templateId: text(body, 'templateId'),
      ...(text(body, 'priceListId') ? { priceListId: text(body, 'priceListId') } : {}),
      products: products as { productId: string; copies: number }[],
      idempotencyKey: text(body, 'idempotencyKey'),
    });
    return { status: 201, body: { ...result } };
  } catch (error) {
    return safeFailure(error);
  }
}

export async function runReprintPriceLabelBatchHttp(
  env: WorkerEnv,
  actor: PriceLabelActor,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  const denied = await batchPreflight(env, actor);
  if (denied) return denied;
  if (hasUntrustedSnapshotField(body)) {
    return { status: 400, body: { code: 'PRICE_LABEL_UNTRUSTED_FIELD' } };
  }
  try {
    const terminal = await terminalAuthority(env, actor);
    const result = await reprintPriceLabelBatchAtomic(env.DB!, {
      tenantId: actor.tenantId,
      branchId: terminal.branchId,
      actorUserId: actor.userId,
      terminalId: terminal.terminalId,
      batchId: text(body, 'batchId'),
      idempotencyKey: text(body, 'idempotencyKey'),
    });
    return { status: 201, body: { ...result } };
  } catch (error) {
    return safeFailure(error);
  }
}

export async function runAcknowledgePriceLabelItemsHttp(
  env: WorkerEnv,
  actor: PriceLabelActor,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  const denied = await batchPreflight(env, actor);
  if (denied) return denied;
  try {
    const terminal = await terminalAuthority(env, actor);
    const raw = Array.isArray(body.acknowledgements) ? body.acknowledgements : [];
    const acknowledgements = raw.map((value) => {
      const ack = objectBody(value);
      return {
        itemId: text(ack, 'itemId'),
        status: text(ack, 'status') as 'ACKED' | 'FAILED',
        ...(text(ack, 'errorCode') ? { errorCode: text(ack, 'errorCode') } : {}),
      };
    });
    const result = await acknowledgePriceLabelItems(env.DB!, {
      tenantId: actor.tenantId,
      branchId: terminal.branchId,
      batchId: text(body, 'batchId'),
      acknowledgements,
    });
    return { status: 200, body: { ...result } };
  } catch (error) {
    return safeFailure(error);
  }
}

export async function runUpsertPriceLabelTemplateHttp(
  env: WorkerEnv,
  actor: PriceLabelActor,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  const denied = await tenantPreflight(env, actor, TEMPLATE_ROLES);
  if (denied) return denied;
  if (!hasOnlyKeys(body, ['templateKey', 'name', 'template', 'paperWidthMm', 'newVersion'])) {
    return { status: 400, body: { code: 'PRICE_LABEL_UNTRUSTED_FIELD' } };
  }
  try {
    const input = {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      templateKey: text(body, 'templateKey'),
      name: text(body, 'name'),
      template: body.template,
      paperWidthMm: body.paperWidthMm as 58 | 80,
    };
    const result =
      body.newVersion === true
        ? await versionPriceLabelTemplate(env.DB!, input)
        : await createPriceLabelTemplate(env.DB!, input);
    return { status: 201, body: { ...result } };
  } catch (error) {
    return safeFailure(error);
  }
}

export async function runRetirePriceLabelTemplateHttp(
  env: WorkerEnv,
  actor: PriceLabelActor,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  const denied = await tenantPreflight(env, actor, TEMPLATE_ROLES);
  if (denied) return denied;
  if (!hasOnlyKeys(body, ['templateId'])) {
    return { status: 400, body: { code: 'PRICE_LABEL_UNTRUSTED_FIELD' } };
  }
  try {
    const result = await retirePriceLabelTemplate(env.DB!, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      templateId: text(body, 'templateId'),
    });
    return { status: 200, body: { ...result } };
  } catch (error) {
    return safeFailure(error);
  }
}

export async function runListPriceLabelTemplatesHttp(
  env: WorkerEnv,
  actor: PriceLabelActor,
  includeRetired = false,
): Promise<HttpResult> {
  const denied = await tenantPreflight(env, actor, TEMPLATE_ROLES);
  if (denied) return denied;
  try {
    const templates = await listPriceLabelTemplates(env.DB!, {
      tenantId: actor.tenantId,
      includeRetired,
    });
    return { status: 200, body: { templates } };
  } catch (error) {
    return safeFailure(error);
  }
}
