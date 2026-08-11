import { describe, expect, it } from 'vitest';
import {
  assertConsentPurpose,
  CONSENT_PURPOSES,
  isConsentActive,
  isConsentPurpose,
  planConsentChange,
  UNKNOWN_CONSENT_PURPOSE,
  type ConsentRecord,
} from './consent.js';

describe('consent LPDP-01', () => {
  it('cataloga propósitos válidos', () => {
    expect(CONSENT_PURPOSES).toContain('messaging_whatsapp');
    expect(CONSENT_PURPOSES).toContain('marketing');
    expect(isConsentPurpose('messaging_whatsapp')).toBe(true);
    expect(isConsentPurpose('telemarketing')).toBe(false);
    expect(() => assertConsentPurpose('messaging_whatsapp')).not.toThrow();
    expect(() => assertConsentPurpose('spam')).toThrow(UNKNOWN_CONSENT_PURPOSE);
  });

  it('GRANT sella granted_at y es idempotente', () => {
    expect(planConsentChange('marketing', true, '2026-08-10T00:00:00.000Z')).toEqual({
      kind: 'GRANT',
      grantedAtIso: '2026-08-10T00:00:00.000Z',
    });
    const active: ConsentRecord = {
      purpose: 'marketing',
      granted: true,
      grantedAtIso: '2026-08-01T00:00:00.000Z',
      revokedAtIso: null,
    };
    expect(planConsentChange('marketing', true, '2026-08-10T00:00:00.000Z', active)).toEqual({
      kind: 'NOOP',
    });
  });

  it('REVOKE sella revoked_at y re-grant posterior vuelve a sellar', () => {
    const active: ConsentRecord = {
      purpose: 'marketing',
      granted: true,
      grantedAtIso: '2026-08-01T00:00:00.000Z',
      revokedAtIso: null,
    };
    expect(planConsentChange('marketing', false, '2026-08-10T00:00:00.000Z', active)).toEqual({
      kind: 'REVOKE',
      revokedAtIso: '2026-08-10T00:00:00.000Z',
    });
    const revoked: ConsentRecord = {
      purpose: 'marketing',
      granted: false,
      grantedAtIso: '2026-08-01T00:00:00.000Z',
      revokedAtIso: '2026-08-10T00:00:00.000Z',
    };
    expect(planConsentChange('marketing', false, '2026-08-11T00:00:00.000Z', revoked)).toEqual({
      kind: 'NOOP',
    });
    expect(planConsentChange('marketing', true, '2026-08-12T00:00:00.000Z', revoked)).toEqual({
      kind: 'GRANT',
      grantedAtIso: '2026-08-12T00:00:00.000Z',
    });
  });

  it('isConsentActive exige granted y sin revocación posterior', () => {
    const active: ConsentRecord = {
      purpose: 'marketing',
      granted: true,
      grantedAtIso: '2026-08-01T00:00:00.000Z',
      revokedAtIso: null,
    };
    expect(isConsentActive(active, '2026-08-10T00:00:00.000Z')).toBe(true);
    expect(
      isConsentActive(
        { ...active, granted: false },
        '2026-08-10T00:00:00.000Z',
      ),
    ).toBe(false);
    expect(
      isConsentActive(
        { ...active, revokedAtIso: '2026-08-09T00:00:00.000Z' },
        '2026-08-10T00:00:00.000Z',
      ),
    ).toBe(false);
    expect(
      isConsentActive(
        { ...active, revokedAtIso: '2026-08-11T00:00:00.000Z' },
        '2026-08-10T00:00:00.000Z',
      ),
    ).toBe(true);
  });
});
