/**
 * Diario contable — Arquitectura §5.3 regla 17 / ADR-0016. Puro, sin D1.
 * Bit-consistente con buildAccountingEntries (S23) + 2101 anticipos / 2102 store credit / 2011 CxP.
 */

export const JOURNAL_UNBALANCED = 'JOURNAL_UNBALANCED';
export const JOURNAL_INVALID_LINE = 'JOURNAL_INVALID_LINE';

export const GL = {
  CASH: '1011',
  AR: '1212',
  AP: '2011',
  CUSTOMER_DEPOSIT: '2101',
  STORE_CREDIT: '2102',
  VAT: '4011',
  PURCHASES: '6011',
  CASH_OVER_SHORT: '6591',
  SALES: '7011',
} as const;

export type ChartAccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

export interface SeedChartAccount {
  readonly code: string;
  readonly name: string;
  readonly type: ChartAccountType;
}

export const SEED_CHART_OF_ACCOUNTS: readonly SeedChartAccount[] = [
  { code: GL.CASH, name: 'Caja y bancos', type: 'ASSET' },
  { code: GL.AR, name: 'Cuentas por cobrar', type: 'ASSET' },
  { code: GL.AP, name: 'Cuentas por pagar', type: 'LIABILITY' },
  { code: GL.CUSTOMER_DEPOSIT, name: 'Anticipos de clientes', type: 'LIABILITY' },
  { code: GL.STORE_CREDIT, name: 'Créditos de tienda', type: 'LIABILITY' },
  { code: GL.VAT, name: 'IGV por pagar', type: 'LIABILITY' },
  { code: GL.PURCHASES, name: 'Compras', type: 'EXPENSE' },
  { code: GL.CASH_OVER_SHORT, name: 'Faltantes y sobrantes de caja', type: 'EXPENSE' },
  { code: GL.SALES, name: 'Ventas', type: 'REVENUE' },
];

export type JournalSourceType =
  | 'SALE'
  | 'PAYMENT'
  | 'SUPPLIER_INVOICE'
  | 'AR_AP'
  | 'CASH_COUNT'
  | 'LAYAWAY'
  | 'SALES_RETURN'
  | 'SUPPLIER_RETURN'
  | 'STORE_CREDIT';

export interface JournalLinePlan {
  readonly code: string;
  readonly debitCents: number;
  readonly creditCents: number;
  readonly memo: string;
}

export interface JournalEntryPlan {
  readonly sourceType: JournalSourceType;
  readonly sourceId: string;
  readonly postDate: string;
  readonly balancedCents: 0;
  readonly lines: readonly JournalLinePlan[];
}

export interface SaleJournalPayment {
  readonly methodCode: string;
  readonly amountCents: number;
}

export function assertJournalBalanced(lines: readonly JournalLinePlan[]): 0 {
  if (lines.length === 0) throw new Error(JOURNAL_UNBALANCED);
  let debit = 0;
  let credit = 0;
  for (const line of lines) {
    if (!Number.isInteger(line.debitCents) || !Number.isInteger(line.creditCents)) {
      throw new Error(JOURNAL_INVALID_LINE);
    }
    if (line.debitCents < 0 || line.creditCents < 0) throw new Error(JOURNAL_INVALID_LINE);
    const debitOnly = line.debitCents > 0 && line.creditCents === 0;
    const creditOnly = line.creditCents > 0 && line.debitCents === 0;
    if (!debitOnly && !creditOnly) throw new Error(JOURNAL_INVALID_LINE);
    debit += line.debitCents;
    credit += line.creditCents;
  }
  if (debit !== credit) throw new Error(JOURNAL_UNBALANCED);
  return 0;
}

export function planSaleJournal(input: {
  readonly sourceId: string;
  readonly postDate: string;
  readonly totalCents: number;
  readonly taxCents: number;
  readonly payments: readonly SaleJournalPayment[];
  readonly storeCreditIssueCents?: number;
}): JournalEntryPlan {
  const payments =
    input.payments.length > 0
      ? input.payments
      : [{ methodCode: 'cash', amountCents: input.totalCents }];
  const isDepositMethod = (code: string) => code === 'anticipo' || code === 'layaway_deposit';
  const isStoreCreditMethod = (code: string) => code === 'store_credit';
  const depositCents = payments
    .filter((p) => isDepositMethod(p.methodCode))
    .reduce((acc, p) => acc + Math.max(0, p.amountCents), 0);
  const storeCreditPayCents = payments
    .filter((p) => isStoreCreditMethod(p.methodCode))
    .reduce((acc, p) => acc + Math.max(0, p.amountCents), 0);
  const cashCents = payments
    .filter(
      (p) =>
        p.methodCode !== 'credit' &&
        !isDepositMethod(p.methodCode) &&
        !isStoreCreditMethod(p.methodCode),
    )
    .reduce((acc, p) => acc + Math.max(0, p.amountCents), 0);
  const creditCents = payments
    .filter((p) => p.methodCode === 'credit')
    .reduce((acc, p) => acc + Math.max(0, p.amountCents), 0);
  const arRemainder =
    input.totalCents - cashCents - creditCents - depositCents - storeCreditPayCents;
  const netCents = input.totalCents - input.taxCents;
  const issueCents = Math.max(0, input.storeCreditIssueCents ?? 0);
  const lines: JournalLinePlan[] = [];
  if (depositCents > 0) {
    lines.push({
      code: GL.CUSTOMER_DEPOSIT,
      debitCents: depositCents,
      creditCents: 0,
      memo: `sale:${input.sourceId}:debit:deposit`,
    });
  }
  if (storeCreditPayCents > 0) {
    lines.push({
      code: GL.STORE_CREDIT,
      debitCents: storeCreditPayCents,
      creditCents: 0,
      memo: `sale:${input.sourceId}:debit:store-credit`,
    });
  }
  if (cashCents > 0) {
    lines.push({
      code: GL.CASH,
      debitCents: cashCents,
      creditCents: 0,
      memo: `sale:${input.sourceId}:debit:cash`,
    });
  }
  if (creditCents + arRemainder > 0) {
    lines.push({
      code: GL.AR,
      debitCents: creditCents + arRemainder,
      creditCents: 0,
      memo: `sale:${input.sourceId}:debit:ar`,
    });
  }
  if (issueCents > 0) {
    lines.push({
      code: GL.STORE_CREDIT,
      debitCents: 0,
      creditCents: netCents,
      memo: `sale:${input.sourceId}:store-credit-issue`,
    });
  } else {
    lines.push({
      code: GL.SALES,
      debitCents: 0,
      creditCents: netCents,
      memo: `sale:${input.sourceId}:sales`,
    });
  }
  if (input.taxCents > 0) {
    lines.push({
      code: GL.VAT,
      debitCents: 0,
      creditCents: input.taxCents,
      memo: `sale:${input.sourceId}:vat`,
    });
  }
  return {
    sourceType: 'SALE',
    sourceId: input.sourceId,
    postDate: input.postDate,
    balancedCents: assertJournalBalanced(lines),
    lines,
  };
}

export function planLayawayDepositJournal(input: {
  readonly sourceId: string;
  readonly postDate: string;
  readonly amountCents: number;
}): JournalEntryPlan {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error(JOURNAL_INVALID_LINE);
  }
  const lines: JournalLinePlan[] = [
    {
      code: GL.CASH,
      debitCents: input.amountCents,
      creditCents: 0,
      memo: `layaway:${input.sourceId}:deposit:cash`,
    },
    {
      code: GL.CUSTOMER_DEPOSIT,
      debitCents: 0,
      creditCents: input.amountCents,
      memo: `layaway:${input.sourceId}:deposit:liability`,
    },
  ];
  return {
    sourceType: 'LAYAWAY',
    sourceId: input.sourceId,
    postDate: input.postDate,
    balancedCents: assertJournalBalanced(lines),
    lines,
  };
}

export function planLayawayRefundJournal(input: {
  readonly sourceId: string;
  readonly postDate: string;
  readonly amountCents: number;
}): JournalEntryPlan {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error(JOURNAL_INVALID_LINE);
  }
  const lines: JournalLinePlan[] = [
    {
      code: GL.CUSTOMER_DEPOSIT,
      debitCents: input.amountCents,
      creditCents: 0,
      memo: `layaway:${input.sourceId}:refund:liability`,
    },
    {
      code: GL.CASH,
      debitCents: 0,
      creditCents: input.amountCents,
      memo: `layaway:${input.sourceId}:refund:cash`,
    },
  ];
  return {
    sourceType: 'LAYAWAY',
    sourceId: input.sourceId,
    postDate: input.postDate,
    balancedCents: assertJournalBalanced(lines),
    lines,
  };
}

export function planArPaymentJournal(input: {
  readonly sourceId: string;
  readonly postDate: string;
  readonly amountCents: number;
}): JournalEntryPlan {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error(JOURNAL_INVALID_LINE);
  }
  const lines: JournalLinePlan[] = [
    {
      code: GL.CASH,
      debitCents: input.amountCents,
      creditCents: 0,
      memo: `ar:${input.sourceId}:cash`,
    },
    {
      code: GL.AR,
      debitCents: 0,
      creditCents: input.amountCents,
      memo: `ar:${input.sourceId}:settle`,
    },
  ];
  return {
    sourceType: 'AR_AP',
    sourceId: input.sourceId,
    postDate: input.postDate,
    balancedCents: assertJournalBalanced(lines),
    lines,
  };
}

export function planApPaymentJournal(input: {
  readonly sourceId: string;
  readonly postDate: string;
  readonly amountCents: number;
}): JournalEntryPlan {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error(JOURNAL_INVALID_LINE);
  }
  const lines: JournalLinePlan[] = [
    {
      code: GL.AP,
      debitCents: input.amountCents,
      creditCents: 0,
      memo: `ap:${input.sourceId}:settle`,
    },
    {
      code: GL.CASH,
      debitCents: 0,
      creditCents: input.amountCents,
      memo: `ap:${input.sourceId}:cash`,
    },
  ];
  return {
    sourceType: 'AR_AP',
    sourceId: input.sourceId,
    postDate: input.postDate,
    balancedCents: assertJournalBalanced(lines),
    lines,
  };
}

export function planSupplierInvoiceJournal(input: {
  readonly sourceId: string;
  readonly postDate: string;
  readonly amountCents: number;
}): JournalEntryPlan {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error(JOURNAL_INVALID_LINE);
  }
  const lines: JournalLinePlan[] = [
    {
      code: GL.PURCHASES,
      debitCents: input.amountCents,
      creditCents: 0,
      memo: `ap:${input.sourceId}:invoice`,
    },
    {
      code: GL.AP,
      debitCents: 0,
      creditCents: input.amountCents,
      memo: `ap:${input.sourceId}:liability`,
    },
  ];
  return {
    sourceType: 'SUPPLIER_INVOICE',
    sourceId: input.sourceId,
    postDate: input.postDate,
    balancedCents: assertJournalBalanced(lines),
    lines,
  };
}

export function planCashCountJournal(input: {
  readonly sourceId: string;
  readonly postDate: string;
  readonly differenceCents: number;
}): JournalEntryPlan | null {
  if (!Number.isInteger(input.differenceCents) || input.differenceCents === 0) return null;
  const abs = Math.abs(input.differenceCents);
  const over = input.differenceCents > 0;
  const lines: JournalLinePlan[] = over
    ? [
        {
          code: GL.CASH,
          debitCents: abs,
          creditCents: 0,
          memo: `z:${input.sourceId}:over`,
        },
        {
          code: GL.CASH_OVER_SHORT,
          debitCents: 0,
          creditCents: abs,
          memo: `z:${input.sourceId}:over-short`,
        },
      ]
    : [
        {
          code: GL.CASH_OVER_SHORT,
          debitCents: abs,
          creditCents: 0,
          memo: `z:${input.sourceId}:short`,
        },
        {
          code: GL.CASH,
          debitCents: 0,
          creditCents: abs,
          memo: `z:${input.sourceId}:short-cash`,
        },
      ];
  return {
    sourceType: 'CASH_COUNT',
    sourceId: input.sourceId,
    postDate: input.postDate,
    balancedCents: assertJournalBalanced(lines),
    lines,
  };
}

export function planStoreCreditExpireJournal(input: {
  readonly sourceId: string;
  readonly postDate: string;
  readonly amountCents: number;
}): JournalEntryPlan {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error(JOURNAL_INVALID_LINE);
  }
  const lines: JournalLinePlan[] = [
    {
      code: GL.STORE_CREDIT,
      debitCents: input.amountCents,
      creditCents: 0,
      memo: `store-credit:${input.sourceId}:expire`,
    },
    {
      code: GL.SALES,
      debitCents: 0,
      creditCents: input.amountCents,
      memo: `store-credit:${input.sourceId}:expire-income`,
    },
  ];
  return {
    sourceType: 'STORE_CREDIT',
    sourceId: input.sourceId,
    postDate: input.postDate,
    balancedCents: assertJournalBalanced(lines),
    lines,
  };
}

export function planStoreCreditAdjustJournal(input: {
  readonly sourceId: string;
  readonly postDate: string;
  readonly amountCents: number;
  readonly adjustSign: 'CREDIT' | 'DEBIT';
}): JournalEntryPlan {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error(JOURNAL_INVALID_LINE);
  }
  const creditLiability = input.adjustSign === 'CREDIT';
  const lines: JournalLinePlan[] = creditLiability
    ? [
        {
          code: GL.CASH_OVER_SHORT,
          debitCents: input.amountCents,
          creditCents: 0,
          memo: `store-credit:${input.sourceId}:adjust-debit`,
        },
        {
          code: GL.STORE_CREDIT,
          debitCents: 0,
          creditCents: input.amountCents,
          memo: `store-credit:${input.sourceId}:adjust-liability`,
        },
      ]
    : [
        {
          code: GL.STORE_CREDIT,
          debitCents: input.amountCents,
          creditCents: 0,
          memo: `store-credit:${input.sourceId}:adjust-liability`,
        },
        {
          code: GL.CASH_OVER_SHORT,
          debitCents: 0,
          creditCents: input.amountCents,
          memo: `store-credit:${input.sourceId}:adjust-credit`,
        },
      ];
  return {
    sourceType: 'STORE_CREDIT',
    sourceId: input.sourceId,
    postDate: input.postDate,
    balancedCents: assertJournalBalanced(lines),
    lines,
  };
}

export function planSupplierReturnJournal(input: {
  readonly sourceId: string;
  readonly postDate: string;
  readonly amountCents: number;
}): JournalEntryPlan {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error(JOURNAL_INVALID_LINE);
  }
  const lines: JournalLinePlan[] = [
    {
      code: GL.AP,
      debitCents: input.amountCents,
      creditCents: 0,
      memo: `ap:${input.sourceId}:return`,
    },
    {
      code: GL.PURCHASES,
      debitCents: 0,
      creditCents: input.amountCents,
      memo: `ap:${input.sourceId}:purchase-reversal`,
    },
  ];
  return {
    sourceType: 'SUPPLIER_RETURN',
    sourceId: input.sourceId,
    postDate: input.postDate,
    balancedCents: assertJournalBalanced(lines),
    lines,
  };
}

export function planSalesReturnJournal(input: {
  readonly sourceId: string;
  readonly postDate: string;
  readonly totalCents: number;
  readonly taxCents: number;
  readonly payments: readonly SaleJournalPayment[];
}): JournalEntryPlan {
  const sale = planSaleJournal(input);
  const lines = sale.lines.map((line) => ({
    code: line.code,
    debitCents: line.creditCents,
    creditCents: line.debitCents,
    memo: line.memo.replace('sale:', 'return:'),
  }));
  return {
    sourceType: 'SALES_RETURN',
    sourceId: input.sourceId,
    postDate: input.postDate,
    balancedCents: assertJournalBalanced(lines),
    lines,
  };
}

export function journalLinesToSignedAmounts(
  lines: readonly JournalLinePlan[],
): readonly { readonly glAccount: string; readonly amountCents: number }[] {
  return lines.map((line) => ({
    glAccount: line.code,
    amountCents: line.debitCents > 0 ? line.debitCents : -line.creditCents,
  }));
}
