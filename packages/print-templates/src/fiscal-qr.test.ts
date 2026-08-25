import { describe, expect, it } from 'vitest';
// HALLAZGO H2 (auditoría 0031 GAP-PRODUCTO): nadie construía el payload QR
// fiscal. Contrato: anexo de representación impresa RS 402-2019/SUNAT —
// separador pipe, 10 campos en orden normativo:
//   RUC | TIPO | SERIE | NUMERO | MTO TOTAL IGV | MTO TOTAL |
//   FECHA DE EMISION | TIPO DOC ADQUIRENTE | NUM DOC ADQUIRENTE | CODIGO HASH
// Simbología QR Code 2005 (ISO/IEC 18004:2006), sin variantes Micro QR,
// codificación UTF-8 (el builder solo produce la CADENA; la matriz la genera
// el código vendorizado MIT ya presente en apps/pos-web/src/lib/vendor).
import { buildFiscalQrPayload, officialDocumentNameFor } from './fiscal-qr.js';

const base = {
  ruc: '20512345678',
  documentType: '01',
  series: 'F001',
  number: 123,
  igvCents: 10800,
  totalCents: 70800,
  issueDateIso: '2026-08-24',
  digestValue: 'digestvalue-fixture-0001',
};

describe('buildFiscalQrPayload (RS 402-2019 anexo)', () => {
  it('factura con adquirente RUC produce los 10 campos en orden normativo', () => {
    const payload = buildFiscalQrPayload({
      ...base,
      buyerDocType: '6',
      buyerDocNumber: '20600695771',
    });
    expect(payload).toBe(
      '20512345678|01|F001|00000123|108.00|708.00|2026-08-24|6|20600695771|digestvalue-fixture-0001',
    );
  });

  it('boleta sin adquirente consigna "-" en tipo y número de documento', () => {
    const payload = buildFiscalQrPayload({ ...base, documentType: '03', series: 'B001' });
    expect(payload).toBe(
      '20512345678|03|B001|00000123|108.00|708.00|2026-08-24|-|-|digestvalue-fixture-0001',
    );
  });

  it('boleta con DNI del adquirente lo consigna (catálogo 06)', () => {
    const payload = buildFiscalQrPayload({
      ...base,
      documentType: '03',
      series: 'B001',
      buyerDocType: '1',
      buyerDocNumber: '44443333',
    });
    expect(payload.split('|')[7]).toBe('1');
    expect(payload.split('|')[8]).toBe('44443333');
  });

  it('número correlativo se rellena a 8 dígitos (formato cbc:ID)', () => {
    const payload = buildFiscalQrPayload(base);
    expect(payload.split('|')[3]).toBe('00000123');
  });

  it('montos en formato n(12,2) con punto decimal, desde INTEGER cents', () => {
    const payload = buildFiscalQrPayload(base);
    expect(payload.split('|')[4]).toBe('108.00');
    expect(payload.split('|')[5]).toBe('708.00');
  });

  it('IGV cero se consigna 0.00 (operaciones exoneradas/inafectas)', () => {
    const payload = buildFiscalQrPayload({ ...base, igvCents: 0 });
    expect(payload.split('|')[4]).toBe('0.00');
  });

  it('rechaza RUC con longitud distinta de 11 dígitos', () => {
    expect(() => buildFiscalQrPayload({ ...base, ruc: '12345' })).toThrow(/INVALID_RUC/);
    expect(() => buildFiscalQrPayload({ ...base, ruc: '2051234567a' })).toThrow(/INVALID_RUC/);
  });

  it('rechaza tipo de comprobante fuera del catálogo 01 (incluye NV interna)', () => {
    expect(() => buildFiscalQrPayload({ ...base, documentType: 'NV' })).toThrow(
      /INVALID_DOCUMENT_TYPE/,
    );
    expect(() => buildFiscalQrPayload({ ...base, documentType: '35' })).toThrow(
      /INVALID_DOCUMENT_TYPE/,
    );
  });

  it('rechaza serie que no sea 4 caracteres alfanuméricos', () => {
    expect(() => buildFiscalQrPayload({ ...base, series: 'F01' })).toThrow(/INVALID_SERIES/);
    expect(() => buildFiscalQrPayload({ ...base, series: 'f001' })).toThrow(/INVALID_SERIES/);
  });

  it('rechaza montos no enteros o negativos (dinero solo INTEGER cents)', () => {
    expect(() => buildFiscalQrPayload({ ...base, totalCents: 70800.5 })).toThrow(
      /INVALID_TICKET_CENTS/,
    );
    expect(() => buildFiscalQrPayload({ ...base, igvCents: -1 })).toThrow(/INVALID_TICKET_CENTS/);
  });

  it('rechaza fecha fuera del formato ISO yyyy-mm-dd o fecha imposible', () => {
    expect(() => buildFiscalQrPayload({ ...base, issueDateIso: '24-08-2026' })).toThrow(
      /INVALID_ISSUE_DATE/,
    );
    expect(() => buildFiscalQrPayload({ ...base, issueDateIso: '2026-02-30' })).toThrow(
      /INVALID_ISSUE_DATE/,
    );
  });

  it('rechaza hash vacío o con separador pipe', () => {
    expect(() => buildFiscalQrPayload({ ...base, digestValue: '' })).toThrow(/INVALID_DIGEST/);
    expect(() => buildFiscalQrPayload({ ...base, digestValue: 'a|b' })).toThrow(/INVALID_DIGEST/);
  });

  it('rechaza número de documento de adquirente con pipe', () => {
    expect(() =>
      buildFiscalQrPayload({ ...base, buyerDocType: '1', buyerDocNumber: '44|44' }),
    ).toThrow(/INVALID_BUYER/);
  });
});

describe('officialDocumentNameFor (denominación oficial, RS 097-2012 anexos 1-2)', () => {
  it('mapea catálogo 01 a denominación oficial', () => {
    expect(officialDocumentNameFor('01')).toBe('FACTURA ELECTRÓNICA');
    expect(officialDocumentNameFor('03')).toBe('BOLETA DE VENTA ELECTRÓNICA');
    expect(officialDocumentNameFor('07')).toBe('NOTA DE CRÉDITO ELECTRÓNICA');
    expect(officialDocumentNameFor('08')).toBe('NOTA DE DÉBITO ELECTRÓNICA');
  });

  it('NV/control interno mantiene su denominación propia', () => {
    expect(officialDocumentNameFor('NV')).toBe('NOTA DE VENTA');
    expect(officialDocumentNameFor('NV_RETURN')).toBe('NOTA DE VENTA');
  });
});
