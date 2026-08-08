import { describe, expect, it } from 'vitest';
import {
  mintCustomerOrderRepriceAuthorizationAtomic,
  processExpiredCustomerOrderRepriceHandoffAtomic,
} from './process-customer-order-atomic.js';

describe('Sprint 43 mandatory residual contracts', () => {
  it('exposes scoped one-shot repricing authorization and server-price handoff', () => {
    expect(mintCustomerOrderRepriceAuthorizationAtomic).toBeTypeOf('function');
    expect(processExpiredCustomerOrderRepriceHandoffAtomic).toBeTypeOf('function');
  });
});
