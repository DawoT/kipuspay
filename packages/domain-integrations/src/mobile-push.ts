export const PUSH_EVENT_TYPES = [
  'CASH_CLOSE',
  'CASH_DISCREPANCY',
  'INVENTORY_STOCKOUT',
  'INSTALLMENT_OVERDUE',
  'ACCOUNTS_RECEIVABLE_OVERDUE',
  'CUSTOMER_ORDER_EXPIRY',
  'RECURRING_GRACE',
  'BILLING_REMINDER',
  'CERT_EXPIRY_WARNING',
] as const;

export type PushEventType = (typeof PUSH_EVENT_TYPES)[number];
export type PushPrivacyMode = 'REDACTED' | 'AMOUNTS';
export type PushDisplayContext = 'NORMAL' | 'OFFLINE' | 'DOZE';
export type PushTarget =
  | { readonly scope: 'OWNER_ALERTS'; readonly userId?: never; readonly branchId?: never }
  | { readonly scope: 'OPERATIONAL_MOBILE'; readonly userId: string; readonly branchId: string };

export function validatePushTarget(target: PushTarget): PushTarget {
  if (target.scope === 'OPERATIONAL_MOBILE' && (!target.userId.trim() || !target.branchId.trim())) {
    throw new Error('PUSH_OPERATIONAL_TARGET_REQUIRED');
  }
  return target;
}

const DEEP_LINK_KINDS = new Set([
  'cash_close',
  'cash_discrepancy',
  'inventory',
  'installment',
  'accounts_receivable',
  'customer_order',
  'recurring_sale',
  'billing',
  'cert_expiry',
]);

const COPY: Readonly<Record<PushEventType, { readonly title: string; readonly body: string }>> = {
  CASH_CLOSE: { title: 'Cierre de caja', body: 'Abre KipusPay para ver el detalle' },
  CASH_DISCREPANCY: { title: 'Alerta de caja', body: 'Abre KipusPay para ver el detalle' },
  INVENTORY_STOCKOUT: { title: 'Alerta de inventario', body: 'Abre KipusPay para ver el detalle' },
  INSTALLMENT_OVERDUE: { title: 'Cuota vencida', body: 'Abre KipusPay para ver el detalle' },
  ACCOUNTS_RECEIVABLE_OVERDUE: {
    title: 'Cuenta por cobrar vencida',
    body: 'Abre KipusPay para ver el detalle',
  },
  CUSTOMER_ORDER_EXPIRY: { title: 'Pedido por vencer', body: 'Abre KipusPay para ver el detalle' },
  RECURRING_GRACE: {
    title: 'Venta recurrente en gracia',
    body: 'Abre KipusPay para ver el detalle',
  },
  BILLING_REMINDER: {
    title: 'Recordatorio de KipusPay',
    body: 'Abre KipusPay para ver el detalle',
  },
  CERT_EXPIRY_WARNING: {
    title: 'Tu certificado SUNAT está por vencer',
    body: 'Abre KipusPay para ver el detalle',
  },
};

export function evaluatePushPrivacy(input: {
  readonly requestedMode?: PushPrivacyMode;
  readonly tenantAmountsPolicyEnabled: boolean;
  readonly ownerAmountsOptIn: boolean;
  readonly role: string;
}): PushPrivacyMode {
  return input.requestedMode === 'AMOUNTS' &&
    input.tenantAmountsPolicyEnabled &&
    input.ownerAmountsOptIn &&
    input.role.toLowerCase() === 'owner'
    ? 'AMOUNTS'
    : 'REDACTED';
}

export interface LockscreenPayload {
  readonly eventType: PushEventType;
  readonly title: string;
  readonly body: string;
  readonly amount_cents?: number;
  readonly deepLink: {
    readonly kind: string;
    readonly entityId: string;
  };
}

export function buildLockscreenPayload(input: {
  readonly eventType: PushEventType;
  readonly privacyMode: PushPrivacyMode;
  readonly amount_cents?: number;
  readonly deepLinkKind: string;
  readonly deepLinkEntityId: string;
  readonly forbiddenSource?: unknown;
}): LockscreenPayload {
  if (!PUSH_EVENT_TYPES.includes(input.eventType)) throw new Error('PUSH_EVENT_TYPE_INVALID');
  if (!DEEP_LINK_KINDS.has(input.deepLinkKind)) throw new Error('PUSH_DEEP_LINK_NOT_ALLOWED');
  if (!input.deepLinkEntityId.trim()) throw new Error('PUSH_DEEP_LINK_ENTITY_REQUIRED');
  if (
    input.amount_cents !== undefined &&
    (!Number.isSafeInteger(input.amount_cents) || input.amount_cents < 0)
  ) {
    throw new Error('PUSH_AMOUNT_INVALID');
  }
  return {
    eventType: input.eventType,
    ...COPY[input.eventType],
    ...(input.privacyMode === 'AMOUNTS' && input.amount_cents !== undefined
      ? { amount_cents: input.amount_cents }
      : {}),
    deepLink: {
      kind: input.deepLinkKind,
      entityId: input.deepLinkEntityId,
    },
  };
}

export function summarizeDisplayedSlo(
  samples: readonly {
    readonly createdAtMs: number;
    readonly acceptedAtMs: number | null;
    readonly displayedAtMs: number | null;
    readonly context: PushDisplayContext;
  }[],
): {
  readonly normalNetworkSamples: number;
  readonly displayedRate: number;
  readonly p95Ms: number | null;
  readonly excluded: { readonly DOZE: number; readonly OFFLINE: number };
  readonly passes: boolean;
} {
  const normal = samples.filter((sample) => sample.context === 'NORMAL');
  const displayedLatencies = normal
    .filter((sample) => sample.displayedAtMs !== null)
    .map((sample) => Math.max(0, sample.displayedAtMs! - sample.createdAtMs))
    .sort((left, right) => left - right);
  const displayedRate = normal.length === 0 ? 0 : displayedLatencies.length / normal.length;
  const p95Index = Math.max(0, Math.ceil(displayedLatencies.length * 0.95) - 1);
  const p95Ms = displayedLatencies[p95Index] ?? null;
  const excluded = {
    DOZE: samples.filter((sample) => sample.context === 'DOZE').length,
    OFFLINE: samples.filter((sample) => sample.context === 'OFFLINE').length,
  };
  return {
    normalNetworkSamples: normal.length,
    displayedRate,
    p95Ms,
    excluded,
    passes: normal.length > 0 && displayedRate >= 0.99 && p95Ms !== null && p95Ms < 10_000,
  };
}
