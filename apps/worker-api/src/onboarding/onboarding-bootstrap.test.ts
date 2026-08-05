import { describe, expect, it } from 'vitest';

import type { TenantBootstrapInput, TenantBootstrapResult } from './onboarding-bootstrap.js';
import { bootstrapTenant, changeFormalizationStage } from './onboarding-bootstrap.js';

describe('onboarding-bootstrap', () => {
  it('crea tenant Arranque en INTERNAL_CONTROL por defecto', () => {
    const input: TenantBootstrapInput = {
      tradeName: 'Bodega Don Pepe',
      verticalType: 'retail',
      formalizationMode: 'INTERNAL_CONTROL',
      ruc: null,
    };
    const result: TenantBootstrapResult = bootstrapTenant(input, 'tenant-demo-1');
    expect(result.tenantId).toBe('tenant-demo-1');
    expect(result.planId).toBe('arranque');
    expect(result.formalizationMode).toBe('INTERNAL_CONTROL');
    expect(result.enabledDocumentTypes).toEqual(['NV', 'NV_RETURN']);
    expect(result.pseMode).toBe('KIPUSPAY_PSE');
  });

  it('avanza etapa con confirmacion y sin convertir historial', () => {
    const next = changeFormalizationStage('INTERNAL_CONTROL', 'FORMALIZING', {
      confirmed: true,
    });
    expect(next.formalizationMode).toBe('FORMALIZING');
    expect(next.enabledDocumentTypes).toContain('03');
    expect(next.historicalNvConverted).toBe(false);
  });

  it('exige confirmacion para cambiar etapa', () => {
    expect(() =>
      changeFormalizationStage('INTERNAL_CONTROL', 'FORMALIZING', { confirmed: false }),
    ).toThrow(/confirm/i);
  });
});
