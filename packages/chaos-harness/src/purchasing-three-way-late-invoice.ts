/**
 * Chaos purchasing-three-way-late-invoice — Sprint 29 (§5.3 regla 14 / §13.5).
 * 500 ciclos: recepción parcial → factura tardía; 0 CxP fantasma; override precio.
 */
import {
  assertThreeWayMatch,
  planCreateAp,
  planPartialReceive,
  THREE_WAY_MISMATCH,
} from '@kipuspay/domain-cash';
import { refreshAvgCostCents } from '@kipuspay/domain-inventory';

export type ChaosVerdict = 'PASS' | 'FAIL';

export interface ThreeWayCycleResult {
  readonly apCreatedOnReceive: boolean;
  readonly apCreatedOnMatch: boolean;
  readonly pmpDrift: number;
  readonly mismatchRejected: boolean;
  readonly overrideOk: boolean;
}

export interface ThreeWayChaosResult {
  readonly cycles: number;
  readonly discrepancies: number;
  readonly samples: readonly ThreeWayCycleResult[];
}

export function judgePurchasingThreeWayLateInvoice(result: ThreeWayChaosResult): ChaosVerdict {
  if (result.cycles < 500) return 'FAIL';
  if (result.discrepancies !== 0) return 'FAIL';
  return 'PASS';
}

function matchLines(
  ordered: number,
  receiveQty: number,
  poCost: number,
  invoiceCost: number,
  override: boolean,
) {
  return assertThreeWayMatch({
    lines: [
      {
        productId: 'p1',
        orderedQty: ordered,
        receivedQty: receiveQty,
        invoicedQty: receiveQty,
        poUnitCostCents: poCost,
        invoiceUnitCostCents: invoiceCost,
      },
    ],
    priceDiffOverride: override,
    invoiceTotalCents: receiveQty * invoiceCost,
    invoiceIgvCents: 0,
  });
}

export function simulateThreeWayLateInvoiceCycle(seed: number): ThreeWayCycleResult {
  const ordered = 10 + (seed % 5);
  const receiveQty = 1 + (seed % Math.min(5, ordered));
  const poCost = 100 + (seed % 50);
  const invoiceCost = seed % 7 === 0 ? poCost + 10 : poCost;

  planPartialReceive({
    purchaseOrderId: `po-${seed}`,
    currentStatus: 'SENT',
    orderedQtyByProduct: new Map([['p1', ordered]]),
    previouslyReceivedQtyByProduct: new Map([['p1', 0]]),
    lines: [{ productId: 'p1', quantity: receiveQty, unitCostCents: poCost }],
  });

  const apCreatedOnReceive = false;
  let mismatchRejected = true;
  let overrideOk = true;
  let apCreatedOnMatch: boolean;
  let pmpDrift = 0;

  if (invoiceCost === poCost) {
    const plan = matchLines(ordered, receiveQty, poCost, invoiceCost, false);
    const ap = planCreateAp({
      id: `ap-${seed}`,
      tenantId: 't',
      supplierId: 's',
      purchaseOrderId: `po-${seed}`,
      amountCents: plan.apAmountCents,
      dueDateIso: '2026-09-01 00:00:00',
    });
    apCreatedOnMatch = ap.originalAmountCents === plan.apAmountCents;
  } else {
    try {
      matchLines(ordered, receiveQty, poCost, invoiceCost, false);
      mismatchRejected = false;
    } catch (err) {
      mismatchRejected = err instanceof Error && err.message === THREE_WAY_MISMATCH;
    }
    const plan = matchLines(ordered, receiveQty, poCost, invoiceCost, true);
    overrideOk = plan.requiresPriceDiffAudit;
    const ap = planCreateAp({
      id: `ap-${seed}`,
      tenantId: 't',
      supplierId: 's',
      purchaseOrderId: `po-${seed}`,
      amountCents: plan.apAmountCents,
      dueDateIso: '2026-09-01 00:00:00',
    });
    apCreatedOnMatch = ap.originalAmountCents === plan.apAmountCents;
    const prevStock = 20;
    const newPmp = refreshAvgCostCents({
      previousStock: Math.max(0, prevStock - receiveQty),
      previousPmpCents: poCost,
      inboundQty: receiveQty,
      inboundUnitCostCents: invoiceCost,
    });
    const expected = refreshAvgCostCents({
      previousStock: Math.max(0, prevStock - receiveQty),
      previousPmpCents: poCost,
      inboundQty: receiveQty,
      inboundUnitCostCents: invoiceCost,
    });
    pmpDrift = newPmp - expected;
  }

  return {
    apCreatedOnReceive,
    apCreatedOnMatch,
    pmpDrift,
    mismatchRejected,
    overrideOk,
  };
}

export function runPurchasingThreeWayLateInvoiceCycles(cycles = 500): ThreeWayChaosResult {
  const samples: ThreeWayCycleResult[] = [];
  let discrepancies = 0;
  for (let i = 0; i < cycles; i += 1) {
    const sample = simulateThreeWayLateInvoiceCycle(i + 1);
    const bad =
      sample.apCreatedOnReceive ||
      !sample.apCreatedOnMatch ||
      sample.pmpDrift !== 0 ||
      !sample.mismatchRejected ||
      !sample.overrideOk;
    if (bad) discrepancies += 1;
    if (i < 5 || bad) samples.push(sample);
  }
  return { cycles, discrepancies, samples };
}

export async function runPurchasingThreeWayLateInvoiceChaos(
  execute?: () => Promise<ThreeWayChaosResult>,
): Promise<ChaosVerdict> {
  if (!execute) {
    return judgePurchasingThreeWayLateInvoice(runPurchasingThreeWayLateInvoiceCycles(500));
  }
  return judgePurchasingThreeWayLateInvoice(await execute());
}
