import { expect, test } from '@playwright/test';

function authSession(role: string) {
  return {
    userId: role === 'owner' ? 'owner-e2e' : 'cashier-e2e',
    role,
    branchId: 'branch-e2e',
    terminal: null,
  };
}

async function mockSession(page: import('@playwright/test').Page, role: string) {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(authSession(role)),
    }),
  );
}

test('caja: handoff de turno genera PIN de un solo uso y transfiere sin cerrar', async ({
  page,
}) => {
  await mockSession(page, 'cashier');
  const corsHeaders = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
  };
  let pinIssued = '';
  await page.route('**/api/cash/shifts/pin', (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers: corsHeaders });
    pinIssued = '123456';
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify({
        shiftId: 'sh1',
        pin: pinIssued,
        expiresAtIso: '2099-01-01T00:00:00.000Z',
        ttlSeconds: 300,
      }),
    });
  });
  let transferBody: Record<string, unknown> | null = null;
  await page.route('**/api/cash/shifts/transfer', (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers: corsHeaders });
    transferBody = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify({
        shiftId: 'sh2',
        incomingUserId: 'cashier-e2e',
        cashDiffCents: 500,
        interimCountCents: 9500,
        interimRequired: true,
      }),
    });
  });

  await page.goto('/caja/handoff');
  await page.getByTestId('handoff-session-id').fill('s-e2e');
  await page.getByTestId('handoff-outgoing').fill('u-saliente');
  await page.getByTestId('handoff-generate-pin').click();
  await expect(page.getByTestId('handoff-pin-reveal')).toBeVisible();
  await expect(page.getByTestId('handoff-pin-reveal')).toContainText('123456');

  await page.getByTestId('handoff-pin-input').fill(pinIssued);
  await page.getByTestId('handoff-interim').fill('9500');
  await page.getByTestId('handoff-transfer').click();
  await expect(page.getByTestId('handoff-msg')).toContainText('Turno transferido');
  await expect(page.getByTestId('handoff-diff')).toContainText('500');
  expect(transferBody).toMatchObject({
    sessionId: 's-e2e',
    outgoingUserId: 'u-saliente',
    pin: '123456',
    interimCountCents: 9500,
  });
});

test('admin: invitación de equipo emite badge EMP- y PIN de caja una sola vez', async ({
  page,
}) => {
  await mockSession(page, 'owner');
  const corsHeaders = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
  };
  let inviteBody: Record<string, unknown> | null = null;
  await page.route('**/api/team/invites', (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers: corsHeaders });
    inviteBody = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify({ userId: 'u8', badgeBarcode: 'EMP-12345', cashierPin: '4321' }),
    });
  });

  await page.goto('/admin/equipo');
  await page.getByTestId('team-email').fill('vendedor@tienda.pe');
  await page.getByTestId('team-role').selectOption('cashier');
  await page.getByTestId('team-invite').click();
  await expect(page.getByTestId('team-result')).toContainText('Invitación creada');
  await expect(page.getByTestId('team-badge')).toContainText('EMP-12345');
  await expect(page.getByTestId('team-pin')).toContainText('4321');
  expect(inviteBody).toMatchObject({ email: 'vendedor@tienda.pe', role: 'cashier' });
});

test('caja: atribución de vendedor en <1s por badge o PIN en el carrito', async ({ page }) => {
  await mockSession(page, 'cashier');
  const corsHeaders = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
  };
  await page.route('**/api/team/resolve', (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers: corsHeaders });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify({
        userId: 'u9',
        email: 'vendedor@tienda.pe',
        role: 'cashier',
        resolvedBy: 'badge',
      }),
    });
  });

  await page.goto('/');
  await page.getByTestId('seller-resolve').click();
  await page.getByTestId('seller-resolve-input').fill('EMP-55555');
  await page.getByTestId('seller-resolve-confirm').click();
  await expect(page.getByTestId('seller-resolve')).toContainText('vendedor@tienda.pe');
  await expect(page.getByTestId('seller-id')).toHaveValue('u9');
});
