import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const LAYOUT = readFileSync(new URL('../../routes/owner/+layout.svelte', import.meta.url), 'utf8');

describe('owner shell density (GTM §6.3 + Arquitectura §0.2.4)', () => {
  it('solo capa 28rem dentro del media query móvil', () => {
    const mediaIdx = LAYOUT.indexOf('@media (max-width: 719px)');
    expect(mediaIdx).toBeGreaterThan(-1);
    expect(LAYOUT.slice(0, mediaIdx)).not.toMatch(/max-width:\s*28rem/);
    expect(LAYOUT.slice(mediaIdx)).toMatch(/max-width:\s*28rem/);
  });

  it('en escritorio el cuerpo llega al page-shell', () => {
    expect(LAYOUT).toMatch(/\.owner-body[\s\S]*?max-width:\s*1280px/);
  });

  it('no duplica el rótulo Modo Dueño en el chrome', () => {
    expect(LAYOUT).not.toMatch(/<p class="mode">Modo Dueño<\/p>/);
  });
});

describe('owner sidebar premium (Hallazgo 2026-08-25 — navegación completa)', () => {
  it('monta sidebar colapsable con branding KipusPay y toggle', () => {
    expect(LAYOUT).toContain('data-testid="owner-sidebar"');
    expect(LAYOUT).toContain('data-testid="owner-sidebar-toggle"');
    expect(LAYOUT).toContain('ownerSidebarGroups');
    expect(LAYOUT).toContain('sidebar-collapsed');
    expect(LAYOUT).toContain('toggleSidebar');
    expect(LAYOUT).toMatch(/aria-label=\{sidebarOpen \? 'Colapsar/);
    expect(LAYOUT).toMatch(/min-height:\s*48px/);
  });

  it('cubre navegación Dueño: Hoy, Ventas, Finanzas, Locales, Stock, Alertas, Mi perfil, Configuración', () => {
    expect(LAYOUT).toContain('ownerSidebarGroups');
    expect(LAYOUT).toContain('data-testid={item.testid}');
    // Los ids concretos viven en owner-nav.ts (fuente única de hrefs para orphan check)
    const NAV = readFileSync(new URL('./owner-nav.ts', import.meta.url), 'utf8');
    for (const id of [
      'owner-nav-hoy',
      'owner-nav-pos',
      'owner-nav-finanzas',
      'owner-nav-locales',
      'owner-nav-stock',
      'owner-nav-alertas',
      'owner-nav-yo',
      'owner-nav-config',
    ]) {
      expect(NAV).toContain(id);
    }
  });

  it('drawer móvil con hamburguesa y overlay a 719px', () => {
    expect(LAYOUT).toContain('data-testid="owner-hamburger"');
    expect(LAYOUT).toContain('data-testid="owner-nav-overlay"');
    expect(LAYOUT).toContain("COMPACT_MQ = '(max-width: 719px)'");
    expect(LAYOUT).toMatch(
      /@media \(max-width: 719px\)[\s\S]*?\.owner-hamburger[\s\S]*?display:\s*flex/,
    );
    expect(LAYOUT).toMatch(
      /\.owner-shell\.sidebar-collapsed \.owner-sidebar[\s\S]*?transform:\s*translateX\(-100%\)/,
    );
    expect(LAYOUT).toMatch(
      /padding-bottom:\s*calc\(\s*5\.5rem\s*\+\s*env\(\s*safe-area-inset-bottom/,
    );
  });

  it('grupos colapsables con 44px targets, iconografía y estado activo', () => {
    expect(LAYOUT).toContain('expandedGroups');
    expect(LAYOUT).toContain('toggleGroup');
    expect(LAYOUT).toContain('owner-nav-group-header');
    expect(LAYOUT).toContain('owner-nav-item');
    expect(LAYOUT).toContain('owner-nav-item-active');
    expect(LAYOUT).toContain('aria-expanded={expandedGroups');
    expect(LAYOUT).toContain('aria-current');
    expect(LAYOUT).toMatch(/\.owner-nav-item[\s\S]*?min-height:\s*44px/);
    expect(LAYOUT).toMatch(/\.owner-nav-group-header[\s\S]*?min-height:\s*48px/);
  });

  it('usa Design System (tokens, tabular, focus, contraste AA)', () => {
    expect(LAYOUT).toContain('var(--bg-glass)');
    expect(LAYOUT).toContain('var(--border-subtle)');
    expect(LAYOUT).toContain('var(--accent-gradient)');
    expect(LAYOUT).toContain('var(--font-heading)');
    expect(LAYOUT).toMatch(/:focus-visible/);
    expect(LAYOUT).toContain('backdrop-filter: blur');
  });

  it('mantiene safe-area y no introduce jerga técnica', () => {
    expect(LAYOUT).toMatch(/env\(safe-area-inset-top/);
    expect(LAYOUT).toMatch(/env\(safe-area-inset-bottom/);
    expect(LAYOUT).not.toMatch(/\b(PSE|CDR|UBL|D1|Workers|Edge|ACID)\b/);
  });

  it('breadcrumb reutiliza ops-copy y estado en línea visible', () => {
    expect(LAYOUT).toContain('breadcrumbLabel');
    expect(LAYOUT).toContain('owner-breadcrumb');
    expect(LAYOUT).toContain('En línea');
    expect(LAYOUT).toContain('Sin conexión');
  });
});
