import { describe, expect, it } from 'vitest';
import { buildHardwareDiagAuditPayload, parseHardwareDiagAuditPayload } from './audit-payload.js';
import { buildDiagnosticReport } from './diagnostics.js';

describe('audit payload HARDWARE_DIAG (regla 37b)', () => {
  const report = buildDiagnosticReport({
    target: 'printer_network',
    ok: false,
    causeCode: 'NETWORK_PRINTER_NOT_FOUND',
    durationMs: 3200,
    testedAtIso: '2026-08-12T20:00:00.000Z',
  });

  it('serializa campos canónicos con timestamp para soporte remoto', () => {
    const payload = JSON.parse(buildHardwareDiagAuditPayload(report)) as Record<string, unknown>;
    expect(payload.target).toBe('printer_network');
    expect(payload.ok).toBe(false);
    expect(payload.causeCode).toBe('NETWORK_PRINTER_NOT_FOUND');
    expect(payload.durationMs).toBe(3200);
    expect(payload.testedAtIso).toBe('2026-08-12T20:00:00.000Z');
    expect(payload.paperWidthMm).toBeUndefined();
  });

  it('incluye paperWidthMm cuando el report lo trae', () => {
    const withPaper = buildDiagnosticReport({
      target: 'printer_usb',
      ok: true,
      causeCode: 'OK',
      durationMs: 40,
      testedAtIso: '2026-08-12T20:00:00.000Z',
      paperWidthMm: 58,
    });
    const payload = JSON.parse(buildHardwareDiagAuditPayload(withPaper)) as {
      paperWidthMm: number | null;
    };
    expect(payload.paperWidthMm).toBe(58);
  });

  it('payload corrupto no se parsea (fail-closed)', () => {
    expect(parseHardwareDiagAuditPayload('no-json')).toBeNull();
    expect(parseHardwareDiagAuditPayload('{"target":1}')).toBeNull();
  });

  it('payload válido se parsea para soporte remoto', () => {
    const parsed = parseHardwareDiagAuditPayload(buildHardwareDiagAuditPayload(report));
    expect(parsed?.causeCode).toBe('NETWORK_PRINTER_NOT_FOUND');
  });
});
