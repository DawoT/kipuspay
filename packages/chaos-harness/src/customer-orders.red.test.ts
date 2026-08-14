import { describe, expect, it } from 'vitest';
import {
  CUSTOMER_ORDER_FAULTS,
  judgeCustomerOrderChaos,
  runCustomerOrderChaos,
  type CustomerOrderChaosResult,
} from './customer-orders.js';

describe('Sprint 43 customer-order chaos 500 contract (RED)', () => {
  it('covers 500 deterministic balanced races and transport failures', async () => {
    const first = await runCustomerOrderChaos(500);
    const replay = await runCustomerOrderChaos(500);
    expect(replay).toEqual(first);
    expect(first.cycles).toBe(500);
    expect(first.samples).toHaveLength(500);
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
    expect(first.samples.filter((sample) => !sample.invariantsHeld)).toEqual([]);
    expect(judgeCustomerOrderChaos(first)).toBe('FAIL');
    expect(judgeCustomerOrderChaos({ ...first, engineEvidenceVerified: true })).toBe('PASS');
  });

  it('derives every failure counter from samples and rejects incomplete evidence', async () => {
    const result = await runCustomerOrderChaos(500);
    const counterFor = (key: keyof CustomerOrderChaosResult) =>
      result.samples.filter((sample) => sample.failures.includes(key as never)).length;
    const failureKeys = [
      'crossTenantMutations',
      'duplicateSales',
      'duplicateFiscalOutbox',
      'doubleStockDeductions',
      'doubleReleases',
      'conservationViolations',
      'stalePriceUses',
      'unauthorizedReprices',
      'duplicateNotices',
      'expiryWithoutDurableIntent',
      'indefiniteExpiredReservations',
      'offlineReplayMutations',
      'auditForks',
      'createPaymentsOrCpe',
      'checkoutBlocks',
      'partialSubsetCommits',
      'ghostInventoryDimensions',
      'duplicatePayments',
    ] as const;
    for (const key of failureKeys) expect(result[key]).toBe(counterFor(key));
    expect(judgeCustomerOrderChaos({ ...result, samples: result.samples.slice(1) })).toBe('FAIL');
    expect(
      judgeCustomerOrderChaos({
        ...result,
        coverage: { ...result.coverage, crossTenant: result.coverage.crossTenant - 1 },
      }),
    ).toBe('FAIL');
    expect(
      judgeCustomerOrderChaos({
        ...result,
        samples: result.samples.map((sample, index) =>
          index === 0 ? { ...sample, fault: 'crossTenant' } : sample,
        ),
      }),
    ).toBe('FAIL');
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
