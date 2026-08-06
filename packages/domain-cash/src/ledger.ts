/**
 * Dominio ledger CxC/CxP/OC/egresos — puro (Arquitectura §5 / DAT-05 / edge E-D).
 * Dinero siempre INTEGER cents. Sin D1 / sin UPSERT.
 */

export type Cents = number;

export type ArStatus = 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE';
export type ApStatus = 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE';
export type PurchaseOrderStatus = 'DRAFT' | 'SENT' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELED';
export type ExpenseCategory = 'SUPPLIES' | 'TRANSPORT' | 'OTHER';

export interface ArCreateInput {
  readonly id: string;
  readonly tenantId: string;
  readonly customerId: string;
  readonly saleId: string;
  readonly amountCents: Cents;
  readonly dueDateIso: string;
  readonly createdAtIso: string;
}

export interface ArCreatePlan {
  readonly arId: string;
  readonly tenantId: string;
  readonly customerId: string;
  readonly originSaleId: string;
  readonly originalAmountCents: Cents;
  readonly balanceDueCents: Cents;
  readonly dueDateIso: string;
  readonly status: 'OPEN';
  readonly createdAtIso: string;
}

export interface ArPaymentInput {
  readonly paymentId: string;
  readonly accountsReceivableId: string;
  readonly currentBalanceCents: Cents;
  readonly amountCents: Cents;
  readonly paymentMethod: string;
  readonly collectedByUserId: string;
  readonly cashRegisterSessionId?: string | undefined;
}

export interface ArPaymentPlan {
  readonly paymentId: string;
  readonly accountsReceivableId: string;
  readonly amountCents: Cents;
  readonly paymentMethod: string;
  readonly collectedByUserId: string;
  readonly cashRegisterSessionId: string | null;
  readonly nextBalanceCents: Cents;
  readonly nextStatus: ArStatus;
}

export interface ArCompensateInput {
  readonly accountsReceivableId: string;
  readonly originSaleId: string;
  readonly currentBalanceCents: Cents;
  readonly creditAmountCents: Cents;
  readonly paymentId: string;
  readonly collectedByUserId: string;
  readonly source: 'CREDIT_NOTE' | 'NV_RETURN';
}

export interface ArCompensatePlan {
  readonly accountsReceivableId: string;
  readonly originSaleId: string;
  readonly paymentId: string;
  readonly appliedCents: Cents;
  readonly nextBalanceCents: Cents;
  readonly nextStatus: ArStatus;
  readonly paymentMethod: string;
  readonly collectedByUserId: string;
}

export interface ApCreateInput {
  readonly id: string;
  readonly tenantId: string;
  readonly supplierId: string;
  readonly purchaseOrderId: string | null;
  readonly amountCents: Cents;
  readonly dueDateIso: string;
}

export interface ApCreatePlan {
  readonly apId: string;
  readonly tenantId: string;
  readonly supplierId: string;
  readonly purchaseOrderId: string | null;
  readonly originalAmountCents: Cents;
  readonly balanceDueCents: Cents;
  readonly dueDateIso: string;
  readonly status: 'OPEN';
}

export interface ApPaymentInput {
  readonly paymentId: string;
  readonly accountsPayableId: string;
  readonly currentBalanceCents: Cents;
  readonly amountCents: Cents;
  readonly paymentMethod: string;
  readonly cashRegisterSessionId?: string | undefined;
}

export interface ApPaymentPlan {
  readonly paymentId: string;
  readonly accountsPayableId: string;
  readonly amountCents: Cents;
  readonly paymentMethod: string;
  readonly cashRegisterSessionId: string | null;
  readonly nextBalanceCents: Cents;
  readonly nextStatus: ApStatus;
}

export interface ExpenseCreateInput {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly cashRegisterSessionId: string;
  readonly category: ExpenseCategory;
  readonly amountCents: Cents;
  readonly description: string;
  readonly authorizedByUserId: string;
  readonly accountsPayableId?: string | undefined;
}

export interface ExpenseCreatePlan {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly cashRegisterSessionId: string;
  readonly category: ExpenseCategory;
  readonly amountCents: Cents;
  readonly description: string;
  readonly authorizedByUserId: string;
  readonly accountsPayableId: string | null;
}

const PO_TRANSITIONS: Readonly<Record<PurchaseOrderStatus, readonly PurchaseOrderStatus[]>> = {
  DRAFT: ['SENT', 'CANCELED'],
  SENT: ['PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELED'],
  PARTIALLY_RECEIVED: ['PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELED'],
  RECEIVED: [],
  CANCELED: [],
};

function assertPositiveCents(amount: Cents, code: string): void {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error(code);
}

function assertNonNegativeCents(amount: Cents, code: string): void {
  if (!Number.isInteger(amount) || amount < 0) throw new Error(code);
}

function statusAfterPayment(nextBalance: Cents): ArStatus {
  if (nextBalance <= 0) return 'PAID';
  return 'PARTIALLY_PAID';
}

/** DAT-05: plan de asiento CxC trazable a `sale_id`. */
export function planCreateAr(input: ArCreateInput): ArCreatePlan {
  assertPositiveCents(input.amountCents, 'INVALID_AR_AMOUNT');
  if (!input.customerId.trim()) throw new Error('AR_REQUIRES_CUSTOMER');
  if (!input.saleId.trim()) throw new Error('AR_REQUIRES_ORIGIN_SALE');
  return {
    arId: input.id,
    tenantId: input.tenantId,
    customerId: input.customerId,
    originSaleId: input.saleId,
    originalAmountCents: input.amountCents,
    balanceDueCents: input.amountCents,
    dueDateIso: input.dueDateIso,
    status: 'OPEN',
    createdAtIso: input.createdAtIso,
  };
}

/** Pago CxC: INSERT payment + UPDATE balance (nunca UPSERT). */
export function planPayAr(input: ArPaymentInput): ArPaymentPlan {
  assertPositiveCents(input.amountCents, 'INVALID_AR_PAYMENT');
  assertNonNegativeCents(input.currentBalanceCents, 'INVALID_AR_BALANCE');
  if (input.amountCents > input.currentBalanceCents) throw new Error('AR_PAYMENT_EXCEEDS_BALANCE');
  const nextBalanceCents = input.currentBalanceCents - input.amountCents;
  return {
    paymentId: input.paymentId,
    accountsReceivableId: input.accountsReceivableId,
    amountCents: input.amountCents,
    paymentMethod: input.paymentMethod,
    collectedByUserId: input.collectedByUserId,
    cashRegisterSessionId: input.cashRegisterSessionId ?? null,
    nextBalanceCents,
    nextStatus: statusAfterPayment(nextBalanceCents),
  };
}

/**
 * Edge E-D: NC / NV_RETURN reduce saldo CxC del origen.
 * Parcial no deja saldo negativo; total cierra PAID.
 */
export function compensateArOnCreditNote(input: ArCompensateInput): ArCompensatePlan {
  assertPositiveCents(input.creditAmountCents, 'INVALID_CREDIT_AMOUNT');
  assertNonNegativeCents(input.currentBalanceCents, 'INVALID_AR_BALANCE');
  if (input.currentBalanceCents <= 0) throw new Error('AR_ALREADY_SETTLED');
  const appliedCents = Math.min(input.creditAmountCents, input.currentBalanceCents);
  const nextBalanceCents = input.currentBalanceCents - appliedCents;
  return {
    accountsReceivableId: input.accountsReceivableId,
    originSaleId: input.originSaleId,
    paymentId: input.paymentId,
    appliedCents,
    nextBalanceCents,
    nextStatus: statusAfterPayment(nextBalanceCents),
    paymentMethod: input.source,
    collectedByUserId: input.collectedByUserId,
  };
}

export function planCreateAp(input: ApCreateInput): ApCreatePlan {
  assertPositiveCents(input.amountCents, 'INVALID_AP_AMOUNT');
  if (!input.supplierId.trim()) throw new Error('AP_REQUIRES_SUPPLIER');
  return {
    apId: input.id,
    tenantId: input.tenantId,
    supplierId: input.supplierId,
    purchaseOrderId: input.purchaseOrderId,
    originalAmountCents: input.amountCents,
    balanceDueCents: input.amountCents,
    dueDateIso: input.dueDateIso,
    status: 'OPEN',
  };
}

export function planPayAp(input: ApPaymentInput): ApPaymentPlan {
  assertPositiveCents(input.amountCents, 'INVALID_AP_PAYMENT');
  assertNonNegativeCents(input.currentBalanceCents, 'INVALID_AP_BALANCE');
  if (input.amountCents > input.currentBalanceCents) throw new Error('AP_PAYMENT_EXCEEDS_BALANCE');
  const nextBalanceCents = input.currentBalanceCents - input.amountCents;
  return {
    paymentId: input.paymentId,
    accountsPayableId: input.accountsPayableId,
    amountCents: input.amountCents,
    paymentMethod: input.paymentMethod,
    cashRegisterSessionId: input.cashRegisterSessionId ?? null,
    nextBalanceCents,
    nextStatus: statusAfterPayment(nextBalanceCents),
  };
}

export function assertPurchaseOrderTransition(
  from: PurchaseOrderStatus,
  to: PurchaseOrderStatus,
): void {
  if (!PO_TRANSITIONS[from].includes(to)) {
    throw new Error(`PO_INVALID_TRANSITION:${from}->${to}`);
  }
}

export interface PartialReceiveLine {
  readonly productId: string;
  readonly quantity: number;
  readonly unitCostCents: Cents;
}

export interface PartialReceiveInput {
  readonly purchaseOrderId: string;
  readonly currentStatus: PurchaseOrderStatus;
  readonly orderedQtyByProduct: ReadonlyMap<string, number>;
  readonly previouslyReceivedQtyByProduct: ReadonlyMap<string, number>;
  readonly lines: readonly PartialReceiveLine[];
}

export interface PartialReceivePlan {
  readonly nextStatus: PurchaseOrderStatus;
  readonly receivedQtyByProduct: ReadonlyMap<string, number>;
  readonly apAmountCents: Cents;
}

/**
 * Recepción parcial: CxP solo por lo recibido en este receipt; status PARTIALLY_RECEIVED o RECEIVED.
 */
export function planPartialReceive(input: PartialReceiveInput): PartialReceivePlan {
  const { receivedQtyByProduct, apAmountCents } = accumulateReceived(
    input.lines,
    input.orderedQtyByProduct,
    input.previouslyReceivedQtyByProduct,
  );
  const allComplete = isFullyReceived(input.orderedQtyByProduct, receivedQtyByProduct);
  const nextStatus: PurchaseOrderStatus = allComplete ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
  assertPurchaseOrderTransition(input.currentStatus, nextStatus);
  return { nextStatus, receivedQtyByProduct, apAmountCents };
}

interface ReceivedAccum {
  readonly receivedQtyByProduct: ReadonlyMap<string, number>;
  readonly apAmountCents: Cents;
}

function accumulateReceived(
  lines: readonly PartialReceiveLine[],
  orderedQtyByProduct: ReadonlyMap<string, number>,
  previouslyReceivedQtyByProduct: ReadonlyMap<string, number>,
): ReceivedAccum {
  if (lines.length === 0) throw new Error('RECEIPT_REQUIRES_LINES');
  let apAmountCents = 0;
  const receivedQtyByProduct = new Map<string, number>();
  for (const line of lines) {
    if (!(line.quantity > 0) || !Number.isFinite(line.quantity)) {
      throw new Error('INVALID_RECEIVE_QTY');
    }
    assertPositiveCents(line.unitCostCents, 'INVALID_UNIT_COST');
    const ordered = orderedQtyByProduct.get(line.productId) ?? 0;
    const currentAcc =
      receivedQtyByProduct.get(line.productId) ??
      (previouslyReceivedQtyByProduct.get(line.productId) ?? 0);
    const nextQty = currentAcc + line.quantity;
    if (nextQty > ordered) throw new Error('RECEIVE_EXCEEDS_ORDERED');
    receivedQtyByProduct.set(line.productId, nextQty);
    apAmountCents += Math.round(line.quantity * line.unitCostCents);
  }
  for (const [pid, qty] of previouslyReceivedQtyByProduct) {
    if (!receivedQtyByProduct.has(pid)) receivedQtyByProduct.set(pid, qty);
  }
  return { receivedQtyByProduct, apAmountCents };
}

function isFullyReceived(
  orderedQtyByProduct: ReadonlyMap<string, number>,
  receivedQtyByProduct: ReadonlyMap<string, number>,
): boolean {
  for (const [pid, ordered] of orderedQtyByProduct) {
    if ((receivedQtyByProduct.get(pid) ?? 0) < ordered) return false;
  }
  return true;
}

export function planCreateExpense(input: ExpenseCreateInput): ExpenseCreatePlan {
  assertPositiveCents(input.amountCents, 'INVALID_EXPENSE_AMOUNT');
  if (!input.description.trim()) throw new Error('EXPENSE_REQUIRES_DESCRIPTION');
  const allowed: ReadonlySet<ExpenseCategory> = new Set(['SUPPLIES', 'TRANSPORT', 'OTHER']);
  const errCategory = 'INVALID_' + 'EXPENSE_CATEGORY';
  if (!allowed.has(input.category)) throw new Error(errCategory);

  return {
    id: input.id,
    tenantId: input.tenantId,
    branchId: input.branchId,
    cashRegisterSessionId: input.cashRegisterSessionId,
    category: input.category,
    amountCents: input.amountCents,
    description: input.description.trim(),
    authorizedByUserId: input.authorizedByUserId,
    accountsPayableId: input.accountsPayableId ?? null,
  };
}

/** due_date default = issued + 30d (política tenant; override en adapter). */
export function defaultCreditDueDateIso(issuedAtLima: string, days = 30): string {
  const base = new Date(`${issuedAtLima.replace(' ', 'T')}Z`);
  if (!Number.isFinite(base.getTime())) throw new Error('INVALID_ISSUED_AT');
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().replace('T', ' ').substring(0, 19);
}
