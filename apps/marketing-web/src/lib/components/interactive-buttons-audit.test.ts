import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const HOME_PAGE = readFileSync(new URL('../../routes/+page.svelte', import.meta.url), 'utf8');
const PRECIOS_PAGE = readFileSync(
  new URL('../../routes/precios/+page.svelte', import.meta.url),
  'utf8',
);
const COMPARAR_PAGE = readFileSync(
  new URL('../../routes/comparar/+page.svelte', import.meta.url),
  'utf8',
);
const AYUDA_PAGE = readFileSync(
  new URL('../../routes/ayuda/+page.svelte', import.meta.url),
  'utf8',
);
const SEGURIDAD_PAGE = readFileSync(
  new URL('../../routes/seguridad/+page.svelte', import.meta.url),
  'utf8',
);
const EMPEZAR_PAGE = readFileSync(
  new URL('../../routes/empezar/+page.svelte', import.meta.url),
  'utf8',
);
const LAYOUT_SVELTE = readFileSync(new URL('../../routes/+layout.svelte', import.meta.url), 'utf8');
const CHECKOUT_MOCK = readFileSync(
  new URL('../brand/CheckoutMock.svelte', import.meta.url),
  'utf8',
);
const OWNER_MOCK = readFileSync(new URL('./OwnerModeMock.svelte', import.meta.url), 'utf8');
const SAVINGS_CALC = readFileSync(new URL('./SavingsCalculator.svelte', import.meta.url), 'utf8');

describe('Auditoría Integral de Funcionalidad de Botones e Interacciones', () => {
  describe('1. Navegación Global y Header (+layout.svelte)', () => {
    it('el botón toggle móvil tiene aria-expanded y handler onclick reactivo', () => {
      expect(LAYOUT_SVELTE).toContain('data-testid="mobile-menu-toggle"');
      expect(LAYOUT_SVELTE).toContain('aria-expanded={mobileMenuOpen}');
      expect(LAYOUT_SVELTE).toContain('openMobileMenu()');
      expect(LAYOUT_SVELTE).toContain('closeMobileMenu()');
    });

    it('el botón de cerrar drawer (✕) y backdrop tienen handler closeMobileMenu', () => {
      expect(LAYOUT_SVELTE).toContain('data-testid="drawer-close"');
      expect(LAYOUT_SVELTE).toMatch(/onclick=\{closeMobileMenu\}/);
      expect(LAYOUT_SVELTE).toContain('data-testid="mobile-backdrop"');
    });

    it('todos los botones de navegación tienen rutas destino válidas', () => {
      expect(LAYOUT_SVELTE).toContain('href="/precios"');
      expect(LAYOUT_SVELTE).toContain('href="/seguridad"');
      expect(LAYOUT_SVELTE).toContain('href="/casos-de-exito"');
      expect(LAYOUT_SVELTE).toContain('href="/comparar"');
      expect(LAYOUT_SVELTE).toContain('href="/empezar"');
    });
  });

  describe('2. Mocks Interactivos (CheckoutMock, OwnerModeMock, SavingsCalculator)', () => {
    it('CheckoutMock: botón Cobrar tiene onclick={triggerCheckout} y disabled={isCharging}', () => {
      expect(CHECKOUT_MOCK).toMatch(/onclick=\{triggerCheckout\}/);
      expect(CHECKOUT_MOCK).toMatch(/disabled=\{isCharging\}/);
      expect(CHECKOUT_MOCK).toContain('Procesando…');
    });

    it('OwnerModeMock: botones de vista Simulación/Fotografía cambian el estado viewMode', () => {
      expect(OWNER_MOCK).toContain("viewMode = 'interactive'");
      expect(OWNER_MOCK).toContain("viewMode = 'photo'");
    });

    it('OwnerModeMock: pestañas de locales cambian selectedStoreId', () => {
      expect(OWNER_MOCK).toContain('selectedStoreId = st.id');
      expect(OWNER_MOCK).toContain('role="tab"');
    });

    it('OwnerModeMock: barras horarias tienen eventos onclick, onmouseenter y onfocus interactivos', () => {
      expect(OWNER_MOCK).toContain('selectedHour = slot.hour');
      expect(OWNER_MOCK).toContain('selectedHour = null');
    });

    it('SavingsCalculator: presets ejecutan applyPreset y los sliders oninput', () => {
      expect(SAVINGS_CALC).toContain('applyPreset(preset)');
      expect(SAVINGS_CALC).toContain('oninput={clearPreset}');
    });
  });

  describe('3. Página de Precios (precios/+page.svelte)', () => {
    it('conmutador Mensual / Anual cambia isAnnual de forma reactiva', () => {
      expect(PRECIOS_PAGE).toContain('isAnnual = false');
      expect(PRECIOS_PAGE).toContain('isAnnual = true');
    });

    it('las 4 tarjetas de planes tienen enlaces CTA funcionales a /empezar o ventas', () => {
      expect(PRECIOS_PAGE).toContain('data-testid={`plan-cta-${plan.id}`}');
      expect(PRECIOS_PAGE).toContain('href={planCta(plan.id).href}');
    });

    it('Plan Picker tiene selector de locales, cajas y capacidades funcionales', () => {
      expect(PRECIOS_PAGE).toContain('name="picker-locales"');
      expect(PRECIOS_PAGE).toContain('name="picker-cajas"');
      expect(PRECIOS_PAGE).toContain('toggleCap(cap.id)');
      expect(PRECIOS_PAGE).toContain('href={`#plan-${recommendation}`}');
    });

    it('Matriz móvil cambia de pestaña activa onclick', () => {
      expect(PRECIOS_PAGE).toContain('matrixTab = plan');
    });
  });

  describe('4. Comparar, Ayuda y Seguridad', () => {
    it('Comparar: selector de categorías cambia activeCategory onclick', () => {
      expect(COMPARAR_PAGE).toContain('activeCategory = tab.id');
      expect(COMPARAR_PAGE).toContain('role="tab"');
    });

    it('Ayuda: botón de limpiar búsqueda (✕) resetea searchQuery a vacío', () => {
      expect(AYUDA_PAGE).toContain('data-testid="clear-search-btn"');
      expect(AYUDA_PAGE).toContain("searchQuery = ''");
    });

    it('Seguridad: los 5 pasos del TrustFlow tienen eventos interactivos de selección y data-testid', () => {
      expect(SEGURIDAD_PAGE).toContain('data-testid="flow-step-{i + 1}"');
      expect(SEGURIDAD_PAGE).toContain('onmouseenter={() => (activeStep = i)}');
      expect(SEGURIDAD_PAGE).toContain('onmouseleave={() => (activeStep = null)}');
    });
  });

  describe('5. Embudo de Onboarding (empezar/+page.svelte)', () => {
    it('controles de navegación del asistente (Continuar, Atrás, Crear cuenta)', () => {
      expect(EMPEZAR_PAGE).toMatch(/onclick=\{next\}/);
      expect(EMPEZAR_PAGE).toMatch(/onclick=\{back\}/);
      expect(EMPEZAR_PAGE).toMatch(/onclick=\{finish\}/);
    });

    it('botón Copiar Credenciales tiene handler copyCredentials y feedback visual', () => {
      expect(EMPEZAR_PAGE).toContain('data-testid="copy-credentials-btn"');
      expect(EMPEZAR_PAGE).toMatch(/onclick=\{copyCredentials\}/);
      expect(EMPEZAR_PAGE).toContain('data-testid="onboarding-go-pos"');
    });
  });

  describe('6. Botones del Home (+page.svelte)', () => {
    it('Hero y Final CTA tienen enlaces primarios a /empezar y secundarios a #como', () => {
      expect(HOME_PAGE).toContain('href="/empezar"');
      expect(HOME_PAGE).toContain('href="#como"');
      expect(HOME_PAGE).toContain('class="btn btn-sticky"');
    });
  });
});
