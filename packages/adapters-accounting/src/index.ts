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

export function toExcelAmountCents(amountCents: Cents): number {
  return amountCents / 100;
}
