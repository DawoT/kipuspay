import { expect, test } from '@playwright/test';
import { installAuthenticatedTenant } from './fixtures/authenticated-tenant';

// guía Parte I §7.1 (referidos) y §2.1: Modo Dueño — Yo: plan, código de
// referido real y enlace de invitación (un mes gratis para ambos).

test('yo dueño: plan, código de referido y enlace de invitación', async ({ page }) => {
  await installAuthenticatedTenant(page, {
    tenantId: 't-owner-profile',
    role: 'owner',
    capabilities: ['owner.mode'],
  });
  await page.route('**/api/growth/events', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ events: [] }),
    }),
  );
  await page.route('**/v1/referrals/code', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'KPREF1234',
        inviteUrl: 'https://kipuspay.com/empezar?ref=KPREF1234',
      }),
    }),
  );

  await page.goto('/owner/yo');
  await expect(page.getByTestId('owner-yo')).toBeVisible();
  await expect(page.getByTestId('plan-label')).toContainText(
    /Plan: Arranque · Solo notas de venta/,
  );

  await expect(
    page.getByText(/Un mes gratis para quien refiere y un mes para quien llega/),
  ).toBeVisible();
  await expect(page.getByTestId('referral-code')).toContainText(/KPREF1234/);
  await expect(page.getByTestId('invite-url')).toContainText(/ref=KPREF1234/);
});
