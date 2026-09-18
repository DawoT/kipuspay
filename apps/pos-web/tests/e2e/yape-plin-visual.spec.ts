import { expect, test } from '@playwright/test';
import { installAuthenticatedTenant } from './fixtures/authenticated-tenant';

// Parte I §4.2 de docs/ops/legal_and_sales_guide.md: en pagos con Yape/Plin sin
// internet se activa la verificación visual manual (pantalla ámbar) antes de
// entregar el producto (copy normativa §5.4 edge 2B).

test('cobro local offline con Yape muestra la verificación visual manual', async ({
  page,
  context,
}) => {
  await installAuthenticatedTenant(page, {
    tenantId: 't-yape',
    role: 'cashier',
    capabilities: ['payments.qr_wallets', 'pos.checkout'],
    terminal: {
      terminalId: 'terminal-e2e',
      terminalSessionId: 'terminal-session-e2e',
      cashRegisterSessionId: 'session-e2e',
    },
  });

  await page.goto('/caja/cobro');
  await context.setOffline(true);
  await page.getByTestId('caja-cobro-method').selectOption('yape');
  await page.getByTestId('caja-cobro-charge').click();

  await expect(page.getByTestId('caja-cobro-amber')).toContainText(
    /Verifica visualmente la app del cliente antes de entregar el producto/,
  );
});
