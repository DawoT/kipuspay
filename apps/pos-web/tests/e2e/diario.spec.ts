import { expect, test } from '@playwright/test';

// s32 (guía §6): diario contable SOLO LECTURA — los asientos nacen con la
// venta, el cobro, el apartado y el arqueo; jamás se mutan desde la UI.

const SESSION = JSON.stringify({
  userId: 'admin-e2e',
  role: 'admin',
  branchId: 'branch-e2e',
});

test('diario: solo lectura con prueba de inmutabilidad', async ({ page }) => {
  await page.addInitScript(
    ([session]) => {
      localStorage.setItem('kipuspay_user', session);
      localStorage.setItem('kipuspay_token', 'jwt-e2e');
      localStorage.setItem('kipuspay_tenant_id', 't-e2e');
    },
    [SESSION] as const,
  );
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.route('**/api/ledger/journal**', (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({
        status: 405,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'JOURNAL_IMMUTABLE', error: 'Journal immutable' }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            account_code: '7011',
            memo: 'venta',
            debit_cents: 10000,
            credit_cents: 0,
          },
        ],
      }),
    });
  });

  await page.goto('/admin/diario');
  await expect(page.getByTestId('admin-diario')).toBeVisible();
  await expect(
    page.getByText(/Solo lectura. Los asientos nacen con la venta, el cobro/),
  ).toBeVisible();
  await expect(page.getByText(/Intentar mutar \(Prueba de inmutabilidad\)/)).toBeVisible();

  await page.getByTestId('journal-from').fill('2026-08-01');
  await page.getByTestId('journal-to').fill('2026-08-31');
  await page.getByTestId('journal-load').click();
  await expect(page.getByTestId('admin-diario')).toContainText(/NV01-0000001|7011/);

  await page.getByTestId('journal-mutate').click();
  await expect(page.getByTestId('journal-mutate-msg')).toContainText(
    /Respuesta de inmutabilidad: El diario no se puede modificar/,
  );
});
