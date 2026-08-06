import { describe, expect, it } from 'vitest';
import type { NormalizedProductRow } from '@kipuspay/domain-integrations';
import { parseEnrichedCsv, tokenizeCsv } from './csv.js';

describe('tokenizeCsv', () => {
  it('respeta comillas y comas internas', () => {
    const records = tokenizeCsv('a,"b,c",d\n1,2,3');
    expect(records).toEqual([
      ['a', 'b,c', 'd'],
      ['1', '2', '3'],
    ]);
  });

  it('soporta comillas dobles escapadas', () => {
    const records = tokenizeCsv('"dice ""hola"""');
    expect(records).toEqual([['dice "hola"']]);
  });
});

describe('parseEnrichedCsv', () => {
  it('parsa productos y clientes del CSV enriquecido', () => {
    const csv = [
      'entity_type,external_id,sku,name,price,cost,tax,barcode',
      'product,p1,SKU-1,Café,12.50,8.00,IGV,7791234',
      'product,p2,SKU-2,Pan,1.20,0.50,IGV,',
    ].join('\n');
    const result = parseEnrichedCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      entityType: 'product',
      externalId: 'p1',
      sku: 'SKU-1',
      priceCents: 1250,
      costCents: 800,
      taxName: 'IGV',
      barcode: '7791234',
    });
  });

  it('detecta CSV de solo clientes por cabecera', () => {
    const csv = [
      'external_id,doc_type,doc_number,name,email',
      'c1,6,20100047218,Cliente S.A.C.,c@x.com',
    ].join('\n');
    const result = parseEnrichedCsv(csv);
    expect(result.rows[0]).toMatchObject({
      entityType: 'customer',
      externalId: 'c1',
      documentNumber: '20100047218',
      name: 'Cliente S.A.C.',
    });
  });

  it('reporta errores por fila sin abortar el lote', () => {
    const csv = [
      'entity_type,external_id,sku,name,price',
      'product,p1,SKU-1,Café,12.50',
      'product,,SKU-2,Pan,1.20',
      'product,p3,SKU-3,Leche,NO-NUMERO',
    ].join('\n');
    const result = parseEnrichedCsv(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]?.reason).toBe('producto requiere external_id');
    expect(result.errors[1]?.reason).toBe('precio inválido: NO-NUMERO');
  });

  it('usa coma decimal para precios entre comillas', () => {
    const csv = 'entity_type,external_id,sku,name,price\nproduct,p1,SKU-1,Café,"9,99"';
    const result = parseEnrichedCsv(csv);
    expect((result.rows[0] as NormalizedProductRow).priceCents).toBe(999);
  });

  it('devuelve vacío para entrada sin registros', () => {
    expect(parseEnrichedCsv('')).toEqual({ rows: [], errors: [] });
  });
});
