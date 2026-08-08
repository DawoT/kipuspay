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
  AP_ALREADY_PAID,
  AP_INSUFFICIENT,
  INSUFFICIENT_STOCK,
  SUPPLIER_RETURN_ALREADY_CLOSED,
  SUPPLIER_RETURN_ALREADY_TERMINAL,
  SUPPLIER_RETURN_COST_MISMATCH,
  SUPPLIER_RETURN_INVALID_AMOUNT,
  SUPPLIER_RETURN_INVALID_STATUS,
  SUPPLIER_RETURN_ITEMS_REQUIRED,
  SUPPLIER_RETURN_QTY_EXCEEDED,
  assertSupplierReturnCancelAllowed,
  assertSupplierReturnClosable,
  assertSupplierReturnStockEnough,
  planSupplierReturnCreate,
  type SupplierReturnApStatus,
  type SupplierReturnClosePlan,
  type SupplierReturnCreatePlan,
  type SupplierReturnItemInput,
  type SupplierReturnStatus,
} from './supplier-return.js';

export {
  STORE_CREDIT_AUTH_REQUIRED,
  STORE_CREDIT_CUSTOMER_REQUIRED,
  STORE_CREDIT_EXPIRED,
  STORE_CREDIT_FORBIDDEN,
  STORE_CREDIT_INSUFFICIENT,
  STORE_CREDIT_INVALID_AMOUNT,
  STORE_CREDIT_NC_NOT_ELIGIBLE,
  STORE_CREDIT_OFFLINE,
  STORE_CREDIT_SOURCE_REQUIRED,
  assertNcCanIssueStoreCredit,
  assertStoreCreditRedeemable,
  giftCardSaleSourceRef,
  ncStoreCreditSourceRef,
  planStoreCreditAdjust,
  planStoreCreditExpire,
  planStoreCreditIssue,
  redeemStoreCreditSourceRef,
  type StoreCreditAdjustPlan,
  type StoreCreditAdjustSign,
  type StoreCreditExpirePlan,
  type StoreCreditIssuePlan,
  type StoreCreditRedeemPlan,
  type StoreCreditTxnType,
} from './store-credit.js';

export {
  assertJournalBalanced,
  GL as JOURNAL_GL,
  JOURNAL_INVALID_LINE,
  JOURNAL_UNBALANCED,
  journalLinesToSignedAmounts,
  planApPaymentJournal,
  planArPaymentJournal,
  planCashCountJournal,
  planLayawayDepositJournal,
  planLayawayRefundJournal,
  planSaleJournal,
  planSalesReturnJournal,
  planStoreCreditAdjustJournal,
  planStoreCreditExpireJournal,
  planSupplierInvoiceJournal,
  planSupplierReturnJournal,
  SEED_CHART_OF_ACCOUNTS,
  type ChartAccountType,
  type JournalEntryPlan,
  type JournalLinePlan,
  type JournalSourceType,
  type SaleJournalPayment,
  type SeedChartAccount,
} from './journal.js';

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
