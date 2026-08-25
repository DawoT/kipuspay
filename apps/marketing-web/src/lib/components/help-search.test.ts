/**
 * Sprint 11C — help-search.test.ts
 * Tests para el buscador reactivo mejorado en /ayuda (V-26 / GTM §1).
 * Validación estática sobre el código fuente — sin DOM.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ayudaPage = readFileSync(new URL('../../routes/ayuda/+page.svelte', import.meta.url), 'utf8');

/** Palabras técnicas prohibidas en el copy visible (V-26 / GTM §1). */
const FORBIDDEN_JARGON = [
  'CDR',
  'PSE',
  'UBL',
  'SOAP',
  'endpoint',
  'Workers',
  'ACID',
  'Edge',
  'RPC',
  'Sharding',
] as const;

describe('help-search — /ayuda', () => {
  it('existe botón clear con data-testid="clear-search-btn"', () => {
    expect(ayudaPage).toContain('data-testid="clear-search-btn"');
  });

  it('el botón clear tiene aria-label accesible', () => {
    expect(ayudaPage).toContain('aria-label="Limpiar búsqueda"');
  });

  it('existe el contador de resultados con data-testid="search-results-count"', () => {
    expect(ayudaPage).toContain('data-testid="search-results-count"');
  });

  it('el contador de resultados tiene aria-live="polite"', () => {
    expect(ayudaPage).toContain('aria-live="polite"');
  });

  it('el contador maneja correctamente singular y plural', () => {
    // Verificamos que el template distingue 1 pregunta vs N preguntas
    expect(ayudaPage).toContain('1 pregunta encontrada');
    expect(ayudaPage).toContain('preguntas encontradas');
  });

  it('el estado vacío (0 resultados) muestra mensaje amigable sin jerga técnica', () => {
    // Extraemos el bloque del empty-state
    const emptyStateBlock = (() => {
      const start = ayudaPage.indexOf('help-empty-state');
      const end = ayudaPage.indexOf('</div>', start) + '</div>'.length;
      return start >= 0 ? ayudaPage.slice(start, end) : '';
    })();

    expect(emptyStateBlock, 'El bloque help-empty-state debe existir').toBeTruthy();

    // Debe tener mensaje comprensible para el usuario final
    expect(emptyStateBlock).toMatch(/[Nn]o encontramos/);
    // Debe tener CTA de contacto
    expect(emptyStateBlock).toMatch(/Escr[ií]benos|contacto|soporte/i);

    // Sin jerga técnica
    for (const word of FORBIDDEN_JARGON) {
      expect(
        emptyStateBlock,
        `La palabra "${word}" no debe aparecer en el empty-state`,
      ).not.toContain(word);
    }
  });

  it('el botón clear aparece condicionalmente solo cuando hay texto', () => {
    // El botón está dentro de un {#if searchQuery.trim().length > 0}
    // que aparece antes del clear-search-btn en el source
    const clearBtnIdx = ayudaPage.indexOf('clear-search-btn');
    const ifBlockBefore = ayudaPage.lastIndexOf('{#if', clearBtnIdx);
    const conditional = ayudaPage.slice(ifBlockBefore, clearBtnIdx);
    expect(conditional, 'El botón clear debe estar dentro de un bloque {#if}').toContain('{#if');
    expect(conditional).toContain('searchQuery');
  });

  it('el buscador no expone jerga técnica en el placeholder', () => {
    const placeholderMatch = ayudaPage.match(/placeholder="[^"]*"/g) ?? [];
    for (const ph of placeholderMatch) {
      for (const word of FORBIDDEN_JARGON) {
        expect(ph, `El placeholder no debe contener "${word}"`).not.toContain(word);
      }
    }
  });
});
