import { describe, expect, it } from 'vitest';
import { DEFAULT_RETURN_POLICY } from './returns.js';
import {
  LAYAWAY_ALREADY_CONVERTED,
  LAYAWAY_ALREADY_TERMINAL,
  LAYAWAY_DEPOSIT_EXCEEDS_BALANCE,
  LAYAWAY_INSUFFICIENT_DEPOSIT,
  LAYAWAY_INVALID_AMOUNT,
  LAYAWAY_INVALID_STATUS,
  LAYAWAY_ITEMS_REQUIRED,
  assertLayawayCancelAllowed,
  assertLayawayConvertible,
  computeLayawayBalanceCents,
  markLayawayOverdue,
  planLayawayCreate,
  planLayawayDeposit,
} from './layaway.js';

const item = {
  productId: 'p1',
  baseQuantityMicrounits: 2_000_000,
  unitPriceCents: 1180,
};

describe('planLayawayCreate', () => {
  it('congela snapshot y no emite documento fiscal', () => {
    const plan = planLayawayCreate({
      items: [item],
      dueDateIso: '2026-08-20',
      nowIso: '2026-08-07T22:00:00.000Z',
    });
    expect(plan.status).toBe('OPEN');
    expect(plan.snapshotTotalCents).toBe(2360);
    expect(plan.emitsFiscalDocument).toBe(false);
    expect(plan.items[0]?.baseQuantityMicrounits).toBe(2_000_000);
  });

  it('rechaza ítems vacíos o precio inválido', () => {
    expect(() =>
      planLayawayCreate({ items: [], dueDateIso: null, nowIso: '2026-08-07T22:00:00.000Z' }),
    ).toThrow(LAYAWAY_ITEMS_REQUIRED);
    expect(() =>
      planLayawayCreate({
        items: [{ ...item, productId: '   ' }],
        dueDateIso: null,
        nowIso: '2026-08-07T22:00:00.000Z',
      }),
    ).toThrow(LAYAWAY_ITEMS_REQUIRED);
    expect(() =>
      planLayawayCreate({
        items: [{ ...item, unitPriceCents: -1 }],
        dueDateIso: null,
        nowIso: '2026-08-07T22:00:00.000Z',
      }),
    ).toThrow(LAYAWAY_INVALID_AMOUNT);
    expect(() =>
      planLayawayCreate({
        items: [{ ...item, baseQuantityMicrounits: 0 }],
        dueDateIso: null,
        nowIso: '2026-08-07T22:00:00.000Z',
      }),
    ).toThrow(LAYAWAY_INVALID_AMOUNT);
  });
});

describe('planLayawayDeposit and balance', () => {
  it('acepta abono parcial y rechaza exceso', () => {
    expect(
      planLayawayDeposit({
        snapshotTotalCents: 2360,
        alreadyPaidCents: 1000,
        amountCents: 360,
        status: 'OPEN',
      }).balanceAfterCents,
    ).toBe(1000);
    expect(() =>
      planLayawayDeposit({
        snapshotTotalCents: 2360,
        alreadyPaidCents: 2000,
        amountCents: 400,
        status: 'OPEN',
      }),
    ).toThrow(LAYAWAY_DEPOSIT_EXCEEDS_BALANCE);
    expect(computeLayawayBalanceCents({ snapshotTotalCents: 2360, paidCents: 360 })).toBe(2000);
  });

  it('rechaza abono sobre estado terminal', () => {
    expect(() =>
      planLayawayDeposit({
        snapshotTotalCents: 2360,
        alreadyPaidCents: 0,
        amountCents: 100,
        status: 'CANCELLED',
      }),
    ).toThrow(LAYAWAY_INVALID_STATUS);
    expect(() =>
      planLayawayDeposit({
        snapshotTotalCents: 2360,
        alreadyPaidCents: 0,
        amountCents: 100,
        status: 'CONVERTED',
      }),
    ).toThrow(LAYAWAY_INVALID_STATUS);
    expect(() =>
      planLayawayDeposit({
        snapshotTotalCents: 2360,
        alreadyPaidCents: 0,
        amountCents: 0,
        status: 'OPEN',
      }),
    ).toThrow(LAYAWAY_INVALID_AMOUNT);
    expect(() => computeLayawayBalanceCents({ snapshotTotalCents: -1, paidCents: 0 })).toThrow(
      LAYAWAY_INVALID_AMOUNT,
    );
  });
});

describe('convert / cancel / overdue', () => {
  it('exige saldo cubierto o crédito para convertir', () => {
    expect(() =>
      assertLayawayConvertible({
        status: 'OPEN',
        snapshotTotalCents: 2360,
        paidCents: 1000,
        remainingAsCredit: false,
      }),
    ).toThrow(LAYAWAY_INSUFFICIENT_DEPOSIT);
    expect(() =>
      assertLayawayConvertible({
        status: 'OPEN',
        snapshotTotalCents: 2360,
        paidCents: 2360,
        remainingAsCredit: false,
      }),
    ).not.toThrow();
    expect(() =>
      assertLayawayConvertible({
        status: 'CONVERTED',
        snapshotTotalCents: 2360,
        paidCents: 2360,
        remainingAsCredit: false,
      }),
    ).toThrow(LAYAWAY_ALREADY_CONVERTED);
    expect(() =>
      assertLayawayConvertible({
        status: 'CANCELLED',
        snapshotTotalCents: 2360,
        paidCents: 0,
        remainingAsCredit: false,
      }),
    ).toThrow(LAYAWAY_INVALID_STATUS);
    expect(() =>
      assertLayawayConvertible({
        status: 'OVERDUE',
        snapshotTotalCents: 2360,
        paidCents: 1000,
        remainingAsCredit: true,
      }),
    ).not.toThrow();
  });

  it('reusa ventana de devolución y no inventa NC', () => {
    expect(() =>
      assertLayawayCancelAllowed({
        status: 'OPEN',
        createdAtMs: Date.parse('2026-08-01T00:00:00.000Z'),
        nowMs: Date.parse('2026-08-07T00:00:00.000Z'),
        paymentMethod: 'cash',
        policy: DEFAULT_RETURN_POLICY,
      }),
    ).not.toThrow();
    expect(() =>
      assertLayawayCancelAllowed({
        status: 'OPEN',
        createdAtMs: Date.parse('2026-07-01T00:00:00.000Z'),
        nowMs: Date.parse('2026-08-07T00:00:00.000Z'),
        paymentMethod: 'cash',
        policy: DEFAULT_RETURN_POLICY,
      }),
    ).toThrow('OUTSIDE_WINDOW');
    expect(() =>
      assertLayawayCancelAllowed({
        status: 'CANCELLED',
        createdAtMs: Date.now(),
        nowMs: Date.now(),
        paymentMethod: 'cash',
        policy: DEFAULT_RETURN_POLICY,
      }),
    ).toThrow(LAYAWAY_ALREADY_TERMINAL);
    expect(() =>
      assertLayawayCancelAllowed({
        status: 'CONVERTED',
        createdAtMs: Date.now(),
        nowMs: Date.now(),
        paymentMethod: 'cash',
        policy: DEFAULT_RETURN_POLICY,
      }),
    ).toThrow(LAYAWAY_ALREADY_TERMINAL);
  });

  it('marca overdue sin emitir ni cancelar', () => {
    expect(
      markLayawayOverdue({
        status: 'OPEN',
        dueDateIso: '2026-08-01',
        nowIso: '2026-08-07T12:00:00.000Z',
      }),
    ).toBe('OVERDUE');
    expect(
      markLayawayOverdue({
        status: 'OPEN',
        dueDateIso: '2026-08-20',
        nowIso: '2026-08-07T12:00:00.000Z',
      }),
    ).toBe('OPEN');
    expect(
      markLayawayOverdue({
        status: 'OPEN',
        dueDateIso: null,
        nowIso: '2026-08-07T12:00:00.000Z',
      }),
    ).toBe('OPEN');
    expect(
      markLayawayOverdue({
        status: 'CANCELLED',
        dueDateIso: '2026-08-01',
        nowIso: '2026-08-07T12:00:00.000Z',
      }),
    ).toBe('CANCELLED');
  });
});
