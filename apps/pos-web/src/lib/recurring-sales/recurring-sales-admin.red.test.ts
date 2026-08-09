import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../../routes/admin/membresias/+page.svelte', import.meta.url),
  'utf8',
);

describe('Sprint 44 memberships Admin contract (RED)', () => {
  it('distinguishes membership from KipusPay billing, installments, layaway, and orders', () => {
    expect(source).toContain('Membresías');
    expect(source).toContain('Genera una venta y una deuda por período');
    expect(source).not.toMatch(
      /Suscripción de KipusPay|Cuotas de esta venta|Apartado|Pedido con retiro/,
    );
  });

  it('explains FIXED versus CURRENT and never asks for card data', () => {
    expect(source).toContain('Precio fijo');
    expect(source).toContain('Precio vigente');
    expect(source).toContain('El servidor calcula el importe');
    expect(source).toContain('Sin autocobro');
    expect(source).not.toMatch(/número de tarjeta|CVV|token de tarjeta/i);
  });

  it('shows schedule, grace, occurrence snapshot, retry and proration history', () => {
    for (const copy of [
      'Próxima ejecución',
      'Período de gracia',
      'Precio aplicado',
      'Reintento pendiente',
      'Cancelar al final del período',
      'Cancelar ahora y calcular crédito',
      'Nota de crédito',
      'NV_RETURN',
    ]) {
      expect(source).toContain(copy);
    }
  });

  it('never gates ordinary checkout or fiscal issuance', () => {
    expect(source).toContain('La mora de esta membresía no bloquea la caja');
    expect(source).not.toMatch(/disable.*checkout|bloquear.*factur/i);
  });

  it('meets keyboard, live-region, touch, contrast, reduced-motion and narrow-screen contracts', () => {
    expect(source).toMatch(/aria-live="polite"/);
    expect(source).toMatch(/role="alert"/);
    expect(source).toMatch(/min-height:\s*44px/);
    expect(source).toMatch(/prefers-reduced-motion/);
    expect(source).toMatch(/max-width:\s*375px/);
    expect(source).toMatch(/:focus-visible/);
  });
});
