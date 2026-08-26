import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const APP_CSS = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');
const LAYOUT_SVELTE = readFileSync(new URL('../../routes/+layout.svelte', import.meta.url), 'utf8');
const HOME_PAGE = readFileSync(new URL('../../routes/+page.svelte', import.meta.url), 'utf8');
const OWNER_MOCK = readFileSync(new URL('./OwnerModeMock.svelte', import.meta.url), 'utf8');

describe('Remediaciones y Refinamientos Clave PO — Marketing Web', () => {
  describe('1. Tipografía y Tamaño Equilibrado de Leads (.section-lead)', () => {
    it('.section-lead define font-size 1.0625rem, line-height 1.55, max-width 38rem y text-wrap pretty', () => {
      expect(APP_CSS).toMatch(
        /\.section-lead\s*\{[^}]*font-size:\s*1\.0625rem;[^}]*line-height:\s*1\.55;[^}]*max-width:\s*38rem;[^}]*text-wrap:\s*pretty;/s,
      );
    });

    it('.section-paper .section-lead mantiene contraste adecuado sobre fondo claro', () => {
      expect(APP_CSS).toMatch(
        /\.section-paper\s+\.section-lead\s*\{[^}]*color:\s*rgba\(26,\s*29,\s*35,\s*0\.78\);/,
      );
    });
  });

  describe('2. Alternancia Perfecta de Colores en Secciones (Ink / Paper)', () => {
    it('verifica el orden estricto de alternancia Ink / Paper sin repeticiones consecutivas', () => {
      // Extraemos las secciones del home en orden
      const sectionMatches = [...HOME_PAGE.matchAll(/<section\b([^>]*)>/g)].map((m) => m[1]);

      expect(sectionMatches.length).toBeGreaterThanOrEqual(12);

      // Hero -> Ink
      expect(sectionMatches[0]).toContain('class="hero"');
      expect(sectionMatches[0]).not.toContain('section-paper');

      // #rubros -> Paper
      expect(sectionMatches[1]).toContain('id="rubros"');
      expect(sectionMatches[1]).toContain('section-paper');

      // #pillars -> Ink
      expect(sectionMatches[2]).toContain('id="pillars"');
      expect(sectionMatches[2]).not.toContain('section-paper');

      // #como -> Paper
      expect(sectionMatches[3]).toContain('id="como"');
      expect(sectionMatches[3]).toContain('section-paper');

      // #producto -> Ink
      expect(sectionMatches[4]).toContain('id="producto"');
      expect(sectionMatches[4]).not.toContain('section-paper');

      // #offline -> Paper
      expect(sectionMatches[5]).toContain('id="offline"');
      expect(sectionMatches[5]).toContain('section-paper');

      // #ledger -> Ink
      expect(sectionMatches[6]).toContain('id="ledger"');
      expect(sectionMatches[6]).not.toContain('section-paper');

      // #owner -> Paper
      expect(sectionMatches[7]).toContain('id="owner"');
      expect(sectionMatches[7]).toContain('section-paper');

      // #comparar -> Ink
      expect(sectionMatches[8]).toContain('id="comparar"');
      expect(sectionMatches[8]).not.toContain('section-paper');

      // #confianza -> Paper
      expect(sectionMatches[9]).toContain('id="confianza"');
      expect(sectionMatches[9]).toContain('section-paper');

      // #preguntas -> Ink
      expect(sectionMatches[10]).toContain('id="preguntas"');
      expect(sectionMatches[10]).not.toContain('section-paper');

      // #final-cta -> Paper
      expect(sectionMatches[11]).toContain('id="final-cta"');
      expect(sectionMatches[11]).toContain('section-paper');

      // Footer en +layout -> Ink
      expect(LAYOUT_SVELTE).toContain('<footer class="site-footer">');
      expect(APP_CSS).toMatch(/\.site-footer\s*\{[^}]*background:\s*var\(--ink-2\);/);
    });

    it('QuipuSectionMark coincide exactamente con el tono de su sección respectiva', () => {
      // #rubros: paper
      expect(HOME_PAGE).toMatch(/id="rubros"[\s\S]*?<QuipuSectionMark[^>]*tone="paper"/);
      // #pillars: ink
      expect(HOME_PAGE).toMatch(/id="pillars"[\s\S]*?<QuipuSectionMark[^>]*tone="ink"/);
      // #como: paper
      expect(HOME_PAGE).toMatch(/id="como"[\s\S]*?<QuipuSectionMark[^>]*tone="paper"/);
      // #producto: ink
      expect(HOME_PAGE).toMatch(/id="producto"[\s\S]*?<QuipuSectionMark[^>]*tone="ink"/);
      // #offline: paper
      expect(HOME_PAGE).toMatch(/id="offline"[\s\S]*?<QuipuSectionMark[^>]*tone="paper"/);
      // #ledger: ink
      expect(HOME_PAGE).toMatch(/id="ledger"[\s\S]*?<QuipuSectionMark[^>]*tone="ink"/);
      // #owner: paper
      expect(HOME_PAGE).toMatch(/id="owner"[\s\S]*?<QuipuSectionMark[^>]*tone="paper"/);
      // #comparar: ink
      expect(HOME_PAGE).toMatch(/id="comparar"[\s\S]*?<QuipuSectionMark[^>]*tone="ink"/);
      // #confianza: paper
      expect(HOME_PAGE).toMatch(/id="confianza"[\s\S]*?<QuipuSectionMark[^>]*tone="paper"/);
      // #preguntas: ink
      expect(HOME_PAGE).toMatch(/id="preguntas"[\s\S]*?<QuipuSectionMark[^>]*tone="ink"/);
    });
  });

  describe('3. Modo Dueño Compacto y Texto Sticky en Desktop', () => {
    it('OwnerModeMock optimiza dimensiones y paddings con PhoneMockFrame', () => {
      expect(OWNER_MOCK).toMatch(/max-width:\s*100%;/);
      expect(OWNER_MOCK).toContain('PhoneMockFrame');
      expect(OWNER_MOCK).toMatch(/height:\s*52px;/);
      expect(OWNER_MOCK).toMatch(/font-size:\s*1\.5rem;/);
    });

    it('app.css aplica sticky en la columna de texto completa en desktop (min-width: 899px) en .product-grid, .owner-grid, .offline-grid y .ledger-grid', () => {
      expect(APP_CSS).toMatch(
        /@media\s*\(min-width:\s*899px\)[\s\S]*?\.product-grid\s*>\s*\.sec-head\s*\{[^}]*position:\s*sticky;/s,
      );
      expect(APP_CSS).toMatch(
        /@media\s*\(min-width:\s*899px\)[\s\S]*?\.owner-grid\s*>\s*\.sec-head\s*\{[^}]*position:\s*sticky;/s,
      );
      expect(APP_CSS).toMatch(
        /@media\s*\(min-width:\s*899px\)[\s\S]*?\.offline-grid\s*>\s*\.offline-content\s*\{[^}]*position:\s*sticky;/s,
      );
      expect(APP_CSS).toMatch(
        /@media\s*\(min-width:\s*899px\)[\s\S]*?\.ledger-grid\s*>\s*\.ledger-content\s*\{[^}]*position:\s*sticky;/s,
      );
    });
  });

  describe('4. Footer 100% Centrado y Estructura Balanceada de 4 Columnas', () => {
    it('+layout.svelte envuelve el footer en .footer-inner', () => {
      expect(LAYOUT_SVELTE).toContain('<div class="footer-inner">');
    });

    it('app.css define .footer-inner centrado max-width: 72rem con flex/column', () => {
      expect(APP_CSS).toMatch(
        /\.footer-inner\s*\{[^}]*max-width:\s*72rem;[^}]*margin:\s*0 auto;[^}]*width:\s*100%;[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*align-items:\s*center;/s,
      );
    });

    it('.footer-grid distribuye 4 columnas en desktop (899px), 2 en tablet (719px) y 1 en mobile', () => {
      expect(APP_CSS).toMatch(
        /\.footer-grid\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*72rem;[^}]*margin:\s*0 auto;[^}]*display:\s*grid;[^}]*gap:\s*2rem;[^}]*grid-template-columns:\s*1fr;/s,
      );
      expect(APP_CSS).toMatch(
        /@media\s*\(min-width:\s*719px\)[\s\S]*?\.footer-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*1fr\);/s,
      );
      expect(APP_CSS).toMatch(
        /@media\s*\(min-width:\s*899px\)[\s\S]*?\.footer-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*1fr\);/s,
      );
    });

    it('.footer-seals, .footer-channels y .footer-legal están 100% centrados', () => {
      expect(APP_CSS).toMatch(
        /\.footer-seals\s*\{[\s\S]*?justify-content:\s*center;[\s\S]*?text-align:\s*center;[\s\S]*?margin-inline:\s*auto;/s,
      );
      expect(APP_CSS).toMatch(
        /\.footer-channels\s*\{[\s\S]*?text-align:\s*center;[\s\S]*?justify-content:\s*center;[\s\S]*?margin-inline:\s*auto;/s,
      );
      expect(APP_CSS).toMatch(
        /\.footer-legal\s*\{[\s\S]*?text-align:\s*center;[\s\S]*?margin-inline:\s*auto;/s,
      );
    });

    it('+layout.svelte contiene enlaces a las 4 secciones pertinentes (Negocio, Comparativas, Recursos, Legal y Acceso)', () => {
      expect(LAYOUT_SVELTE).toContain('<h3>Para tu negocio</h3>');
      expect(LAYOUT_SVELTE).toContain('<h3>Comparativas</h3>');
      expect(LAYOUT_SVELTE).toContain('<h3>Recursos</h3>');
      expect(LAYOUT_SVELTE).toContain('<h3>Legal y Acceso</h3>');
      expect(LAYOUT_SVELTE).toContain('{posOrigin}/login');
    });
  });
});
