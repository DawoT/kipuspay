import { describe, expect, it } from 'vitest';
import {
  buildLockscreenPayload,
  evaluatePushPrivacy,
  summarizeDisplayedSlo,
  validatePushTarget,
} from './mobile-push.js';

describe('mobile push privacy boundaries', () => {
  it('redacts amounts unless every owner policy condition is true', () => {
    expect(
      evaluatePushPrivacy({
        requestedMode: 'REDACTED',
        tenantAmountsPolicyEnabled: true,
        ownerAmountsOptIn: true,
        role: 'owner',
      }),
    ).toBe('REDACTED');
    expect(
      evaluatePushPrivacy({
        requestedMode: 'AMOUNTS',
        tenantAmountsPolicyEnabled: true,
        ownerAmountsOptIn: true,
        role: 'admin',
      }),
    ).toBe('REDACTED');
    expect(
      buildLockscreenPayload({
        eventType: 'BILLING_REMINDER',
        privacyMode: 'REDACTED',
        amount_cents: 500,
        deepLinkKind: 'billing',
        deepLinkEntityId: 'billing-a',
      }),
    ).not.toHaveProperty('amount_cents');
  });

  it('rejects unallowlisted links, empty entities, and invalid amounts', () => {
    expect(() =>
      buildLockscreenPayload({
        eventType: 'CASH_CLOSE',
        privacyMode: 'REDACTED',
        deepLinkKind: 'external_url',
        deepLinkEntityId: 'opaque',
      }),
    ).toThrow('PUSH_DEEP_LINK_NOT_ALLOWED');
    expect(() =>
      buildLockscreenPayload({
        eventType: 'CASH_CLOSE',
        privacyMode: 'REDACTED',
        deepLinkKind: 'cash_close',
        deepLinkEntityId: ' ',
      }),
    ).toThrow('PUSH_DEEP_LINK_ENTITY_REQUIRED');
    expect(() =>
      buildLockscreenPayload({
        eventType: 'CASH_CLOSE',
        privacyMode: 'AMOUNTS',
        amount_cents: -1,
        deepLinkKind: 'cash_close',
        deepLinkEntityId: 'close-a',
      }),
    ).toThrow('PUSH_AMOUNT_INVALID');
  });

  it('fails the SLO with no normal samples or missing displays', () => {
    expect(summarizeDisplayedSlo([])).toMatchObject({
      normalNetworkSamples: 0,
      displayedRate: 0,
      p95Ms: null,
      passes: false,
    });
    expect(
      summarizeDisplayedSlo([
        { createdAtMs: 0, acceptedAtMs: null, displayedAtMs: null, context: 'DOZE' },
      ]),
    ).toMatchObject({ normalNetworkSamples: 0, displayedRate: 0, p95Ms: null, passes: false });
    expect(
      summarizeDisplayedSlo([
        { createdAtMs: 0, acceptedAtMs: 10, displayedAtMs: null, context: 'NORMAL' },
      ]),
    ).toMatchObject({ normalNetworkSamples: 1, displayedRate: 0, p95Ms: null, passes: false });
  });

  it('validates push target scopes and enables amounts for owner opt-in', () => {
    expect(validatePushTarget({ scope: 'OWNER_ALERTS' })).toEqual({ scope: 'OWNER_ALERTS' });
    expect(
      validatePushTarget({ scope: 'OPERATIONAL_MOBILE', userId: 'u1', branchId: 'b1' }),
    ).toEqual({ scope: 'OPERATIONAL_MOBILE', userId: 'u1', branchId: 'b1' });
    expect(() =>
      validatePushTarget({ scope: 'OPERATIONAL_MOBILE', userId: '', branchId: 'b1' }),
    ).toThrow('PUSH_OPERATIONAL_TARGET_REQUIRED');

    expect(
      evaluatePushPrivacy({
        requestedMode: 'AMOUNTS',
        tenantAmountsPolicyEnabled: true,
        ownerAmountsOptIn: true,
        role: 'owner',
      }),
    ).toBe('AMOUNTS');
  });
});
