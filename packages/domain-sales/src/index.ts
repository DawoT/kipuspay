export type Cents = number;

import { applyIgvCents, IGV_RATE_PER_MILLE } from './taxes.js';

export { applyIgvCents, IGV_RATE_PER_MILLE } from './taxes.js';

export interface SaleLine {
  readonly productId: string;
  readonly priceCents: Cents;
  readonly qty: number;
}

export interface SaleTotals {
  readonly subtotalCents: Cents;
  readonly igvCents: Cents;
  readonly totalCents: Cents;
}

export function computeSubtotalCents(lines: readonly SaleLine[]): Cents {
  let subtotal: Cents = 0;
  for (const line of lines) {
    subtotal += line.priceCents * line.qty;
  }
  return subtotal;
}

export function buildSaleTotals(lines: readonly SaleLine[]): SaleTotals {
  let subtotalCents = 0;
  let igvCents = 0;
  for (const line of lines) {
    const lineSubtotalCents = line.priceCents * line.qty;
    subtotalCents += lineSubtotalCents;
    igvCents += applyIgvCents(lineSubtotalCents, IGV_RATE_PER_MILLE);
  }
  return {
    subtotalCents,
    igvCents,
    totalCents: subtotalCents + igvCents,
  };
}

export {
  aggregateSaleItems,
  assertOfflineSaleShape,
  assertTipAllowed,
  computeNvLineTotals,
  InsufficientStockError,
  resolveIssuedAtMs,
  splitNvLinesByFefo,
  TIP_DEFAULT_MAX_PERCENT,
  toLimaTimestamp,
  totalDueWithTip,
  totalTipCents,
  type CatalogPriceCost,
  type NvLineCents,
  type NvTotals,
  type OfflinePaymentPayload,
  type OfflineSaleItemPayload,
  type OfflineSalePayload,
} from './offline-sale.js';

export {
  adjustProfileTimestampMs,
  consolidateLocalClientProfiles,
  isAnonymousDocument,
  planCrmLww,
  PROFILE_SKEW_MS,
  type CrmLwwPlan,
  type CrmProfileInput,
  type ExistingCustomer,
} from './crm-lww.js';

export {
  assertItemCancelAuthorized,
  assertOrderBillable,
  assertOrderItemTransition,
  assertOrderTransition,
  DEFAULT_ORDER_STOCK_POLICY,
  KDS_FIRE_SLA_MS,
  planMarkItemsReady,
  planOrderReadyAggregation,
  planOrderStockDeltas,
  planSplitBill,
  resolveOrderStockPolicy,
  type OrderItemStatus,
  type OrderStatus,
  type OrderStockDelta,
  type OrderStockPolicy,
  type SplitPortion,
} from './orders.js';

export {
  assertReturnReason,
  assertReturnWithinWindow,
  daysSinceIssued,
  DEFAULT_RETURN_POLICY,
  parseReturnPolicyRow,
  planReturnLines,
  resolveReturnDocType,
  RETURN_NO_LINES,
  RETURN_OUTSIDE_WINDOW,
  RETURN_QTY_EXCEEDED,
  RETURN_REASON_REQUIRED,
  sumReturnRefundCents,
  windowDaysForMethod,
  type OriginalSaleItem,
  type PlannedReturnLine,
  type ReturnDocType,
  type ReturnLineRequest,
  type ReturnPolicy,
} from './returns.js';

export {
  assertLayawayCancelAllowed,
  assertLayawayConvertible,
  computeLayawayBalanceCents,
  LAYAWAY_ALREADY_CONVERTED,
  LAYAWAY_ALREADY_TERMINAL,
  LAYAWAY_DEPOSIT_EXCEEDS_BALANCE,
  LAYAWAY_INSUFFICIENT_DEPOSIT,
  LAYAWAY_INVALID_AMOUNT,
  LAYAWAY_INVALID_STATUS,
  LAYAWAY_ITEMS_REQUIRED,
  markLayawayOverdue,
  planLayawayCreate,
  planLayawayDeposit,
  type LayawayCreatePlan,
  type LayawayDepositPlan,
  type LayawayItemInput,
  type LayawayStatus,
} from './layaway.js';

export {
  assertQuoteApprovable,
  assertQuoteCancelAllowed,
  assertQuoteConvertible,
  assertQuoteSendable,
  markQuoteExpired,
  planQuoteCreate,
  QUOTE_ALREADY_CONVERTED,
  QUOTE_ALREADY_TERMINAL,
  QUOTE_EXPIRED,
  QUOTE_INVALID_AMOUNT,
  QUOTE_INVALID_STATUS,
  QUOTE_ITEMS_REQUIRED,
  QUOTE_NOT_APPROVED,
  type QuoteCreatePlan,
  type QuoteItemInput,
  type QuoteStatus,
} from './quotes.js';

export {
  assertInstallmentPayable,
  installmentOverdueBlocksCaja,
  markInstallmentOverdue,
  planInstallmentPay,
  planInstallmentSchedule,
  shouldCancelInstallmentsOnArClosed,
  INSTALLMENT_ALREADY_PAID,
  INSTALLMENT_AR_CLOSED,
  INSTALLMENT_FORBIDDEN,
  INSTALLMENT_IDEM_REQUIRED,
  INSTALLMENT_INVALID_AMOUNT,
  INSTALLMENT_INVALID_STATUS,
  INSTALLMENT_PRINCIPAL_MISMATCH,
  INSTALLMENT_SCHEDULE_REQUIRED,
  type InstallmentPayPlan,
  type InstallmentScheduleItemInput,
  type InstallmentScheduleItemPlan,
  type InstallmentSchedulePlan,
  type InstallmentStatus,
} from './installments.js';

export {
  applyCommissionPercentCents,
  assertCommissionNotPayroll,
  assertCommissionPayable,
  assertCommissionVoidable,
  lineCommissionCents,
  planCommissionAccrual,
  planCommissionPayout,
  planCommissionReverse,
  resolveCommissionRate,
  COMMISSION_ALREADY_PAID,
  COMMISSION_FORBIDDEN,
  COMMISSION_INVALID_AMOUNT,
  COMMISSION_INVALID_RATE,
  COMMISSION_INVALID_STATUS,
  COMMISSION_NOTHING_TO_PAY,
  COMMISSION_PAYROLL_FORBIDDEN,
  COMMISSION_SELLER_REQUIRED,
  type CommissionAccrualPlan,
  type CommissionLineInput,
  type CommissionPayoutPlan,
  type CommissionPayoutStatus,
  type CommissionRateRow,
} from './commissions.js';

export {
  assertAndApplyPromotions,
  parseMaxStack,
  parseMaxStackJson,
  parsePromoRule,
  parsePromoRuleJson,
  PROMO_EXPIRED,
  PROMO_INACTIVE,
  PROMO_NOT_ELIGIBLE,
  PROMO_NOT_FOUND,
  PROMO_RULE_INVALID,
  PROMO_STACK_FORBIDDEN,
  type MaxStackConfig,
  type PromoAppliesTo,
  type PromoKind,
  type PromoLineInput,
  type PromoLineResult,
  type PromoRule,
  type PromotionDef,
} from './promotions.js';

export {
  assertCustomerOrderConservation,
  assertCustomerOrderRepricingAuthorized,
  assertCustomerOrderTransition,
  CUSTOMER_ORDER_MAX_ITEMS,
  CUSTOMER_ORDER_MICROUNITS_PER_BASE_UNIT,
  customerOrderRemainingMicrounits,
  decideCustomerOrderClose,
  planCustomerOrderCreate,
  planCustomerOrderFulfillment,
  planCustomerOrderNotification,
  resolveCustomerOrderPrice,
  type CustomerOrderItemInput,
  type CustomerOrderQuantities,
  type CustomerOrderRepricingAuthorization,
  type CustomerOrderRepricingScope,
  type CustomerOrderStatus,
  type CustomerOrderTerminalStatus,
} from './customer-orders.js';

export {
  computeRecurringCatchUp,
  computeRecurringPeriod,
  computeRecurringProration,
  computeRecurringRetry,
  decideRecurringCancellation,
  decideRecurringDelinquency,
  RECURRING_TIMEZONE,
  resolveRecurringOccurrenceItems,
  transitionRecurringStatus,
  versionRecurringPlan,
  type RecurringAfterGracePolicy,
  type RecurringCancellationMode,
  type RecurringFrequency,
  type RecurringPlanItem,
  type RecurringPlanVersion,
  type RecurringPricingPolicy,
  type RecurringStatus,
} from './recurring-sales.js';
