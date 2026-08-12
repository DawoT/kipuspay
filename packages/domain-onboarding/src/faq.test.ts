import { describe, expect, it } from 'vitest';
import { FAQ_ITEMS, faqFor, validateFaqCopy } from './faq.js';

describe('FAQ in-product contextual (regla 37a)', () => {
  it('ofrece solo preguntas de capabilities habilitadas', () => {
    const items = faqFor({ capabilities: new Set(['kds', 'quick_add']) });
    const ids = items.map((i) => i.id);
    expect(ids).toContain('faq-kds');
    expect(ids).toContain('faq-quick-add');
    expect(ids).not.toContain('faq-fefo');
    expect(ids).not.toContain('faq-team');
  });

  it('sin capabilities habilitadas no hay FAQ', () => {
    expect(faqFor({ capabilities: new Set() })).toEqual([]);
  });

  it('copy de las FAQ sin jerga técnica (Staff Content)', () => {
    const result = validateFaqCopy();
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('la validación de jerga detecta infracciones si aparecen', () => {
    const result = validateFaqCopy([
      { id: 'faq-x', question: '¿Qué es el PSE?', answer: 'usa la API', capability: 'kds' },
    ]);
    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.term)).toContain('PSE');
    expect(result.violations.map((v) => v.term)).toContain('API');
  });

  it('ids únicos en el catálogo', () => {
    expect(new Set(FAQ_ITEMS.map((i) => i.id)).size).toBe(FAQ_ITEMS.length);
  });
});
