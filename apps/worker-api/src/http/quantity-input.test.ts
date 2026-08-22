import { describe, expect, it } from 'vitest';
import {
  COUNT_QUANTITY_RULE,
  ENTERED_QUANTITY_RULE,
  MICROUNITS_INPUT_INVALID,
  MICROUNITS_INPUT_OUT_OF_RANGE,
  parseMicrounitsInput,
} from './quantity-input.js';

describe('parseMicrounitsInput — regla única fail-closed (US-05 AC1/AC3)', () => {
  it('cierra el fail-open de Number(): tipos inválidos jamás se coaccionan', () => {
    // Los casos demostrados en runtime con Number(): '\u00A012' y ' 12 '
    // pasaban como 12; true→1; []→''→0.
    expect(parseMicrounitsInput('\u00A012', ENTERED_QUANTITY_RULE)).toEqual({
      ok: false,
      errorName: MICROUNITS_INPUT_INVALID,
    });
    expect(parseMicrounitsInput(' 12 ', ENTERED_QUANTITY_RULE)).toEqual({
      ok: false,
      errorName: MICROUNITS_INPUT_INVALID,
    });
    expect(parseMicrounitsInput(true, ENTERED_QUANTITY_RULE)).toEqual({
      ok: false,
      errorName: MICROUNITS_INPUT_INVALID,
    });
    expect(parseMicrounitsInput(false, ENTERED_QUANTITY_RULE).ok).toBe(false);
    expect(parseMicrounitsInput([], ENTERED_QUANTITY_RULE).ok).toBe(false);
    expect(parseMicrounitsInput([12], ENTERED_QUANTITY_RULE).ok).toBe(false);
    expect(parseMicrounitsInput({}, ENTERED_QUANTITY_RULE).ok).toBe(false);
    expect(parseMicrounitsInput(null, ENTERED_QUANTITY_RULE).ok).toBe(false);
    expect(parseMicrounitsInput(undefined, ENTERED_QUANTITY_RULE).ok).toBe(false);
  });

  it('gramática canónica ^[0-9]+$: sin signo, sin decimales, sin ceros de relleno', () => {
    for (const raw of ['+12', '-5', '1e3', '0x10', '12.5', '10,5', '007', '', '１２']) {
      expect(parseMicrounitsInput(raw, ENTERED_QUANTITY_RULE).ok).toBe(false);
    }
    expect(parseMicrounitsInput('12', ENTERED_QUANTITY_RULE)).toEqual({ ok: true, microunits: 12 });
    expect(parseMicrounitsInput('0', COUNT_QUANTITY_RULE)).toEqual({ ok: true, microunits: 0 });
  });

  it('regla única 0/negativos: mínimo lo declara el caso de uso (AC3)', () => {
    expect(parseMicrounitsInput(0, ENTERED_QUANTITY_RULE)).toEqual({
      ok: false,
      errorName: MICROUNITS_INPUT_OUT_OF_RANGE,
    });
    expect(parseMicrounitsInput(-1, ENTERED_QUANTITY_RULE)).toEqual({
      ok: false,
      errorName: MICROUNITS_INPUT_OUT_OF_RANGE,
    });
    expect(parseMicrounitsInput(-1, COUNT_QUANTITY_RULE)).toEqual({
      ok: false,
      errorName: MICROUNITS_INPUT_OUT_OF_RANGE,
    });
    // Contar 0 stock SÍ es válido.
    expect(parseMicrounitsInput(0, COUNT_QUANTITY_RULE)).toEqual({ ok: true, microunits: 0 });
  });

  it('números no enteros seguros: NaN/Infinity/floats → OUT_OF_RANGE, nunca redondeo', () => {
    for (const raw of [Number.NaN, Infinity, -Infinity, 1.5, 12.0000001]) {
      const res = parseMicrounitsInput(raw, COUNT_QUANTITY_RULE);
      expect(res).toEqual({ ok: false, errorName: MICROUNITS_INPUT_OUT_OF_RANGE });
    }
  });

  it('exactitud en montos grandes: MAX_SAFE_INTEGER exacto por dígitos sin float', () => {
    expect(parseMicrounitsInput(Number.MAX_SAFE_INTEGER, ENTERED_QUANTITY_RULE)).toEqual({
      ok: true,
      microunits: 9_007_199_254_740_991,
    });
    expect(parseMicrounitsInput('9007199254740991', ENTERED_QUANTITY_RULE)).toEqual({
      ok: true,
      microunits: 9_007_199_254_740_991,
    });
    // 2^53 ya no es entero seguro.
    expect(parseMicrounitsInput(9_007_199_254_740_992, ENTERED_QUANTITY_RULE)).toEqual({
      ok: false,
      errorName: MICROUNITS_INPUT_OUT_OF_RANGE,
    });
    // Texto que excede MAX_SAFE_INTEGER: overflow detectado por dígitos.
    expect(parseMicrounitsInput('9007199254740992', ENTERED_QUANTITY_RULE)).toEqual({
      ok: false,
      errorName: MICROUNITS_INPUT_OUT_OF_RANGE,
    });
    expect(parseMicrounitsInput('99999999999999999999', ENTERED_QUANTITY_RULE)).toEqual({
      ok: false,
      errorName: MICROUNITS_INPUT_OUT_OF_RANGE,
    });
  });

  it('preserva la escala: microunidades grandes canónicas pasan intactas', () => {
    expect(parseMicrounitsInput('2500000', ENTERED_QUANTITY_RULE)).toEqual({
      ok: true,
      microunits: 2_500_000,
    });
  });
});
