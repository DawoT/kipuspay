import { describe, expect, it } from 'vitest';
import { paperWidthLabel, resolvePaperWidth } from './paper-width.js';

describe('paper-width domain (58/80 autodetección)', () => {
  it('preferencia guardada gana sobre el probe (58)', () => {
    expect(resolvePaperWidth({ preferred: 58, probed: 80 })).toBe(58);
    expect(resolvePaperWidth({ preferred: 80, probed: 58 })).toBe(80);
  });

  it('sin preferencia, el probe define el ancho', () => {
    expect(resolvePaperWidth({ preferred: null, probed: 58 })).toBe(58);
    expect(resolvePaperWidth({ preferred: undefined, probed: 80 })).toBe(80);
  });

  it('sin preferencia ni probe → null (el cliente decide default para la prueba)', () => {
    expect(resolvePaperWidth({ preferred: null, probed: null })).toBeNull();
  });

  it('valores fuera de 58/80 son rechazados (fail-closed)', () => {
    expect(
      resolvePaperWidth({ preferred: 100 as unknown as 58 | 80 | null, probed: null }),
    ).toBeNull();
    expect(
      resolvePaperWidth({ preferred: null, probed: 100 as unknown as 58 | 80 | null }),
    ).toBeNull();
    expect(resolvePaperWidth({ preferred: 58, probed: 100 as unknown as 58 | 80 | null })).toBe(58);
  });

  it('label para UI', () => {
    expect(paperWidthLabel(58)).toBe('58 mm');
    expect(paperWidthLabel(80)).toBe('80 mm');
  });
});
