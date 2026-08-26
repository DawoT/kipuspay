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

  it('Resumen del día tiene placeholder ilustrado con CTA cuando no hay ventas', () => {
    expect(ownerPage).toContain('data-testid="owner-empty-day"');
    expect(ownerPage).toContain('data-testid="empty-cta-finanzas"');
    expect(ownerPage).toContain('data-testid="empty-cta-caja"');
    expect(ownerPage).toContain('Aún sin movimiento hoy');
    expect(ownerPage).toContain('Ver Finanzas');
    expect(ownerPage).toContain('Ir a la caja');
    expect(ownerPage).toContain('empty-day-hero');
    expect(ownerPage).not.toMatch(/\b(PSE|CDR|UBL|D1|Workers|Edge|ACID)\b/);
  });

  it('timestamp Actualizado al conectar permanece visible y no se rompe con 0', () => {
    expect(ownerPage).toContain('data-testid="hoy-source"');
    expect(ownerPage).toContain('Actualizado al conectar');
    expect(ownerPage).toContain('tabular-nums');
    expect(ownerPage).toContain('data-testid="hoy-net"');
    expect(ownerPage).toContain('data-testid="hoy-docs"');
    expect(ownerPage).toContain('data-testid="hoy-alertas"');
  });

  it('mantiene navegación primaria vía sidebar pero quick-nav sigue como atajo', () => {
    expect(ownerPage).toContain('owner-quick-nav');
    expect(ownerPage).toContain('aria-label="Accesos rápidos Modo Dueño"');
    // El layout + layout premium provee el sidebar; la página no duplica el shell
    expect(ownerPage).toContain('page-masthead');
    expect(ownerPage).toContain('Resumen del día');
    expect(ownerPage).toContain('Lo que importa hoy');
  });

  it('showEmptyDay combina rollup 0 + sin alertas ni reportes (server autoritativo)', () => {
    expect(ownerPage).toContain('showEmptyDay');
    expect(ownerPage).toContain('hasAlertsData');
    expect(ownerPage).toContain('hasReports');
    expect(ownerPage).toContain('(snap?.docCount ?? 0) === 0');
  });

  it('usa EmptyState y Button del Design System con 44px', () => {
    expect(ownerPage).toContain("from '$lib/ui/EmptyState.svelte'");
    expect(ownerPage).toContain("from '$lib/ui/Button.svelte'");
    expect(ownerPage).toMatch(/min-height:\s*44px/);
  });
});
