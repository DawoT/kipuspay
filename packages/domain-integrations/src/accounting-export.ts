/**
 * Sprint 23 — export contable (§5.4 regla 3).
 * Solo lectura: deriva asientos desde ventas/CxC sin mutar ledger.
 */

import type { Cents } from '@kipuspay/domain-sales';

export type AccountingExportTarget = 'contasis' | 'concar';

export interface AccountingExportQuery {
  readonly fromDate: string;
  readonly toDate: string;
  readonly branchId: string;
  readonly target: AccountingExportTarget;
}

/** Fila operativa canónica (ventas + CxC) antes de mapear a GL. */
export interface AccountingSalePayment {
  readonly methodCode: string;
  readonly amountCents: Cents;
}

export interface AccountingSaleRow {
  readonly saleId: string;
  readonly branchId: string;
  readonly soldAt: string;
  readonly totalCents: Cents;
  readonly taxCents: Cents;
  /** Desglose real de pagos por método (C4: el débito se reparte 1011/1212). */
  readonly payments: readonly AccountingSalePayment[];
  readonly arBalanceCents: Cents;
}

export interface AccountingEntry {
  readonly sourceSaleId: string;
  readonly branchId: string;
  /** YYYY-MM-DD (America/Lima conceptual; caller normaliza). */
  readonly bookedAt: string;
  readonly glAccount: string;
  readonly amountCents: Cents;
  readonly line: number;
  readonly memo: string;
}

const TARGETS: ReadonlySet<string> = new Set(['contasis', 'concar']);

/** Mapeo GL estable (contrato S23; S32 journal_* debe bit-consistir). */
export const GL = {
  CASH: '1011',
  AR: '1212',
  CUSTOMER_DEPOSIT: '2101',
  SALES: '7011',
  VAT: '4011',
} as const;

/** Métodos de pago que aplican un anticipo apartado (S32/ADR-0016, 2101). */
const DEPOSIT_METHODS: ReadonlySet<string> = new Set(['anticipo', 'layaway_deposit']);

export function isAccountingExportTarget(value: string): value is AccountingExportTarget {
  return TARGETS.has(value);
}

/** Formato decimal string desde cents — sin Number/float de dinero. */
export function centsToDecimalString(amountCents: Cents): string {
  const neg = amountCents < 0;
  const abs = neg ? -amountCents : amountCents;
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const body = `${whole}.${frac.toString().padStart(2, '0')}`;
  return neg ? `-${body}` : body;
}

function bookedDate(soldAt: string): string {
  return soldAt.slice(0, 10);
}

/**
 * Deriva asientos: débito caja/CxC/anticipo, crédito ventas + IGV.
 * C4: el débito se reparte por método de pago real (`payments`) agrupado por
 * cuenta GL — todo lo no-crédito ni-anticipo (efectivo, yape, tarjeta,
 * transferencia) suma a 1011; el saldo a crédito va a 1212; el método
 * `anticipo`/`layaway_deposit` (conversión de apartado, S32) va a 2101.
 * Sort caller-side con sortAccountingEntries para bit-repro.
 */
export function buildAccountingEntries(rows: readonly AccountingSaleRow[]): AccountingEntry[] {
  const out: AccountingEntry[] = [];
  for (const row of rows) {
    const bookedAt = bookedDate(row.soldAt);
    const netCents = row.totalCents - row.taxCents;

    const payments =
      row.payments.length > 0
        ? row.payments
        : [{ methodCode: 'cash', amountCents: row.totalCents }];
    const depositCents = payments
      .filter((p) => DEPOSIT_METHODS.has(p.methodCode))
      .reduce((acc, p) => acc + Math.max(0, p.amountCents), 0);
    const cashCents = payments
      .filter((p) => p.methodCode !== 'credit' && !DEPOSIT_METHODS.has(p.methodCode))
      .reduce((acc, p) => acc + Math.max(0, p.amountCents), 0);
    const creditCents = payments
      .filter((p) => p.methodCode === 'credit')
      .reduce((acc, p) => acc + Math.max(0, p.amountCents), 0);
    const arRemainder = row.totalCents - cashCents - creditCents - depositCents;

    let line = 1;
    if (depositCents > 0) {
      out.push({
        sourceSaleId: row.saleId,
        branchId: row.branchId,
        bookedAt,
        glAccount: GL.CUSTOMER_DEPOSIT,
        amountCents: depositCents,
        line,
        memo: `sale:${row.saleId}:debit:deposit`,
      });
      line += 1;
    }
    if (cashCents > 0) {
      out.push({
        sourceSaleId: row.saleId,
        branchId: row.branchId,
        bookedAt,
        glAccount: GL.CASH,
        amountCents: cashCents,
        line,
        memo: `sale:${row.saleId}:debit:cash`,
      });
      line += 1;
    }
    if (creditCents + arRemainder > 0) {
      out.push({
        sourceSaleId: row.saleId,
        branchId: row.branchId,
        bookedAt,
        glAccount: GL.AR,
        amountCents: creditCents + arRemainder,
        line,
        memo: `sale:${row.saleId}:debit:ar`,
      });
      line += 1;
    }

    out.push({
      sourceSaleId: row.saleId,
      branchId: row.branchId,
      bookedAt,
      glAccount: GL.SALES,
      amountCents: -netCents,
      line,
      memo: `sale:${row.saleId}:sales`,
    });
    out.push({
      sourceSaleId: row.saleId,
      branchId: row.branchId,
      bookedAt,
      glAccount: GL.VAT,
      amountCents: -row.taxCents,
      line: line + 1,
      memo: `sale:${row.saleId}:vat`,
    });
  }
  return sortAccountingEntries(out);
}

export function sortAccountingEntries(entries: readonly AccountingEntry[]): AccountingEntry[] {
  return [...entries].sort((a, b) => {
    if (a.bookedAt !== b.bookedAt) return a.bookedAt < b.bookedAt ? -1 : 1;
    if (a.sourceSaleId !== b.sourceSaleId) return a.sourceSaleId < b.sourceSaleId ? -1 : 1;
    if (a.line !== b.line) return a.line - b.line;
    return a.glAccount < b.glAccount ? -1 : a.glAccount > b.glAccount ? 1 : 0;
  });
}

export interface AccountingExportPort {
  buildEntries(rows: readonly AccountingSaleRow[]): readonly AccountingEntry[];
}
