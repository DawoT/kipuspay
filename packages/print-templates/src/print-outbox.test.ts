import { describe, expect, it } from 'vitest';
import { buildGsKQrCommands } from './escpos-qr.js';
import {
  MAX_PRINT_ITEMS,
  assertPrintPayloadSize,
  assertPrintJobTransition,
  base64ToBytes,
  bytesToBase64,
  countBlockingPrintJobs,
  printJobKey,
} from './print-outbox.js';

describe('buildGsKQrCommands', () => {
  it('emite secuencia GS ( k con store + print', () => {
    const cmd = buildGsKQrCommands('https://cpe.example/q');
    expect(cmd[0]).toBe(0x1d);
    expect(cmd[1]).toBe(0x28);
    expect(cmd[2]).toBe(0x6b);
    expect(cmd).toContain(0x50); // store fn
    expect(cmd).toContain(0x51); // print fn
  });

  it('rechaza payload vacío / demasiado largo', () => {
    expect(buildGsKQrCommands('')).toEqual([]);
    expect(() => buildGsKQrCommands('x'.repeat(7100))).toThrow('QR_PAYLOAD_TOO_LONG');
  });
});

describe('print-outbox contract', () => {
  it('key + blocking count', () => {
    expect(printJobKey('sale-1')).toBe('print_jobs/sale-1');
    expect(() => printJobKey('')).toThrow('PRINT_JOB_SALE_ID_EMPTY');
    expect(
      countBlockingPrintJobs([{ status: 'PENDING' }, { status: 'FAILED' }, { status: 'PRINTED' }]),
    ).toBe(2);
  });

  it('excludes non-cash-blocking label jobs from close Z', () => {
    expect(
      countBlockingPrintJobs([
        { status: 'PENDING', kind: 'SALE_TICKET', blocksCashClose: true },
        { status: 'FAILED', kind: 'PRICE_LABEL_BATCH', blocksCashClose: false },
      ]),
    ).toBe(1);
  });

  it('transitions + base64 roundtrip', () => {
    expect(() => assertPrintJobTransition('PENDING', 'PRINTED')).not.toThrow();
    expect(() => assertPrintJobTransition('PRINTED', 'PENDING')).toThrow(/PRINT_JOB_INVALID/);
    const bytes = new Uint8Array([1, 2, 255]);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual([1, 2, 255]);
  });
});

describe('S25-H1 límite de payload de compilación', () => {
  it('assertPrintPayloadSize rechaza snapshot con más de MAX_PRINT_ITEMS items', () => {
    expect(MAX_PRINT_ITEMS).toBeGreaterThan(0);
    expect(MAX_PRINT_ITEMS).toBeLessThanOrEqual(500);
    expect(() =>
      assertPrintPayloadSize({ items: Array.from({ length: MAX_PRINT_ITEMS }, () => ({})) }),
    ).not.toThrow();
    expect(() =>
      assertPrintPayloadSize({ items: Array.from({ length: MAX_PRINT_ITEMS + 1 }, () => ({})) }),
    ).toThrow(/PRINT_PAYLOAD_TOO_LARGE/);
  });
});
