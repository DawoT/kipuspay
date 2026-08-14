import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const routes = [
  '../../routes/caja/cuotas/+page.svelte',
  '../../routes/admin/credito-tienda/+page.svelte',
  '../../routes/admin/inventario/+page.svelte',
  '../../routes/admin/integraciones/+page.svelte',
  '../../routes/admin/oc-recepcion/+page.svelte',
  '../../routes/admin/factura-proveedor/+page.svelte',
  '../../routes/caja/cotizacion/+page.svelte',
  '../../routes/caja/apartado/+page.svelte',
  '../../routes/caja/vale/+page.svelte',
  '../../routes/owner/+page.svelte',
  '../../routes/admin/ubicaciones/+page.svelte',
  '../../routes/admin/configuracion/+page.svelte',
] as const;

describe('rutas POS listadas usan apiFetch (Fase F)', () => {
  it('no hacen fetch(`${apiBase`) y no siembran demos', () => {
    for (const rel of routes) {
      const source = readFileSync(new URL(rel, import.meta.url), 'utf8');
      expect(source, rel).not.toMatch(/fetch\(`\$\{(apiBase|resolveApiBase)/);
      expect(source, rel).not.toMatch(/\b(c-demo|u-demo|po-demo|oc-demo)\b/);
    }
  });

  it('crédito de tienda no llama /issue; el vale se emite en Caja', () => {
    const source = readFileSync(new URL('../../routes/admin/credito-tienda/+page.svelte', import.meta.url), 'utf8');
    expect(source).not.toContain('/api/ledger/store-credit/issue');
    expect(source).toMatch(/vale se emite en Caja/i);
    expect(source).toContain('apiFetch');
  });
});
