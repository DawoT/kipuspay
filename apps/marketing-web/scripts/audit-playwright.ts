import { chromium } from '../../../node_modules/.pnpm/playwright@1.62.1/node_modules/playwright/index.mjs';

const BASE_URL = 'http://localhost:5173';

const ROUTES_TO_AUDIT = [
  '/',
  '/precios',
  '/seguridad',
  '/ayuda',
  '/empezar',
  '/casos-de-exito',
  '/blog',
  '/blog/primera-venta-el-mismo-dia',
  '/para/retail',
  '/para/restaurantes',
  '/para/farmacias',
  '/para/servicios',
  '/para/cadenas',
  '/comparar/bsale',
  '/sitemap.xml',
  '/robots.txt',
];

async function runAudit() {
  console.log('🚀 Iniciando auditoría Playwright sobre', BASE_URL);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const errors: string[] = [];
  const warnings: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(`Console Error [${page.url()}]: ${msg.text()}`);
    } else if (msg.type() === 'warning') {
      warnings.push(`Console Warning [${page.url()}]: ${msg.text()}`);
    }
  });

  page.on('pageerror', (err) => {
    errors.push(`Page Error [${page.url()}]: ${err.message}`);
  });

  let auditedCount = 0;

  for (const route of ROUTES_TO_AUDIT) {
    const targetUrl = `${BASE_URL}${route}`;
    console.log(`🔎 Auditando: ${route}`);

    try {
      const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
      const status = response?.status();

      if (status !== 200) {
        errors.push(`HTTP ${status} en ${route}`);
      }

      if (route.endsWith('.xml') || route.endsWith('.txt')) {
        const text = await page.content();
        if (!text || text.length < 50) {
          errors.push(`Contenido insuficiente en endpoint ${route}`);
        }
      } else {
        // Auditoría DOM para páginas HTML
        const title = await page.title();
        if (!title || !title.includes('KipusPay')) {
          errors.push(`Título de página inválido o incompleto en ${route}: "${title}"`);
        }

        // Verificar que no se muestre el soft-off
        const softOffCount = await page.locator('[data-testid="marketing-soft-off"]').count();
        if (softOffCount > 0) {
          errors.push(`Soft-off activo inesperadamente en ${route}`);
        }

        // Verificar visibilidad del header
        const headerCount = await page.locator('.site-header').count();
        if (headerCount === 0) {
          errors.push(`Site header no encontrado en ${route}`);
        }
      }

      auditedCount++;
    } catch (err: any) {
      errors.push(`Fallo al navegar a ${route}: ${err.message}`);
    }
  }

  await browser.close();

  console.log('\n📊 === RESULTADOS DE AUDITORÍA PLAYWRIGHT ===');
  console.log(`Páginas auditadas con éxito: ${auditedCount} / ${ROUTES_TO_AUDIT.length}`);
  console.log(`Total Errores: ${errors.length}`);
  console.log(`Total Advertencias: ${warnings.length}`);

  if (errors.length > 0) {
    console.error('\n❌ ERRORES DETECTADOS:');
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  } else {
    console.log('\n✅ 0 ERRORES DETECTADOS. Todas las páginas responden 200 OK con DOM válido.');
  }
}

runAudit().catch((err) => {
  console.error('Fatal audit error:', err);
  process.exit(1);
});
