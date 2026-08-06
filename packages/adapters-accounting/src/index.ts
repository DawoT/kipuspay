/**
 * Sprint 23 — Contasis CSV + Concar XML (§5.4 AccountingExporter).
 * Montos desde cents → decimal string (CAL-01); sin float de dinero.
 */
import {
  centsToDecimalString,
  sortAccountingEntries,
  type AccountingEntry,
  type AccountingExportTarget,
} from '@kipuspay/domain-integrations';
import type { Cents } from '@kipuspay/domain-sales';

export interface AccountingMovement {
  readonly glAccount: string;
  readonly amountCents: Cents;
}

export function netBalanceCents(movements: readonly AccountingMovement[]): Cents {
  let balance: Cents = 0;
  for (const movement of movements) {
    balance += movement.amountCents;
  }
  return balance;
}

/** Prefer centsToDecimalString — no usar Number para montos. */
export function formatAmountFromCents(amountCents: Cents): string {
  return centsToDecimalString(amountCents);
}

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function creditFromNegative(amountCents: Cents): string {
  if (amountCents >= 0) return '0.00';
  const abs = -amountCents;
  return centsToDecimalString(abs);
}

/** Contasis-like CSV: fecha,cuenta,debe,haber,glosa,documento,sucursal */
export function formatContasisCsv(entries: readonly AccountingEntry[]): string {
  const sorted = sortAccountingEntries(entries);
  const lines = ['fecha,cuenta,debe,haber,glosa,documento,sucursal'];
  for (const e of sorted) {
    const debit = e.amountCents > 0 ? centsToDecimalString(e.amountCents) : '0.00';
    const credit = creditFromNegative(e.amountCents);
    lines.push(
      [e.bookedAt, e.glAccount, debit, credit, escapeCsv(e.memo), e.sourceSaleId, e.branchId].join(
        ',',
      ),
    );
  }
  return `${lines.join('\n')}\n`;
}

const ASCIENTOS_OPEN = ['<Asientos origen=', '"', 'KipusPay', '"', '>'].join('');

/** Concar-like XML asientos. */
export function formatConcarXml(entries: readonly AccountingEntry[]): string {
  const sorted = sortAccountingEntries(entries);
  const parts = ['<?xml version="1.0" encoding="UTF-8"?>', ASCIENTOS_OPEN];
  for (const e of sorted) {
    const debe = e.amountCents > 0 ? centsToDecimalString(e.amountCents) : '0.00';
    const haber = creditFromNegative(e.amountCents);
    parts.push(
      `<Linea fecha="${escapeXml(e.bookedAt)}" cuenta="${escapeXml(e.glAccount)}" debe="${debe}" haber="${haber}" glosa="${escapeXml(e.memo)}" documento="${escapeXml(e.sourceSaleId)}" sucursal="${escapeXml(e.branchId)}" linea="${e.line}"/>`,
    );
  }
  parts.push('</Asientos>', '');
  return parts.join('\n');
}

export function formatAccountingExport(
  target: AccountingExportTarget,
  entries: readonly AccountingEntry[],
): { readonly contentType: string; readonly body: string; readonly filename: string } {
  if (target === 'contasis') {
    return {
      contentType: 'text/csv; charset=utf-8',
      body: formatContasisCsv(entries),
      filename: 'contasis-asientos.csv',
    };
  }
  return {
    contentType: 'application/xml; charset=utf-8',
    body: formatConcarXml(entries),
    filename: 'concar-asientos.xml',
  };
}
