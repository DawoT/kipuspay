import { describe, expect, it } from 'vitest';
import { allHelpCategories, searchHelpItems } from './help.js';

describe('help.ts content module', () => {
  it('retorna categorias de ayuda pobladas', () => {
    const categories = allHelpCategories();
    expect(categories.length).toBeGreaterThan(0);
    for (const cat of categories) {
      expect(cat.title).toBeTruthy();
      expect(cat.items.length).toBeGreaterThan(0);
    }
  });

  it('permite buscar items por palabra clave', () => {
    const results = searchHelpItems('internet');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].question.toLowerCase()).toContain('internet');
  });

  it('retorna arreglo vacio si la consulta no coincide', () => {
    const results = searchHelpItems('termino_inexistente_xyz');
    expect(results).toHaveLength(0);
  });
});
