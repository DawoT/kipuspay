import { describe, expect, it } from 'vitest';
import {
  advanceFormalization,
  assertDocumentTypeEnabled,
  assertFormalizationAdvance,
  enabledDocumentTypesFor,
  type FormalizationMode,
} from './formalization-advance.js';

describe('formalization-advance', () => {
  it('permite INTERNAL_CONTROL → FORMALIZING → ELECTRONIC_ISSUER', () => {
    expect(advanceFormalization('INTERNAL_CONTROL', 'FORMALIZING')).toBe('FORMALIZING');
    expect(advanceFormalization('FORMALIZING', 'ELECTRONIC_ISSUER')).toBe('ELECTRONIC_ISSUER');
  });

  it('rechaza saltos y retrocesos (sin convertir NV historicas)', () => {
    expect(() => assertFormalizationAdvance('INTERNAL_CONTROL', 'ELECTRONIC_ISSUER')).toThrow(
      /confirmar/i,
    );
    expect(() => assertFormalizationAdvance('ELECTRONIC_ISSUER', 'INTERNAL_CONTROL')).toThrow(
      /retroceder/i,
    );
    expect(() => assertFormalizationAdvance('FORMALIZING', 'INTERNAL_CONTROL')).toThrow(
      /retroceder/i,
    );
  });

  it('idempotente si ya esta en el destino', () => {
    const mode: FormalizationMode = 'FORMALIZING';
    expect(advanceFormalization(mode, mode)).toBe(mode);
  });

  it('documentos habilitados por etapa (NV vs CPE)', () => {
    expect(enabledDocumentTypesFor('INTERNAL_CONTROL')).toEqual(['NV', 'NV_RETURN']);
    expect(enabledDocumentTypesFor('FORMALIZING')).toContain('03');
    expect(enabledDocumentTypesFor('ELECTRONIC_ISSUER')).toContain('01');
  });

  it('habilita solo lo declarado (fail-closed)', () => {
    expect(() => assertDocumentTypeEnabled('01', '["NV","03"]')).toThrow(
      'DOCUMENT_TYPE_NOT_ENABLED',
    );
    expect(() => assertDocumentTypeEnabled('NV', '["NV","03"]')).not.toThrow();
    expect(() => assertDocumentTypeEnabled('03', '["NV","03"]')).not.toThrow();
  });

  it('columna vacia/invalida nunca habilita por omision', () => {
    expect(() => assertDocumentTypeEnabled('NV', null)).toThrow('DOCUMENT_TYPE_NOT_ENABLED');
    expect(() => assertDocumentTypeEnabled('NV', '')).toThrow('DOCUMENT_TYPE_NOT_ENABLED');
    expect(() => assertDocumentTypeEnabled('NV', 'no-json')).toThrow('DOCUMENT_TYPE_NOT_ENABLED');
    expect(() => assertDocumentTypeEnabled('NV', '[]')).toThrow('DOCUMENT_TYPE_NOT_ENABLED');
    expect(() => assertDocumentTypeEnabled('NV', '{"a":1}')).toThrow('DOCUMENT_TYPE_NOT_ENABLED');
  });
});
