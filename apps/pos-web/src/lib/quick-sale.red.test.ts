import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const posSource = readFileSync(new URL('../../src/routes/+page.svelte', import.meta.url), 'utf8');
const cartPanelSource = (() => {
  try {
    return readFileSync(new URL('../../src/lib/pos/CartPanel.svelte', import.meta.url), 'utf8');
  } catch {
    return '';
  }
})();
const combinedCartSource = posSource + '\n' + cartPanelSource;
const catalogSource = readFileSync(
  new URL('../../src/routes/admin/catalogo/+page.svelte', import.meta.url),
  'utf8',
);

describe('Sprint 50 quick-sale UI contract (GREEN)', () => {
  it('caja: botón de venta rápida con tope sin authz y copy honesto', () => {
    // Tras SOLID GAP#3 el botón vive en CartPanel, el modal sigue en +page
    expect(combinedCartSource).toContain('data-testid="quick-sale"');
    expect(combinedCartSource).toContain('Venta rápida (sin catálogo)');
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
    expect(combinedCartSource).toContain('addOrBumpLine(lines, genericLine(');
  });

  it('catálogo: panel de escáner rápido gated por flag y con copy EMP-', () => {
    expect(catalogSource).toContain('isCatalogQuickAddEnabled()');
    expect(catalogSource).toContain('data-testid="quick-add-panel"');
    expect(catalogSource).toContain('data-testid="quick-add-submit"');
    expect(catalogSource).toContain('EMP- es de vendedores y jamás crea un producto');
    expect(catalogSource).toContain('/api/catalog/quick-add');
  });
});
