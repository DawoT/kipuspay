import { describe, expect, it } from 'vitest';
import {
  isFiniteNumber,
  isMoneyInteger,
  parseFiniteNumber,
  parseMoneyInteger,
  parseMoneyToCents,
  type MoneyParseErrorName,
} from './money-input.js';

describe('money-input (CAL-01)', () => {
  it('rechaza coerción silenciosa: Number(true)=1, Number([])=0', () => {
    expect(isMoneyInteger(true)).toBe(false);
    expect(isMoneyInteger([])).toBe(false);
    expect(isMoneyInteger('100')).toBe(false);
    expect(isMoneyInteger(1.5)).toBe(false);
    expect(isMoneyInteger(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
  });

  it('acepta enteros seguros y rechaza no finitos', () => {
    expect(isMoneyInteger(0)).toBe(true);
    expect(isMoneyInteger(12345)).toBe(true);
    expect(isMoneyInteger(Number.NaN)).toBe(false);
    expect(isMoneyInteger(Infinity)).toBe(false);
    expect(isFiniteNumber(3.25)).toBe(true);
    expect(isFiniteNumber(NaN)).toBe(false);
  });

  it('parsea a null lo inválido y preserva lo válido', () => {
    expect(parseMoneyInteger(500)).toBe(500);
    expect(parseMoneyInteger('500')).toBeNull();
    expect(parseMoneyInteger(true)).toBeNull();
    expect(parseFiniteNumber(2.5)).toBe(2.5);
    expect(parseFiniteNumber('2.5')).toBeNull();
  });
});

describe('parseMoneyToCents (US-06: resultado discriminado {ok,errorName})', () => {
  it('gramática canónica -?\\d+(\\.\\d{1,2})?: strings → cents por dígitos', () => {
    expect(parseMoneyToCents('10.50')).toEqual({ ok: true, cents: 1050 });
    expect(parseMoneyToCents('10.5')).toEqual({ ok: true, cents: 1050 });
    expect(parseMoneyToCents('10')).toEqual({ ok: true, cents: 1000 });
    expect(parseMoneyToCents('0.01')).toEqual({ ok: true, cents: 1 });
    expect(parseMoneyToCents('0')).toEqual({ ok: true, cents: 0 });
    expect(parseMoneyToCents(' 12.34 ')).toEqual({ ok: true, cents: 1234 });
  });

  it('gramática canónica: número negativo admitido (paths string y number consistentes)', () => {
    // "-5" → -500 cents y "-5.5" → -550: el camino string admite el signo
    // opcional igual que el camino number (-5, -5.5 ya eran enteros/floats
    // válidos como number). Además el signo jamás se pierde en decimales.
    expect(parseMoneyToCents('-5')).toEqual({ ok: true, cents: -500 });
    expect(parseMoneyToCents('-5.5')).toEqual({ ok: true, cents: -550 });
    expect(parseMoneyToCents('-0.5')).toEqual({ ok: true, cents: -50 });
    expect(parseMoneyToCents(-5)).toEqual({ ok: true, cents: -5 });
    expect(parseMoneyToCents(-5.5)).toEqual({ ok: true, cents: -550 });
  });

  it('preserva enteros seguros (ya en cents) y rechaza coerciones con errorName', () => {
    expect(parseMoneyToCents(1000)).toEqual({ ok: true, cents: 1000 });
    expect(parseMoneyToCents(0)).toEqual({ ok: true, cents: 0 });
    expect(parseMoneyToCents(true)).toEqual({ ok: false, errorName: 'invalid_amount' });
    expect(parseMoneyToCents(null)).toEqual({ ok: false, errorName: 'invalid_amount' });
    expect(parseMoneyToCents(undefined)).toEqual({ ok: false, errorName: 'invalid_amount' });
    expect(parseMoneyToCents([])).toEqual({ ok: false, errorName: 'invalid_amount' });
  });

  it('US-01 bullet: number float con ≤2 decimales → cents enteros (19.99 → 1999)', () => {
    expect(parseMoneyToCents(19.99)).toEqual({ ok: true, cents: 1999 });
    expect(parseMoneyToCents(1.5)).toEqual({ ok: true, cents: 150 });
    expect(parseMoneyToCents(0.01)).toEqual({ ok: true, cents: 1 });
    expect(parseMoneyToCents(10.5)).toEqual({ ok: true, cents: 1050 });
    expect(parseMoneyToCents(123.45)).toEqual({ ok: true, cents: 12345 });
  });

  it('borde del rango: MAX_SAFE_INTEGER aceptado con precisión exacta (sin float)', () => {
    expect(parseMoneyToCents('90071992547409.91')).toEqual({
      ok: true,
      cents: Number.MAX_SAFE_INTEGER,
    });
    // Espejo por la vía number con un valor exactamente representable: el
    // literal -90071992547409.91 NO es representable en float64 (su forma
    // canónica es "-90071992547409.9"), por lo que jamás podría componer
    // -MAX_SAFE_INTEGER; el parser de dígitos lo interpreta fail-closed con
    // la precisión real del float (1 decimal → -9007199254740990).
    expect(parseMoneyToCents(-90071992547409.9)).toEqual({
      ok: true,
      cents: -9007199254740990,
    });
  });

  it('negative_zero: -0 y "-0" se rechazan con motivo distinguible (no un null mudo)', () => {
    // -0 number pasaba como -0 (safe integer); "-0" string caía en null
    // genérico. Ahora ambos devuelven {ok:false, errorName:'negative_zero'}.
    expect(parseMoneyToCents(-0)).toEqual({ ok: false, errorName: 'negative_zero' });
    expect(parseMoneyToCents('-0')).toEqual({ ok: false, errorName: 'negative_zero' });
    expect(parseMoneyToCents('-0.00')).toEqual({ ok: false, errorName: 'negative_zero' });
    expect(parseMoneyToCents('-0.0')).toEqual({ ok: false, errorName: 'negative_zero' });
  });

  it('amount_out_of_range: |cents| > 9007199254740991 con motivo distinguible', () => {
    expect(parseMoneyToCents('90071992547409.92')).toEqual({
      ok: false,
      errorName: 'amount_out_of_range',
    });
    expect(parseMoneyToCents('9007199254740992')).toEqual({
      ok: false,
      errorName: 'amount_out_of_range',
    });
    expect(parseMoneyToCents('-90071992547409.92')).toEqual({
      ok: false,
      errorName: 'amount_out_of_range',
    });
    expect(parseMoneyToCents('-999999999999999999')).toEqual({
      ok: false,
      errorName: 'amount_out_of_range',
    });
    expect(parseMoneyToCents('999999999999999999')).toEqual({
      ok: false,
      errorName: 'amount_out_of_range',
    });
    expect(parseMoneyToCents(Number.MAX_SAFE_INTEGER + 1)).toEqual({
      ok: false,
      errorName: 'amount_out_of_range',
    });
  });

  it('tabla adversarial completa: cada insumo → {ok:false,errorName} exacto', () => {
    const cases: Array<[unknown, MoneyParseErrorName]> = [
      // Strings no canónicas: vacía, no numérica, separadores y sintaxis que
      // Number() aceptaría (coerción silenciosa prohibida por CAL-01/V-21).
      ['', 'invalid_amount'],
      [' ', 'invalid_amount'],
      ['abc', 'invalid_amount'],
      ['10,50', 'invalid_amount'],
      ['.5', 'invalid_amount'],
      ['10.', 'invalid_amount'],
      ['10.555', 'invalid_amount'],
      ['+5', 'invalid_amount'],
      ['5.5.5', 'invalid_amount'],
      ['1e3', 'invalid_amount'],
      ['1e2', 'invalid_amount'],
      ['0x10', 'invalid_amount'],
      ['Infinity', 'invalid_amount'],
      ['NaN', 'invalid_amount'],
      // '1２3' mezcla ASCII + full-width: visualmente 123 pero no es decimal.
      ['1２3', 'invalid_amount'],
      // Dígitos full-width unicode '１００': visualmente 100, no son ASCII.
      ['１００', 'invalid_amount'],
      // Signo que no es ASCII '-' (U+2212): la gramática canónica lo rechaza.
      ['−5', 'invalid_amount'],
      // No líquido: objetos, NaN e Infinity jamás se convierten a cents.
      [{}, 'invalid_amount'],
      [Number.NaN, 'invalid_amount'],
      [Number.POSITIVE_INFINITY, 'invalid_amount'],
      [Number.NEGATIVE_INFINITY, 'invalid_amount'],
      // Artefactos float: 0.1+0.2 es 0.30000000000000004 (>2 decimales):
      // jamás se redondea a 30.
      [0.1 + 0.2, 'invalid_amount'],
      [1.005, 'invalid_amount'],
      [1e21, 'invalid_amount'],
      // Fuera de rango seguro (motivo distinguido arriba, aquí en la tabla).
      ['90071992547409.92', 'amount_out_of_range'],
      ['999999999999999999', 'amount_out_of_range'],
      [Number.MAX_SAFE_INTEGER + 1, 'amount_out_of_range'],
      // Cero negativo (motivo distinguido arriba, aquí en la tabla).
      ['-0', 'negative_zero'],
      ['-0.00', 'negative_zero'],
      [-0, 'negative_zero'],
    ];
    for (const [input, errorName] of cases) {
      expect(parseMoneyToCents(input)).toEqual({ ok: false, errorName });
    }
  });

  it('US-01 adversarial: sintaxis numéricas y no-líquido siguen fail-closed, ahora discriminadas', () => {
    expect(parseMoneyToCents('1e2')).toEqual({ ok: false, errorName: 'invalid_amount' });
    expect(parseMoneyToCents('0x10')).toEqual({ ok: false, errorName: 'invalid_amount' });
    expect(parseMoneyToCents('１００')).toEqual({ ok: false, errorName: 'invalid_amount' });
    expect(parseMoneyToCents({})).toEqual({ ok: false, errorName: 'invalid_amount' });
    expect(parseMoneyToCents(Number.NaN)).toEqual({ ok: false, errorName: 'invalid_amount' });
    expect(parseMoneyToCents(Number.POSITIVE_INFINITY)).toEqual({
      ok: false,
      errorName: 'invalid_amount',
    });
    expect(parseMoneyToCents(Number.MAX_SAFE_INTEGER + 1)).toEqual({
      ok: false,
      errorName: 'amount_out_of_range',
    });
  });
  it('US-10 integrado: strings negativos (-19.99/-10.50/-0.01, trim), espejo number y signos malformados', () => {
    expect(parseMoneyToCents(' -19.99 ')).toEqual({ ok: true, cents: -1999 });
    expect(parseMoneyToCents('-19.99')).toEqual({ ok: true, cents: -1999 });
    expect(parseMoneyToCents('-10.50')).toEqual({ ok: true, cents: -1050 });
    expect(parseMoneyToCents('-10.5')).toEqual({ ok: true, cents: -1050 });
    expect(parseMoneyToCents('-0.01')).toEqual({ ok: true, cents: -1 });
    expect(parseMoneyToCents(-19.99)).toEqual({ ok: true, cents: -1999 });
    // Signos malformados: la gramática canónica -?\d+(\.\d{1,2})? los rechaza.
    expect(parseMoneyToCents('+-5')).toEqual({ ok: false, errorName: 'invalid_amount' });
    expect(parseMoneyToCents('--5')).toEqual({ ok: false, errorName: 'invalid_amount' });
    expect(parseMoneyToCents('- 5')).toEqual({ ok: false, errorName: 'invalid_amount' });
    expect(parseMoneyToCents('-')).toEqual({ ok: false, errorName: 'invalid_amount' });
  });
});