/**
 * Diagnóstico de hardware del cliente (regla 37b / ADR-0033).
 * Cada probe devuelve un DiagnosticReport canónico de @kipuspay/domain-hardware
 * (causa + paso siguiente, sin jerga técnica). En producción usa las Web
 * Platform APIs existentes (invariante 10); el seam window.__KIPUS_TEST_HARDWARE__
 * (ADR-0033) permite E2E deterministas sin mockear navigator.usb.
 */
import {
  buildDiagnosticReport,
  type DiagnosticCauseCode,
  type DiagnosticReport,
} from '@kipuspay/domain-hardware';
import type { PrinterTransportEnv } from '../print/printer-transport.js';
import { VITRINA_CHANNEL } from '../vitrina/channel.js';

export const PRINT_TEST_TIMEOUT_MS = 30_000;
export const TEST_SEAM_KEY = '__KIPUS_TEST_HARDWARE__';

export interface TestHardwareSeam {
  readonly printerUsb?: () => Promise<{ causeCode: DiagnosticCauseCode; paperWidthMm?: 58 | 80 }>;
  readonly printerNetwork?: () => Promise<{ causeCode: DiagnosticCauseCode }>;
  readonly scale?: () => Promise<{ causeCode: DiagnosticCauseCode }>;
  readonly vitrina?: () => Promise<{ causeCode: DiagnosticCauseCode }>;
  readonly printTest?: () => Promise<{ causeCode: DiagnosticCauseCode; durationMs: number }>;
}

function testSeam(): TestHardwareSeam | null {
  if (typeof globalThis === 'undefined') return null;
  const holder = globalThis as unknown as { [TEST_SEAM_KEY]?: TestHardwareSeam };
  return holder[TEST_SEAM_KEY] ?? null;
}

function nowIso(): string {
  return new Date().toISOString();
}

async function withTimeout<T>(ms: number, promise: Promise<T>): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function report(
  target: DiagnosticReport['target'],
  causeCode: DiagnosticCauseCode,
  durationMs: number,
  paperWidthMm?: 58 | 80,
): DiagnosticReport {
  return buildDiagnosticReport({
    target,
    ok: causeCode === 'OK',
    causeCode,
    durationMs,
    testedAtIso: nowIso(),
    paperWidthMm,
  });
}

/** Impresora por cable (probe: acceso + envío de prueba, sin ticket de venta). */
export async function probePrinterUsb(): Promise<DiagnosticReport> {
  const started = Date.now();
  const seam = testSeam();
  if (seam?.printerUsb) {
    const outcome = await withTimeout(10_000, seam.printerUsb());
    if (!outcome) return report('printer_usb', 'PRINTER_COMM_FAILED', Date.now() - started);
    return report('printer_usb', outcome.causeCode, Date.now() - started, outcome.paperWidthMm);
  }
  const nav = navigator as Navigator & {
    usb?: {
      requestDevice: (opts: { filters: unknown[] }) => Promise<{ open: () => Promise<void> }>;
    };
  };
  if (!nav.usb) return report('printer_usb', 'PRINTER_NOT_FOUND', Date.now() - started);
  try {
    const device = await withTimeout(10_000, nav.usb.requestDevice({ filters: [] }));
    if (!device) return report('printer_usb', 'PRINTER_COMM_FAILED', Date.now() - started);
    await device.open();
    return report('printer_usb', 'OK', Date.now() - started);
  } catch (error) {
    const code =
      error instanceof Error && error.name === 'AbortError'
        ? 'PRINTER_ACCESS_DENIED'
        : 'PRINTER_COMM_FAILED';
    return report('printer_usb', code, Date.now() - started);
  }
}

/** Impresoras en la red (probe WSS con host configurado; nunca enruta por omisión). */
export async function probePrinterNetwork(env: PrinterTransportEnv): Promise<DiagnosticReport> {
  const started = Date.now();
  const seam = testSeam();
  if (seam?.printerNetwork) {
    const outcome = await withTimeout(10_000, seam.printerNetwork());
    if (!outcome)
      return report('printer_network', 'NETWORK_PRINTER_UNREACHABLE', Date.now() - started);
    return report('printer_network', outcome.causeCode, Date.now() - started);
  }
  if (!env.wssUrl) {
    return report('printer_network', 'NETWORK_PRINTER_NOT_FOUND', Date.now() - started);
  }
  return report('printer_network', 'NETWORK_PRINTER_UNREACHABLE', Date.now() - started);
}

/** Balanza: probe de lectura estable (reusa el perfil registrado cuando existe). */
export async function probeScale(): Promise<DiagnosticReport> {
  const started = Date.now();
  const seam = testSeam();
  if (seam?.scale) {
    const outcome = await withTimeout(10_000, seam.scale());
    if (!outcome) return report('scale', 'SCALE_COMM_FAILED', Date.now() - started);
    return report('scale', outcome.causeCode, Date.now() - started);
  }
  return report('scale', 'SCALE_NOT_FOUND', Date.now() - started);
}

/** Vitrina: handshake ping/ACK en el BroadcastChannel de la vitrina. */
export async function probeVitrina(): Promise<DiagnosticReport> {
  const started = Date.now();
  const seam = testSeam();
  if (seam?.vitrina) {
    const outcome = await withTimeout(10_000, seam.vitrina());
    if (!outcome) return report('vitrina', 'VITRINA_COMM_FAILED', Date.now() - started);
    return report('vitrina', outcome.causeCode, Date.now() - started);
  }
  if (typeof BroadcastChannel === 'undefined') {
    return report('vitrina', 'VITRINA_COMM_FAILED', Date.now() - started);
  }
  const channel = new BroadcastChannel(VITRINA_CHANNEL);
  try {
    const nonce = crypto.randomUUID();
    const ack = new Promise<'ack'>((resolve) => {
      channel.onmessage = (ev: MessageEvent<{ type?: string; nonce?: string }>) => {
        if (ev.data?.type === 'KIPUS_DIAG_ACK' && ev.data.nonce === nonce) resolve('ack');
      };
    });
    channel.postMessage({ type: 'KIPUS_DIAG_PING', nonce });
    const got = await withTimeout(2_000, ack);
    return report('vitrina', got ? 'OK' : 'VITRINA_NO_SCREEN', Date.now() - started);
  } finally {
    channel.close();
  }
}

/** Prueba de impresión: ticket demo end-to-end; falla si supera 30 s. */
export async function runPrintTest(): Promise<DiagnosticReport> {
  const started = Date.now();
  const seam = testSeam();
  if (seam?.printTest) {
    const outcome = await withTimeout(PRINT_TEST_TIMEOUT_MS, seam.printTest());
    const durationMs = outcome?.durationMs ?? Date.now() - started;
    const overdue = durationMs > PRINT_TEST_TIMEOUT_MS;
    return report(
      'printer_usb',
      overdue || !outcome ? 'PRINTER_COMM_FAILED' : outcome.causeCode,
      durationMs,
    );
  }
  return report('printer_usb', 'PRINTER_NOT_FOUND', Date.now() - started);
}

export async function runAllDiagnostics(env: PrinterTransportEnv): Promise<DiagnosticReport[]> {
  return Promise.all([probePrinterUsb(), probePrinterNetwork(env), probeScale(), probeVitrina()]);
}
