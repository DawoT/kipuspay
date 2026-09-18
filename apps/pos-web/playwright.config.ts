import { defineConfig } from '@playwright/test';

// The suite launcher chooses a free port once and passes it to every Playwright
// process. Direct CLI usage keeps a stable fallback for debugging.
const e2ePort = process.env.KIPUSPAY_E2E_PORT ?? '41731';
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  // Contención del preview bajo carga: acotado a 4 workers evita timeouts
  // intermitentes del webServer con la suite completa.
  workers: 4,
  reporter: [['list']],
  use: {
    baseURL: e2eBaseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // El Service Worker intercepta GETs same-origin y esquivaba los mocks
    // page.route de los fixtures (regresión s43/s44): bloqueado por defecto.
    // Los specs que prueban el SW (mobile-low-end) lo re-habilitan con test.use.
    serviceWorkers: 'block',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  webServer: {
    // El tsconfig.json del app extiende estáticamente ./.svelte-kit/tsconfig.json;
    // con KIPUSPAY_E2E_OUT_DIR el sync del build escribe en otra carpeta y un
    // clone fresco (CI) no tendría el extends target. Este sync previo lo genera.
    command: `KIPUSPAY_E2E_OUT_DIR=.svelte-kit ./node_modules/.bin/svelte-kit sync && ./node_modules/.bin/vite build && ./node_modules/.bin/vite preview --host 127.0.0.1 --port ${e2ePort} --strictPort`,
    url: e2eBaseUrl,
    timeout: 120_000,
    // Reusar un preview ajeno oculta la revisión bajo prueba. Solo se permite
    // en una depuración local que lo pida explícitamente.
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === '1',
    env: {
      PUBLIC_ENABLE_DEV_HARNESS: '1',
      // UI titular bajo prueba solo en preview local; staging sigue con flag 0.
      PUBLIC_FEATURE_LPDP: '1',
      // El wrangler.jsonc del app apunta a staging para deploy; los E2E
      // locales no deben emitir requests a ningún Worker remoto.
      PUBLIC_API_BASE: '',
      KIPUSPAY_E2E_OUT_DIR: process.env.KIPUSPAY_E2E_OUT_DIR ?? '.svelte-kit-e2e',
    },
  },
});
