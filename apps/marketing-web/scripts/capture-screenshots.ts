import { chromium } from '../../../node_modules/.pnpm/playwright@1.62.1/node_modules/playwright/index.mjs';

const ARTIFACT_DIR = '/home/deuz/.gemini/antigravity-cli/brain/d9b2a48d-a715-42e6-ab0a-5107fa4e7c8b';
const BASE_URL = 'http://localhost:5173';

async function capture() {
  console.log('📸 Capturando pantallas de la web de marketing...');
  const browser = await chromium.launch({ headless: true });

  // 1. Escritorio (1280x800)
  const desktopContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await desktopContext.newPage();

  // /seguridad
  await page.goto(`${BASE_URL}/seguridad`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${ARTIFACT_DIR}/seguridad_desktop.png`, fullPage: true });
  console.log('  ✓ Capturada /seguridad en Escritorio');

  // /ayuda
  await page.goto(`${BASE_URL}/ayuda`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${ARTIFACT_DIR}/ayuda_desktop.png`, fullPage: true });
  console.log('  ✓ Capturada /ayuda en Escritorio');

  // /precios
  await page.goto(`${BASE_URL}/precios`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${ARTIFACT_DIR}/precios_desktop.png`, fullPage: true });
  console.log('  ✓ Capturada /precios en Escritorio');

  // /blog
  await page.goto(`${BASE_URL}/blog`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${ARTIFACT_DIR}/blog_desktop.png`, fullPage: true });
  console.log('  ✓ Capturada /blog en Escritorio');

  await desktopContext.close();

  // 2. Móvil (390x844)
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
  });
  const mobilePage = await mobileContext.newPage();

  // /seguridad (Móvil)
  await mobilePage.goto(`${BASE_URL}/seguridad`, { waitUntil: 'networkidle' });
  await mobilePage.screenshot({ path: `${ARTIFACT_DIR}/seguridad_mobile.png`, fullPage: true });
  console.log('  ✓ Capturada /seguridad en Móvil');

  await mobileContext.close();
  await browser.close();
  console.log('✨ Capturas completadas exitosamente.');
}

capture().catch((err) => {
  console.error('Error al capturar pantallas:', err);
  process.exit(1);
});
