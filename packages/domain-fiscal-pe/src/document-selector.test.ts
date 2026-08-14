import { describe, expect, it } from 'vitest';
import { formalizationBannerMessage, suggestDocumentType } from './document-selector.js';
import { assertEmissionAllowed, DOC_TOTAL_THRESHOLD_FOR_ID } from './index.js';

describe('document-selector', () => {
  it('INTERNAL_CONTROL → NV; RUC → Factura; consumidor → Boleta', () => {
    expect(
      suggestDocumentType({
        formalizationMode: 'INTERNAL_CONTROL',
        taxRegime: 'RG',
        clientDocumentType: '6',
        clientDocumentNumber: '20123456789',
      }),
    ).toBe('NV');
    expect(
      suggestDocumentType({
        formalizationMode: 'ELECTRONIC_ISSUER',
        taxRegime: 'RG',
        clientDocumentType: '6',
        clientDocumentNumber: '20123456789',
      }),
    ).toBe('01');
    expect(
      suggestDocumentType({
        formalizationMode: 'ELECTRONIC_ISSUER',
        taxRegime: 'RG',
        clientDocumentType: '1',
        clientDocumentNumber: '12345678',
      }),
    ).toBe('03');
  });

  it('banner por modo', () => {
    // S11-E9 (GTM §3.3.1): banner persistente con llamado a formalizar.
    expect(formalizationBannerMessage('INTERNAL_CONTROL')).toMatch(/notas de venta/i);
    expect(formalizationBannerMessage('INTERNAL_CONTROL')).toMatch(/Activa facturación/i);
    expect(formalizationBannerMessage('FORMALIZING')).toMatch(/Formalizando/i);
    expect(formalizationBannerMessage('ELECTRONIC_ISSUER')).toMatch(/electrónico/i);
  });

  it('bloquea boleta ≥700 sin DNI vía assertEmissionAllowed', () => {
    expect(() =>
      assertEmissionAllowed({
        formalizationMode: 'ELECTRONIC_ISSUER',
        taxRegime: 'RG',
        documentType: '03',
        totalAmountCents: DOC_TOTAL_THRESHOLD_FOR_ID,
        clientDocumentType: '',
        clientDocumentNumber: '',
        clientName: '',
      }),
    ).toThrow(/BOLETA_ID_REQUIRED/);
  });
});
