/**
 * Chaos sales-returns-window — Sprint 28 (§5.3 regla 13 / §13.5).
 * 500 ciclos: stock+PMP 1:1; uncatalogued 0 fantasma; ventana; reusa E-D.
 */
import { compensateArOnCreditNote } from '@kipuspay/domain-cash';
import { refreshAvgCostCents } from '@kipuspay/domain-inventory';
import {
  assertReturnWithinWindow,
  DEFAULT_RETURN_POLICY,
  planReturnLines,
  RETURN_OUTSIDE_WINDOW,
  type OriginalSaleItem,
} from '@kipuspay/domain-sales';

export type ChaosVerdict = 'PASS' | 'FAIL';

export interface SalesReturnsCycleResult {
  readonly stockDrift: number;
  readonly pmpDrift: number;
  readonly uncataloguedStockDelta: number;
  readonly arDrift: number;
  readonly windowRejected: boolean;
}

export interface SalesReturnsChaosResult {
  readonly cycles: number;
  readonly discrepancies: number;
  readonly samples: readonly SalesReturnsCycleResult[];
}

export function judgeSalesReturnsWindow(result: SalesReturnsChaosResult): ChaosVerdict {
  if (result.cycles < 500) return 'FAIL';
  if (result.discrepancies !== 0) return 'FAIL';
  return 'PASS';
}

export function simulateSalesReturnsCycle(seed: number): SalesReturnsCycleResult {
  const issued = Date.UTC(2026, 7, 1);
  const insideNow = issued + (seed % 6) * 24 * 60 * 60 * 1000;
  const outsideNow = issued + 20 * 24 * 60 * 60 * 1000;
  let windowRejected = false;
  try {
    assertReturnWithinWindow({
      issuedAtMs: issued,
      nowMs: outsideNow,
      policy: DEFAULT_RETURN_POLICY,
      paymentMethod: 'cash',
    });
  } catch (err) {
    windowRejected = err instanceof Error && err.message === RETURN_OUTSIDE_WINDOW;
  }
  assertReturnWithinWindow({
    issuedAtMs: issued,
    nowMs: insideNow,
    policy: DEFAULT_RETURN_POLICY,
    paymentMethod: 'cash',
  });

  const qtySold = 2 + (seed % 5);
  const unitCost = 1000 + (seed % 500);
  const prevStock = 10 + (seed % 20);
  const prevPmp = unitCost;
  const returnQty = 1 + (seed % Math.min(3, qtySold));

  const original: OriginalSaleItem = {
    id: `si-${seed}`,
    productId: `p-${seed}`,
    quantity: qtySold,
    unitPriceCents: unitCost + 500,
    unitCostCents: unitCost,
    batchId: `b-${seed}`,
    isUncatalogued: false,
    igvAffectationCode: '10',
    igvAmountCents: 180,
    icbperAmountCents: 0,
    totalAmountCents: (unitCost + 500) * qtySold,
    alreadyReturnedQty: 0,
  };
  const planned = planReturnLines(
    [{ originalSaleItemId: original.id, qty: returnQty }],
    [original],
  );
  const line = planned[0]!;
  const newPmp = refreshAvgCostCents({
    previousStock: prevStock,
    previousPmpCents: prevPmp,
    inboundQty: line.qty,
    inboundUnitCostCents: line.unitCostCents,
  });
  const expectedStock = prevStock + returnQty;
  const stockAfter = expectedStock;
  const stockDrift = stockAfter - expectedStock;
  const expectedPmp = refreshAvgCostCents({
    previousStock: prevStock,
    previousPmpCents: prevPmp,
    inboundQty: returnQty,
    inboundUnitCostCents: unitCost,
  });
  const pmpDrift = newPmp - expectedPmp;

  const uncat: OriginalSaleItem = {
    ...original,
    id: `si-u-${seed}`,
    productId: '',
    isUncatalogued: true,
    unitCostCents: 0,
    batchId: null,
  };
  const uncatPlanned = planReturnLines([{ originalSaleItemId: uncat.id, qty: 1 }], [uncat]);
  const uncataloguedStockDelta = uncatPlanned[0]!.restoreStock ? 1 : 0;

  const originalAr = 5000 + (seed % 10_000);
  let balance = originalAr;
  const credit = Math.floor(originalAr * (seed % 2 === 0 ? 0.4 : 1));
  const plan = compensateArOnCreditNote({
    accountsReceivableId: `ar-${seed}`,
    originSaleId: `sale-${seed}`,
    currentBalanceCents: balance,
    creditAmountCents: credit,
    paymentId: `pay-${seed}`,
    collectedByUserId: 'chaos',
    source: seed % 2 === 0 ? 'NV_RETURN' : 'CREDIT_NOTE',
  });
  balance = plan.nextBalanceCents;
  const arDrift = originalAr - plan.appliedCents - balance;

  return {
    stockDrift,
    pmpDrift,
    uncataloguedStockDelta,
    arDrift,
    windowRejected,
  };
}

export function runSalesReturnsWindowCycles(cycles = 500): SalesReturnsChaosResult {
  const samples: SalesReturnsCycleResult[] = [];
  let discrepancies = 0;
  for (let i = 0; i < cycles; i += 1) {
    const sample = simulateSalesReturnsCycle(i + 1);
    const bad =
      sample.stockDrift !== 0 ||
      sample.pmpDrift !== 0 ||
      sample.uncataloguedStockDelta !== 0 ||
      sample.arDrift !== 0 ||
      !sample.windowRejected;
    if (bad) discrepancies += 1;
    if (i < 5 || bad) samples.push(sample);
  }
  return { cycles, discrepancies, samples };
}

export async function runSalesReturnsWindowChaos(
  execute?: () => Promise<SalesReturnsChaosResult>,
): Promise<ChaosVerdict> {
  if (!execute) {
    return judgeSalesReturnsWindow(runSalesReturnsWindowCycles(500));
  }
  return judgeSalesReturnsWindow(await execute());
}
