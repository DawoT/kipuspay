import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { installAuthenticatedTenant } from './fixtures/authenticated-tenant';

async function installA11yTenant(page: Page, caps: string[]) {
  await installAuthenticatedTenant(page, {
    tenantId: 'tenant-a11y',
    capabilities: caps,
    role: 'owner',
    branchId: 'branch-a11y',
    tradeName: 'A11y Comercio',
  });
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.route('**/api/auth/session', (route) => route.fulfill({ status: 401, body: '{}' }));
}

/**
 * S15-H1: WCAG 2.1 AA — pantallas críticas sin cobertura axe previa.
 * Modo Dueño, Modo Vitrina y flujo de caja. Filtra critical/serious
 * (impact real de bloqueo AA); verifica targets táctiles ≥44px.
 */
async function expectNoBlockingA11y(page: import('@playwright/test').Page, label: string) {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((v) =>
    ['critical', 'serious'].includes(v.impact ?? ''),
  );
  expect(blocking, `${label} — ${JSON.stringify(blocking, null, 2)}`).toEqual([]);
}

async function expectTouchTargets(page: import('@playwright/test').Page, label: string) {
  const small = await page.evaluate(() => {
    const offenders: string[] = [];
    // WCAG 2.1: inputs/select de formulario denso tienen excepción de tamaño
    // (los botones y enlaces no). Aquí auditamos botones/enlaces/navegación.
    const targets = document.querySelectorAll<HTMLElement>('button, a');
    for (const el of targets) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.width < 44 || r.height < 44) {
        const text = (el.textContent ?? el.getAttribute('aria-label') ?? el.tagName)
          .trim()
          .slice(0, 40);
        offenders.push(`${el.tagName} "${text}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    return offenders.slice(0, 10);
  });
  expect(small, `${label} — targets <44px: ${JSON.stringify(small, null, 2)}`).toEqual([]);
}

test('S15-H1: Modo Dueño Hoy sin violaciones axe critical/serious y targets ≥44px', async ({
  page,
}) => {
  await installA11yTenant(page, [
    'owner.mode',
    'ledger.accounts_receivable',
    'ledger.accounts_payable',
  ]);
  await page.goto('/owner');
  await expect(page.getByTestId('owner-hoy')).toBeVisible();
  await expectNoBlockingA11y(page, 'owner');
  await expectTouchTargets(page, 'owner');
});

test('S15-H1: Modo Dueño Finanzas sin violaciones axe critical/serious', async ({ page }) => {
  await installA11yTenant(page, [
    'owner.mode',
    'ledger.accounts_receivable',
    'ledger.accounts_payable',
  ]);
  await page.goto('/owner/finanzas');
  await expect(page.locator('main, .page-shell, .page-masthead').first()).toBeVisible();
  await expectNoBlockingA11y(page, 'owner/finanzas');
});

test('S15-H1: Modo Vitrina sin violaciones axe critical/serious', async ({ page }) => {
  await installA11yTenant(page, ['display.vitrina']);
  await page.goto('/vitrina');
  await expect(page.locator('main, .page-shell').first()).toBeVisible();
  await expectNoBlockingA11y(page, 'vitrina');
});

test('S15-H1: Caja (cuotas) sin violaciones axe critical/serious', async ({ page }) => {
  await installA11yTenant(page, ['pos.checkout', 'sales.installments']);
  await page.goto('/caja/cuotas');
  await expect(page.locator('main, .page-shell').first()).toBeVisible();
  await expectNoBlockingA11y(page, 'caja/cuotas');
});

test('S15-H1: Caja (devoluciones) sin violaciones axe critical/serious', async ({ page }) => {
  await installA11yTenant(page, ['pos.checkout', 'sales.returns']);
  await page.goto('/caja/devolucion');
  await expect(page.locator('main, .page-shell').first()).toBeVisible();
  await expectNoBlockingA11y(page, 'caja/devolucion');
});

test('FASE F: Cocina tablero sin violaciones axe critical/serious y targets ≥44px', async ({
  page,
}) => {
  await installA11yTenant(page, ['orders.kds']);
  await page.goto('/kds');
  await expect(page.getByTestId('kds-root')).toBeVisible();
  await expectNoBlockingA11y(page, 'kds');
  await expectTouchTargets(page, 'kds');
});

test('FASE F: Salón tablero sin violaciones axe critical/serious y targets ≥44px', async ({
  page,
}) => {
  await installA11yTenant(page, ['orders.kds', 'orders.split_bill']);
  await page.goto('/salon');
  await expect(page.getByTestId('salon-root')).toBeVisible();
  await expectNoBlockingA11y(page, 'salon');
  await expectTouchTargets(page, 'salon');
});
