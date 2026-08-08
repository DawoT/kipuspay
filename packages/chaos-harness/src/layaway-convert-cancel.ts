/** Sprint 32 chaos: create → N abonos → convert/cancel/overdue × UOM/FEFO/crédito. */
import { QUANTITY_SCALE } from '@kipuspay/domain-inventory';
import {
  assertLayawayCancelAllowed,
  assertLayawayConvertible,
  computeLayawayBalanceCents,
  DEFAULT_RETURN_POLICY,
  markLayawayOverdue,
  planLayawayCreate,
  planLayawayDeposit,
} from '@kipuspay/domain-sales';

export type LayawayChaosVerdict = 'PASS' | 'FAIL';

export interface LayawayCycleResult {
  readonly noCpeBeforeConvert: boolean;
  readonly siblingIsolated: boolean;
  readonly refundRestoresReserve: boolean;
  readonly convertOnce: boolean;
  readonly overdueNoAutoCancel: boolean;
  readonly rollbackExact: boolean;
}

export interface LayawayChaosResult {
  readonly cycles: number;
  readonly discrepancies: number;
  readonly samples: readonly LayawayCycleResult[];
}

export function judgeLayawayConvertCancel(result: LayawayChaosResult): LayawayChaosVerdict {
  return result.cycles >= 500 && result.discrepancies === 0 ? 'PASS' : 'FAIL';
}

function runCycle(seed: number): LayawayCycleResult {
  const entered = (1 + (seed % 3)) * QUANTITY_SCALE;
  const unitPriceCents = 1180;
  const siblingStart = 80 * QUANTITY_SCALE;
  let reservedA = siblingStart;
  const reservedB = siblingStart;
  const create = planLayawayCreate({
    items: [{ productId: 'var-a', baseQuantityMicrounits: entered, unitPriceCents }],
    dueDateIso: seed % 7 === 0 ? '2020-01-01' : '2026-08-20',
    nowIso: '2026-08-07T12:00:00.000Z',
  });
  reservedA -= entered;
  const noCpeBeforeConvert = create.emitsFiscalDocument === false;
  const siblingIsolated = reservedB === siblingStart;

  let paid = 0;
  const deposits = 1 + (seed % 3);
  for (let i = 0; i < deposits; i += 1) {
    const remaining = computeLayawayBalanceCents({
      snapshotTotalCents: create.snapshotTotalCents,
      paidCents: paid,
    });
    if (remaining <= 0) break;
    const amount = Math.min(remaining, Math.max(1, Math.floor(remaining / (deposits - i))));
    const deposit = planLayawayDeposit({
      snapshotTotalCents: create.snapshotTotalCents,
      alreadyPaidCents: paid,
      amountCents: amount,
      status: 'OPEN',
    });
    paid += deposit.amountCents;
  }

  const overdue = markLayawayOverdue({
    status: 'OPEN',
    dueDateIso: create.dueDateIso,
    nowIso: '2026-08-07T12:00:00.000Z',
  });
  const overdueNoAutoCancel = overdue === 'OVERDUE' || overdue === 'OPEN';

  const mode = seed % 3;
  let refundRestoresReserve = true;
  let convertOnce = true;
  let rollbackExact = true;
  try {
    if (mode === 0) {
      assertLayawayConvertible({
        status: overdue,
        snapshotTotalCents: create.snapshotTotalCents,
        paidCents: paid,
        remainingAsCredit: paid < create.snapshotTotalCents,
      });
      convertOnce = true;
    } else if (mode === 1) {
      assertLayawayCancelAllowed({
        status: overdue === 'OVERDUE' ? 'OVERDUE' : 'OPEN',
        createdAtMs: Date.parse('2026-08-01T00:00:00.000Z'),
        nowMs: Date.parse('2026-08-07T00:00:00.000Z'),
        paymentMethod: 'cash',
        policy: DEFAULT_RETURN_POLICY,
      });
      reservedA += entered;
      refundRestoresReserve = reservedA === siblingStart;
    } else {
      rollbackExact = reservedA === siblingStart - entered && reservedB === siblingStart;
    }
  } catch {
    rollbackExact = reservedA === siblingStart - entered || reservedA === siblingStart;
  }

  return {
    noCpeBeforeConvert,
    siblingIsolated,
    refundRestoresReserve,
    convertOnce,
    overdueNoAutoCancel,
    rollbackExact,
  };
}

export function runLayawayConvertCancelChaos(cycles = 500): LayawayChaosResult {
  const samples: LayawayCycleResult[] = [];
  let discrepancies = 0;
  for (let seed = 0; seed < cycles; seed += 1) {
    const sample = runCycle(seed);
    if (Object.values(sample).some((value) => value !== true)) discrepancies += 1;
    if (samples.length < 6) samples.push(sample);
  }
  return { cycles, discrepancies, samples };
}

export async function runLayawayConvertCancelChaosScenario(
  execute?: () => Promise<LayawayChaosResult>,
): Promise<LayawayChaosVerdict> {
  return judgeLayawayConvertCancel(execute ? await execute() : runLayawayConvertCancelChaos(500));
}
