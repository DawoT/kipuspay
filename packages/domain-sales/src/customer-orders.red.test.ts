import { describe, expect, it } from 'vitest';
import {
  assertCustomerOrderConservation,
  decideCustomerOrderClose,
  planCustomerOrderCreate,
  planCustomerOrderFulfillment,
  resolveCustomerOrderPrice,
} from './customer-orders.js';

const item = {
  productId: 'product-1',
  productUomId: 'uom-1',
  uomCode: 'UND',
  enteredQuantityMicrounits: 2_000_000,
  factorNumerator: 1,
  factorDenominator: 1,
  requestedQuantityMicrounits: 2_000_000,
  unitPriceCents: 1_180,
  batchId: 'batch-1',
  locationId: 'location-1',
  serialIds: [] as string[],
};

describe('Sprint 43 customer-order domain contract (RED)', () => {
  it('creates a stock reservation with zero sale, payment, CPE, or fiscal outbox', () => {
    const plan = planCustomerOrderCreate({
      tenantId: 'tenant-a',
      branchId: 'branch-a',
      customerId: 'customer-a',
      reservedUntil: '2026-08-09T12:00:00.000Z',
      items: [item],
    });

    expect(plan.kind).toBe('CUSTOMER_ORDER');
    expect(plan.reservesStock).toBe(true);
    expect(plan.emitsSale).toBe(false);
    expect(plan.emitsPayment).toBe(false);
    expect(plan.emitsFiscalDocument).toBe(false);
    expect(plan.emitsFiscalOutbox).toBe(false);
    expect(plan.items[0]).toMatchObject({
      reservedQuantityMicrounits: 2_000_000,
      fulfilledQuantityMicrounits: 0,
      releasedQuantityMicrounits: 0,
      unitPriceCents: 1_180,
    });
  });

  it('distinguishes customer order from food order, quote, layaway, and ordinary sale', () => {
    const plan = planCustomerOrderCreate({
      tenantId: 'tenant-a',
      branchId: 'branch-a',
      customerId: 'customer-a',
      reservedUntil: '2026-08-09T12:00:00.000Z',
      items: [item],
    });
    expect(plan.kind).not.toBe('FOOD_SERVICE_ORDER');
    expect(plan.kind).not.toBe('QUOTE');
    expect(plan.kind).not.toBe('LAYAWAY');
    expect(plan.kind).not.toBe('ORDINARY_SALE');
    expect(plan.acceptsAdvancePayment).toBe(false);
  });

  it('enforces exact requested=fulfilled+released+reserved conservation for partials', () => {
    expect(() =>
      assertCustomerOrderConservation({
        requestedQuantityMicrounits: 2_000_000,
        fulfilledQuantityMicrounits: 500_000,
        releasedQuantityMicrounits: 0,
        reservedQuantityMicrounits: 1_500_000,
      }),
    ).not.toThrow();
    expect(() =>
      assertCustomerOrderConservation({
        requestedQuantityMicrounits: 2_000_000,
        fulfilledQuantityMicrounits: 500_000,
        releasedQuantityMicrounits: 1,
        reservedQuantityMicrounits: 1_500_000,
      }),
    ).toThrow('CUSTOMER_ORDER_CONSERVATION_VIOLATION');
  });

  it('uses the valid snapshot and never deducts reserved stock a second time', () => {
    expect(
      resolveCustomerOrderPrice({
        status: 'OPEN',
        reservedUntil: '2026-08-09T12:00:00.000Z',
        now: '2026-08-08T12:00:00.000Z',
        snapshotUnitPriceCents: 1_180,
        currentUnitPriceCents: 1_500,
      }),
    ).toEqual({ unitPriceCents: 1_180, source: 'ORDER_SNAPSHOT', requiresSupervisor: false });

    const fulfillment = planCustomerOrderFulfillment({
      status: 'OPEN',
      requestedQuantityMicrounits: 2_000_000,
      reservedQuantityMicrounits: 2_000_000,
      fulfillQuantityMicrounits: 500_000,
    });
    expect(fulfillment.stockDeductionMicrounits).toBe(0);
    expect(fulfillment.nextStatus).toBe('PARTIAL');
  });

  it('releases an expired remainder before repricing and requires supervisor approval', () => {
    expect(
      resolveCustomerOrderPrice({
        status: 'EXPIRED',
        reservedUntil: '2026-08-07T12:00:00.000Z',
        now: '2026-08-08T12:00:00.000Z',
        snapshotUnitPriceCents: 1_180,
        currentUnitPriceCents: 1_500,
      }),
    ).toEqual({
      unitPriceCents: 1_500,
      source: 'CURRENT_PRICING',
      releaseFirst: true,
      requiresSupervisor: true,
    });
  });

  it.each(['CANCELLED', 'EXPIRED'] as const)(
    '%s releases only the remaining reservation',
    (targetStatus) => {
      expect(
        decideCustomerOrderClose({
          status: 'PARTIAL',
          targetStatus,
          requestedQuantityMicrounits: 2_000_000,
          fulfilledQuantityMicrounits: 500_000,
          releasedQuantityMicrounits: 0,
          reservedQuantityMicrounits: 1_500_000,
          noticeIntentPersisted: targetStatus === 'EXPIRED',
        }),
      ).toMatchObject({
        releaseQuantityMicrounits: 1_500_000,
        nextReservedQuantityMicrounits: 0,
        nextReleasedQuantityMicrounits: 1_500_000,
      });
    },
  );
});
