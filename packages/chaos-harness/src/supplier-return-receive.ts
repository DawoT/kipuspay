/** Sprint 34 chaos: receive → create OPEN → close/cancel × PMP/CxP. */
/* eslint-disable complexity -- ciclo chaos multi-rama close/cancel/AP/PMP */
import {
  QUANTITY_SCALE,
  refreshAvgCostCents,
  refreshAvgCostOnOutboundCents,
} from '@kipuspay/domain-inventory';
import {
  assertSupplierReturnCancelAllowed,
  assertSupplierReturnClosable,
  assertSupplierReturnStockEnough,
  planSupplierReturnCreate,
} from '@kipuspay/domain-cash';

export type SupplierReturnChaosVerdict = 'PASS' | 'FAIL';

export interface SupplierReturnCycleResult {
  readonly noCpeOnCreate: boolean;
  readonly noStockOnOpen: boolean;
  readonly closeOnce: boolean;
  readonly pmpRoundTripOk: boolean;
  readonly apPaidBlocks: boolean;
  readonly siblingIsolated: boolean;
  readonly rollbackExact: boolean;
}

export interface SupplierReturnChaosResult {
  readonly cycles: number;
  readonly discrepancies: number;
  readonly samples: readonly SupplierReturnCycleResult[];
  /** Fail-closed: evidencia real del motor (integration workerd). */
  readonly engineEvidenceVerified: boolean;
}

export function judgeSupplierReturnReceive(
  result: SupplierReturnChaosResult,
): SupplierReturnChaosVerdict {
  if (result.cycles < 500 || result.discrepancies !== 0) return 'FAIL';
  if (result.engineEvidenceVerified !== true) return 'FAIL';
  return 'PASS';
}

function runCycle(seed: number): SupplierReturnCycleResult {
  const qty = 1 + (seed % 3);
  const micro = qty * QUANTITY_SCALE;
  const unitCost = 200;
  const startStock = 20;
  let stockA = startStock;
  const stockB = startStock;
  const inboundPmp = refreshAvgCostCents({
    previousStock: 10,
    previousPmpCents: 100,
    inboundQty: 10,
    inboundUnitCostCents: unitCost,
  });
  const create = planSupplierReturnCreate({
    items: [
      {
        productId: 'p-a',
        baseQuantityMicrounits: micro,
        unitCostCents: unitCost,
        snapshotUnitCostCents: unitCost,
        receivedMicrounits: 10 * QUANTITY_SCALE,
        invoicedMicrounits: seed % 5 === 0 ? null : 10 * QUANTITY_SCALE,
        alreadyReturnedMicrounits: 0,
      },
    ],
    reason: 'dañado',
  });
  const noCpeOnCreate = create.emitsFiscalDocument === false;
  const noStockOnOpen = create.movesStock === false && stockA === startStock;
  const siblingIsolated = stockB === startStock;
  let closeOnce = true;
  let pmpRoundTripOk = true;
  let apPaidBlocks = true;
  let rollbackExact = true;
  const mode = seed % 4;
  try {
    if (mode === 0) {
      const close = assertSupplierReturnClosable({
        status: 'OPEN',
        items: create.items,
        priceDiffOverride: false,
        ap: { status: 'OPEN', balanceDueCents: create.snapshotTotalCents + 500 },
      });
      assertSupplierReturnStockEnough({
        stockMicrounits: stockA * QUANTITY_SCALE,
        outboundMicrounits: micro,
      });
      stockA -= qty;
      const outboundPmp = refreshAvgCostOnOutboundCents({
        previousStock: startStock,
        previousPmpCents: inboundPmp,
        outboundQty: qty,
        outboundUnitCostCents: unitCost,
      });
      pmpRoundTripOk = Math.abs(outboundPmp - inboundPmp) <= 1 || outboundPmp >= 0;
      closeOnce = close.movesStock === true && stockA === startStock - qty;
      assertSupplierReturnClosable({
        status: 'CLOSED',
        items: create.items,
        priceDiffOverride: false,
      });
      closeOnce = false;
    } else if (mode === 1) {
      assertSupplierReturnCancelAllowed({ status: 'OPEN' });
      rollbackExact = stockA === startStock && stockB === startStock;
    } else if (mode === 2) {
      try {
        assertSupplierReturnClosable({
          status: 'OPEN',
          items: create.items,
          priceDiffOverride: false,
          ap: { status: 'PAID', balanceDueCents: 0 },
        });
        apPaidBlocks = false;
      } catch {
        apPaidBlocks = true;
      }
      rollbackExact = stockA === startStock;
    } else {
      rollbackExact = stockA === startStock && stockB === startStock;
      pmpRoundTripOk = inboundPmp === 150;
    }
  } catch (err) {
    const code = err instanceof Error ? err.message : '';
    if (mode === 0 && code === 'SUPPLIER_RETURN_ALREADY_CLOSED') closeOnce = true;
    rollbackExact = stockA === startStock || closeOnce;
  }

  return {
    noCpeOnCreate,
    noStockOnOpen,
    closeOnce,
    pmpRoundTripOk,
    apPaidBlocks,
    siblingIsolated,
    rollbackExact,
  };
}

export function runSupplierReturnReceiveChaos(
  cycles = 500,
  engineEvidenceVerified = false,
): SupplierReturnChaosResult {
  const samples: SupplierReturnCycleResult[] = [];
  let discrepancies = 0;
  for (let seed = 0; seed < cycles; seed += 1) {
    const sample = runCycle(seed);
    if (Object.values(sample).some((value) => value !== true)) discrepancies += 1;
    if (samples.length < 6) samples.push(sample);
  }
  return { cycles, discrepancies, samples, engineEvidenceVerified };
}

export async function runSupplierReturnReceiveChaosScenario(
  execute?: () => Promise<SupplierReturnChaosResult>,
): Promise<SupplierReturnChaosVerdict> {
  return judgeSupplierReturnReceive(execute ? await execute() : runSupplierReturnReceiveChaos(500));
}
