import { describe, expect, it } from 'vitest';
import {
  assertCustomerOrderConservation,
  assertCustomerOrderRepricingAuthorized,
  assertCustomerOrderTransition,
  customerOrderRemainingMicrounits,
  decideCustomerOrderClose,
  planCustomerOrderCreate,
  planCustomerOrderFulfillment,
  planCustomerOrderNotification,
  resolveCustomerOrderPrice,
  type CustomerOrderItemInput,
} from './customer-orders.js';

const baseItem: CustomerOrderItemInput = {
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
  serialIds: [],
};

const createInput = {
  tenantId: 'tenant-a',
  branchId: 'branch-a',
  customerId: 'customer-a',
  reservedUntil: '2026-08-09T12:00:00.000Z',
  items: [baseItem],
};

describe('customer-order invariants', () => {
  it.each([
    [2_000_000, 0, 0, 2_000_000],
    [2_000_000, 500_000, 500_000, 1_000_000],
    [2_000_000, 2_000_000, 0, 0],
  ])('accepts exact safe-integer conservation', (requested, fulfilled, released, reserved) => {
    expect(() =>
      assertCustomerOrderConservation({
        requestedQuantityMicrounits: requested,
        fulfilledQuantityMicrounits: fulfilled,
        releasedQuantityMicrounits: released,
        reservedQuantityMicrounits: reserved,
      }),
    ).not.toThrow();
    expect(
      customerOrderRemainingMicrounits({
        requestedQuantityMicrounits: requested,
        fulfilledQuantityMicrounits: fulfilled,
        releasedQuantityMicrounits: released,
      }),
    ).toBe(reserved);
  });

  it.each([
    [-1, 0, 0, -1],
    [1, 0.5, 0, 0.5],
    [Number.MAX_SAFE_INTEGER + 1, 0, 0, Number.MAX_SAFE_INTEGER + 1],
    [1, 1, 1, 0],
  ])(
    'rejects negative, fractional, unsafe, or non-conservative quantities',
    (requested, fulfilled, released, reserved) => {
      expect(() =>
        assertCustomerOrderConservation({
          requestedQuantityMicrounits: requested,
          fulfilledQuantityMicrounits: fulfilled,
          releasedQuantityMicrounits: released,
          reservedQuantityMicrounits: reserved,
        }),
      ).toThrow();
    },
  );
});

describe('customer-order creation validation', () => {
  it('accepts the bounded maximum item count', () => {
    const items = Array.from({ length: 100 }, (_, index) => ({
      ...baseItem,
      productId: `product-${index}`,
    }));
    expect(planCustomerOrderCreate({ ...createInput, items }).items).toHaveLength(100);
  });

  it.each([
    { ...createInput, items: [] },
    { ...createInput, items: Array.from({ length: 101 }, () => baseItem) },
    { ...createInput, reservedUntil: '2026-08-09 12:00:00' },
    { ...createInput, reservedUntil: 'not-a-date' },
    { ...createInput, reservedUntil: '2026-02-30T12:00:00.000Z' },
    { ...createInput, tenantId: ' ' },
    { ...createInput, branchId: ' ' },
    { ...createInput, customerId: ' ' },
    {
      ...createInput,
      items: [{ ...baseItem, requestedQuantityMicrounits: 0 }],
    },
    {
      ...createInput,
      items: [{ ...baseItem, factorDenominator: -1 }],
    },
    {
      ...createInput,
      items: [{ ...baseItem, unitPriceCents: Number.MAX_SAFE_INTEGER + 1 }],
    },
    {
      ...createInput,
      items: [
        {
          ...baseItem,
          enteredQuantityMicrounits: Number.MAX_SAFE_INTEGER,
          factorNumerator: 2,
          requestedQuantityMicrounits: Number.MAX_SAFE_INTEGER,
        },
      ],
    },
    {
      ...createInput,
      items: [{ ...baseItem, productId: ' ' }],
    },
    {
      ...createInput,
      items: [{ ...baseItem, productUomId: ' ' }],
    },
    {
      ...createInput,
      items: [{ ...baseItem, uomCode: ' ' }],
    },
    {
      ...createInput,
      items: [{ ...baseItem, serialIds: ['', 'serial-2'] }],
    },
    {
      ...createInput,
      items: [{ ...baseItem, serialIds: ['serial-1', 'serial-1'] }],
    },
    {
      ...createInput,
      items: [
        {
          ...baseItem,
          requestedQuantityMicrounits: 2_000_000,
          serialIds: ['serial-1'],
        },
      ],
    },
  ])('rejects invalid boundaries, dates, quantities, prices, and serials', (input) => {
    expect(() => planCustomerOrderCreate(input)).toThrow();
  });

  it('accepts exact one-base-unit serial snapshots and omitted serials', () => {
    const itemWithoutSerials: CustomerOrderItemInput = {
      productId: 'product-2',
      productUomId: baseItem.productUomId,
      uomCode: baseItem.uomCode,
      enteredQuantityMicrounits: baseItem.enteredQuantityMicrounits,
      factorNumerator: baseItem.factorNumerator,
      factorDenominator: baseItem.factorDenominator,
      requestedQuantityMicrounits: baseItem.requestedQuantityMicrounits,
      unitPriceCents: baseItem.unitPriceCents,
      batchId: 'batch-1',
      locationId: 'location-1',
    };
    expect(
      planCustomerOrderCreate({
        ...createInput,
        items: [
          {
            ...baseItem,
            enteredQuantityMicrounits: 1_000_000,
            requestedQuantityMicrounits: 1_000_000,
            serialIds: ['serial-1'],
          },
          itemWithoutSerials,
        ],
      }).items,
    ).toHaveLength(2);
  });
});

describe('customer-order monotonic lifecycle', () => {
  it('supports repeated partials until fulfilled without a second stock deduction', () => {
    const first = planCustomerOrderFulfillment({
      status: 'OPEN',
      requestedQuantityMicrounits: 2_000_000,
      reservedQuantityMicrounits: 2_000_000,
      fulfillQuantityMicrounits: 500_000,
    });
    const second = planCustomerOrderFulfillment({
      status: first.nextStatus,
      requestedQuantityMicrounits: 2_000_000,
      reservedQuantityMicrounits: first.nextReservedQuantityMicrounits,
      fulfillQuantityMicrounits: 1_500_000,
    });

    expect(first).toMatchObject({
      nextStatus: 'PARTIAL',
      nextReservedQuantityMicrounits: 1_500_000,
      fulfilledQuantityDeltaMicrounits: 500_000,
      stockDeductionMicrounits: 0,
    });
    expect(second).toMatchObject({
      nextStatus: 'FULFILLED',
      nextReservedQuantityMicrounits: 0,
      fulfilledQuantityDeltaMicrounits: 1_500_000,
      stockDeductionMicrounits: 0,
    });
  });

  it.each(['FULFILLED', 'CANCELLED', 'EXPIRED'] as const)(
    'rejects fulfillment from terminal status %s',
    (status) => {
      expect(() =>
        planCustomerOrderFulfillment({
          status,
          requestedQuantityMicrounits: 1_000_000,
          reservedQuantityMicrounits: 0,
          fulfillQuantityMicrounits: 1,
        }),
      ).toThrow('CUSTOMER_ORDER_TERMINAL');
    },
  );

  it('rejects zero, negative, overflow, and over-fulfillment', () => {
    for (const fulfillQuantityMicrounits of [0, -1, 1_000_001, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() =>
        planCustomerOrderFulfillment({
          status: 'PARTIAL',
          requestedQuantityMicrounits: 2_000_000,
          reservedQuantityMicrounits: 1_000_000,
          fulfillQuantityMicrounits,
        }),
      ).toThrow();
    }
  });

  it('allows only forward transitions and requires an expiry notice intent', () => {
    expect(() => assertCustomerOrderTransition('OPEN', 'PARTIAL')).not.toThrow();
    expect(() => assertCustomerOrderTransition('PARTIAL', 'FULFILLED')).not.toThrow();
    expect(() => assertCustomerOrderTransition('PARTIAL', 'OPEN')).toThrow(
      'CUSTOMER_ORDER_INVALID_TRANSITION',
    );
    expect(() => assertCustomerOrderTransition('CANCELLED', 'CANCELLED')).toThrow(
      'CUSTOMER_ORDER_TERMINAL',
    );
    expect(() =>
      decideCustomerOrderClose({
        status: 'PARTIAL',
        targetStatus: 'EXPIRED',
        requestedQuantityMicrounits: 2_000_000,
        fulfilledQuantityMicrounits: 500_000,
        releasedQuantityMicrounits: 0,
        reservedQuantityMicrounits: 1_500_000,
        noticeIntentPersisted: false,
      }),
    ).toThrow('CUSTOMER_ORDER_EXPIRY_NOTICE_REQUIRED');
  });

  it('closes by cancellation after releasing the exact remainder', () => {
    expect(
      decideCustomerOrderClose({
        status: 'OPEN',
        targetStatus: 'CANCELLED',
        requestedQuantityMicrounits: 1_000_000,
        fulfilledQuantityMicrounits: 0,
        releasedQuantityMicrounits: 0,
        reservedQuantityMicrounits: 1_000_000,
        noticeIntentPersisted: false,
      }),
    ).toMatchObject({
      nextStatus: 'CANCELLED',
      nextReleasedQuantityMicrounits: 1_000_000,
    });
  });
});

describe('customer-order expiry, pricing, and notification intent', () => {
  it('treats elapsed reservations as expired and requires scoped supervisor approval', () => {
    expect(
      resolveCustomerOrderPrice({
        status: 'OPEN',
        reservedUntil: '2026-08-07T12:00:00.000Z',
        now: '2026-08-08T12:00:00.000Z',
        snapshotUnitPriceCents: 1_180,
        currentUnitPriceCents: 1_500,
      }),
    ).toMatchObject({
      source: 'CURRENT_PRICING',
      releaseFirst: true,
      requiresSupervisor: true,
    });

    const scope = {
      tenantId: 'tenant-a',
      customerOrderId: 'order-a',
      saleId: 'sale-a',
      snapshotUnitPriceCents: 1_180,
      currentUnitPriceCents: 1_500,
    };
    expect(() =>
      assertCustomerOrderRepricingAuthorized(scope, {
        role: 'supervisor',
        ...scope,
      }),
    ).not.toThrow();
    expect(() =>
      assertCustomerOrderRepricingAuthorized(scope, {
        role: 'cashier',
        ...scope,
      }),
    ).toThrow('CUSTOMER_ORDER_REPRICE_FORBIDDEN');
    expect(() =>
      assertCustomerOrderRepricingAuthorized(scope, {
        role: 'supervisor',
        ...scope,
        saleId: 'other-sale',
      }),
    ).toThrow('CUSTOMER_ORDER_REPRICE_SCOPE_MISMATCH');
  });

  it('plans one durable expiry warning with operational fallback', () => {
    expect(
      planCustomerOrderNotification({
        whatsappCapabilityEnabled: true,
        whatsappOptInActive: true,
      }),
    ).toEqual({
      eventType: 'EXPIRY_WARNING',
      channel: 'WHATSAPP',
      initialStatus: 'PENDING',
      blocksExpiryRelease: false,
    });
    expect(
      planCustomerOrderNotification({
        whatsappCapabilityEnabled: false,
        whatsappOptInActive: false,
      }),
    ).toMatchObject({ eventType: 'EXPIRY_WARNING', channel: 'IN_APP' });
  });

  it.each(['FULFILLED', 'CANCELLED'] as const)(
    'never resolves pricing for terminal status %s',
    (status) => {
      expect(() =>
        resolveCustomerOrderPrice({
          status,
          reservedUntil: '2026-08-09T12:00:00.000Z',
          now: '2026-08-08T12:00:00.000Z',
          snapshotUnitPriceCents: 1_180,
          currentUnitPriceCents: 1_500,
        }),
      ).toThrow('CUSTOMER_ORDER_TERMINAL');
    },
  );
});
