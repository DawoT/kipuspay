import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pos = readFileSync(new URL('../../src/routes/+page.svelte', import.meta.url), 'utf8');
const owner = readFileSync(new URL('../../src/routes/owner/+page.svelte', import.meta.url), 'utf8');
const cobro = readFileSync(new URL('../../src/routes/caja/cobro/+page.svelte', import.meta.url), 'utf8');

/**
 * F-6 (auditoría browser) — cero IDs/placeholders demo en el copy y los
 * flujos del POS (sale-demo, sp-demo, cust-demo, demo-quarantine, RUC de
 * ejemplo). Los test doubles de fixtures e2e NO se escanean: esto es solo
 * fuente de rutas.
 */
describe('F-6 contrato: cero IDs demo en fuentes de rutas', () => {
  it('cobro: sin sale-demo, sp-demo ni idempotency demo', () => {
    expect(cobro).not.toContain('sale-demo');
    expect(cobro).not.toContain('sp-demo');
    expect(cobro).not.toContain("`demo-${");
  });

  it('cobro: sin customer demo por defecto', () => {
    expect(cobro).not.toContain("'cust-demo'");
    expect(cobro).not.toContain('"cust-demo"');
  });

  it('owner: sin demo-quarantine ni texto local-demo', () => {
    expect(owner).not.toContain('demo-quarantine');
    expect(owner).not.toContain('local demo');
  });

  it('+page: sin RUC de ejemplo hardcodeado', () => {
    expect(pos).not.toMatch(/ruc:\s*['"]2\d{10}['"]/);
  });
});