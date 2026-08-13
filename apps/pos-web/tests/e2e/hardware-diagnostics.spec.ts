import { expect, test, type Page } from '@playwright/test';

/**
 * Sprint 53 — Troubleshooter de hardware (regla 37b / ADR-0033).
 * El seam window.__KIPUS_TEST_HARDWARE__ (ADR-0033) simula el hardware sin
 * mockear navigator.usb: Playwright inyecta la respuesta de cada probe.
 */

async function mockSession(page: Page, role: string) {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        userId: role === 'owner' ? 'owner-e2e' : 'cashier-e2e',
        role,
        branchId: 'branch-e2e',
        terminal: null,
        tradeName: 'Demo KipusPay',
        formalizationMode: 'INTERNAL_CONTROL',
      }),
    }),
  );
}

async function mockDiagnosticsApi(page: Page, requests: unknown[]) {
  await page.route('**/api/hardware/diagnostics', async (route) => {
    const req = route.request();
    if (req.method() === 'POST') {
      requests.push(req.postDataJSON());
      return route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ recorded: 1 }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ reports: [] }),
    });
  });
}

async function installHardwareSeam(
  page: Page,
  seam: Record<string, { causeCode: string; paperWidthMm?: number }>,
  printDurationMs = 1200,
) {
  await page.addInitScript(
    ({ seam, printDurationMs }) => {
      (window as unknown as Record<string, unknown>)['__KIPUS_TEST_HARDWARE__'] = {
        printerUsb: async () => seam.printerUsb,
        printerNetwork: async () => seam.printerNetwork,
        scale: async () => seam.scale,
        vitrina: async () => seam.vitrina,
        printTest: async () => ({
          causeCode: seam.printTest.causeCode,
          durationMs: printDurationMs,
        }),
      };
    },
    { seam, printDurationMs },
  );
}

async function gotoConfig(page: Page) {
  await page.goto('/admin/configuracion');
  await expect(page.getByTestId('hw-probe-usb')).toBeVisible();
}

test('todo el hardware funciona → estados ✓ con causa OK y ancho detectado', async ({ page }) => {
  await mockSession(page, 'owner');
  const requests: unknown[] = [];
  await mockDiagnosticsApi(page, requests);
  await installHardwareSeam(page, {
    printerUsb: { causeCode: 'OK', paperWidthMm: 58 },
    printerNetwork: { causeCode: 'OK' },
    scale: { causeCode: 'OK' },
    vitrina: { causeCode: 'OK' },
    printTest: { causeCode: 'OK' },
  });
  await gotoConfig(page);

  await page.getByTestId('hw-probe-usb').click();
  await expect(page.getByTestId('hw-report-printer_usb')).toContainText(
    'Todo funciona correctamente',
  );
  await expect(page.getByTestId('hw-report-printer_usb')).toContainText('58 mm');

  await page.getByTestId('hw-probe-network').click();
  await expect(page.getByTestId('hw-report-printer_network')).toContainText(
    'Todo funciona correctamente',
  );

  await page.getByTestId('hw-probe-scale').click();
  await expect(page.getByTestId('hw-report-scale')).toContainText('Todo funciona correctamente');

  await page.getByTestId('hw-probe-vitrina').click();
  await expect(page.getByTestId('hw-report-vitrina')).toContainText('Todo funciona correctamente');

  // El report se persiste en el log (soporte remoto).
  expect(requests.length).toBeGreaterThanOrEqual(1);
});

test('impresora no encontrada → causa comprensible + siguiente paso, sin jerga técnica', async ({
  page,
}) => {
  await mockSession(page, 'owner');
  await mockDiagnosticsApi(page, []);
  await installHardwareSeam(page, {
    printerUsb: { causeCode: 'PRINTER_NOT_FOUND' },
    printerNetwork: { causeCode: 'NETWORK_PRINTER_NOT_FOUND' },
    scale: { causeCode: 'SCALE_NOT_FOUND' },
    vitrina: { causeCode: 'OK' },
    printTest: { causeCode: 'PRINTER_NOT_FOUND' },
  });
  await gotoConfig(page);

  await page.getByTestId('hw-probe-usb').click();
  const report = page.getByTestId('hw-report-printer_usb');
  await expect(report).toContainText('No encontramos una impresora conectada por cable');
  await expect(report).toContainText('Siguiente paso: Conecta la impresora con su cable');

  await page.getByTestId('hw-probe-network').click();
  const netReport = page.getByTestId('hw-report-printer_network');
  await expect(netReport).toContainText('No encontramos impresoras en tu red');
  await expect(netReport).toContainText('misma red Wi-Fi');

  // 0 conceptos técnicos en el flujo principal (criterio de aceptación).
  const pageText = await page.locator('#hardware').innerText();
  for (const jargon of ['WebUSB', 'WSS', 'IP', 'Bluetooth', 'LAN', 'ESC/POS']) {
    expect(pageText, `jerga técnica visible: ${jargon}`).not.toContain(jargon);
  }
});

test('prueba de impresión se completa dentro de 30 s', async ({ page }) => {
  await mockSession(page, 'owner');
  await mockDiagnosticsApi(page, []);
  await installHardwareSeam(page, {
    printerUsb: { causeCode: 'OK' },
    printerNetwork: { causeCode: 'OK' },
    scale: { causeCode: 'OK' },
    vitrina: { causeCode: 'OK' },
    printTest: { causeCode: 'OK' },
  });
  await gotoConfig(page);

  await page.getByTestId('hw-print-test').click();
  await expect(page.getByTestId('hw-report-print')).toContainText(
    'Impresión de prueba completada en 1200 ms',
  );
});
