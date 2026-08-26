import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(new URL('../../routes/+page.svelte', import.meta.url), 'utf8');
const cartPanel = (() => {
  try {
    return readFileSync(new URL('../pos/CartPanel.svelte', import.meta.url), 'utf8');
  } catch {
    return '';
  }
})();
const combinedPage = page + '\n' + cartPanel;
const button = readFileSync(new URL('./Button.svelte', import.meta.url), 'utf8');
const feedback = readFileSync(new URL('./feedback.ts', import.meta.url), 'utf8');
const appCss = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');

describe('Refinamiento #3 — Micro-interacción carrito + sello (GTM §6.4)', () => {
  it('cart-item-row bump: scale 0.98→1 120ms cubic-bezier(0.22,1,0.36,1)', () => {
    expect(combinedPage).toMatch(/@keyframes cart-bump/);
    expect(combinedPage).toMatch(/transform:\s*scale\(0\.98\)/);
    expect(combinedPage).toMatch(/transform:\s*scale\(1\)/);
    expect(combinedPage).toMatch(/cart-bump\s+120ms\s+cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\)/);
    expect(combinedPage).toMatch(/\.cart-item-row\.bump/);
    expect(combinedPage).toMatch(/addOrBumpLine/);
    expect(combinedPage).toMatch(/triggerCartBump|bumpedId/);
  });

  it('total-amount.settled: pulse-emerald 2s + stitch verde + shadow-emerald', () => {
    expect(combinedPage).toMatch(/\.total-amount\.settled/);
    expect(combinedPage).toMatch(/pulse-emerald/);
    expect(combinedPage).toMatch(/2s/);
    expect(combinedPage).toMatch(/box-shadow:\s*var\(--shadow-emerald\)/);
    // app.css define pulse-emerald y shadow-emerald como tokens canónicos
    expect(appCss).toMatch(/@keyframes pulse-emerald/);
    expect(appCss).toMatch(/--shadow-emerald:/);
  });

  it('status=completado: Icon check 16 + BrandKnot + Box shadow-emerald', () => {
    expect(combinedPage).toMatch(/chargeSettled/);
    expect(combinedPage).toMatch(/data-testid="settled-seal"/);
    expect(combinedPage).toMatch(/BrandKnot/);
    expect(combinedPage).toMatch(/<Icon[^>]*name="check"[^>]*size=\{16\}/);
    expect(combinedPage).toMatch(/import BrandKnot/);
    expect(combinedPage).toMatch(/shadow-emerald/);
    expect(combinedPage).toMatch(/settled-seal/);
    expect(combinedPage).toMatch(/Venta cobrada/);
  });

  it('qty-btn 44px + active scale 0.96 + feedback vibrate', () => {
    expect(combinedPage).toMatch(/\.qty-btn/);
    expect(combinedPage).toMatch(/min-width:\s*44px/);
    expect(combinedPage).toMatch(/min-height:\s*44px/);
    expect(combinedPage).toMatch(/\.qty-btn:active/);
    expect(combinedPage).toMatch(/scale\(0\.96\)/);
    // Button.svelte también expone qty-btn active para cobertura
    expect(button).toMatch(/qty-btn/);
    expect(button).toMatch(/scale\(0\.96\)/);
    expect(feedback).toMatch(/navigator\.vibrate\(\[40,\s*60,\s*40\]\)/);
  });

  it('prefers-reduced-motion desactiva micro-interacciones', () => {
    expect(combinedPage).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(combinedPage).toMatch(/animation:\s*none/);
    expect(button).toMatch(/prefers-reduced-motion/);
  });
});
