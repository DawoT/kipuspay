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
  it('gramática canónica -?(0|[1-9]\\d*)(\\.\\d{1,2})?: strings → cents por dígitos', () => {
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
    expect(parseMoneyToCents(true)).toEqual({ ok: false, errorName: 'INVALID_AMOUNT' });
    expect(parseMoneyToCents(null)).toEqual({ ok: false, errorName: 'INVALID_AMOUNT' });
    expect(parseMoneyToCents(undefined)).toEqual({ ok: false, errorName: 'INVALID_AMOUNT' });
    expect(parseMoneyToCents([])).toEqual({ ok: false, errorName: 'INVALID_AMOUNT' });
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
      ['', 'INVALID_AMOUNT'],
      [' ', 'INVALID_AMOUNT'],
      ['abc', 'INVALID_AMOUNT'],
      ['10,50', 'INVALID_AMOUNT'],
      ['.5', 'INVALID_AMOUNT'],
      ['10.', 'INVALID_AMOUNT'],
      ['10.555', 'INVALID_AMOUNT'],
      ['+5', 'INVALID_AMOUNT'],
      // US-01: ceros a la izquierda no son canónicos — '007'/'01.50'/'00.01'
      // duplicarían representaciones del mismo monto ('007'→700 igual que
      // '7') en la capa de dinero; la gramática (0|[1-9]\d*) los rechaza.
      ['007', 'INVALID_AMOUNT'],
      ['01.50', 'INVALID_AMOUNT'],
      ['00.01', 'INVALID_AMOUNT'],
      ['007.5', 'INVALID_AMOUNT'],
      ['000', 'INVALID_AMOUNT'],
      ['-007', 'INVALID_AMOUNT'],
      ['-01.50', 'INVALID_AMOUNT'],
      ['-00.01', 'INVALID_AMOUNT'],
      ['5.5.5', 'INVALID_AMOUNT'],
      ['1e3', 'INVALID_AMOUNT'],
      ['1e2', 'INVALID_AMOUNT'],
      ['0x10', 'INVALID_AMOUNT'],
      ['Infinity', 'INVALID_AMOUNT'],
      ['NaN', 'INVALID_AMOUNT'],
      // '1２3' mezcla ASCII + full-width: visualmente 123 pero no es decimal.
      ['1２3', 'INVALID_AMOUNT'],
      // Dígitos full-width unicode '１００': visualmente 100, no son ASCII.
      ['１００', 'INVALID_AMOUNT'],
      // Signo que no es ASCII '-' (U+2212): la gramática canónica lo rechaza.
      ['−5', 'INVALID_AMOUNT'],
      // No líquido: objetos, NaN e Infinity jamás se convierten a cents.
      [{}, 'INVALID_AMOUNT'],
      [Number.NaN, 'INVALID_AMOUNT'],
      [Number.POSITIVE_INFINITY, 'INVALID_AMOUNT'],
      [Number.NEGATIVE_INFINITY, 'INVALID_AMOUNT'],
      // Artefactos float: 0.1+0.2 es 0.30000000000000004 (>2 decimales):
      // jamás se redondea a 30.
      [0.1 + 0.2, 'INVALID_AMOUNT'],
      [1.005, 'INVALID_AMOUNT'],
      [1e21, 'INVALID_AMOUNT'],
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

  it('US-01 acceptance 2: solo ^-?(0|[1-9]\\d*)(\\.\\d{1,2})?$ acepta (ceros a la izquierda bloquean)', () => {
    // Acepta: '0' es canónico; '10.5' arranca en [1-9] y es único (no
    // colisiona con '010.5' ni '10.50').
    expect(parseMoneyToCents('0')).toEqual({ ok: true, cents: 0 });
    expect(parseMoneyToCents('0.00')).toEqual({ ok: true, cents: 0 });
    expect(parseMoneyToCents('7')).toEqual({ ok: true, cents: 700 });
    expect(parseMoneyToCents('10.50')).toEqual({ ok: true, cents: 1050 });
    expect(parseMoneyToCents('-0.01')).toEqual({ ok: true, cents: -1 });
    // Rechaza representaciones duplicadas: '007'/700 == '7'/700,
    // '01.50'/150 == '1.50'/150, '00.01'/1 == '0.01'/1 → la misma
    // representación decimal admite UNA única cadena canónica.
    expect(parseMoneyToCents('007')).toEqual({ ok: false, errorName: 'INVALID_AMOUNT' });
    expect(parseMoneyToCents('01.50')).toEqual({ ok: false, errorName: 'INVALID_AMOUNT' });
    expect(parseMoneyToCents('00.01')).toEqual({ ok: false, errorName: 'INVALID_AMOUNT' });
    expect(parseMoneyToCents('-007')).toEqual({ ok: false, errorName: 'INVALID_AMOUNT' });
    expect(parseMoneyToCents('-01.50')).toEqual({ ok: false, errorName: 'INVALID_AMOUNT' });
    expect(parseMoneyToCents('-00.01')).toEqual({ ok: false, errorName: 'INVALID_AMOUNT' });
  });

  it('US-01 adversarial: sintaxis numéricas y no-líquido siguen fail-closed, ahora discriminadas', () => {
    expect(parseMoneyToCents('1e2')).toEqual({ ok: false, errorName: 'INVALID_AMOUNT' });
    expect(parseMoneyToCents('0x10')).toEqual({ ok: false, errorName: 'INVALID_AMOUNT' });
    expect(parseMoneyToCents('１００')).toEqual({ ok: false, errorName: 'INVALID_AMOUNT' });
    expect(parseMoneyToCents({})).toEqual({ ok: false, errorName: 'INVALID_AMOUNT' });
    expect(parseMoneyToCents(Number.NaN)).toEqual({ ok: false, errorName: 'INVALID_AMOUNT' });
    expect(parseMoneyToCents(Number.POSITIVE_INFINITY)).toEqual({
      ok: false,
      errorName: 'INVALID_AMOUNT',
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
    // Signos malformados: la gramática canónica -?(0|[1-9]\d*)(\.\d{1,2})? los rechaza.
    expect(parseMoneyToCents('+-5')).toEqual({ ok: false, errorName: 'INVALID_AMOUNT' });
    expect(parseMoneyToCents('--5')).toEqual({ ok: false, errorName: 'INVALID_AMOUNT' });
    expect(parseMoneyToCents('- 5')).toEqual({ ok: false, errorName: 'INVALID_AMOUNT' });
    expect(parseMoneyToCents('-')).toEqual({ ok: false, errorName: 'INVALID_AMOUNT' });
  });
});