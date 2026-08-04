export type PaymentKind = 'card' | 'cash';

export interface PaymentResult {
  readonly amountCents: number;
  readonly approved: boolean;
  readonly externalReference: string | null;
}

export function isPaymentApproved(result: PaymentResult): boolean {
  return result.approved;
}

export function externalToken(result: PaymentResult): string {
  return result.externalReference ?? '';
}
