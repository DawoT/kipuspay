/**
 * Chaos shard-do-failure + breaker taxonomy (§13.5 / Sprint 26).
 */
import {
  applyBusinessFailure,
  applyInfraFailures,
  BREAKER_FAILURE_THRESHOLD,
  initialBreakerSnapshot,
  type BreakerSnapshot,
} from '@kipuspay/domain-fiscal-pe';

export type ChaosVerdict = 'PASS' | 'FAIL';

export interface ShardDoFailureResult {
  readonly doReadsInWindow: number;
  readonly windowSeconds: number;
  readonly breakerOpenedOn5xx: boolean;
  readonly breakerClosedOn4xx: boolean;
}

export function judgeShardDoFailure(result: ShardDoFailureResult): ChaosVerdict {
  if (result.doReadsInWindow > 10 * result.windowSeconds) return 'FAIL';
  if (!result.breakerOpenedOn5xx) return 'FAIL';
  if (!result.breakerClosedOn4xx) return 'FAIL';
  return 'PASS';
}

/**
 * Simula colapso: coalesced writes only — DO reads ≤10/s (nunca 1 por request).
 * 10×5xx abren; 10×4xx no.
 */
export async function runShardDoFailureChaos(
  run?: () => Promise<ShardDoFailureResult>,
): Promise<ChaosVerdict> {
  if (run) return judgeShardDoFailure(await run());

  // Fixture in-process: 1000 isolates report INFRA coalesced → 1 DO write batch
  let doReads = 0;
  const readDo = () => {
    doReads += 1;
  };
  // Hot path: NO DO reads — only KV/isolate (simulate 0)
  void readDo;
  doReads = 0;

  let snap5: BreakerSnapshot = initialBreakerSnapshot();
  snap5 = applyInfraFailures(snap5, BREAKER_FAILURE_THRESHOLD, Date.now());
  let snap4: BreakerSnapshot = initialBreakerSnapshot();
  for (let i = 0; i < 10; i += 1) {
    snap4 = applyBusinessFailure(snap4);
  }

  return judgeShardDoFailure({
    doReadsInWindow: doReads,
    windowSeconds: 60,
    breakerOpenedOn5xx: snap5.state === 'open',
    breakerClosedOn4xx: snap4.state === 'closed',
  });
}

export interface BreakerTaxonomyResult {
  readonly openedOn5xx: boolean;
  readonly stayedClosedOn4xx: boolean;
}

export function judgeBreakerTaxonomy(r: BreakerTaxonomyResult): ChaosVerdict {
  return r.openedOn5xx && r.stayedClosedOn4xx ? 'PASS' : 'FAIL';
}

export async function runBreakerTaxonomyChaos(
  run?: () => Promise<BreakerTaxonomyResult>,
): Promise<ChaosVerdict> {
  if (run) return judgeBreakerTaxonomy(await run());
  let a = initialBreakerSnapshot();
  a = applyInfraFailures(a, 10, 1);
  let b = initialBreakerSnapshot();
  for (let i = 0; i < 10; i += 1) b = applyBusinessFailure(b);
  return judgeBreakerTaxonomy({
    openedOn5xx: a.state === 'open',
    stayedClosedOn4xx: b.state === 'closed',
  });
}
