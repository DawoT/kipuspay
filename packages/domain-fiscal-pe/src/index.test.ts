import { describe, expect, it } from 'vitest';
import {
  DOC_TOTAL_THRESHOLD_FOR_ID,
  NRUS_UNITARY_OMISSION_CENTS,
  NV_LEGAL_LEGEND,
  assertEmissionAllowed,
  cdrIsAccepted,
  classifyUnitaryXmlTarget,
  computeMustSubmitByIso,
  createMockRcCdrPort,
  defaultSunatStatus,
  formalizeDescriptor,
  isSunatApplicable,
  resolveBranchSeries,
  type DocumentTypeCode,
  type EmissionContext,
} from './index.js';

describe('constantes legales ADR-FISCAL-001', () => {
  it('umbrales canónicos en cents', () => {
    expect(DOC_TOTAL_THRESHOLD_FOR_ID).toBe(70_000);
    expect(NRUS_UNITARY_OMISSION_CENTS).toBe(500);
  });
});

describe('cdrIsAccepted', () => {
  it('acepta solo CDR código 0 y flag accepted', () => {
    expect(cdrIsAccepted({ cdrCode: '0', cdrDescription: 'Aceptada', accepted: true })).toBe(true);
    expect(cdrIsAccepted({ cdrCode: '2335', cdrDescription: 'Rechazo', accepted: false })).toBe(
      false,
    );
    expect(cdrIsAccepted({ cdrCode: '0', cdrDescription: 'raro', accepted: false })).toBe(false);
  });
});

describe('formalizeDescriptor', () => {
  it('formatea serie-correlativo con relleno a 8 dígitos', () => {
    expect(formalizeDescriptor({ issuerRuc: '20123456789', series: 'F001', correlative: 42 })).toBe(
      'F001-00000042',
    );
  });
});

describe('NV nunca a SUNAT', () => {
  it('isSunatApplicable false para NV / NV_RETURN', () => {
    expect(isSunatApplicable('NV')).toBe(false);
    expect(isSunatApplicable('NV_RETURN')).toBe(false);
    expect(isSunatApplicable('01')).toBe(true);
    expect(defaultSunatStatus('NV')).toBe('NOT_APPLICABLE');
    expect(defaultSunatStatus('01')).toBe('PENDING');
  });

  it('leyenda legal presente', () => {
    expect(NV_LEGAL_LEGEND).toMatch(/No es comprobante/);
    expect(NV_LEGAL_LEGEND.toLowerCase()).not.toContain('contingencia');
  });
});

describe('assertEmissionAllowed', () => {
  const base: EmissionContext = {
    formalizationMode: 'ELECTRONIC_ISSUER',
    taxRegime: 'RG',
    documentType: '01',
    totalAmountCents: 118_000,
    clientDocumentType: '6',
    clientDocumentNumber: '20123456789',
    clientName: 'ACME SAC',
  };

  it('bloquea CPE en INTERNAL_CONTROL', () => {
    expect(() =>
      assertEmissionAllowed({ ...base, formalizationMode: 'INTERNAL_CONTROL', documentType: '03' }),
    ).toThrow('CPE_BLOCKED_INTERNAL_CONTROL');
  });

  it('permite NV en INTERNAL_CONTROL', () => {
    expect(() =>
      assertEmissionAllowed({
        ...base,
        formalizationMode: 'INTERNAL_CONTROL',
        documentType: 'NV',
      }),
    ).not.toThrow();
  });

  it('factura exige RUC (tipo 6 + 11 dígitos)', () => {
    expect(() =>
      assertEmissionAllowed({
        ...base,
        clientDocumentType: '1',
        clientDocumentNumber: '12345678',
      }),
    ).toThrow('FACTURA_REQUIRES_RUC');
  });

  it('boleta ≥700 exige doc + nombre', () => {
    expect(() =>
      assertEmissionAllowed({
        ...base,
        documentType: '03',
        totalAmountCents: DOC_TOTAL_THRESHOLD_FOR_ID,
        clientDocumentType: '',
        clientDocumentNumber: '',
        clientName: '',
      }),
    ).toThrow('BOLETA_ID_REQUIRED');
  });

  it('NRUS no admite factura', () => {
    expect(() => assertEmissionAllowed({ ...base, taxRegime: 'NRUS' })).toThrow(
      'DOCUMENT_NOT_ALLOWED_FOR_REGIME',
    );
  });

  it('UNKNOWN formal no admite CPE', () => {
    expect(() => assertEmissionAllowed({ ...base, taxRegime: 'UNKNOWN' })).toThrow(
      'DOCUMENT_NOT_ALLOWED_FOR_REGIME',
    );
  });

  it('boleta ≥700 con doc+nombre OK; factura RUC OK', () => {
    expect(() =>
      assertEmissionAllowed({
        ...base,
        documentType: '03',
        totalAmountCents: DOC_TOTAL_THRESHOLD_FOR_ID,
        clientDocumentType: '1',
        clientDocumentNumber: '12345678',
        clientName: 'Juan Perez',
      }),
    ).not.toThrow();
    expect(() => assertEmissionAllowed(base)).not.toThrow();
  });

  it('NV opcional en ELECTRONIC_ISSUER', () => {
    expect(() => assertEmissionAllowed({ ...base, documentType: 'NV' })).not.toThrow();
  });
});

describe('isCpeDocument / computeMustSubmitByIso boleta', () => {
  it('clasifica CPE y boleta +7d', async () => {
    const { isCpeDocument, computeMustSubmitByIso: must } = await import('./index.js');
    expect(isCpeDocument('01')).toBe(true);
    expect(isCpeDocument('NV')).toBe(false);
    const issued = Date.parse('2026-08-04T15:00:00.000Z');
    expect(must('03', issued)).toBe(new Date(issued + 7 * 24 * 3600 * 1000).toISOString());
    expect(must('12', issued)).toBe(new Date(issued + 7 * 24 * 3600 * 1000).toISOString());
    expect(must('07', issued)).toBeNull();
  });
});

describe('resolveBranchSeries', () => {
  it('resuelve serie activa o SERIES_NOT_FOUND', () => {
    const series = [
      {
        id: 's1',
        series: 'F001',
        documentTypeCode: '01',
        currentNumber: 10,
        isActive: true,
      },
    ];
    expect(
      resolveBranchSeries({
        documentType: '01',
        branchSeries: series,
        requestedSeries: 'F001',
      }),
    ).toEqual({ seriesId: 's1', series: 'F001', currentNumber: 10 });

    expect(() =>
      resolveBranchSeries({
        documentType: '03',
        branchSeries: series,
        requestedSeries: 'B001',
      }),
    ).toThrow('SERIES_NOT_FOUND');

    expect(
      resolveBranchSeries({
        documentType: 'NV_RETURN',
        branchSeries: [
          {
            id: 'nv1',
            series: 'NV01',
            documentTypeCode: 'NV_RETURN',
            currentNumber: 2,
            isActive: true,
          },
        ],
        requestedSeries: 'NV01',
      }),
    ).toEqual({ seriesId: 'nv1', series: 'NV01', currentNumber: 2 });
  });
});

describe('computeMustSubmitByIso', () => {
  it('factura +3d; NV null', () => {
    const issued = Date.parse('2026-08-04T15:00:00.000Z');
    expect(computeMustSubmitByIso('NV', issued)).toBeNull();
    const factura = computeMustSubmitByIso('01', issued);
    expect(factura).toBe(new Date(issued + 3 * 24 * 3600 * 1000).toISOString());
  });
});

describe('classifyUnitaryXmlTarget', () => {
  it('01 factura → UNIT_XML sin depender de referencia', () => {
    expect(classifyUnitaryXmlTarget('01')).toBe('UNIT_XML');
    expect(classifyUnitaryXmlTarget('01', undefined)).toBe('UNIT_XML');
  });

  it('07/08 de factura → UNIT_XML; 07/08 de boleta → RC', () => {
    expect(classifyUnitaryXmlTarget('07', '01')).toBe('UNIT_XML');
    expect(classifyUnitaryXmlTarget('08', '01')).toBe('UNIT_XML');
    expect(classifyUnitaryXmlTarget('07', '03')).toBe('RC');
    expect(classifyUnitaryXmlTarget('08', '03')).toBe('RC');
  });

  it('03 boleta y 12 → RC (nunca unit XML)', () => {
    expect(classifyUnitaryXmlTarget('03')).toBe('RC');
    expect(classifyUnitaryXmlTarget('12')).toBe('RC');
  });

  it('NV / NV_RETURN → NONE', () => {
    expect(classifyUnitaryXmlTarget('NV')).toBe('NONE');
    expect(classifyUnitaryXmlTarget('NV_RETURN')).toBe('NONE');
  });

  it('07/08 sin referencia resoluble → NONE (fail-closed, no asume canal)', () => {
    expect(classifyUnitaryXmlTarget('07', undefined)).toBe('NONE');
    expect(classifyUnitaryXmlTarget('08', undefined)).toBe('NONE');
  });

  it('documentType desconocido → NONE (fail-closed)', () => {
    expect(classifyUnitaryXmlTarget('ZZ' as DocumentTypeCode)).toBe('NONE');
  });
});

describe('createMockRcCdrPort (solo staging/tests)', () => {
  it('acepta XML no vacío y rechaza XML vacío', async () => {
    const port = createMockRcCdrPort();
    const ok = await port.submit({
      tenantId: 't',
      summaryId: 'RC-1',
      xml: '<summary/>',
    });
    expect(ok.accepted).toBe(true);
    expect(ok.cdrCode).toBe('0');

    const empty = await port.submit({ tenantId: 't', summaryId: 'RC-2', xml: '   ' });
    expect(empty.accepted).toBe(false);
    expect(empty.cdrCode).toBe('99');
  });
});
