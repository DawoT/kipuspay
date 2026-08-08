import { describe, expect, it } from 'vitest';
import {
  judgeInventoryLocationConservation,
  runInventoryLocationConservationChaos,
  runInventoryLocationConservationChaosScenario,
} from './inventory-location-conservation.js';

describe('inventory-location-conservation chaos', () => {
  it('500 ciclos conservan ubicación/lote/sucursal con retry y oversell', async () => {
    const result = runInventoryLocationConservationChaos(500);
    expect(result.discrepancies).toBe(0);
    expect(judgeInventoryLocationConservation(result)).toBe('PASS');
    await expect(runInventoryLocationConservationChaosScenario()).resolves.toBe('PASS');
  });
});
