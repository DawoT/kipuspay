import { describe, expect, it } from 'vitest';
import { externalToken, isPaymentApproved, type PaymentResult } from './index.js';

const result: PaymentResult = { amountCents: 2500, approved: true, externalReference: 'tok_123' };

describe('isPaymentApproved', () => {
  it('refleja el flag approved', () => {
    expect(isPaymentApproved(result)).toBe(true);
    expect(isPaymentApproved({ ...result, approved: false })).toBe(false);
  });
});

describe('externalToken', () => {
  it('devuelve la referencia externa con fallback a string vacío', () => {
    expect(externalToken(result)).toBe('tok_123');
    expect(externalToken({ ...result, externalReference: null })).toBe('');
  });
});
