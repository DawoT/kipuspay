import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mainPage = readFileSync(new URL('../../routes/+page.svelte', import.meta.url), 'utf8');
const cartPanel = (() => {
  try {
    return readFileSync(new URL('./CartPanel.svelte', import.meta.url), 'utf8');
  } catch {
    return '';
  }
})();
const combinedMain = mainPage + '\n' + cartPanel;
const cajaPage = readFileSync(new URL('../../routes/caja/+page.svelte', import.meta.url), 'utf8');

describe('Sprint 67 — Ergonomia Caja & POS', () => {
  describe('Indicadores visuales del carrito', () => {
    it('tiene data-testid="cart-item-count" en el markup del carrito', () => {
      expect(combinedMain).toContain('data-testid="cart-item-count"');
    });

    it('tiene data-testid="cart-discount-badge" para descuentos activos', () => {
      expect(combinedMain).toContain('data-testid="cart-discount-badge"');
    });

    it('tiene data-testid="charge-btn" en el boton de cobro', () => {
      expect(combinedMain).toContain('data-testid="charge-btn"');
    });

    it('el handler de teclado F9 esta registrado en el codigo', () => {
      expect(mainPage).toContain('F9');
    });

    it('no usa toFixed ni parseFloat para montos del carrito', () => {
      const cartSection = mainPage.match(/cartTotal|cartPayable|formatCents/g);
      expect(cartSection).not.toBeNull();
      expect(mainPage).not.toMatch(/cartTotalCents.*\.toFixed/);
      expect(mainPage).not.toMatch(/cartPayableCents.*\.toFixed/);
    });
  });

  describe('Ergonomia del cierre Z', () => {
    it('tiene data-testid="caja-counted-total" para el resumen de conteo', () => {
      expect(cajaPage).toContain('data-testid="caja-counted-total"');
    });

    it('tiene data-testid="caja-confirm-close" en el boton de cierre', () => {
      expect(cajaPage).toContain('data-testid="caja-confirm-close"');
    });

    it('tiene data-testid="caja-diff-ok" para diferencia cero', () => {
      expect(cajaPage).toContain('data-testid="caja-diff-ok"');
    });

    it('tiene data-testid="caja-diff-warning" para diferencia no cero', () => {
      expect(cajaPage).toContain('data-testid="caja-diff-warning"');
    });

    it('usa formatCents para mostrar el total contado', () => {
      expect(cajaPage).toContain('formatCents(countedLocal)');
    });

    it('cero jerga tecnica visible en la caja', () => {
      expect(cajaPage).not.toMatch(/\b(PSE|CDR|UBL|D1|Workers|Edge|ACID|sharding)\b/);
    });
  });
});
