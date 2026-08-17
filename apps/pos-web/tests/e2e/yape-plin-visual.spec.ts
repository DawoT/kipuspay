import { expect, test } from '@playwright/test';

// Parte I §4.2 de docs/ops/legal_and_sales_guide.md: en pagos con Yape/Plin sin
// internet se activa la verificación visual manual (pantalla ámbar) antes de
// entregar el producto (copy normativa §5.4 edge 2B).

const SESSION = JSON.stringify({
  userId: 'cashier-e2e',
  role: 'cashier',
  branchId: 'branch-e2e',
});
const CLAIM = JSON.stringify({ branchId: 'branch-e2e', sessionId: 'session-e2e' });

test('cobro local offline con Yape muestra la verificación visual manual', async ({
  page,
  context,
}) => {
  await page.addInitScript(
    ([session, claim]) => {
      localStorage.setItem('kipuspay_user', session);
      localStorage.setItem('kipuspay.onboarding.claim', claim);
      localStorage.setItem('kipuspay_token', 'jwt-e2e');
      localStorage.setItem('kipuspay_tenant_id', 't-e2e');
      localStorage.setItem('kipuspay:pos-terminal-id', 'terminal-e2e');
    },
    [SESSION, CLAIM] as const,
  );
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        userId: 'cashier-e2e',
        role: 'cashier',
        branchId: 'branch-e2e',
        terminal: { terminalId: 'terminal-e2e', terminalSessionId: 'terminal-session-e2e' },
      }),
    }),
  );
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );

  await page.goto('/caja/cobro');
  await context.setOffline(true);
  await page.getByTestId('caja-cobro-method').selectOption('yape');
  await page.getByTestId('caja-cobro-charge').click();

  await expect(page.getByTestId('caja-cobro-amber')).toContainText(
    /Verifica visualmente la app del cliente antes de entregar el producto/,
  );
});
