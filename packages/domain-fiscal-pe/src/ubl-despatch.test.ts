/* eslint-disable no-secrets/no-secrets -- fixtures XML de prueba */
import { describe, expect, it } from 'vitest';
import { assertValidDespatchXml, buildUblDespatchXml } from './ubl-despatch.js';

const input = {
  ublVersion: '2.1' as const,
  id: 'T001-00000001',
  issueDate: '2026-08-21',
  issueTime: '15:00:00',
  issuerRuc: '20123456789',
  issuerName: 'Emisor SAC',
  transferReasonCode: '01',
  transportModeCode: '01',
  vehiclePlate: 'ABC-123',
  carrierDocumentType: '1',
  carrierDocumentNumber: '12345678',
  carrierName: 'Carlos Ruiz',
  originUbigeo: '150101',
  originAddress: 'Av Lima 100',
  destinationUbigeo: '070101',
  destinationAddress: 'Jr Callao 200',
  transferStartedAt: '2026-08-21T20:00:00.000Z',
  lines: [{ id: 1, description: 'Caja', quantity: 2, unitCode: 'NIU' }],
};

describe('buildUblDespatchXml', () => {
  it('GRE 31 well-formed con tipo 31 y sin contingencia', () => {
    const xml = buildUblDespatchXml(input);
    expect(() => assertValidDespatchXml(xml)).not.toThrow();
    expect(xml).toContain('<cbc:DespatchAdviceTypeCode>31</cbc:DespatchAdviceTypeCode>');
    expect(xml).toContain('20123456789');
  });

  it('rechaza RUC inválido y líneas vacías', () => {
    expect(() => buildUblDespatchXml({ ...input, issuerRuc: '123' })).toThrow('INVALID_ISSUER_RUC');
    expect(() => buildUblDespatchXml({ ...input, lines: [] })).toThrow('EMPTY_LINES');
    expect(() => buildUblDespatchXml({ ...input, ublVersion: '2.0' as never })).toThrow(
      'UNSUPPORTED_UBL_VERSION',
    );
  });

  it('assertValidDespatchXml rechaza XML incompleto o contingencia', () => {
    expect(() => assertValidDespatchXml('<DespatchAdvice/>')).toThrow('INVALID_UBL_VERSION');
    expect(() =>
      assertValidDespatchXml(
        '<DespatchAdvice><cbc:UBLVersionID>2.1</cbc:UBLVersionID></DespatchAdvice>',
      ),
    ).toThrow('MISSING_DESPATCH_TYPE');
    expect(() =>
      assertValidDespatchXml(
        '<DespatchAdvice><cbc:UBLVersionID>2.1</cbc:UBLVersionID>' +
          '<cbc:DespatchAdviceTypeCode>31</cbc:DespatchAdviceTypeCode></DespatchAdvice>',
      ),
    ).toThrow('MISSING_ISSUER_RUC');
    expect(() =>
      assertValidDespatchXml(
        '<DespatchAdvice><cbc:UBLVersionID>2.1</cbc:UBLVersionID>' +
          '<cbc:DespatchAdviceTypeCode>31</cbc:DespatchAdviceTypeCode>' +
          '<cbc:ID schemeID="6">20123456789</cbc:ID></DespatchAdvice>',
      ),
    ).toThrow('MISSING_LINES');
    const signed = buildUblDespatchXml(input).replace(
      '</DespatchAdvice>',
      ' contingencia</DespatchAdvice>',
    );
    expect(() => assertValidDespatchXml(signed)).toThrow('CONTINGENCIA_FORBIDDEN');
  });
});
