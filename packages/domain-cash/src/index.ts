export type Cents = number;

export type DrawerState = 'closed' | 'open' | 'suspended';

export interface DrawerSnapshot {
  readonly sessionId: string;
  readonly state: DrawerState;
  readonly openingCents: Cents;
  readonly expectedCents: Cents;
  readonly countedCents: Cents | null;
}

export function diffCents(snapshot: DrawerSnapshot): Cents | null {
  if (snapshot.countedCents === null) {
    return null;
  }
  return snapshot.countedCents - snapshot.expectedCents;
}

export function drawIsBalanced(snapshot: DrawerSnapshot): boolean {
  const diff = diffCents(snapshot);
  return diff !== null && diff === 0;
}

export {
  assertPurchaseOrderTransition,
  compensateArOnCreditNote,
  defaultCreditDueDateIso,
  planCreateAp,
  planCreateAr,
  planCreateExpense,
  planPayAp,
  planPayAr,
  planPartialReceive,
  type ApCreatePlan,
  type ApPaymentPlan,
  type ArCompensatePlan,
  type ArCreatePlan,
  type ArPaymentPlan,
  type ArStatus,
  type ExpenseCategory,
  type ExpenseCreatePlan,
  type PartialReceivePlan,
  type PurchaseOrderStatus,
} from './ledger.js';

export {
  assertThreeWayMatch,
  THREE_WAY_MISMATCH,
  THREE_WAY_OVERRIDE_REQUIRED,
  THREE_WAY_QTY_MISMATCH,
  type SupplierInvoiceStatus,
  type ThreeWayLineInput,
  type ThreeWayMatchInput,
  type ThreeWayMatchPlan,
} from './three-way.js';

export {
  assertCreditWithinLimit,
  assertDiscountAuthorized,
  computeExpectedCashCents,
  discountRequiresAuthz,
  planBlindClose,
  planSaleReprint,
  printOutboxPendingCount,
  shouldBlockZForPrintOutbox,
  sumCountLines,
  type BlindClosePlan,
  type CashMovementType,
  type DiscountPolicy,
  type SaleReprintPlan,
} from './blind-z.js';
