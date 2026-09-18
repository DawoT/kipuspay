import { expect, test } from '@playwright/test';
import { installAuthenticatedTenant } from './fixtures/authenticated-tenant';

// Q12 de docs/ops/legal_and_sales_guide.md: control 3-way matching (OC ×
// Recepción × Factura) evita pagar facturas con sobreprecio; CxP al confirmar
// el match. Spec con las capabilities activas (PUBLIC_FEATURE_PURCHASING_
// THREE_WAY + LEDGER_AR_AP en el env del webserver).

test('factura proveedor: formulario de match 3-way con CxP al confirmar', async ({ page }) => {
  await installAuthenticatedTenant(page, {
    tenantId: 't-three-way',
    role: 'admin',
    verticalType: 'cadenas',
    capabilities: ['purchasing.three_way', 'ledger.accounts_payable'],
  });
  await page.route('**/api/purchasing/invoices/match', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        invoiceId: 'inv-e2e',
        invoiceStatus: 'MATCHED',
        apAmountCents: 11800,
      }),
    }),
  );

  await page.goto('/admin/factura-proveedor');
  await expect(page.getByTestId('admin-factura-match')).toBeVisible();
  await expect(page.getByText(/La cuenta por pagar se crea al confirmar/i)).toBeVisible();

  await page.getByTestId('inv-po-id').fill('PO-2026-0001');
  await page.getByTestId('inv-branch').fill('branch-e2e');
  await page.getByTestId('inv-number').fill('F001-00077');
  await page.getByTestId('inv-product').fill('p1');
  await page.getByTestId('inv-qty').fill('10');
  await page.getByTestId('inv-cost').fill('1180');
  await page
    .getByRole('button', { name: /confirmar|match|conciliar/i })
    .first()
    .click();

  await expect(page.getByTestId('admin-factura-match')).toContainText(
    /inv-e2e|MATCHED|S\/ 118\.00/i,
  );
});
