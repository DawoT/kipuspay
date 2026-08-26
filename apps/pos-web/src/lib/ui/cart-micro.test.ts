import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(new URL('../../routes/+page.svelte', import.meta.url), 'utf8');
const button = readFileSync(new URL('./Button.svelte', import.meta.url), 'utf8');
const feedback = readFileSync(new URL('./feedback.ts', import.meta.url), 'utf8');
const appCss = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');

describe('Refinamiento #3 — Micro-interacción carrito + sello (GTM §6.4)', () => {
  it('cart-item-row bump: scale 0.98→1 120ms cubic-bezier(0.22,1,0.36,1)', () => {
    expect(page).toMatch(/@keyframes cart-bump/);
    expect(page).toMatch(/transform:\s*scale\(0\.98\)/);
    expect(page).toMatch(/transform:\s*scale\(1\)/);
    expect(page).toMatch(/cart-bump\s+120ms\s+cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\)/);
    expect(page).toMatch(/\.cart-item-row\.bump/);
    expect(page).toMatch(/addOrBumpLine/);
    expect(page).toMatch(/triggerCartBump|bumpedId/);
  });

  it('total-amount.settled: pulse-emerald 2s + stitch verde + shadow-emerald', () => {
    expect(page).toMatch(/\.total-amount\.settled/);
    expect(page).toMatch(/pulse-emerald/);
    expect(page).toMatch(/2s/);
    expect(page).toMatch(/box-shadow:\s*var\(--shadow-emerald\)/);
    // app.css define pulse-emerald y shadow-emerald como tokens canónicos
    expect(appCss).toMatch(/@keyframes pulse-emerald/);
    expect(appCss).toMatch(/--shadow-emerald:/);
  });

  it('status=completado: Icon check 16 + BrandKnot + Box shadow-emerald', () => {
    expect(page).toMatch(/chargeSettled/);
    expect(page).toMatch(/data-testid="settled-seal"/);
    expect(page).toMatch(/BrandKnot/);
    expect(page).toMatch(/<Icon[^>]*name="check"[^>]*size=\{16\}/);
    expect(page).toMatch(/import BrandKnot/);
    expect(page).toMatch(/shadow-emerald/);
    expect(page).toMatch(/settled-seal/);
    expect(page).toMatch(/Venta cobrada/);
  });

  it('qty-btn 44px + active scale 0.96 + feedback vibrate', () => {
    expect(page).toMatch(/\.qty-btn/);
    expect(page).toMatch(/min-width:\s*44px/);
    expect(page).toMatch(/min-height:\s*44px/);
    expect(page).toMatch(/\.qty-btn:active/);
    expect(page).toMatch(/scale\(0\.96\)/);
    // Button.svelte también expone qty-btn active para cobertura
    expect(button).toMatch(/qty-btn/);
    expect(button).toMatch(/scale\(0\.96\)/);
    expect(feedback).toMatch(/navigator\.vibrate\(\[40,\s*60,\s*40\]\)/);
  });

  it('prefers-reduced-motion desactiva micro-interacciones', () => {
    expect(page).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(page).toMatch(/animation:\s*none/);
    expect(button).toMatch(/prefers-reduced-motion/);
  });
});
