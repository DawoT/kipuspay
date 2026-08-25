// Lee el código fuente de la página y verifica contratos de markup
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ownerPage = readFileSync(new URL('../../routes/owner/+page.svelte', import.meta.url), 'utf8');

describe('Sprint 66 — Owner Dashboard KPI Enterprise', () => {
  it('tiene tarjeta de ticket promedio con testid hoy-ticket-avg', () => {
    expect(ownerPage).toContain('data-testid="hoy-ticket-avg"');
  });

  it('tiene timestamp de refresh con testid hoy-refresh-ts', () => {
    expect(ownerPage).toContain('data-testid="hoy-refresh-ts"');
  });

  it('tiene quick-nav con 4 links a secciones owner', () => {
    expect(ownerPage).toContain('data-testid="owner-quick-finanzas"');
    expect(ownerPage).toContain('data-testid="owner-quick-locales"');
    expect(ownerPage).toContain('data-testid="owner-quick-stock"');
    expect(ownerPage).toContain('data-testid="owner-quick-yo"');
  });

  it('el delta de ventas usa emerald/rose sin jerga tecnica', () => {
    expect(ownerPage).toContain('stat-delta');
    expect(ownerPage).not.toMatch(/\b(PSE|CDR|UBL|D1|Workers|Edge|ACID)\b/);
  });

  it('quick-nav tiene touch targets min 44px', () => {
    expect(ownerPage).toMatch(/min-height:\s*44px/);
  });

  it('las stat-cards tienen hover con shadow', () => {
    expect(ownerPage).toContain('var(--shadow-sm)');
  });

  it('cero demo literals en owner page', () => {
    expect(ownerPage).not.toMatch(/['"`]demo['"`]/);
  });
});
