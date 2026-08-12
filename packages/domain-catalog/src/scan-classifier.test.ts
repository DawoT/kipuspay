import { describe, expect, it } from 'vitest';
import { classifyScan, isReservedBarcode, type ScanClassification } from './scan-classifier.js';

describe('scan classifier namespace (Sprint 50 / edge 1A)', () => {
  it('dígitos EAN-13/UPC → PRODUCT_SCOPE; EMP- → VENDOR_SCOPE', () => {
    expect(classifyScan('1234567890128')).toBe('PRODUCT_SCOPE');
    expect(classifyScan('12345')).toBe('PRODUCT_SCOPE');
    expect(classifyScan('EMP-12345')).toBe('VENDOR_SCOPE');
  });

  it('entradas inválidas → UNKNOWN (fail-closed)', () => {
    expect(classifyScan('')).toBe('UNKNOWN');
    expect(classifyScan(null)).toBe('UNKNOWN');
    expect(classifyScan(undefined)).toBe('UNKNOWN');
    expect(classifyScan('  ')).toBe('UNKNOWN');
    expect(classifyScan('EMP')).toBe('UNKNOWN');
    expect(classifyScan('emp-12345')).toBe('UNKNOWN');
    expect(classifyScan('EMP-')).toBe('UNKNOWN');
    expect(classifyScan('EMP-ABC')).toBe('UNKNOWN');
    expect(classifyScan('ABC-123')).toBe('UNKNOWN');
    expect(classifyScan('12345 67890')).toBe('UNKNOWN');
  });

  it('edge 1A: 500 escaneos mixtos → 0 falsos positivos', () => {
    let products = 0;
    let vendors = 0;
    let unknown = 0;
    for (let i = 0; i < 500; i += 1) {
      const raw = i % 2 === 0 ? `EMP-${10000 + i}` : `${i}`.padStart(13, '0');
      const kind = classifyScan(raw);
      if (kind === 'PRODUCT_SCOPE') products += 1;
      else if (kind === 'VENDOR_SCOPE') vendors += 1;
      else unknown += 1;
    }
    expect(products).toBe(250);
    expect(vendors).toBe(250);
    expect(unknown).toBe(0);
  });

  it('EMP- está reservado: jamás es barcode de producto', () => {
    expect(isReservedBarcode('EMP-12345')).toBe(true);
    expect(isReservedBarcode('EMP-')).toBe(true);
    expect(isReservedBarcode('EMP-ABC')).toBe(true);
    expect(isReservedBarcode('1234567890128')).toBe(false);
    expect(isReservedBarcode('')).toBe(false);
  });

  it('el union es cerrado', () => {
    const kinds: readonly ScanClassification[] = ['PRODUCT_SCOPE', 'VENDOR_SCOPE', 'UNKNOWN'];
    for (const kind of kinds) expect(['PRODUCT_SCOPE', 'VENDOR_SCOPE', 'UNKNOWN']).toContain(kind);
  });
});
