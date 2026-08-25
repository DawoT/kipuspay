import { describe, expect, it } from 'vitest';
import {
  PUSH_EVENT_TYPES,
  buildLockscreenPayload,
  evaluatePushPrivacy,
  summarizeDisplayedSlo,
} from './mobile-push.js';

describe('Sprint 45 mobile push domain contract (RED)', () => {
  it('keeps the operational registry closed and billing reminders separate', () => {
    expect(PUSH_EVENT_TYPES).toEqual([
      'CASH_CLOSE',
      'CASH_DISCREPANCY',
      'INVENTORY_STOCKOUT',
      'INSTALLMENT_OVERDUE',
      'ACCOUNTS_RECEIVABLE_OVERDUE',
      'CUSTOMER_ORDER_EXPIRY',
      'RECURRING_GRACE',
      'BILLING_REMINDER',
      'CERT_EXPIRY_WARNING',
    ]);
    expect(PUSH_EVENT_TYPES.indexOf('BILLING_REMINDER')).toBeGreaterThan(
      PUSH_EVENT_TYPES.indexOf('RECURRING_GRACE'),
    );
  });

  it('SEC-03: CERT_EXPIRY_WARNING tiene copy owner y deep link registrado, sin montos', () => {
    // El productor (cert-expiry-scheduled) jamás pasa amount_cents.
    const payload = buildLockscreenPayload({
      eventType: 'CERT_EXPIRY_WARNING',
      privacyMode: 'AMOUNTS',
      deepLinkKind: 'cert_expiry',
      deepLinkEntityId: 'opaque-tenant-id',
    });
    expect(payload.title).toMatch(/certificado/i);
    expect(payload.deepLink).toEqual({ kind: 'cert_expiry', entityId: 'opaque-tenant-id' });
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('amount_cents');
  });

  it('defaults to REDACTED and requires tenant policy plus Owner opt-in for amounts', () => {
    expect(
      evaluatePushPrivacy({
        requestedMode: 'AMOUNTS',
        tenantAmountsPolicyEnabled: true,
        ownerAmountsOptIn: false,
        role: 'owner',
      }),
    ).toBe('REDACTED');
    expect(
      evaluatePushPrivacy({
        requestedMode: 'AMOUNTS',
        tenantAmountsPolicyEnabled: true,
        ownerAmountsOptIn: true,
        role: 'owner',
      }),
    ).toBe('AMOUNTS');
  });

  it('never serializes customer PII, fiscal content, endpoint, token, or secrets', () => {
    const payload = buildLockscreenPayload({
      eventType: 'ACCOUNTS_RECEIVABLE_OVERDUE',
      privacyMode: 'AMOUNTS',
      amount_cents: 12_345,
      deepLinkKind: 'accounts_receivable',
      deepLinkEntityId: 'opaque-ar-id',
      forbiddenSource: {
        customerName: 'Persona',
        documentNumber: '00000000',
        phone: '+51000000000',
        address: 'private',
        fiscalDocument: 'F001-1',
        endpoint: 'https://push.invalid/secret',
        token: 'provider-token',
      },
    });
    const serialized = JSON.stringify(payload);
    for (const forbidden of [
      'Persona',
      '00000000',
      '+51000000000',
      'private',
      'F001-1',
      'push.invalid',
      'provider-token',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(payload).toMatchObject({
      amount_cents: 12_345,
      deepLink: { kind: 'accounts_receivable', entityId: 'opaque-ar-id' },
    });
    expect(payload.deepLink).not.toHaveProperty('url');
  });

  it('measures event-created to DISPLAYED and labels offline/doze exclusions', () => {
    expect(
      summarizeDisplayedSlo([
        { createdAtMs: 0, acceptedAtMs: 50, displayedAtMs: 900, context: 'NORMAL' },
        { createdAtMs: 0, acceptedAtMs: 40, displayedAtMs: null, context: 'DOZE' },
        { createdAtMs: 0, acceptedAtMs: 30, displayedAtMs: null, context: 'OFFLINE' },
      ]),
    ).toEqual({
      normalNetworkSamples: 1,
      displayedRate: 1,
      p95Ms: 900,
      excluded: { DOZE: 1, OFFLINE: 1 },
      passes: true,
    });
  });
});
