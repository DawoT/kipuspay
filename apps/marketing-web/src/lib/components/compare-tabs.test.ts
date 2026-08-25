/**
 * Sprint 11C — compare-tabs.test.ts
 * Tests para el selector de categoría en /comparar (V-26 / GTM §1).
 * Validación estática sobre el código fuente — sin DOM.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const compararPage = readFileSync(
  new URL('../../routes/comparar/+page.svelte', import.meta.url),
  'utf8',
);

describe('compare-tabs — /comparar', () => {
  it('existen al menos 3 tabs de categoría (verificado en CATEGORY_TABS)', () => {
    // En Svelte el {#each} genera N tabs; verificamos que hay al menos 3 en CATEGORY_TABS
    const tabsBlock = (() => {
      const start = compararPage.indexOf('const CATEGORY_TABS');
      const end = compararPage.indexOf('] as const;', start) + '] as const;'.length;
      return start >= 0 ? compararPage.slice(start, end) : '';
    })();
    expect(tabsBlock, 'El bloque CATEGORY_TABS debe existir').toBeTruthy();
    // Contamos cuántos objetos { id: ... } hay
    const idMatches = tabsBlock.match(/id:\s*['"][^'"]+['"]/g);
    expect(idMatches, 'Debe haber al menos 3 tabs').not.toBeNull();
    expect(idMatches!.length).toBeGreaterThanOrEqual(3);
  });

  it('cada tab tiene data-testid que empieza con compare-tab-', () => {
    // En Svelte el template contiene data-testid="compare-tab-{tab.id}"
    // Lo verificamos buscando el patrón de template Y que los IDs existen en CATEGORY_TABS
    expect(compararPage).toContain('compare-tab-{tab.id}');
    // También que los IDs reales de las categorías están referenciados en el código
    for (const cat of ['todos', 'restaurante', 'tienda', 'servicios']) {
      expect(compararPage, `La categoría "${cat}" debe estar en CATEGORY_TABS`).toContain(
        `id: '${cat}'`,
      );
    }
  });

  it('los tabs tienen aria-selected', () => {
    expect(compararPage).toContain('aria-selected');
  });

  it('el tablist tiene role="tablist" con aria-label descriptivo', () => {
    expect(compararPage).toContain('role="tablist"');
    expect(compararPage).toContain('aria-label="Filtrar comparativa por tipo de negocio"');
  });

  it('los tabs son botones nativos (touch target ≥ 44px)', () => {
    // Verificamos que se usa <button para los tabs
    expect(compararPage).toContain('<button');
    expect(compararPage).toContain('role="tab"');
    // Touch target definido en CSS
    expect(compararPage).toContain('min-height: 44px');
    expect(compararPage).toContain('min-width: 44px');
  });

  it('incluye las categorías básicas de negocio (Todos, Restaurante, Tienda, Servicios)', () => {
    for (const label of ['Todos', 'Restaurante', 'Tienda', 'Servicios']) {
      expect(compararPage, `El label "${label}" debe existir en CATEGORY_TABS`).toContain(label);
    }
  });

  it('el filtro usa estado reactivo Svelte (no recarga de página)', () => {
    // La asignación activeCategory = tab.id debe estar en el markup (onclick inline)
    expect(compararPage).toContain('activeCategory = tab.id');
    // No debe haber window.location.assign dentro del tab loop
    const tabloopMatch = compararPage.match(/\{#each CATEGORY_TABS[\s\S]*?\{\/each\}/)?.at(0) ?? '';
    expect(tabloopMatch).not.toContain('location.assign');
  });
});
