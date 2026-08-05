import { describe, expect, it } from 'vitest';
import { buildRig, digitsOf, offsetAt } from './quipu.js';

const OPTS = {
  originX: 100,
  originY: 60,
  spacing: 90,
  length: 600,
  drift: 12,
};

describe('quipu — valor posicional', () => {
  it('descompone en centenas, decenas y unidades', () => {
    expect(digitsOf(342)).toEqual([3, 4, 2]);
    expect(digitsOf(7)).toEqual([0, 0, 7]);
    expect(digitsOf(90)).toEqual([0, 9, 0]);
  });

  it('recorta fuera de rango sin romper el dibujo', () => {
    expect(digitsOf(-5)).toEqual([0, 0, 0]);
    expect(digitsOf(4321)).toEqual([9, 9, 9]);
    expect(digitsOf(12.7)).toEqual([0, 1, 2]);
  });

  it('la cantidad de nudos es la suma de los digitos', () => {
    const rig = buildRig([{ slug: 'restaurantes', value: 342 }], OPTS);
    expect(rig.cords[0]?.knots).toHaveLength(3 + 4 + 2);
  });

  it('las centenas cuelgan mas arriba que las unidades', () => {
    const rig = buildRig([{ slug: 'retail', value: 111 }], OPTS);
    const knots = rig.cords[0]?.knots ?? [];
    const [hundreds, tens, units] = knots;

    expect(hundreds?.tier).toBe('hundreds');
    expect(units?.tier).toBe('units');
    expect(hundreds?.y).toBeLessThan(tens?.y ?? 0);
    expect(tens?.y).toBeLessThan(units?.y ?? 0);
    expect(hundreds?.size).toBeGreaterThan(units?.size ?? 0);
  });

  it('un cordel sin valor cuelga limpio', () => {
    const rig = buildRig([{ slug: 'servicios', value: 0 }], OPTS);
    expect(rig.cords[0]?.knots).toHaveLength(0);
    expect(rig.cords[0]?.path).toMatch(/^M/);
  });
});

describe('quipu — aparejo', () => {
  const rig = buildRig(
    [
      { slug: 'restaurantes', value: 342 },
      { slug: 'farmacias', value: 213 },
      { slug: 'retail', value: 431 },
    ],
    OPTS,
  );

  it('un colgante por entrada, separados por spacing', () => {
    expect(rig.cords).toHaveLength(3);
    expect(rig.cords.map((c) => c.slug)).toEqual(['restaurantes', 'farmacias', 'retail']);
  });

  it('el cordel principal cubre todos los colgantes', () => {
    expect(rig.primary.y).toBe(OPTS.originY);
    expect(rig.primary.x1).toBeLessThan(OPTS.originX);
    expect(rig.primary.x2).toBeGreaterThan(OPTS.originX + 2 * OPTS.spacing);
  });

  it('los nudos siguen la curva del cordel, no una vertical recta', () => {
    const cord = rig.cords[0];
    const drifted = (cord?.knots ?? []).some((k) => Math.abs(k.x - OPTS.originX) > 1);
    expect(drifted).toBe(true);
  });

  it('el path arranca en el cordel principal y remata en la punta', () => {
    const cord = rig.cords[0];
    expect(cord?.path.startsWith(`M${OPTS.originX},${OPTS.originY}`)).toBe(true);
    expect(cord?.tip.y).toBe(OPTS.originY + OPTS.length);
  });

  it('ningun cordel cae igual que su vecino', () => {
    const tips = rig.cords.map((c) => c.tip.y);
    expect(new Set(tips).size).toBe(tips.length);
  });

  it('el vaiven vale cero en el nacimiento del cordel', () => {
    expect(offsetAt(0, 12)).toBeCloseTo(0);
    expect(offsetAt(0.5, 12)).toBeGreaterThan(0);
  });

  it('compacto: nudos caben en un cordel corto sin salirse del largo', () => {
    const rig = buildRig([{ slug: 'retail', value: 333 }], {
      ...OPTS,
      length: 52,
      knotScale: 0.33,
      compact: true,
    });
    const knots = rig.cords[0]?.knots ?? [];
    expect(knots).toHaveLength(9);
    for (const knot of knots) {
      expect(knot.y).toBeLessThanOrEqual(OPTS.originY + 52);
    }
    const [hundreds, , units] = knots;
    expect(hundreds?.y).toBeLessThan(units?.y ?? 0);
  });

  it('compacto: mantiene el orden posicional igual que el clasico', () => {
    const classic = buildRig([{ slug: 'restaurantes', value: 231 }], OPTS);
    const compact = buildRig([{ slug: 'restaurantes', value: 231 }], {
      ...OPTS,
      knotScale: 0.33,
      compact: true,
    });
    for (const cord of [classic.cords[0], compact.cords[0]]) {
      const ks = cord?.knots ?? [];
      expect(ks[0]?.tier).toBe('hundreds');
      expect(ks[ks.length - 1]?.tier).toBe('units');
    }
  });
});
