import { describe, expect, it } from 'vitest';
import { runChaosScenario, runShardDoFailureChaos, runBreakerTaxonomyChaos } from './index.js';

describe('shard-do-failure chaos Sprint 26', () => {
  it('PASS: 5xx abren, 4xx no, DO reads ≤10/s', async () => {
    expect(await runShardDoFailureChaos()).toBe('PASS');
    expect(await runBreakerTaxonomyChaos()).toBe('PASS');
    expect(await runChaosScenario('shard-do-failure', 26)).toBe('PASS');
  });

  it('FAIL si DO bombardeado', async () => {
    expect(
      await runShardDoFailureChaos(() =>
        Promise.resolve({
          doReadsInWindow: 1000,
          windowSeconds: 60,
          breakerOpenedOn5xx: true,
          breakerClosedOn4xx: true,
        }),
      ),
    ).toBe('FAIL');
  });
});
