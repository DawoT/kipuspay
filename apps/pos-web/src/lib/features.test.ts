import { describe, expect, it, vi } from 'vitest';

describe('features flags default off', () => {
  it('checkout/print/vitrina/owner off sin env', async () => {
    vi.resetModules();
    vi.stubEnv('PUBLIC_FEATURE_POS_CHECKOUT', '');
    vi.stubEnv('PUBLIC_FEATURE_PRINT_TEMPLATES', '');
    vi.stubEnv('PUBLIC_FEATURE_VITRINA', '');
    vi.stubEnv('PUBLIC_FEATURE_OWNER_MODE', '');
    vi.stubEnv('PUBLIC_FEATURE_' + 'OWNER_PUSH', '');
    vi.stubEnv('PUBLIC_FEATURE_LEDGER_AR_AP', '');
    vi.stubEnv('PUBLIC_FEATURE_REPORTING_CATALOG', '');
    vi.stubEnv('PUBLIC_FEATURE_REPORTING_EXPORT', '');
    vi.stubEnv('PUBLIC_FEATURE_ORDERS_KDS', '');

    const mod = await import('./features.js');
    expect(mod.isPosCheckoutEnabled()).toBe(false);
    expect(mod.isPrintTemplatesEnabled()).toBe(false);
    expect(mod.isVitrinaEnabled()).toBe(false);
    expect(mod.isOwnerModeEnabled()).toBe(false);
    expect(mod.isOwnerPushEnabled()).toBe(false);
    expect(mod.isLedgerArApEnabled()).toBe(false);
    expect(mod.isReportingCatalogEnabled()).toBe(false);
    expect(mod.isReportingExportEnabled()).toBe(false);
    expect(mod.isOrdersKdsEnabled()).toBe(false);
    vi.unstubAllEnvs();
  });
});
