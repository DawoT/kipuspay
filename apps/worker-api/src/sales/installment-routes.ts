/**
 * Sprint 36 — cuotas / pago en partes (FEATURE_SALES_INSTALLMENTS, default off).
 */
import {
  listOverdueInstallments,
  processInstallmentPayAtomic,
  processInstallmentPlanAtomic,
  type InstallmentPlanItemInput,
} from '@kipuspay/adapters-d1';
import type { WorkerEnv } from '../auth/control-plane.js';
import { isSalesInstallmentsEnabled } from '../auth/features.js';
import { isMoneyInteger, parseMoneyInteger } from '../http/money-input.js';

export { isSalesInstallmentsEnabled };

function parseInstallmentItems(value: unknown): InstallmentPlanItemInput[] | null {
  if (!Array.isArray(value)) return null;
  const items: InstallmentPlanItemInput[] = [];
  for (const raw of value) {
    const item = raw as Record<string, unknown>;
    if (
      !isMoneyInteger(item.installmentNumber) ||
      !isMoneyInteger(item.principalCents) ||
      !isMoneyInteger(item.interestCents) ||
      typeof item.dueDateIso !== 'string'
    ) {
      return null;
    }
    items.push({
      installmentNumber: item.installmentNumber,
      principalCents: item.principalCents,
      interestCents: item.interestCents,
      dueDateIso: item.dueDateIso,
    });
  }
  return items;
}

export interface HttpResult {
  status: number;
  body: Record<string, unknown>;
}

function featureOff(): HttpResult {
  return {
    status: 404,
    body: { error: 'FEATURE_SALES_INSTALLMENTS off', code: 'FEATURE_OFF' },
  };
}

function dbUnavailable(): HttpResult {
  return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
}

const CLIENT_422 = new Set([
  'INSTALLMENT_SCHEDULE_REQUIRED',
  'INSTALLMENT_PRINCIPAL_MISMATCH',
  'INSTALLMENT_INVALID_AMOUNT',
  'INSTALLMENT_INVALID_STATUS',
  'INSTALLMENT_ALREADY_PAID',
  'INSTALLMENT_AR_CLOSED',
  'INSTALLMENT_IDEM_REQUIRED',
  'INSTALLMENT_FORBIDDEN',
  'INSTALLMENT_PLAN_EXISTS',
  'INSTALLMENT_CUSTOMER_REQUIRED',
  'CREDIT_LIMIT_EXCEEDED',
  'AR_PAYMENT_EXCEEDS_BALANCE',
  'INVALID_AR_PAYMENT',
]);

function mapError(err: unknown): HttpResult {
  const code = err instanceof Error ? err.message : 'INSTALLMENT_FAILED';
  if (code === 'INSTALLMENT_NOT_FOUND' || code === 'INSTALLMENT_SALE_NOT_FOUND') {
    return { status: 404, body: { error: code, code } };
  }
  const status = CLIENT_422.has(code) ? 422 : 400;
  return { status, body: { error: code, code } };
}

function opts(env: WorkerEnv | undefined) {
  return {
    ledgerChartOfAccountsEnabled:
      env?.FEATURE_LEDGER_CHART_OF_ACCOUNTS === '1' ||
      env?.FEATURE_LEDGER_CHART_OF_ACCOUNTS === 'true',
  };
}

function supervisorOrAbove(role: string | undefined): boolean {
  return role === 'supervisor' || role === 'admin' || role === 'owner';
}

// eslint-disable-next-line complexity -- create: authz + validación de items/dinero en un solo handler
export async function runCreateInstallmentPlanHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  role: string | undefined,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  if (!isSalesInstallmentsEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  if (!tenantId || !userId) {
    return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  }
  if (!supervisorOrAbove(role)) {
    return { status: 403, body: { error: 'Supervisor+ required', code: 'FORBIDDEN' } };
  }
  const saleId = typeof body.saleId === 'string' ? body.saleId : '';
  const branchId = typeof body.branchId === 'string' ? body.branchId : '';
  const items = parseInstallmentItems(body.items);
  const downPaymentCents = parseMoneyInteger(body.downPaymentCents ?? 0);
  if (!saleId || items === null || items.length === 0 || downPaymentCents === null) {
    return {
      status: 400,
      body: {
        error:
          'saleId and items required; installmentNumber, principalCents, interestCents and downPaymentCents must be integer numbers',
        code: 'BAD_REQUEST',
      },
    };
  }
  try {
    const result = await processInstallmentPlanAtomic(
      env.DB,
      tenantId,
      userId,
      {
        saleId,
        branchId,
        downPaymentCents,
        items,
        creditOverrideTokenHash:
          typeof body.creditOverrideTokenHash === 'string' ? body.creditOverrideTokenHash : null,
        actorIsSupervisorOrAbove: true,
      },
      opts(env),
    );
    return { status: 200, body: result };
  } catch (err) {
    return mapError(err);
  }
}

export async function runPayInstallmentHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  role: string | undefined,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  if (!isSalesInstallmentsEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  if (!tenantId || !userId) {
    return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  }
  if (!supervisorOrAbove(role)) {
    return { status: 403, body: { error: 'Supervisor+ required', code: 'FORBIDDEN' } };
  }
  const parsed = parsePayInstallmentBody(body);
  if (!parsed.ok) {
    return {
      status: 400,
      body: {
        error: 'installmentId, branchId, cashRegisterSessionId, idempotencyKey required',
        code: 'BAD_REQUEST',
      },
    };
  }
  try {
    const result = await processInstallmentPayAtomic(
      env.DB,
      tenantId,
      userId,
      parsed.input,
      opts(env),
    );
    return { status: 200, body: result };
  } catch (err) {
    return mapError(err);
  }
}

function parsePayInstallmentBody(body: Record<string, unknown>): {
  ok: boolean;
  input: {
    installmentId: string;
    branchId: string;
    cashRegisterSessionId: string;
    paymentMethod: string;
    idempotencyKey: string;
    actorIsSupervisorOrAbove: boolean;
    clientPrincipalCents?: number;
    clientInterestCents?: number;
  };
} {
  const installmentId = typeof body.installmentId === 'string' ? body.installmentId : '';
  const branchId = typeof body.branchId === 'string' ? body.branchId : '';
  const cashRegisterSessionId =
    typeof body.cashRegisterSessionId === 'string' ? body.cashRegisterSessionId : '';
  const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '';
  const paymentMethod = typeof body.paymentMethod === 'string' ? body.paymentMethod : 'cash';
  const ok = Boolean(installmentId && branchId && cashRegisterSessionId && idempotencyKey);
  const input: {
    installmentId: string;
    branchId: string;
    cashRegisterSessionId: string;
    paymentMethod: string;
    idempotencyKey: string;
    actorIsSupervisorOrAbove: boolean;
    clientPrincipalCents?: number;
    clientInterestCents?: number;
  } = {
    installmentId,
    branchId,
    cashRegisterSessionId,
    paymentMethod,
    idempotencyKey,
    actorIsSupervisorOrAbove: true,
  };
  if (typeof body.principalCents === 'number') {
    input.clientPrincipalCents = body.principalCents;
  }
  if (typeof body.interestCents === 'number') {
    input.clientInterestCents = body.interestCents;
  }
  return { ok, input };
}

export async function runOwnerInstallmentsOverdueHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
): Promise<HttpResult> {
  if (!isSalesInstallmentsEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  if (!tenantId) {
    return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  }
  const items = await listOverdueInstallments(env.DB, tenantId, new Date().toISOString());
  return { status: 200, body: { items } };
}
