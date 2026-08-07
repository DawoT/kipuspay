import { describe, expect, it } from 'vitest';
import {
  judgePromotionsAntiStack,
  runPromotionsAntiStackChaos,
  runPromotionsAntiStackChaosScenario,
} from './promotions-anti-stack.js';

describe('promotions-anti-stack chaos', () => {
  it('500 ciclos PASS', async () => {
    const result = runPromotionsAntiStackChaos(500);
    expect(result.discrepancies).toBe(0);
    expect(judgePromotionsAntiStack(result)).toBe('PASS');
    expect(await runPromotionsAntiStackChaosScenario()).toBe('PASS');
  });

  it('judge falla si <500', () => {
    expect(judgePromotionsAntiStack({ cycles: 10, discrepancies: 0, samples: [] })).toBe('FAIL');
  });
});
