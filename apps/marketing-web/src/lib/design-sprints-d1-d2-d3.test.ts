import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatCents } from './brand/money.js';

const CHECKOUT_MOCK = readFileSync(new URL('./brand/CheckoutMock.svelte', import.meta.url), 'utf8');
const OWNER_MOCK = readFileSync(
  new URL('./components/OwnerModeMock.svelte', import.meta.url),
  'utf8',
);
const SAVINGS_CALC = readFileSync(
  new URL('./components/SavingsCalculator.svelte', import.meta.url),
  'utf8',
);
const PRECIOS_PAGE = readFileSync(
  new URL('../routes/precios/+page.svelte', import.meta.url),
  'utf8',
);
const TIMELINE_COMP = readFileSync(
  new URL('./components/MigrationTimeline.svelte', import.meta.url),
  'utf8',
);
const SEGURIDAD_PAGE = readFileSync(
  new URL('../routes/seguridad/+page.svelte', import.meta.url),
  'utf8',
);
const APP_CSS = readFileSync(new URL('../app.css', import.meta.url), 'utf8');

describe('Sprints D1, D2 y D3 — Diseño Premium y Pulido UI/UX Staff', () => {
  describe('Sprint D1: Mocks de Producto y Calculadora', () => {
    it('CheckoutMock incluye desglose fiscal contable (OP. GRAVADA, IGV 18%) en céntimos enteros (CAL-01)', () => {
      expect(CHECKOUT_MOCK).toContain('OP. GRAVADA');
      expect(CHECKOUT_MOCK).toContain('I.G.V. (18%)');
      expect(CHECKOUT_MOCK).toContain('formatCents(Math.round(total_cents / 1.18))');
      expect(CHECKOUT_MOCK).toContain('formatCents(total_cents - Math.round(total_cents / 1.18))');
      expect(CHECKOUT_MOCK).toContain('class="fiscal-breakdown"');
      expect(CHECKOUT_MOCK).toContain('class="fiscal-row"');
    });

    it('CheckoutMock incluye línea de corte punteada, micro-código tributario y dentado térmico', () => {
      expect(CHECKOUT_MOCK).toContain('class="ticket-perforation"');
      expect(CHECKOUT_MOCK).toContain('class="ticket-validation"');
      expect(CHECKOUT_MOCK).toContain('COMPROBANTE AUTORIZADO');
      expect(CHECKOUT_MOCK).toContain('class="ticket-bottom-tear"');
      expect(CHECKOUT_MOCK).toMatch(/\.ticket-perforation\s*\{[^}]*repeating-linear-gradient/);
      expect(CHECKOUT_MOCK).toMatch(/\.ticket-bottom-tear\s*\{[^}]*clip-path:\s*polygon/);
    });

    it('OwnerModeMock incluye bisel de titanio pulido y sombra perimetral profunda', () => {
      expect(OWNER_MOCK).toMatch(/border:\s*3\.5px solid #333842;/);
      expect(OWNER_MOCK).toMatch(
        /box-shadow:\s*0 25px 60px -12px rgba\(0,\s*0,\s*0,\s*0\.7\),\s*0 0 0 1px rgba\(255,\s*255,\s*255,\s*0\.08\);/,
      );
    });

    it('OwnerModeMock incluye indicador palpitante .pulse-dot-live con @keyframes livePulse y copy EN VIVO', () => {
      expect(OWNER_MOCK).toContain('pulse-dot-live');
      expect(OWNER_MOCK).toContain('Cajas en línea · EN VIVO');
      expect(OWNER_MOCK).toMatch(/@keyframes livePulse\s*\{/);
      expect(OWNER_MOCK).toMatch(
        /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.pulse-dot-live\s*\{[^}]*animation:\s*none;/,
      );
    });

    it('OwnerModeMock incluye minigráfico interactivo de barras horarias en Soles (09:00 a 19:00) en céntimos (CAL-01)', () => {
      expect(OWNER_MOCK).toContain('class="hourly-rhythm-card"');
      expect(OWNER_MOCK).toContain('class="hourly-chart"');
      expect(OWNER_MOCK).toContain('class="hourly-bar-btn"');
      expect(OWNER_MOCK).toContain('Ritmo de ventas por hora');
      expect(OWNER_MOCK).toContain('09:00');
      expect(OWNER_MOCK).toContain('19:00');
      expect(OWNER_MOCK).toContain('currentStore.hourlySales');

      // Verifica formateo con formatCents sobre los puntos horarios
      expect(formatCents(24500)).toBe('245.00');
      expect(formatCents(125000)).toBe('1250.00');
      expect(formatCents(116000)).toBe('1160.00');
    });

    it('SavingsCalculator ajusta el mínimo a 5 tickets/día y calcula relleno dinámico --track-fill', () => {
      expect(SAVINGS_CALC).toMatch(/id="ticket-slider"[\s\S]*?min="5"/);
      expect(SAVINGS_CALC).toContain('--track-fill:');
      expect(SAVINGS_CALC).toMatch(/::-webkit-slider-runnable-track[\s\S]*?--track-fill/);
      expect(SAVINGS_CALC).toMatch(/::-moz-range-track[\s\S]*?--track-fill/);
    });

    it('SavingsCalculator incluye el sello contable "AHORRO AUDITADO"', () => {
      expect(SAVINGS_CALC).toContain('data-testid="savings-audit-seal"');
      expect(SAVINGS_CALC).toContain('AHORRO AUDITADO');
      expect(SAVINGS_CALC).toContain('class="audit-seal"');
      expect(SAVINGS_CALC).toContain('class="audit-knot"');
    });
  });

  describe('Sprint D2: Precios, TrustFlow y Timeline', () => {
    it('Precios Crece card tiene resplandor perimetral ámbar y elevación scale(1.02) en desktop', () => {
      expect(APP_CSS).toMatch(
        /@media\s*\(min-width:\s*899px\)[\s\S]*?\.pricing-card\.highlight\s*\{[^}]*transform:\s*scale\(1\.02\);[^}]*box-shadow:\s*var\(--shadow-glow\);/,
      );
      expect(APP_CSS).toMatch(
        /@media\s*\(min-width:\s*899px\)\s*and\s*\(hover:\s*hover\)[\s\S]*?\.pricing-card\.highlight:hover\s*\{[^}]*transform:\s*scale\(1\.03\)\s*translateY\(-2px\);/,
      );
    });

    it('Precios renderiza la insignia en relieve con micro-nudo diamante', () => {
      expect(PRECIOS_PAGE).toContain('class="badge-knot"');
      expect(PRECIOS_PAGE).toContain('◆');
      expect(PRECIOS_PAGE).toMatch(/\.pricing-badge\s*\{[^}]*box-shadow:\s*0 2px 5px/);
      expect(PRECIOS_PAGE).toMatch(/\.pricing-badge\s*\{[^}]*inset 0 1px 0/);
    });

    it('MigrationTimeline implementa cordel vertical continuo de fibra quipu (--fiber) con 4 hitos', () => {
      expect(TIMELINE_COMP).toMatch(/\.lane-steps::before\s*\{[^}]*background:\s*var\(--fiber\);/);
      expect(TIMELINE_COMP).toMatch(/\.lane-kipus\s+\.lane-steps::before\s*\{[^}]*var\(--amber\)/);
      expect(TIMELINE_COMP).toMatch(/\.lane-kipus\s+\.lane-dot\s*\{[^}]*box-shadow:/);
      expect(TIMELINE_COMP).toContain('Te registras en 1 minuto');
      expect(TIMELINE_COMP).toContain('Importas tu catálogo');
      expect(TIMELINE_COMP).toContain('Configuras tus puntos de venta');
      expect(TIMELINE_COMP).toContain('Cobras el mismo día');
    });

    it('TrustFlow en /seguridad implementa micro-animación de pulso (flowPulse) al hover/focus', () => {
      expect(SEGURIDAD_PAGE).toMatch(
        /\.trust-flow__step:hover\s+\.trust-flow__line[\s\S]*?animation:\s*flowPulse/,
      );
      expect(SEGURIDAD_PAGE).toMatch(
        /\.trust-flow__step:focus-visible\s+\.trust-flow__line[\s\S]*?animation:\s*flowPulse/,
      );
      expect(SEGURIDAD_PAGE).toMatch(/@keyframes flowPulse\s*\{/);
      expect(SEGURIDAD_PAGE).toMatch(
        /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?animation:\s*none;/,
      );
    });
  });

  describe('Sprint D3: Macro-Ritmo Editorial y Tokens Globales', () => {
    it('app.css define ritmo vertical fluido clamp(5rem, 8vw, 7.5rem) en .section', () => {
      expect(APP_CSS).toMatch(
        /\.section\s*\{[^}]*padding:\s*clamp\(5rem,\s*8vw,\s*7\.5rem\)\s*var\(--inset-section-x\);/,
      );
    });

    it('app.css define micro-gradientes radiales sutiles en superficies oscuras', () => {
      expect(APP_CSS).toMatch(
        /\.section:not\(\.section-paper\)\s*\{[^}]*background-image:\s*radial-gradient/,
      );
    });

    it('app.css define anillo de foco accesible doble en botones y elementos interactivos', () => {
      expect(APP_CSS).toMatch(
        /:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--amber-bright\);[^}]*box-shadow:\s*0 0 0 1px var\(--ink\);/,
      );
      expect(APP_CSS).toMatch(/\.btn:focus-visible\s*\{[^}]*box-shadow:\s*0 0 0 2px var\(--ink\);/);
      expect(APP_CSS).toMatch(
        /\.section-paper \.btn:focus-visible\s*\{[^}]*box-shadow:\s*0 0 0 2px var\(--paper\);/,
      );
    });
  });
});
