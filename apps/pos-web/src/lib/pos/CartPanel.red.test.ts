import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const posLib = fileURLToPath(new URL('.', import.meta.url));
const cartPanelPath = join(posLib, 'CartPanel.svelte');

function readCartPanel(): string {
  if (!existsSync(cartPanelPath)) throw new Error(`CartPanel.svelte no existe en ${cartPanelPath}`);
  return readFileSync(cartPanelPath, 'utf8');
}

describe('GAP #3 — SOLID: CartPanel.svelte extraído (TDD RED→GREEN)', () => {
  it('existe CartPanel.svelte como módulo aislado', () => {
    expect(existsSync(cartPanelPath), 'CartPanel.svelte debe existir').toBe(true);
  });

  it('renderiza data-testid del carrito sin depender de +page.svelte', () => {
    const src = readCartPanel();
    expect(src).toContain('data-testid="cart-item-count"');
    expect(src).toContain('data-testid="cart-item-row"');
    expect(src).toContain('data-testid="total"');
    expect(src).toContain('data-testid="charge-btn"');
    expect(src).toContain('data-testid="cart-discount-badge"');
    expect(src).toContain('data-testid="settled-seal"');
    expect(src).toContain('data-testid="charge"');
  });

  it('expone props tipadas sin switch(vertical) y sin duplicar lógica de dominio', () => {
    const src = readCartPanel();
    expect(src).toMatch(/\$props\(\)/);
    expect(src).toContain('CartLine');
    expect(src).not.toMatch(/switch\s*\(\s*[A-Za-z_.]*vertical/);
    expect(src).not.toMatch(/vertical\s*===/);
    expect(src).toContain('formatCents');
    expect(src).not.toMatch(/\.toFixed\s*\(/);
  });

  it('conserva micro-interacción cart-bump 120ms y qty-btn ≥44px', () => {
    const src = readCartPanel();
    expect(src).toMatch(/@keyframes cart-bump/);
    expect(src).toMatch(/cart-bump\s+120ms\s+cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\)/);
    expect(src).toMatch(/min-width:\s*44px/);
    expect(src).toMatch(/min-height:\s*44px/);
  });

  it('mantiene estados del cart (vacío, con descuento, settled, cobrando)', () => {
    const src = readCartPanel();
    expect(src).toContain('cartPayableCents');
    expect(src).toContain('cartTotalCents');
    expect(src).toContain('EmptyState');
    expect(src).toContain('chargeSettled');
    expect(src).toContain('optimisticTotal');
  });
});
