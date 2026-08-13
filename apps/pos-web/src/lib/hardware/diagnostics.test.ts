import { describe, expect, it } from 'vitest';
import {
  PRINT_TEST_TIMEOUT_MS,
  TEST_SEAM_KEY,
  probePrinterNetwork,
  probePrinterUsb,
  probeScale,
  probeVitrina,
  runPrintTest,
  type TestHardwareSeam,
} from './diagnostics';

declare global {
  interface Window {
    [TEST_SEAM_KEY]?: TestHardwareSeam;
  }
}

function installSeam(seam: TestHardwareSeam): void {
  (globalThis as unknown as { [TEST_SEAM_KEY]?: TestHardwareSeam })[TEST_SEAM_KEY] = seam;
}

function clearSeam(): void {
  delete (globalThis as unknown as { [TEST_SEAM_KEY]?: TestHardwareSeam })[TEST_SEAM_KEY];
}

describe('hardware diagnostics client (ADR-0033)', () => {
  it('printer usb: OK con ancho de papel autodetectado', async () => {
    installSeam({
      printerUsb: () => Promise.resolve({ causeCode: 'OK' as const, paperWidthMm: 58 as const }),
    });
    const report = await probePrinterUsb();
    expect(report.ok).toBe(true);
    expect(report.paperWidthMm).toBe(58);
    expect(report.durationMs).toBeLessThan(5000);
  });

  it('printer usb: causa del seam se propaga con nextStep del dominio', async () => {
    installSeam({ printerUsb: () => Promise.resolve({ causeCode: 'PRINTER_NOT_FOUND' as const }) });
    const report = await probePrinterUsb();
    expect(report.ok).toBe(false);
    expect(report.nextStepId).toBeTruthy();
  });

  it('printer usb: sin seam y sin navigator.usb → PRINTER_NOT_FOUND', async () => {
    clearSeam();
    const report = await probePrinterUsb();
    expect(report.causeCode).toBe('PRINTER_NOT_FOUND');
  });

  it('printer network: OK cuando hay host y handshake responde', async () => {
    installSeam({ printerNetwork: () => Promise.resolve({ causeCode: 'OK' as const }) });
    const report = await probePrinterNetwork({ wssUrl: 'wss://printer.local' });
    expect(report.ok).toBe(true);
  });

  it('printer network: sin host configurado → NETWORK_PRINTER_NOT_FOUND', async () => {
    clearSeam();
    const report = await probePrinterNetwork({});
    expect(report.causeCode).toBe('NETWORK_PRINTER_NOT_FOUND');
  });
  it('scale: causa del seam se propaga', async () => {
    installSeam({ scale: () => Promise.resolve({ causeCode: 'SCALE_UNSTABLE' as const }) });
    const report = await probeScale();
    expect(report.ok).toBe(false);
    expect(report.causeCode).toBe('SCALE_UNSTABLE');
  });

  it('vitrina: OK cuando hay pantalla que responde ACK', async () => {
    installSeam({ vitrina: () => Promise.resolve({ causeCode: 'OK' as const }) });
    const report = await probeVitrina();
    expect(report.ok).toBe(true);
  });

  it('vitrina: sin seam y sin pantalla → VITRINA_NO_SCREEN', async () => {
    clearSeam();
    const report = await probeVitrina();
    expect(report.causeCode).toBe('VITRINA_NO_SCREEN');
  });

  it('prueba de impresión: success dentro del presupuesto', async () => {
    installSeam({
      printTest: () => Promise.resolve({ causeCode: 'OK' as const, durationMs: 1200 }),
    });
    const report = await runPrintTest();
    expect(report.ok).toBe(true);
    expect(report.durationMs).toBe(1200);
  });

  it('prueba de impresión: se marca fallida si excede 30 s', async () => {
    installSeam({
      printTest: () =>
        Promise.resolve({ causeCode: 'OK' as const, durationMs: PRINT_TEST_TIMEOUT_MS + 500 }),
    });
    const report = await runPrintTest();
    expect(report.ok).toBe(false);
    expect(report.causeCode).toBe('PRINTER_COMM_FAILED');
  });
});
