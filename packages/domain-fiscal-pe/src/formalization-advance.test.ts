import { describe, expect, it } from 'vitest';
import {
  advanceFormalization,
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
});
