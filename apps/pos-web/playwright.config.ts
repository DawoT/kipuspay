import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  // Contención del preview bajo carga: acotado a 4 workers evita timeouts
  // intermitentes del webServer con la suite completa.
  workers: 4,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    // El Service Worker intercepta GETs same-origin y esquivaba los mocks
    // page.route de los fixtures (regresión s43/s44): bloqueado por defecto.
    // Los specs que prueban el SW (mobile-low-end) lo re-habilitan con test.use.
    serviceWorkers: 'block',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  webServer: {
    command: 'pnpm build && pnpm preview',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    env: {
      PUBLIC_ENABLE_DEV_HARNESS: '1',
      PUBLIC_FEATURE_ORDERS_CUSTOMER_ORDERS: '1',
      PUBLIC_FEATURE_POS_CHECKOUT: '1',
      PUBLIC_FEATURE_SALES_RECURRING: '1',
      PUBLIC_FEATURE_MOBILE_PUSH: '1',
      PUBLIC_FEATURE_CLIENT_MOBILE_POS: '1',
      PUBLIC_FEATURE_OWNER_MODE: '1',
      PUBLIC_FEATURE_ANALYTICS_FORECASTING: '1',
      PUBLIC_FEATURE_LPDP: '1',
      PUBLIC_FEATURE_ANALYTICS_AGENTIC_INSIGHTS: '1',
      PUBLIC_FEATURE_CATALOG_QUICK_ADD: '1',
      PUBLIC_FEATURE_SHIFT_HANDOFF: '1',
      PUBLIC_FEATURE_TEAM_INVITE: '1',
      PUBLIC_FEATURE_ONBOARDING_TOUR: '1',
      PUBLIC_FEATURE_SALES_DEBIT_NOTE: '1',
      PUBLIC_FEATURE_GRE: '1',
      PUBLIC_FEATURE_FISCAL_WITHHOLDINGS: '1',
      PUBLIC_FEATURE_SALE_TIP: '1',
      PUBLIC_FEATURE_CASH_DRAWER: '1',
      PUBLIC_FEATURE_CATALOG_SELLABLE: '1',
      PUBLIC_FEATURE_PRINT_TEMPLATES: '1',
      PUBLIC_FEATURE_HARDWARE_DIAGNOSTICS: '1',
      PUBLIC_FEATURE_SALES_COMMISSIONS: '1',
      PUBLIC_FEATURE_VITRINA: '1',
      PUBLIC_FEATURE_DATA_BACKUP: '1',
      PUBLIC_FEATURE_CASH_BLIND_Z: '1',
      PUBLIC_FEATURE_LEDGER_STORE_CREDIT: '1',
      PUBLIC_FEATURE_PURCHASING_THREE_WAY: '1',
      PUBLIC_FEATURE_LEDGER_AR_AP: '1',
      PUBLIC_FEATURE_PAYMENTS_QR_WALLETS: '1',
      PUBLIC_FEATURE_SALES_RETURNS: '1',
    },
  },
});
