import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../../routes/admin/configuracion/+page.svelte', import.meta.url),
  'utf8',
);

describe('admin configuración — contrato API absoluto', () => {
  it('cancel y plan usan apiFetch (resolveApiBase), no fetch relativo', () => {
    expect(source).toContain("apiFetch('/api/tenant/cancel'");
    expect(source).toContain("apiFetch('/api/tenant/plan'");
    expect(source).toContain("apiFetch('/api/tenant/billing-portal'");
    expect(source).toContain("apiFetch('/api/tenant/checkout-session'");
    expect(source).toContain('location.origin');
    expect(source).not.toMatch(/returnUrl: 'https:\/\/app\.kipuspay\.com/);
    expect(source).not.toMatch(/fetch\('\/api\/tenant\/cancel'/);
    expect(source).not.toMatch(/fetch\('\/api\/tenant\/plan'/);
  });

  it('export de catálogo y ventas es descarga autenticada', () => {
    expect(source).toContain("downloadExport('/api/catalog/export'");
    expect(source).toContain("downloadExport('/api/sales/export'");
    expect(source).not.toContain("downloadExport('/api/reports/day-summary'");
  });
});
