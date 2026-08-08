import { describe, expect, it } from 'vitest';
import {
  CUSTOMER_ORDER_FAULTS,
  judgeCustomerOrderChaos,
  runCustomerOrderChaos,
} from './customer-order-chaos.js';

describe('Sprint 43 customer-order chaos 500 contract (RED)', () => {
  it('covers 500 deterministic balanced races and transport failures', async () => {
    const first = await runCustomerOrderChaos(500);
    const replay = await runCustomerOrderChaos(500);
    expect(replay).toEqual(first);
    expect(first.cycles).toBe(500);
    expect(Object.keys(first.coverage)).toEqual(CUSTOMER_ORDER_FAULTS);
    expect(first).toMatchObject({
      crossTenantMutations: 0,
      duplicateSales: 0,
      duplicateFiscalOutbox: 0,
      doubleStockDeductions: 0,
      doubleReleases: 0,
      conservationViolations: 0,
      stalePriceUses: 0,
      unauthorizedReprices: 0,
      duplicateNotices: 0,
      expiryWithoutDurableIntent: 0,
      indefiniteExpiredReservations: 0,
      offlineReplayMutations: 0,
      auditForks: 0,
      createPaymentsOrCpe: 0,
      checkoutBlocks: 0,
    });
    expect(first.samples.every((sample) => sample.invariantsHeld)).toBe(true);
    expect(judgeCustomerOrderChaos(first)).toBe('PASS');
  });

  it('includes fulfill-vs-cancel/expire, partials, dimensions, notices, and offline replay', () => {
    expect(CUSTOMER_ORDER_FAULTS).toEqual(
      expect.arrayContaining([
        'crossTenant',
        'doubleFulfill',
        'fulfillVsCancel',
        'fulfillVsExpire',
        'partialFulfillment',
        'batchLocationSerialUom',
        'priceDriftAfterExpiry',
        'noticeDuplicate',
        'noticeTransportFailure',
        'offlineEnvelopeReplay',
        'auditTailRace',
        'checkoutDuringOrderFailure',
      ]),
    );
  });
});
