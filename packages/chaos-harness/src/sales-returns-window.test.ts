import { describe, expect, it } from 'vitest';
import {
  judgeSalesReturnsWindow,
  runSalesReturnsWindowChaos,
  runSalesReturnsWindowCycles,
} from './sales-returns-window.js';

describe('sales-returns-window chaos', () => {
  it('500 ciclos PASS (stock/PMP/uncatalogued/E-D/ventana)', async () => {
    const result = runSalesReturnsWindowCycles(500);
    expect(judgeSalesReturnsWindow(result)).toBe('PASS');
    expect(await runSalesReturnsWindowChaos()).toBe('PASS');
  });

  it('menos de 500 ciclos → FAIL', () => {
    expect(judgeSalesReturnsWindow({ cycles: 10, discrepancies: 0, samples: [] })).toBe('FAIL');
  });
});
