import { describe, expect, it } from 'vitest';
import { decideAuthGate, type AuthGateInput, type AuthTenantSnapshot } from './auth-decide.js';
import { isCheckoutCriticalRoute, isPremiumFeatureRoute } from './plan-routes.js';

const activeTenant = (over: Partial<AuthTenantSnapshot> = {}): AuthTenantSnapshot => ({
  id: 't1',
  status: 'active',
  subscriptionStatus: 'active',
  trialEndsAt: null,
  pastGracePeriod: false,
  ...over,
});

const baseOk = (over: Partial<AuthGateInput> = {}): AuthGateInput => ({
  hasBearerJwt: true,
  jwtValid: true,
  tenantHintMismatch: false,
  tenant: activeTenant(),
  tenantLookupFailed: false,
  revocation: { available: true, revoked: false },
  path: '/api/pos/checkout',
  nowMs: Date.parse('2026-08-04T12:00:00Z'),
  ...over,
});

describe('plan-routes', () => {
  it('marca cobro/caja/emisión como críticas y no premium', () => {
    for (const path of [
      '/api/pos/checkout',
      '/api/sales/offline',
      '/api/sales/returns',
      '/api/sales/layaways',
      '/api/sales/quotes',
      '/api/cash/open',
      '/api/fiscal/emit',
      '/api/documents/emit',
      '/api/reports/arqueo',
    ]) {
      expect(isCheckoutCriticalRoute(path)).toBe(true);
      expect(isPremiumFeatureRoute(path)).toBe(false);
    }
  });

  it('marca Modo Dueño / reportes avanzados / insights como premium', () => {
    expect(isPremiumFeatureRoute('/api/owner/dashboard')).toBe(true);
    expect(isPremiumFeatureRoute('/api/reports/advanced/top-products')).toBe(true);
    expect(isPremiumFeatureRoute('/api/insights/briefing')).toBe(true);
    expect(isPremiumFeatureRoute('/api/integrations/accounting/export')).toBe(true);
    expect(isPremiumFeatureRoute('/api/integrations/api-keys')).toBe(true);
    expect(isPremiumFeatureRoute('/api/integrations/catalog-import')).toBe(false);
    expect(isPremiumFeatureRoute('/api/reports/day-summary')).toBe(false);
  });

  it('billing cron no es premium ni checkout-critical (Arranque puede meter)', () => {
    expect(isPremiumFeatureRoute('/api/billing/cron/meter-overage')).toBe(false);
    expect(isCheckoutCriticalRoute('/api/billing/cron/meter-overage')).toBe(false);
  });

  it('cobro/emisión siguen checkout-critical (nunca 402 por cupo/plan)', () => {
    for (const path of [
      '/api/pos/offline-sale',
      '/api/sales/emit',
      '/api/cash/open',
      '/api/fiscal/emit',
    ]) {
      expect(isCheckoutCriticalRoute(path)).toBe(true);
      expect(isPremiumFeatureRoute(path)).toBe(false);
    }
  });
});

describe('decideAuthGate (autorización negativa)', () => {
  it('401 sin Bearer JWT válido', () => {
    const r = decideAuthGate(baseOk({ hasBearerJwt: false, jwtValid: false }));
    expect(r).toEqual({
      ok: false,
      status: 401,
      code: 'UNAUTHENTICATED',
      error: 'Missing or invalid Bearer JWT',
    });
  });

  it('503 fail-closed si la verificación de revocación no está disponible', () => {
    const r = decideAuthGate(baseOk({ revocation: { available: false } }));
    expect(r).toMatchObject({ ok: false, status: 503, code: 'REVOCATION_CHECK_UNAVAILABLE' });
  });

  it('403 si el tenant está revocado', () => {
    const r = decideAuthGate(baseOk({ revocation: { available: true, revoked: true } }));
    expect(r).toMatchObject({ ok: false, status: 403, code: 'TENANT_REVOKED' });
  });

  it('503 si el control plane de tenant falla', () => {
    const r = decideAuthGate(baseOk({ tenantLookupFailed: true, tenant: null }));
    expect(r).toMatchObject({ ok: false, status: 503, code: 'AUTH_CONTROL_UNAVAILABLE' });
  });

  it('nunca 402 en cobro aunque trial vencido o past_due post-gracia', () => {
    const trialExpired = decideAuthGate(
      baseOk({
        path: '/api/pos/checkout',
        tenant: activeTenant({
          subscriptionStatus: 'trial',
          trialEndsAt: '2026-01-01T00:00:00Z',
        }),
      }),
    );
    expect(trialExpired).toEqual({ ok: true });

    const pastDueSale = decideAuthGate(
      baseOk({
        path: '/api/cash/open',
        tenant: activeTenant({
          subscriptionStatus: 'past_due',
          pastGracePeriod: true,
        }),
      }),
    );
    expect(pastDueSale).toEqual({ ok: true });

    const emit = decideAuthGate(
      baseOk({
        path: '/api/fiscal/emit',
        tenant: activeTenant({
          subscriptionStatus: 'canceled',
          pastGracePeriod: true,
        }),
      }),
    );
    expect(emit).toEqual({ ok: true });
  });

  it('402 en feature premium con trial vencido', () => {
    const r = decideAuthGate(
      baseOk({
        path: '/api/owner/dashboard',
        tenant: activeTenant({
          subscriptionStatus: 'trial',
          trialEndsAt: '2026-01-01T00:00:00Z',
        }),
      }),
    );
    expect(r).toMatchObject({ ok: false, status: 402, code: 'TRIAL_EXPIRED' });
  });

  it('402 en feature premium con past_due post-gracia', () => {
    const r = decideAuthGate(
      baseOk({
        path: '/api/insights/briefing',
        tenant: activeTenant({
          subscriptionStatus: 'past_due',
          pastGracePeriod: true,
        }),
      }),
    );
    expect(r).toMatchObject({ ok: false, status: 402, code: 'SUBSCRIPTION_INACTIVE' });
  });

  it('403 por hint de tenant mismatch y por tenant inactivo', () => {
    expect(decideAuthGate(baseOk({ tenantHintMismatch: true }))).toMatchObject({
      ok: false,
      status: 403,
      code: 'TENANT_HINT_MISMATCH',
    });
    expect(decideAuthGate(baseOk({ tenant: activeTenant({ status: 'suspended' }) }))).toMatchObject(
      { ok: false, status: 403, code: 'TENANT_INACTIVE' },
    );
  });

  it('404 si el tenant no existe', () => {
    expect(decideAuthGate(baseOk({ tenant: null }))).toMatchObject({
      ok: false,
      status: 404,
      code: 'TENANT_NOT_FOUND',
    });
  });
});
