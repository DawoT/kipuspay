import { describe, expect, it } from 'vitest';
import { assertFactsVerbatim, NLG_CONTRADICTION_KEY } from './nlp-guard.js';

describe('insights NLG post-check anti-alucinación (Sprint 49)', () => {
  const facts = [
    { key: 'gross_sales_cents', value: 118000 },
    { key: 'doc_count', value: 42 },
    { key: 'top_product', value: 'Café' },
  ];

  it('acepta prosa que cita los hechos verbatim', () => {
    expect(() =>
      assertFactsVerbatim(facts, 'Las ventas fueron S/ 118000 en 42 comprobantes.'),
    ).not.toThrow();
  });

  it('rechaza una cifra ajena a los hechos (alucinación)', () => {
    expect(() =>
      assertFactsVerbatim(facts, 'Las ventas fueron S/ 999999 en 42 comprobantes.'),
    ).toThrow(NLG_CONTRADICTION_KEY);
  });

  it('rechaza si un hecho numérico falta del texto', () => {
    expect(() => assertFactsVerbatim(facts, 'Hubo 42 comprobantes.')).toThrow(
      NLG_CONTRADICTION_KEY,
    );
  });

  it('los montos se comparan sin decimales (INTEGER cents)', () => {
    expect(() =>
      assertFactsVerbatim([{ key: 'x', value: 1180 }], 'El total fue 1180.'),
    ).not.toThrow();
  });

  it('los hechos string se exigen verbatim y no confunden con cifras', () => {
    expect(() =>
      assertFactsVerbatim(
        [
          { key: 'top_product', value: 'Café' },
          { key: 'doc_count', value: 42 },
        ],
        'El top es Café con 42 comprobantes.',
      ),
    ).not.toThrow();
    expect(() =>
      assertFactsVerbatim([{ key: 'top_product', value: 'Café' }], 'El top es Café.'),
    ).not.toThrow();
  });
});

describe('cobertura branches (CAL-05)', () => {
  it('rechaza número extraído del texto que no es un hecho (candidateNumbers)', () => {
    expect(() =>
      assertFactsVerbatim(
        [
          { key: 'gross_sales_cents', value: 118000 },
          { key: 'doc_count', value: 42 },
        ],
        'La meta del mes es 999999 comprobantes.',
      ),
    ).toThrow(NLG_CONTRADICTION_KEY);
  });
});
