import { expect, test } from '@playwright/test';

test('offline sync: encolar N → sync background → cola vacía (cero spinner cobro)', async ({
  page,
}) => {
  await page.goto('/dev/offline-sync-harness');
  await expect(page.getByRole('heading', { name: 'Offline sync harness' })).toBeVisible();

  await page.getByTestId('run').click();
  // Cobro responde de inmediato (sin spinner bloqueante de red).
  await expect(page.getByTestId('status')).toHaveText('enqueued');
  await expect(page.getByTestId('message')).toContainText('Cobro OK');

  await expect(page.getByTestId('status')).toHaveText('synced', { timeout: 10_000 });
  await expect(page.getByTestId('pending')).toHaveText('0');
});
