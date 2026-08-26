import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { createMemoryOfflineIdb, OfflineQueueStore } from '../offline-sync/offline-queue.js';
import { chargeCartOffline } from '../pos-checkout/charge.js';
import type { CartLine } from '../pos-checkout/cart.js';

const cartPanelPath = path.resolve(__dirname, './CartPanel.svelte');
const chargePath = path.resolve(__dirname, '../pos-checkout/charge.ts');
const plusPagePath = path.resolve(__dirname, '../../routes/+page.svelte');

function read(p: string): string {
  return readFileSync(p, 'utf8');
}

describe('GAP #5 — tipCents MoneyInput + payableCents (TDD RED→GREEN)', () => {
  it('CartPanel usa MoneyInput bind:value={tipCents} y no input number crudo', () => {
    const src = read(cartPanelPath);
    // Debe importar y usar MoneyInput, no input type=number con bind tipCents
    expect(src).toContain('MoneyInput');
    expect(src).toMatch(/MoneyInput[^>]*bind:value=\{tipCents\}/);
    expect(src).not.toMatch(/<input[^>]*type="number"[^>]*bind:value=\{tipCents\}/);
    expect(src).not.toMatch(/<input[^>]*id="tip-cents"[^>]*type="number"/);
  });

  it('tip-quick calcula sobre payableCents (cartPayableCents) no totalCents', () => {
    const src = read(cartPanelPath);
    expect(src).toContain('payableCents');
    expect(src).toMatch(/Math\.round\(payableCents\s*\*\s*frac\)/);
    expect(src).not.toMatch(/Math\.round\(totalCents\s*\*\s*frac\)/);
  });

  it('charge.ts valida Integer>0 antes de buildPaymentLine (no deja float 2.5)', () => {
    const src = read(chargePath);
    // Debe validar entero con Number.isInteger antes de enviar tip
    expect(src).toMatch(/Number\.isInteger\s*\(\s*tip/);
    // Debe contener validación de tipCents y uso de Math.round para normalizar float
    expect(src).toContain('Number.isInteger');
    expect(src).toContain('tipCents');
    expect(src).toContain('Math.round');
    // buildPaymentLine debe usar Math.round o validación entera
    const hasIntegerGuard = /Number\.isInteger/.test(src) && /tip/.test(src);
    expect(hasIntegerGuard).toBe(true);
  });

  it('+page.svelte valida tipCents entero antes de pasar a chargeCartOffline', () => {
    const src = read(plusPagePath);
    // spread debe incluir validación entero, no solo tipCents>0
    expect(src).toMatch(/Number\.isInteger\s*\(\s*tipCents/);
    expect(src).not.toMatch(/\.\.\.\(tipOn&&tipCents>0\?\{tipCents\}:\{\}\)/);
  });

  it('chargeCartOffline: tipCents float 2.5 no viaja como 2.5 al payload (debe ser integer o ausente)', async () => {
    const queue = new OfflineQueueStore(createMemoryOfflineIdb());
    const line: CartLine = { productId: 'p1', name: 'Prod', unitPriceCents: 1000, quantity: 1 };
    const outcome = await chargeCartOffline(
      [line],
      {
        formalizationMode: 'INTERNAL_CONTROL',
        taxRegime: 'RG',
        branchId: 'b1',
        cashRegisterSessionId: 's1',
        series: 'NV01',
        clientDocumentType: '1',
        clientDocumentNumber: '00000000',
        clientName: 'Cliente',
        paymentMethodId: 'pm1',
        tipCents: 2.5 as unknown as number,
      },
      queue,
    );
    expect(outcome.ok).toBe(true);
    const pending = await queue.listPending();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tip = (pending[0]?.payload.payments[0] as any)?.tipCents;
    // bug: tip === 2.5 ; fix: tip is integer or undefined, nunca 2.5
    if (tip !== undefined) {
      expect(Number.isInteger(tip)).toBe(true);
      expect(tip).not.toBe(2.5);
      // debe ser Math.round(2.5) = 3 si se normaliza, o ausente; nunca float
    }
  });

  it('chargeCartOffline: tipCents negativo no se envía', async () => {
    const queue = new OfflineQueueStore(createMemoryOfflineIdb());
    const line: CartLine = { productId: 'p1', name: 'Prod', unitPriceCents: 1000, quantity: 1 };
    await chargeCartOffline(
      [line],
      {
        formalizationMode: 'INTERNAL_CONTROL',
        taxRegime: 'RG',
        branchId: 'b1',
        cashRegisterSessionId: 's1',
        series: 'NV01',
        clientDocumentType: '1',
        clientDocumentNumber: '00000000',
        clientName: 'Cliente',
        paymentMethodId: 'pm1',
        tipCents: -100,
      },
      queue,
    );
    const pending = await queue.listPending();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tip = (pending[0]?.payload.payments[0] as any)?.tipCents;
    expect(tip).toBeUndefined();
  });
});
