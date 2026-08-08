import { describe, expect, it } from 'vitest';
import {
  runDispatchCustomerOrderNoticeHttp,
  runMintCustomerOrderRepriceAuthorizationHttp,
  runRepriceExpiredCustomerOrderHttp,
} from './customer-order-routes.js';

describe('Sprint 43 mandatory Worker residual routes', () => {
  it('exports repricing authorization, handoff, and notice dispatcher routes', () => {
    expect(runMintCustomerOrderRepriceAuthorizationHttp).toBeTypeOf('function');
    expect(runRepriceExpiredCustomerOrderHttp).toBeTypeOf('function');
    expect(runDispatchCustomerOrderNoticeHttp).toBeTypeOf('function');
  });
});
