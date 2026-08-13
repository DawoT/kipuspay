import { describe, expect, it } from 'vitest';
import { qrMatrix } from './qr-canvas';

describe('qrMatrix (vendor qrcode-generator, MIT)', () => {
  it('genera una matriz determinista para un payload', () => {
    const a = qrMatrix('https://kipuspay.pe');
    const b = qrMatrix('https://kipuspay.pe');
    expect(a.size).toBe(b.size);
    expect(a.size).toBeGreaterThan(20);
    for (let r = 0; r < a.size; r++) {
      for (let c = 0; c < a.size; c++) {
        expect(a.isDark(r, c)).toBe(b.isDark(r, c));
      }
    }
  });

  it('dibuja el patrón finder 7×7 en la esquina superior izquierda', () => {
    const m = qrMatrix('1234');
    expect(m.isDark(0, 0)).toBe(true);
    expect(m.isDark(0, 6)).toBe(true);
    expect(m.isDark(6, 0)).toBe(true);
    expect(m.isDark(1, 1)).toBe(false);
    expect(m.isDark(2, 2)).toBe(true);
    expect(m.isDark(4, 4)).toBe(true);
    expect(m.isDark(0, 7)).toBe(false);
  });

  it('soporta payloads largos con tamaño auto-detectado', () => {
    const long = 'https://kipuspay.pe/ticket/'.repeat(4);
    const m = qrMatrix(long);
    expect(m.size).toBeGreaterThan(29);
  });

  it('payloads distintos producen matrices distintas', () => {
    const a = qrMatrix('abc');
    const b = qrMatrix('xyz');
    let different = false;
    for (let r = 0; r < Math.min(a.size, b.size) && !different; r++) {
      for (let c = 0; c < Math.min(a.size, b.size); c++) {
        if (a.isDark(r, c) !== b.isDark(r, c)) {
          different = true;
          break;
        }
      }
    }
    expect(different).toBe(true);
  });
});
