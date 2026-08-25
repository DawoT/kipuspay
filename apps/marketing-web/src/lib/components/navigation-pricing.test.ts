import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PRICING_PLANS, planCta } from '../content/pricing.js';

const css = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../../routes/+layout.svelte', import.meta.url), 'utf8');
const precios = readFileSync(new URL('../../routes/precios/+page.svelte', import.meta.url), 'utf8');

describe('Sprint 11A — Grilla de Precios (4 columnas) y Navegación Móvil Moderna con Drawer', () => {
  describe('Grilla de precios 4 columnas y alturas uniformes', () => {
    it('muestra 4 planes con estructura contigua en desktop (repeat 4)', () => {
      expect(css).toMatch(
        /@media\s*\(min-width:\s*899px\)[\s\S]*?\.pricing-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/,
      );
    });

    it('en tablets muestra 2 columnas contiguas', () => {
      expect(css).toMatch(
        /@media\s*\(min-width:\s*719px\)[\s\S]*?\.pricing-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
      );
    });

    it('en móviles muestra 1 columna (flex vertical)', () => {
      expect(css).toMatch(
        /\.pricing-grid\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-direction:\s*column;/,
      );
    });

    it('cada tarjeta de plan tiene altura uniforme (flex-col, justify-between, h-full)', () => {
      expect(css).toMatch(
        /\.pricing-card\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-direction:\s*column;[\s\S]*?justify-content:\s*space-between;[\s\S]*?height:\s*100%;/,
      );
      expect(precios).toContain('class="pricing-card-content"');
      expect(precios).toContain('class="pricing-card-action"');
    });

    it('el CTA está alineado al fondo en cada tarjeta', () => {
      expect(css).toMatch(/\.pricing-card\s+\.btn\s*\{[\s\S]*?margin-top:\s*auto;/);
      expect(precios).toContain('data-testid={`plan-cta-${plan.id}`}');
      for (const plan of PRICING_PLANS) {
        expect(planCta(plan.id).href).toBeTruthy();
        expect(planCta(plan.id).label).toBeTruthy();
      }
    });

    it('el plan Crece se destaca como "Más elegido" con borde ámbar', () => {
      const crece = PRICING_PLANS.find((p) => p.id === 'crece');
      expect(crece?.badge).toBe('Más elegido');
      expect(precios).toContain("class:highlight={plan.id === 'crece'}");
      expect(css).toMatch(
        /\.pricing-card\.highlight\s*\{[\s\S]*?border-left-color:\s*var\(--amber\);/,
      );
    });
  });

  describe('Navegación móvil moderna con Drawer y Backdrop', () => {
    it('el botón hamburguesa tiene aria-expanded reactivo y aria-label accesible', () => {
      expect(layout).toContain('class="nav-sm-toggle"');
      expect(layout).toContain('aria-expanded={mobileMenuOpen}');
      expect(layout).toContain('aria-controls="mobile-drawer"');
      expect(layout).toContain('aria-label="Abrir menú de navegación"');
      expect(css).toMatch(
        /\.nav-sm-toggle\s*\{[\s\S]*?min-width:\s*44px;[\s\S]*?min-height:\s*44px;/,
      );
    });

    it('el drawer móvil es accesible (role="dialog", aria-modal="true", aria-label)', () => {
      expect(layout).toContain('id="mobile-drawer"');
      expect(layout).toContain('role="dialog"');
      expect(layout).toContain('aria-modal="true"');
      expect(layout).toContain('aria-label="Menú de navegación"');
    });

    it('implementa backdrop semitransparente oscuro bg-ink/60 con fade', () => {
      expect(layout).toContain('class="mobile-backdrop"');
      expect(layout).toContain('onclick={closeMobileMenu}');
      expect(css).toMatch(
        /\.mobile-backdrop\s*\{[\s\S]*?background:\s*rgba\(20,\s*22,\s*28,\s*0\.6\);/,
      );
    });

    it('el botón de cierre ✕ tiene touch target >= 44px y aria-label="Cerrar menú"', () => {
      expect(layout).toContain('class="drawer-close"');
      expect(layout).toContain('aria-label="Cerrar menú"');
      expect(css).toMatch(
        /\.drawer-close\s*\{[\s\S]*?min-width:\s*44px;[\s\S]*?min-height:\s*44px;/,
      );
    });

    it('los enlaces de navegación del drawer tienen touch target >= 44px y cierran el drawer al hacer clic', () => {
      expect(layout).toContain('class="drawer-nav"');
      expect(layout).toContain('onclick={closeMobileMenu}');
      expect(css).toMatch(/\.drawer-nav a\s*\{[\s\S]*?min-height:\s*44px;/);
    });

    it('cierra automáticamente al presionar Escape o cambiar de ruta', () => {
      expect(layout).toContain("e.key === 'Escape'");
      expect(layout).toContain('closeMobileMenu()');
      expect(layout).toContain('if (pathname) {');
    });

    it('en escritorio los dropdowns tienen safe-zone para evitar cierres accidentales', () => {
      expect(css).toMatch(
        /\.dropdown::before\s*\{[\s\S]*?content:\s*['"]['"];[\s\S]*?height:\s*0\.5rem;/,
      );
    });

    it('respeta prefers-reduced-motion en animaciones', () => {
      expect(css).toMatch(
        /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?animation-duration:\s*0\.01ms\s*!important/,
      );
    });
  });
});
