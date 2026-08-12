import { describe, expect, it } from 'vitest';
import { classifyIntent, INTENT_ACTIONS, type InsightIntent } from './intent-router.js';

describe('insights intent router (Sprint 49)', () => {
  it('acepta solo acciones de la whitelist', () => {
    for (const action of INTENT_ACTIONS) {
      expect(classifyIntent(action)).toBe(action);
    }
  });

  it('rechaza acciones fuera de la whitelist (fail-closed)', () => {
    expect(classifyIntent('DELETE_ALL_SALES')).toBe('UNSUPPORTED');
    expect(classifyIntent('DROP TABLE')).toBe('UNSUPPORTED');
    expect(classifyIntent('')).toBe('UNSUPPORTED');
    expect(classifyIntent('SALES_SUMMARY; DROP TABLE sales')).toBe('UNSUPPORTED');
  });

  it('normaliza el identificador (case y espacios)', () => {
    expect(classifyIntent('  sales_summary ')).toBe('SALES_SUMMARY');
    expect(classifyIntent('top-products')).toBe('TOP_PRODUCTS');
  });

  it('bloquea verbos destructivos incluso dentro de una acción whitelist', () => {
    expect(classifyIntent('sales_summary; drop table')).toBe('UNSUPPORTED');
    expect(classifyIntent('delete from sales')).toBe('UNSUPPORTED');
    expect(classifyIntent('breakage-drop')).toBe('UNSUPPORTED');
  });

  it('el tipo de intención es un union cerrado', () => {
    const action: InsightIntent = 'BREAKAGE';
    expect(INTENT_ACTIONS).toContain(action);
  });
});
