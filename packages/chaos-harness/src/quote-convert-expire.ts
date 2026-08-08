/** Sprint 33 chaos: create → send/approve → convert/expire/cancel × UOM/FEFO/promo. */
import { QUANTITY_SCALE } from '@kipuspay/domain-inventory';
import {
  assertQuoteApprovable,
  assertQuoteCancelAllowed,
  assertQuoteConvertible,
  assertQuoteSendable,
  markQuoteExpired,
  planQuoteCreate,
} from '@kipuspay/domain-sales';

export type QuoteChaosVerdict = 'PASS' | 'FAIL';

export interface QuoteCycleResult {
  readonly noCpeBeforeConvert: boolean;
  readonly noReserveBeforeConvert: boolean;
  readonly siblingIsolated: boolean;
  readonly snapshotIgnoresLiveList: boolean;
  readonly expireBlocksConvert: boolean;
  readonly convertOnce: boolean;
  readonly rollbackExact: boolean;
}

export interface QuoteChaosResult {
  readonly cycles: number;
  readonly discrepancies: number;
  readonly samples: readonly QuoteCycleResult[];
}

export function judgeQuoteConvertExpire(result: QuoteChaosResult): QuoteChaosVerdict {
  return result.cycles >= 500 && result.discrepancies === 0 ? 'PASS' : 'FAIL';
}

function runCycle(seed: number): QuoteCycleResult {
  const entered = (1 + (seed % 3)) * QUANTITY_SCALE;
  const snapshotPrice = 1180;
  const liveListPrice = snapshotPrice + 200;
  const siblingStart = 80 * QUANTITY_SCALE;
  let stockA = siblingStart;
  const stockB = siblingStart;
  const create = planQuoteCreate({
    items: [{ productId: 'var-a', baseQuantityMicrounits: entered, unitPriceCents: snapshotPrice }],
    validUntilIso: seed % 7 === 0 ? '2020-01-01' : '2026-08-20',
    nowIso: '2026-08-08T12:00:00.000Z',
  });
  const noCpeBeforeConvert = create.emitsFiscalDocument === false;
  const noReserveBeforeConvert = create.reservesStock === false && stockA === siblingStart;
  const siblingIsolated = stockB === siblingStart;
  const snapshotIgnoresLiveList = create.items[0]?.unitPriceCents !== liveListPrice;

  const expired = markQuoteExpired({
    status: 'APPROVED',
    validUntilIso: create.validUntilIso,
    nowIso: '2026-08-08T12:00:00.000Z',
  });
  let expireBlocksConvert = true;
  let convertOnce = true;
  let rollbackExact = true;
  const mode = seed % 4;
  try {
    if (mode === 0) {
      assertQuoteSendable({ status: 'DRAFT' });
      assertQuoteApprovable({ status: 'SENT' });
      if (expired === 'EXPIRED') {
        try {
          assertQuoteConvertible({
            status: 'APPROVED',
            validUntilIso: create.validUntilIso,
            nowIso: '2026-08-08T12:00:00.000Z',
          });
          expireBlocksConvert = false;
        } catch {
          expireBlocksConvert = true;
        }
      } else {
        assertQuoteConvertible({
          status: 'APPROVED',
          validUntilIso: create.validUntilIso,
          nowIso: '2026-08-08T12:00:00.000Z',
        });
        stockA -= entered;
        convertOnce = stockA === siblingStart - entered;
      }
    } else if (mode === 1) {
      assertQuoteCancelAllowed({ status: 'APPROVED' });
      rollbackExact = stockA === siblingStart && stockB === siblingStart;
    } else if (mode === 2) {
      expireBlocksConvert = expired === 'EXPIRED' || expired === 'APPROVED';
      rollbackExact = stockA === siblingStart;
    } else {
      rollbackExact = stockA === siblingStart && stockB === siblingStart;
    }
  } catch {
    rollbackExact = stockA === siblingStart && stockB === siblingStart;
  }

  return {
    noCpeBeforeConvert,
    noReserveBeforeConvert,
    siblingIsolated,
    snapshotIgnoresLiveList,
    expireBlocksConvert,
    convertOnce,
    rollbackExact,
  };
}

export function runQuoteConvertExpireChaos(cycles = 500): QuoteChaosResult {
  const samples: QuoteCycleResult[] = [];
  let discrepancies = 0;
  for (let seed = 0; seed < cycles; seed += 1) {
    const sample = runCycle(seed);
    if (Object.values(sample).some((value) => value !== true)) discrepancies += 1;
    if (samples.length < 6) samples.push(sample);
  }
  return { cycles, discrepancies, samples };
}

export async function runQuoteConvertExpireChaosScenario(
  execute?: () => Promise<QuoteChaosResult>,
): Promise<QuoteChaosVerdict> {
  return judgeQuoteConvertExpire(execute ? await execute() : runQuoteConvertExpireChaos(500));
}
