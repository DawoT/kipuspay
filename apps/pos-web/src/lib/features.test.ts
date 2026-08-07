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
    vi.stubEnv('PUBLIC_FEATURE_STOCK_TRANSFERS', '');
    vi.stubEnv('PUBLIC_FEATURE_PURCHASING_PARTIAL_RECEIVE', '');
    vi.stubEnv('PUBLIC_FEATURE_' + 'PAYMENTS_QR_WALLETS', '');
    vi.stubEnv('PUBLIC_FEATURE_' + 'PAYMENTS_CARD_ACQUIRER', '');
    vi.stubEnv('PUBLIC_FEATURE_' + 'MESSAGING_WHATSAPP', '');
    vi.stubEnv('PUBLIC_FEATURE_' + 'LOYALTY_POINTS', '');
    vi.stubEnv('PUBLIC_FEATURE_' + 'CLIENT_OFFLOADING', '');
    vi.stubEnv('PUBLIC_FEATURE_' + 'HARDWARE_PRINT_FALLBACK', '');

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
    expect(mod.isStockTransfersEnabled()).toBe(false);
    expect(mod.isPartialReceiveEnabled()).toBe(false);
    expect(mod.isPaymentsQrWalletsEnabled()).toBe(false);
    expect(mod.isPaymentsCardAcquirerEnabled()).toBe(false);
    expect(mod.isMessagingWhatsAppEnabled()).toBe(false);
    expect(mod.isLoyaltyPointsEnabled()).toBe(false);
    expect(mod.isClientOffloadingEnabled()).toBe(false);
    expect(mod.isHardwarePrintFallbackEnabled()).toBe(false);
    vi.unstubAllEnvs();
  });
});
