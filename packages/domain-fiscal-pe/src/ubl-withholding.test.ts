import { describe, expect, it } from 'vitest';
import { assertValidWithholdingXml, buildUblWithholdingXml } from './ubl-withholding.js';

const base = {
  ublVersion: '2.0' as const,
  id: 'P001-00000001',
  issueDate: '2026-08-21',
  issuerRuc: '20123456789',
  issuerName: 'Emisor SAC',
  customerDocType: '6',
  customerDocNumber: '20612913251',
  customerName: 'Cliente SAC',
  referencedDocId: 'F001-8',
  baseAmountCents: 10_000,
  amountCents: 200,
  ratePercentage: 200,
};

describe('buildUblWithholdingXml', () => {
  it('percepción 02 con cents enteros', () => {
    const xml = buildUblWithholdingXml({ ...base, documentType: '02' });
    expect(() => assertValidWithholdingXml(xml, '02')).not.toThrow();
    expect(xml).toContain('<Perception');
    expect(xml).toContain('100.00');
    expect(xml).toContain('2.00');
  });

  it('retención 20', () => {
    const xml = buildUblWithholdingXml({
      ...base,
      documentType: '20',
      id: 'R001-00000001',
      amountCents: 600,
      ratePercentage: 600,
    });
    expect(() => assertValidWithholdingXml(xml, '20')).not.toThrow();
    expect(xml).toContain('<Retention');
  });

  it('rechaza montos no enteros', () => {
    expect(() => buildUblWithholdingXml({ ...base, documentType: '02', amountCents: 1.5 })).toThrow(
      'INVALID_AMOUNT_CENTS',
    );
    expect(() =>
      buildUblWithholdingXml({ ...base, documentType: '02', baseAmountCents: 0 }),
    ).toThrow('INVALID_BASE_CENTS');
    expect(() => buildUblWithholdingXml({ ...base, documentType: '02', issuerRuc: '1' })).toThrow(
      'INVALID_ISSUER_RUC',
    );
    expect(() =>
      buildUblWithholdingXml({ ...base, documentType: '02', ublVersion: '2.1' as never }),
    ).toThrow('UNSUPPORTED_UBL_VERSION');
  });

  it('assertValidWithholdingXml rechaza root/versión/contingencia', () => {
    expect(() => assertValidWithholdingXml('<Retention/>', '02')).toThrow(
      'MISSING_WITHHOLDING_ROOT',
    );
    expect(() => assertValidWithholdingXml('<Perception/>', '02')).toThrow('INVALID_UBL_VERSION');
    expect(() =>
      assertValidWithholdingXml(
        '<Perception><cbc:UBLVersionID>2.0</cbc:UBLVersionID></Perception>',
        '02',
      ),
    ).toThrow('MISSING_ISSUER_RUC');
    const xml = buildUblWithholdingXml({ ...base, documentType: '02' }).replace(
      '</Perception>',
      ' contingencia</Perception>',
    );
    expect(() => assertValidWithholdingXml(xml, '02')).toThrow('CONTINGENCIA_FORBIDDEN');
  });
});
