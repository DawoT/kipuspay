import { describe, expect, it } from 'vitest';
import {
  judgePurchasingThreeWayLateInvoice,
  runPurchasingThreeWayLateInvoiceChaos,
  runPurchasingThreeWayLateInvoiceCycles,
} from './purchasing-three-way-late-invoice.js';

describe('purchasing-three-way-late-invoice chaos', () => {
  it('500 ciclos PASS', async () => {
    const result = runPurchasingThreeWayLateInvoiceCycles(500);
    expect(judgePurchasingThreeWayLateInvoice(result)).toBe('PASS');
    expect(await runPurchasingThreeWayLateInvoiceChaos()).toBe('PASS');
  });

  it('menos de 500 → FAIL', () => {
    expect(judgePurchasingThreeWayLateInvoice({ cycles: 10, discrepancies: 0, samples: [] })).toBe(
      'FAIL',
    );
  });
});
