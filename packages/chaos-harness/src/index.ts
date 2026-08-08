/**
 * Chaos harness — contrato de escenarios (Arquitectura §13.5).
 * Cada escenario se activa en el sprint indicado; invocarlo antes es un error explícito.
 */

import { runShardDoFailureChaos, type ShardDoFailureResult } from './shard-do-failure.js';
import {
  runUsageOverageIdempotentChaos,
  type UsageOverageChaosResult,
} from './usage-overage-idempotent.js';
import {
  runSalesReturnsWindowChaos,
  type SalesReturnsChaosResult,
} from './sales-returns-window.js';
import {
  runPurchasingThreeWayLateInvoiceChaos,
  type ThreeWayChaosResult,
} from './purchasing-three-way-late-invoice.js';
import {
  runPromotionsAntiStackChaosScenario,
  type PromotionsAntiStackChaosResult,
} from './promotions-anti-stack.js';
import {
  runVariantsUomBomBatchChaosScenario,
  type VariantsUomChaosResult,
} from './variants-uom-bom-batch.js';
import {
  runLayawayConvertCancelChaosScenario,
  type LayawayChaosResult,
} from './layaway-convert-cancel.js';
import {
  runJournalBalanceExportChaosScenario,
  type JournalChaosResult,
} from './journal-balance-export.js';
import {
  runQuoteConvertExpireChaosScenario,
  type QuoteChaosResult,
} from './quote-convert-expire.js';
import {
  runSupplierReturnReceiveChaosScenario,
  type SupplierReturnChaosResult,
} from './supplier-return-receive.js';
import {
  runStoreCreditIssueRedeemChaosScenario,
  type StoreCreditChaosResult,
} from './store-credit-issue-redeem.js';
import {
  runInstallmentPayIdempotentChaosScenario,
  type InstallmentChaosResult,
} from './installment-pay-idempotent.js';
import {
  runConcurrentWritersChaos,
  runDuplicateRetryChaos,
  type ConcurrentWritersResult,
  type DuplicateRetryResult,
} from './sprint4-acid.js';
import { runDeadlineChaos, type DeadlineChaosResult } from './deadline-chaos.js';
import {
  runNetworkAdversarialChaos,
  type NetworkAdversarialResult,
} from './network-adversarial.js';
import { runQuotaExceededChaos, type QuotaExceededResult } from './quota-exceeded.js';
import { runLowEndDeviceChaos, type LowEndDeviceResult } from './low-end-device.js';
import { runArCompensateChaos, type ArCompensateChaosResult } from './ar-compensate.js';
import { runRollupIdempotentChaos, type RollupIdempotentResult } from './rollup-idempotent.js';

export type ChaosScenarioId =
  | 'network-adversarial'
  | 'quota-exceeded'
  | 'low-end-device'
  | 'ar-compensate'
  | 'rollup-idempotent'
  | 'shard-do-failure'
  | 'usage-overage-idempotent'
  | 'sales-returns-window'
  | 'purchasing-three-way-late-invoice'
  | 'promotions-anti-stack'
  | 'variants-uom-bom-batch'
  | 'layaway-convert-cancel'
  | 'journal-balance-export'
  | 'quote-convert-expire'
  | 'supplier-return-receive'
  | 'store-credit-issue-redeem'
  | 'installment-pay-idempotent'
  | 'concurrent-writers'
  | 'duplicate-retry'
  | 'deadline';

export type ChaosVerdict = 'PASS' | 'FAIL';

/** Sprint mínimo en el que el escenario bloquea CI (null = aún no implementado). */
export const SCENARIO_ACTIVE_FROM: Readonly<Record<ChaosScenarioId, number | null>> = {
  'network-adversarial': 6,
  'quota-exceeded': 6,
  'low-end-device': 7,
  'ar-compensate': 8,
  'rollup-idempotent': 9,
  'shard-do-failure': 26,
  'usage-overage-idempotent': 27,
  'sales-returns-window': 28,
  'purchasing-three-way-late-invoice': 29,
  'promotions-anti-stack': 30,
  'variants-uom-bom-batch': 31,
  'layaway-convert-cancel': 32,
  'journal-balance-export': 32,
  'quote-convert-expire': 33,
  'supplier-return-receive': 34,
  'store-credit-issue-redeem': 35,
  'installment-pay-idempotent': 36,
  'concurrent-writers': 4,
  'duplicate-retry': 4,
  deadline: 5,
};

export class ChaosScenarioNotReadyError extends Error {
  readonly scenario: ChaosScenarioId;
  readonly activeFrom: number | null;

  constructor(scenario: ChaosScenarioId, activeFrom: number | null) {
    super(
      activeFrom === null
        ? `Escenario chaos "${scenario}" no tiene sprint de activación (§13.5)`
        : `Escenario chaos "${scenario}" activo desde Sprint ${activeFrom}; aún no implementado`,
    );
    this.name = 'ChaosScenarioNotReadyError';
    this.scenario = scenario;
    this.activeFrom = activeFrom;
  }
}

export function assertScenarioReady(scenario: ChaosScenarioId, currentSprint: number): void {
  const from = SCENARIO_ACTIVE_FROM[scenario];
  if (from === null || currentSprint < from) {
    throw new ChaosScenarioNotReadyError(scenario, from);
  }
}

export interface ChaosDeps {
  readonly runConcurrentWriters?: () => Promise<ConcurrentWritersResult>;
  readonly runDuplicateRetry?: () => Promise<DuplicateRetryResult>;
  readonly concurrentInitialStock?: number;
  readonly concurrentQtyEach?: number;
  readonly runDeadline?: () => Promise<DeadlineChaosResult>;
  readonly runNetworkAdversarial?: (cycles: number) => Promise<NetworkAdversarialResult>;
  readonly networkCycles?: number;
  readonly runQuotaExceeded?: () => Promise<QuotaExceededResult>;
  readonly runLowEndDevice?: () => Promise<LowEndDeviceResult>;
  readonly runArCompensate?: () => Promise<ArCompensateChaosResult>;
  readonly runRollupIdempotent?: () => Promise<RollupIdempotentResult>;
  readonly runShardDoFailure?: () => Promise<ShardDoFailureResult>;
  readonly runUsageOverageIdempotent?: () => Promise<UsageOverageChaosResult>;
  readonly runSalesReturnsWindow?: () => Promise<SalesReturnsChaosResult>;
  readonly runPurchasingThreeWayLateInvoice?: () => Promise<ThreeWayChaosResult>;
  readonly runPromotionsAntiStack?: () => Promise<PromotionsAntiStackChaosResult>;
  readonly runVariantsUomBomBatch?: () => Promise<VariantsUomChaosResult>;
  readonly runLayawayConvertCancel?: () => Promise<LayawayChaosResult>;
  readonly runJournalBalanceExport?: () => Promise<JournalChaosResult>;
  readonly runQuoteConvertExpire?: () => Promise<QuoteChaosResult>;
  readonly runSupplierReturnReceive?: () => Promise<SupplierReturnChaosResult>;
  readonly runStoreCreditIssueRedeem?: () => Promise<StoreCreditChaosResult>;
  readonly runInstallmentPayIdempotent?: () => Promise<InstallmentChaosResult>;
}

function requireDep<T>(value: T | undefined, message: string): T {
  if (!value) throw new Error(message);
  return value;
}

/* eslint-disable complexity -- dispatch por escenario §13.5 */
async function dispatchReadyScenario(
  scenario: ChaosScenarioId,
  deps: ChaosDeps,
): Promise<ChaosVerdict> {
  switch (scenario) {
    case 'concurrent-writers':
      return runConcurrentWritersChaos(
        requireDep(
          deps.runConcurrentWriters,
          'Escenario concurrent-writers exige deps.runConcurrentWriters (evidencia D1); fail-closed sin fixtures',
        ),
        deps.concurrentInitialStock ?? 2,
        deps.concurrentQtyEach ?? 1,
      );
    case 'duplicate-retry':
      return runDuplicateRetryChaos(
        requireDep(
          deps.runDuplicateRetry,
          'Escenario duplicate-retry exige deps.runDuplicateRetry (evidencia D1); fail-closed sin fixtures',
        ),
      );
    case 'deadline':
      return runDeadlineChaos(
        requireDep(
          deps.runDeadline,
          'Escenario deadline exige deps.runDeadline (evidencia D1/reloj); fail-closed sin fixtures',
        ),
      );
    case 'network-adversarial':
      return runNetworkAdversarialChaos(
        requireDep(
          deps.runNetworkAdversarial,
          'Escenario network-adversarial exige deps.runNetworkAdversarial (evidencia sync); fail-closed sin fixtures',
        ),
        deps.networkCycles ?? 500,
      );
    case 'quota-exceeded':
      return runQuotaExceededChaos(
        requireDep(
          deps.runQuotaExceeded,
          'Escenario quota-exceeded exige deps.runQuotaExceeded (evidencia IDB); fail-closed sin fixtures',
        ),
      );
    case 'low-end-device':
      return runLowEndDeviceChaos(
        requireDep(
          deps.runLowEndDevice,
          'Escenario low-end-device exige deps.runLowEndDevice (evidencia cola); fail-closed sin fixtures',
        ),
      );
    case 'ar-compensate':
      return runArCompensateChaos(
        requireDep(
          deps.runArCompensate,
          'Escenario ar-compensate exige deps.runArCompensate (evidencia ciclos); fail-closed sin fixtures',
        ),
      );
    case 'rollup-idempotent':
      return runRollupIdempotentChaos(
        requireDep(
          deps.runRollupIdempotent,
          'Escenario rollup-idempotent exige deps.runRollupIdempotent (evidencia ciclos); fail-closed sin fixtures',
        ),
      );
    case 'shard-do-failure':
      return runShardDoFailureChaos(deps.runShardDoFailure);
    case 'usage-overage-idempotent':
      return runUsageOverageIdempotentChaos(deps.runUsageOverageIdempotent);
    case 'sales-returns-window':
      return runSalesReturnsWindowChaos(deps.runSalesReturnsWindow);
    case 'purchasing-three-way-late-invoice':
      return runPurchasingThreeWayLateInvoiceChaos(deps.runPurchasingThreeWayLateInvoice);
    case 'promotions-anti-stack':
      return runPromotionsAntiStackChaosScenario(deps.runPromotionsAntiStack);
    case 'variants-uom-bom-batch':
      return runVariantsUomBomBatchChaosScenario(deps.runVariantsUomBomBatch);
    case 'layaway-convert-cancel':
      return runLayawayConvertCancelChaosScenario(deps.runLayawayConvertCancel);
    case 'journal-balance-export':
      return runJournalBalanceExportChaosScenario(deps.runJournalBalanceExport);
    case 'quote-convert-expire':
      return runQuoteConvertExpireChaosScenario(deps.runQuoteConvertExpire);
    case 'supplier-return-receive':
      return runSupplierReturnReceiveChaosScenario(deps.runSupplierReturnReceive);
    case 'store-credit-issue-redeem':
      return runStoreCreditIssueRedeemChaosScenario(deps.runStoreCreditIssueRedeem);
    case 'installment-pay-idempotent':
      return runInstallmentPayIdempotentChaosScenario(deps.runInstallmentPayIdempotent);
    default:
      return Promise.reject(
        new Error(
          `Escenario "${scenario}" marcado activo en §13.5 (Sprint ${SCENARIO_ACTIVE_FROM[scenario]}) pero sin runner aún`,
        ),
      );
  }
}

/**
 * Punto de entrada. Fail-closed: sin execute real → error, nunca PASS por fixtures.
 */
export async function runChaosScenario(
  scenario: ChaosScenarioId,
  currentSprint: number,
  deps: ChaosDeps = {},
): Promise<ChaosVerdict> {
  assertScenarioReady(scenario, currentSprint);
  return dispatchReadyScenario(scenario, deps);
}

export {
  judgeConcurrentWriters,
  judgeDuplicateRetry,
  runConcurrentWritersChaos,
  runDuplicateRetryChaos,
} from './sprint4-acid.js';

export { judgeDeadlineChaos, runDeadlineChaos } from './deadline-chaos.js';

export { judgeNetworkAdversarial, runNetworkAdversarialChaos } from './network-adversarial.js';

export { judgeQuotaExceeded, runQuotaExceededChaos } from './quota-exceeded.js';

export { judgeLowEndDevice, runLowEndDeviceChaos } from './low-end-device.js';

export {
  judgeArCompensate,
  runArCompensateChaos,
  runArCompensateCycles,
  simulateArCompensateCycle,
} from './ar-compensate.js';

export {
  judgeRollupIdempotent,
  runRollupIdempotentChaos,
  runRollupIdempotentCycles,
  simulateRollupIdempotentCycle,
} from './rollup-idempotent.js';

export {
  judgeBreakerTaxonomy,
  judgeShardDoFailure,
  runBreakerTaxonomyChaos,
  runShardDoFailureChaos,
} from './shard-do-failure.js';

export {
  judgeUsageOverageIdempotent,
  runUsageOverageIdempotentChaos,
} from './usage-overage-idempotent.js';

export {
  judgeSalesReturnsWindow,
  runSalesReturnsWindowChaos,
  runSalesReturnsWindowCycles,
  simulateSalesReturnsCycle,
} from './sales-returns-window.js';

export {
  judgePurchasingThreeWayLateInvoice,
  runPurchasingThreeWayLateInvoiceChaos,
  runPurchasingThreeWayLateInvoiceCycles,
  simulateThreeWayLateInvoiceCycle,
} from './purchasing-three-way-late-invoice.js';

export {
  judgePromotionsAntiStack,
  runPromotionsAntiStackChaos,
  runPromotionsAntiStackChaosScenario,
} from './promotions-anti-stack.js';

export {
  judgeVariantsUomBomBatch,
  runVariantsUomBomBatchChaos,
  runVariantsUomBomBatchChaosScenario,
} from './variants-uom-bom-batch.js';

export {
  judgeLayawayConvertCancel,
  runLayawayConvertCancelChaos,
  runLayawayConvertCancelChaosScenario,
} from './layaway-convert-cancel.js';

export {
  judgeJournalBalanceExport,
  runJournalBalanceExportChaos,
  runJournalBalanceExportChaosScenario,
} from './journal-balance-export.js';

export {
  judgeQuoteConvertExpire,
  runQuoteConvertExpireChaos,
  runQuoteConvertExpireChaosScenario,
} from './quote-convert-expire.js';

export {
  judgeSupplierReturnReceive,
  runSupplierReturnReceiveChaos,
  runSupplierReturnReceiveChaosScenario,
} from './supplier-return-receive.js';

export {
  judgeStoreCreditIssueRedeem,
  runStoreCreditIssueRedeemChaos,
  runStoreCreditIssueRedeemChaosScenario,
} from './store-credit-issue-redeem.js';

export {
  judgeInstallmentPayIdempotent,
  runInstallmentPayIdempotentChaos,
  runInstallmentPayIdempotentChaosScenario,
  type InstallmentChaosResult,
} from './installment-pay-idempotent.js';
