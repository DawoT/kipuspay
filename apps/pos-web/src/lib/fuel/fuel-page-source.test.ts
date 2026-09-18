import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(new URL('../../routes/+page.svelte', import.meta.url), 'utf8');

describe('POS Grifos integration', () => {
  it('monta el despacho solo para un tenant grifo con fuel.dispatch', () => {
    expect(page).toContain("import FuelDispatchCard from '$lib/fuel/FuelDispatchCard.svelte'");
    expect(page).toContain("capabilitiesSnapshot.has('fuel.dispatch')");
    expect(page).toContain("capabilitiesSnapshot.has('pos.checkout')");
    expect(page).toContain("capabilitiesSnapshot.has('fuel.dispatch')");
    expect(page).toContain('<FuelDispatchCard');
  });
});
