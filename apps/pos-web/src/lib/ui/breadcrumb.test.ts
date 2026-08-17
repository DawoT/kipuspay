import { describe, expect, it } from 'vitest';
import { breadcrumbLabel } from './breadcrumb';

describe('breadcrumbLabel', () => {
  it('nombra el terminal, no el path vacío', () => {
    expect(breadcrumbLabel('/')).toBe('Terminal POS');
  });

  it('nombra catálogo, no admin/catalogo', () => {
    expect(breadcrumbLabel('/admin/catalogo')).toBe('Catálogo');
  });

  it('nombra el historial del día', () => {
    expect(breadcrumbLabel('/caja/historial')).toBe('Historial del día');
  });

  it('humaniza un segmento desconocido sin slashes', () => {
    expect(breadcrumbLabel('/admin/foo-bar')).toBe('foo bar');
  });

  it('nombra conciliar factura, no 3-way', () => {
    expect(breadcrumbLabel('/admin/factura-proveedor')).toBe('Conciliar factura');
    expect(breadcrumbLabel('/admin/factura-proveedor')).not.toMatch(/3-way/i);
  });
});
