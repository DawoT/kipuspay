import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const APP_CSS = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
const HOME_PAGE = readFileSync(new URL('../routes/+page.svelte', import.meta.url), 'utf8');
const COMPARAR_PAGE = readFileSync(
  new URL('../routes/comparar/+page.svelte', import.meta.url),
  'utf8',
);
const AYUDA_PAGE = readFileSync(new URL('../routes/ayuda/+page.svelte', import.meta.url), 'utf8');
const VERTICAL_VIEW = readFileSync(
  new URL('./components/VerticalLandingView.svelte', import.meta.url),
  'utf8',
);
const SAVINGS_CALCULATOR = readFileSync(
  new URL('./components/SavingsCalculator.svelte', import.meta.url),
  'utf8',
);
const OWNER_MOCK = readFileSync(
  new URL('./components/OwnerModeMock.svelte', import.meta.url),
  'utf8',
);

describe('Sprints V1, V2 y V3 — Refinamiento Visual y Elevaciones Canónicas', () => {
  describe('Tokens Canónicos de Radio y Sombras/Glow (:root)', () => {
    it('define la escala canónica de radios en :root', () => {
      expect(APP_CSS).toMatch(/--radius-none:\s*0/);
      expect(APP_CSS).toMatch(/--radius-xs:\s*2px/);
      expect(APP_CSS).toMatch(/--radius-sm:\s*4px/);
      expect(APP_CSS).toMatch(/--radius-md:\s*6px/);
      expect(APP_CSS).toMatch(/--radius-lg:\s*12px/);
      expect(APP_CSS).toMatch(/--radius-full:\s*9999px/);
      expect(APP_CSS).toMatch(/--radius:\s*var\(--radius-none\)/);
    });

    it('define el kit de sombras y resplandores en :root', () => {
      expect(APP_CSS).toMatch(/--shadow-sm:\s*0 1px 3px rgba\(10, 12, 16, 0\.25\)/);
      expect(APP_CSS).toMatch(/--shadow-md:\s*0 4px 14px rgba\(10, 12, 16, 0\.35\)/);
      expect(APP_CSS).toMatch(/--shadow-lg:\s*0 16px 40px rgba\(10, 12, 16, 0\.5\)/);
      expect(APP_CSS).toMatch(/--shadow-glow:\s*0 0 24px rgba\(217, 154, 61, 0\.28\)/);
      expect(APP_CSS).toMatch(/--shadow-sello:\s*0 0 24px rgba\(46, 158, 116, 0\.28\)/);
      expect(APP_CSS).toMatch(/--border-glow:\s*rgba\(217, 154, 61, 0\.45\)/);
    });

    it('define el sistema canónico de badges .k-badge', () => {
      expect(APP_CSS).toMatch(/\.k-badge\s*\{[^}]*display:\s*inline-flex/);
      expect(APP_CSS).toMatch(/\.k-badge\s*\{[^}]*font-family:\s*var\(--font-mono\)/);
      expect(APP_CSS).toMatch(/\.k-badge\s*\{[^}]*border-radius:\s*var\(--radius-xs\)/);
      expect(APP_CSS).toMatch(/\.k-badge--status-ok\s*\{[^}]*color:\s*var\(--sello-bright\)/);
      expect(APP_CSS).toMatch(/\.k-badge--status-prep\s*\{[^}]*color:\s*var\(--amber-bright\)/);
      expect(APP_CSS).toMatch(/\.k-badge--tag\s*\{[^}]*color:\s*var\(--paper-dim\)/);
      expect(APP_CSS).toMatch(/\.k-badge--accent\s*\{[^}]*color:\s*var\(--amber-bright\)/);
    });

    it('define la tipografía monetaria tabular .pricing-price-display', () => {
      expect(APP_CSS).toMatch(
        /\.pricing-price-display\s*\{[^}]*font-family:\s*var\(--font-display\)/,
      );
      expect(APP_CSS).toMatch(/\.pricing-price-display \.curr\s*\{[^}]*font-size:\s*1\.15rem/);
      expect(APP_CSS).toMatch(
        /\.pricing-price-display \.amount\s*\{[^}]*font-variant-numeric:\s*tabular-nums/,
      );
      expect(APP_CSS).toMatch(
        /\.pricing-price-display \.period\s*\{[^}]*font-family:\s*var\(--font-mono\)/,
      );
    });
  });

  describe('Acordeones FAQ Fluidos con CSS Grid', () => {
    it('define la animación de apertura ultra-suave en CSS Grid para .faq-item', () => {
      expect(APP_CSS).toMatch(
        /\.faq-item\s+\.faq-content-wrap\s*\{[^}]*display:\s*grid;[^}]*grid-template-rows:\s*0fr;[^}]*transition:\s*grid-template-rows\s*0\.28s\s*cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\)/,
      );
      expect(APP_CSS).toMatch(
        /\.faq-item\[open\]\s+\.faq-content-wrap\s*\{[^}]*grid-template-rows:\s*1fr;/,
      );
      expect(APP_CSS).toMatch(/\.faq-item\s+\.faq-content-inner\s*\{[^}]*overflow:\s*hidden;/);
    });

    it('los componentes y vistas con FAQ envuelven las respuestas con .faq-content-wrap y .faq-content-inner', () => {
      expect(HOME_PAGE).toContain('class="faq-content-wrap"');
      expect(HOME_PAGE).toContain('class="faq-content-inner"');

      expect(COMPARAR_PAGE).toContain('class="faq-content-wrap"');
      expect(COMPARAR_PAGE).toContain('class="faq-content-inner"');

      expect(AYUDA_PAGE).toContain('class="faq-content-wrap"');
      expect(AYUDA_PAGE).toContain('class="faq-content-inner"');

      expect(VERTICAL_VIEW).toContain('class="faq-content-wrap"');
      expect(VERTICAL_VIEW).toContain('class="faq-content-inner"');
    });
  });

  describe('Micro-Elevación y Borde Luminoso en Cards', () => {
    it('las tarjetas tienen transición fluida y micro-elevación al hover', () => {
      expect(APP_CSS).toMatch(
        /\.pricing-card,\s*\n\s*\.simulation-card,\s*\n\s*\.compare-table-wrap,\s*\n\s*\.feature-card\s*\{[^}]*transition:[^}]*transform\s*0\.2s\s*var\(--ease-out\)/,
      );
      expect(APP_CSS).toMatch(
        /@media\s*\(hover:\s*hover\)[\s\S]*?transform:\s*translateY\(-2px\);[\s\S]*?box-shadow:\s*var\(--shadow-md\);[\s\S]*?border-color:\s*rgba\(217,\s*154,\s*61,\s*0\.35\);/,
      );
    });

    it('respeta prefers-reduced-motion en las micro-elevaciones de cards', () => {
      expect(APP_CSS).toMatch(
        /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.pricing-card:hover[\s\S]*?transform:\s*none;/,
      );
    });
  });

  describe('Sliders de Calculadora con Nudo Diamante (SavingsCalculator)', () => {
    it('el slider tiene pista estilo regla contable y thumb rotado a 45° en forma de nudo diamante', () => {
      expect(SAVINGS_CALCULATOR).toMatch(/input\[type='range'\]::-webkit-slider-runnable-track/);
      expect(SAVINGS_CALCULATOR).toMatch(/input\[type='range'\]::-webkit-slider-thumb/);
      expect(SAVINGS_CALCULATOR).toMatch(/transform:\s*rotate\(45deg\)/);
      expect(SAVINGS_CALCULATOR).toMatch(/border:\s*2px solid var\(--amber-bright\)/);
      expect(SAVINGS_CALCULATOR).toMatch(/box-shadow:\s*var\(--shadow-glow\)/);
      expect(SAVINGS_CALCULATOR).toMatch(/input\[type='range'\]::-moz-range-thumb/);
    });

    it('mantiene touch targets accesibles de 44px', () => {
      expect(SAVINGS_CALCULATOR).toMatch(/height:\s*44px/);
    });
  });

  describe('Header Scrolled con Desenfoque de Cristal, Sticky Glow y OwnerModeMock Crossfade', () => {
    it('el header usa fondo protector oscuro consistente con desenfoque y sombra (z-index 100)', () => {
      expect(APP_CSS).toMatch(
        /\.site-header\s*\{[^}]*z-index:\s*100;[\s\S]*?background:\s*rgba\(20,\s*22,\s*28,\s*0\.94\);[\s\S]*?backdrop-filter:\s*blur\(12px\);[\s\S]*?border-bottom:\s*1px solid rgba\(243,\s*239,\s*230,\s*0\.1\);[\s\S]*?box-shadow:\s*0 4px 20px rgba\(0,\s*0,\s*0,\s*0\.35\);/,
      );
      expect(APP_CSS).toMatch(
        /\.site-header\.scrolled\s*\{[^}]*backdrop-filter:\s*blur\(12px\);[^}]*-webkit-backdrop-filter:\s*blur\(12px\);[^}]*background:\s*rgba\(20,\s*22,\s*28,\s*0\.94\);[^}]*border-bottom:\s*1px solid rgba\(243,\s*239,\s*230,\s*0\.1\);[^}]*box-shadow:\s*0 4px 20px rgba\(0,\s*0,\s*0,\s*0\.35\);/,
      );
    });

    it('el botón flotante móvil .btn-sticky tiene sombra con resplandor ámbar (--shadow-glow)', () => {
      expect(APP_CSS).toMatch(/\.btn-sticky\s*\{[\s\S]*?box-shadow:\s*var\(--shadow-glow\);/);
    });

    it('OwnerModeMock tiene animación suave de crossfade (250ms ease) al alternar vistas', () => {
      expect(OWNER_MOCK).toMatch(/animation:\s*mockCrossfade 250ms ease both;/);
      expect(OWNER_MOCK).toMatch(/@keyframes mockCrossfade/);
      expect(OWNER_MOCK).toMatch(
        /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?animation:\s*none;/,
      );
    });
  });
});
