/**
 * US-04 — parse tipado fail-closed de *Microunits y costo derivado exacto.
 * Tipos inválidos → resultado discriminado estable (sin NaN ni excepciones);
 * montos grandes → exactitud centavo a centavo contra verdad BigInt
 * (el producto float directo pierde centavos, ver caso adversario abajo).
 */
import { describe, expect, it } from 'vitest';
import {
  deriveMicrounitValueCents,
  parseQuantityMicrounits,
  parseQuantityMicrounitsQuery,
  QUANTITY_MICROUNITS_BAD_REQUEST,
} from './quantity-input.js';

describe('parseQuantityMicrounits (body JSON, fail-closed)', () => {
  it('acepta enteros seguros ≥ 0', () => {
    expect(parseQuantityMicrounits(0)).toEqual({ ok: true, microunits: 0 });
    expect(parseQuantityMicrounits(42)).toEqual({ ok: true, microunits: 42 });
    expect(parseQuantityMicrounits(1_000_000)).toEqual({ ok: true, microunits: 1_000_000 });
    expect(parseQuantityMicrounits(Number.MAX_SAFE_INTEGER)).toEqual({
      ok: true,
      microunits: Number.MAX_SAFE_INTEGER,
    });
  });

  it('rechaza tipos inválidos con INVALID_QUANTITY (sin coerción silenciosa)', () => {
    for (const bad of [
      '42',
      '1000000',
      '',
      '0x10',
      true,
      false,
      null,
      undefined,
      [],
      [1_000_000],
      {},
      NaN,
      Infinity,
      -Infinity,
      1.5,
      -5,
    ]) {
      const result = parseQuantityMicrounits(bad);
      expect(result).toEqual({ ok: false, errorName: 'INVALID_QUANTITY' });
    }
  });

  it('discrimina -0 y fuera de rango seguro', () => {
    expect(parseQuantityMicrounits(-0)).toEqual({ ok: false, errorName: 'negative_zero' });
    expect(parseQuantityMicrounits(2 ** 53)).toEqual({
      ok: false,
      errorName: 'quantity_out_of_range',
    });
  });

  it('never-throw: el shape 400 compartido es estable', () => {
    expect(QUANTITY_MICROUNITS_BAD_REQUEST).toEqual({
      error: 'invalid quantity microunits',
      code: 'INVALID_QUANTITY_MICROUNITS',
    });
  });
});

describe('parseQuantityMicrounitsQuery (query param string)', () => {
  it('acepta dígitos canónicos', () => {
    expect(parseQuantityMicrounitsQuery('0')).toEqual({ ok: true, microunits: 0 });
    expect(parseQuantityMicrounitsQuery('500000')).toEqual({ ok: true, microunits: 500_000 });
    expect(parseQuantityMicrounitsQuery('9007199254740991')).toEqual({
      ok: true,
      microunits: Number.MAX_SAFE_INTEGER,
    });
    expect(parseQuantityMicrounitsQuery(' 42 ')).toEqual({ ok: true, microunits: 42 });
  });

  it('rechaza basura que Number() aceptaba', () => {
    for (const bad of [undefined, '', '007', '+5', '-1', '1e3', '0x10', '12.0', 'abc']) {
      expect(parseQuantityMicrounitsQuery(bad)).toEqual({
        ok: false,
        errorName: 'INVALID_QUANTITY',
      });
    }
  });

  it('guard de longitud: sobre MAX_SAFE_INTEGER → out_of_range sin convertir', () => {
    // MAX + 1, misma cantidad de dígitos: comparación lexicográfica.
    expect(parseQuantityMicrounitsQuery('9007199254740992')).toEqual({
      ok: false,
      errorName: 'quantity_out_of_range',
    });
    // Un dígito más que el máximo.
    expect(parseQuantityMicrounitsQuery('99999999999999999')).toEqual({
      ok: false,
      errorName: 'quantity_out_of_range',
    });
    // Cadena gigante (DoS de conversión): rechazo inmediato por longitud.
    const giant = '9'.repeat(400);
    expect(parseQuantityMicrounitsQuery(giant)).toEqual({
      ok: false,
      errorName: 'quantity_out_of_range',
    });
  });
});

describe('deriveMicrounitValueCents (costo derivado exacto, auditoría :247)', () => {
  it('casos exactos chicos', () => {
    expect(deriveMicrounitValueCents(1_000_000, 100)).toBe(100);
    expect(deriveMicrounitValueCents(1_500_000, 1000)).toBe(1500);
    expect(deriveMicrounitValueCents(10_000_000_000, 1_000_000)).toBe(10_000_000_000);
    expect(deriveMicrounitValueCents(7_777_777, 0)).toBe(0);
  });

  it('redondeo half-up idéntico a Math.round, incluidos negativos', () => {
    expect(deriveMicrounitValueCents(2_500_000, 1)).toBe(Math.round(2.5));
    expect(deriveMicrounitValueCents(1_500_000, 1)).toBe(Math.round(1.5));
    expect(deriveMicrounitValueCents(500_001, 1)).toBe(Math.round(0.500001));
    expect(deriveMicrounitValueCents(-1_500_000, 1)).toBe(Math.round(-1.5));
    expect(deriveMicrounitValueCents(-1_499_999, 1)).toBe(Math.round(-1.499999));
    expect(deriveMicrounitValueCents(-2_400_000, 1)).toBe(Math.round(-2.4));
  });

  it('exactitud en montos grandes donde el producto float pierde centavos', () => {
    // Caso adversario verificado contra aritmética BigInt: el producto
    // directo desborda MAX_SAFE_INTEGER y Math.round del cociente float
    // reporta un centavo de más; la aritmética exacta no.
    const microunits = 5_507_490_250_751;
    const unitCostCents = 679_131_554;
    const truth = 3_740_310_412_632_376;
    expect(Number((BigInt(microunits) * BigInt(unitCostCents)) / 1_000_000n)).toBe(truth);
    expect(Math.round((microunits * unitCostCents) / 1_000_000)).toBe(truth + 1); // drift legado
    expect(deriveMicrounitValueCents(microunits, unitCostCents)).toBe(truth);

    // Segundo par independiente, mismo fenómeno (1 centavo de más en float).
    expect(deriveMicrounitValueCents(993_211_187_199, 586_946_295)).toBe(582_961_626_479_004);
    expect(Math.round((993_211_187_199 * 586_946_295) / 1_000_000)).toBe(582_961_626_479_005);
  });

  it('fail-closed: operando no exacto o producto fuera de rango → null', () => {
    for (const bad of [NaN, Infinity, 1.5, '5', null]) {
      expect(deriveMicrounitValueCents(bad as number, 100)).toBeNull();
      expect(deriveMicrounitValueCents(1_000_000, bad as number)).toBeNull();
    }
    // whole × cost desbordaría MAX_SAFE_INTEGER (guard previo a multiplicar).
    expect(deriveMicrounitValueCents(9_000_000_000_000_000, Number.MAX_SAFE_INTEGER)).toBeNull();
    expect(deriveMicrounitValueCents(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)).toBeNull();
  });
});
