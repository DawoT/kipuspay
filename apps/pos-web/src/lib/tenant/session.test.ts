import { describe, expect, it } from 'vitest';
import {
  defaultTenantSession,
  markTenantFirstSale,
  tenantFromSearchParams,
  ttfsMs,
} from './session.js';

describe('pos tenant session', () => {
  it('lee onboarding desde query', () => {
    const s = tenantFromSearchParams(
      new URLSearchParams({
        onboarding: '1',
        tenant: 't1',
        mode: 'FORMALIZING',
        vertical: 'farmacias',
        name: 'Botica',
      }),
    );
    expect(s?.formalizationMode).toBe('FORMALIZING');
    expect(s?.tradeName).toBe('Botica');
  });

  it('mide TTFS tras primera venta', () => {
    const base = {
      ...defaultTenantSession(),
      onboardingStartedAtIso: '2026-08-05T20:00:00.000Z',
    };
    expect(ttfsMs(base)).toBeNull();
    const sold = markTenantFirstSale(base, '2026-08-05T20:04:00.000Z');
    expect(ttfsMs(sold)).toBe(240_000);
  });
});
