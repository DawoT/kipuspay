/* eslint-disable no-secrets/no-secrets -- testids de UI canónicos */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const posSource = readFileSync(new URL('../../src/routes/+page.svelte', import.meta.url), 'utf8');
const catalogSource = readFileSync(
  new URL('../../src/routes/admin/catalogo/+page.svelte', import.meta.url),
  'utf8',
);

describe('Sprint 50 quick-sale UI contract (GREEN)', () => {
  it('caja: botón de venta rápida con tope sin authz y copy honesto', () => {
    expect(posSource).toContain('data-testid="quick-sale"');
    expect(posSource).toContain('VENTA RÁPIDA (sin catálogo)');
    expect(posSource).toContain('QUICK_SALE_MAX_CENTS = 2000');
    expect(posSource).toContain('El servidor calcula impuestos; esta línea no descuenta stock');
    expect(posSource).toContain('confirmTestid="quick-sale-add"');
    expect(posSource).toContain('quick-sale-add');
    expect(posSource).toContain('data-testid="quick-sale-name"');
    expect(posSource).toContain('data-testid="quick-sale-price"');
    expect(posSource).not.toContain('quickError = error');
  });

  it('caja: la línea genérica llega marcada isUncatalogued al carrito', () => {
    expect(posSource).toContain('genericLine(name, quickPriceCents)');
    expect(posSource).toContain('addOrBumpLine(lines, genericLine(name, quickPriceCents))');
  });

  it('catálogo: panel de escáner rápido gated por flag y con copy EMP-', () => {
    expect(catalogSource).toContain('isCatalogQuickAddEnabled()');
    expect(catalogSource).toContain('data-testid="quick-add-panel"');
    expect(catalogSource).toContain('data-testid="quick-add-submit"');
    expect(catalogSource).toContain('EMP- es de vendedores y jamás crea un producto');
    expect(catalogSource).toContain('/api/catalog/quick-add');
  });
});
