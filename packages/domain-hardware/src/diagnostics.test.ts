import { describe, expect, it } from 'vitest';
import {
  DIAGNOSTIC_CAUSES,
  findJargonViolations,
  DIAGNOSTIC_TARGETS,
  buildDiagnosticReport,
  causeLabel,
  nextStepFor,
  type DiagnosticCauseCode,
  type DiagnosticTarget,
} from './diagnostics.js';

describe('diagnostics domain (regla 37b / ADR-0033)', () => {
  it('cubre los 4 targets del roadmap FASE 6G', () => {
    expect(DIAGNOSTIC_TARGETS).toEqual(['printer_usb', 'printer_network', 'scale', 'vitrina']);
  });

  it('cada causa tiene label no-técnico y nextStep accionable; OK no tiene nextStep', () => {
    for (const [code, cause] of Object.entries(DIAGNOSTIC_CAUSES)) {
      expect(cause.label.length, `label vacío para ${code}`).toBeGreaterThan(0);
      if (code === 'OK') {
        expect(cause.nextStepId).toBeNull();
      } else {
        expect(cause.nextStepId, `sin nextStep para ${code}`).toBeTruthy();
      }
    }
  });

  it('el report deriva nextStepId desde el catálogo (DRY)', () => {
    const report = buildDiagnosticReport({
      target: 'printer_usb',
      ok: false,
      causeCode: 'PRINTER_NOT_FOUND',
      durationMs: 120,
      testedAtIso: '2026-08-12T20:00:00.000Z',
    });
    expect(report.nextStepId).toBe(DIAGNOSTIC_CAUSES.PRINTER_NOT_FOUND.nextStepId);
    expect(report.ok).toBe(false);
    expect(report.paperWidthMm).toBeUndefined();
  });

  it('report OK con ancho de papel 58/80 para impresora', () => {
    const report = buildDiagnosticReport({
      target: 'printer_usb',
      ok: true,
      causeCode: 'OK',
      durationMs: 40,
      testedAtIso: '2026-08-12T20:00:00.000Z',
      paperWidthMm: 80,
    });
    expect(report.ok).toBe(true);
    expect(report.nextStepId).toBeNull();
    expect(report.paperWidthMm).toBe(80);
  });

  it('causeCode inconsistente con ok=false → inválido; ok=true exige OK', () => {
    const bad = buildDiagnosticReport({
      target: 'scale',
      ok: false,
      causeCode: 'OK',
      durationMs: 10,
      testedAtIso: '2026-08-12T20:00:00.000Z',
    });
    expect(bad.valid).toBe(false);
    const bad2 = buildDiagnosticReport({
      target: 'scale',
      ok: true,
      causeCode: 'SCALE_NOT_FOUND',
      durationMs: 10,
      testedAtIso: '2026-08-12T20:00:00.000Z',
    });
    expect(bad2.valid).toBe(false);
    const good = buildDiagnosticReport({
      target: 'vitrina',
      ok: true,
      causeCode: 'OK',
      durationMs: 10,
      testedAtIso: '2026-08-12T20:00:00.000Z',
    });
    expect(good.valid).toBe(true);
  });

  it('causeCode desconocido no produce report', () => {
    const unknown = buildDiagnosticReport({
      target: 'scale',
      ok: false,
      causeCode: 'NOPE' as DiagnosticCauseCode,
      durationMs: 10,
      testedAtIso: '2026-08-12T20:00:00.000Z',
    });
    expect(unknown.valid).toBe(false);
  });

  it('los labels y pasos siguientes resuelven desde el catálogo', () => {
    expect(causeLabel('SCALE_UNSTABLE')).toBe(DIAGNOSTIC_CAUSES.SCALE_UNSTABLE.label);
    expect(nextStepFor('NETWORK_PRINTER_UNREACHABLE')).toBe(
      DIAGNOSTIC_CAUSES.NETWORK_PRINTER_UNREACHABLE.nextStepId,
    );
    expect(nextStepFor('OK')).toBeNull();
  });

  it('validación de copy: cero jerga técnica en labels y nextSteps', () => {
    const entries = Object.entries(DIAGNOSTIC_CAUSES).map(([code, cause]) => [
      { id: code, text: cause.label },
      { id: `${code}.next`, text: cause.nextStepId ?? '' },
    ]);
    expect(findJargonViolations(entries.flat())).toEqual([]);
  });

  it('los targets usan solo causas del catálogo (sin IDs huérfanos)', () => {
    const targets: DiagnosticTarget[] = ['printer_usb', 'printer_network', 'scale', 'vitrina'];
    const codes = Object.keys(DIAGNOSTIC_CAUSES) as DiagnosticCauseCode[];
    for (const target of targets) {
      expect(DIAGNOSTIC_CAUSES[targetToDefaultCause(target)]).toBeDefined();
    }
    expect(codes).toContain('OK');
  });

  it('la validación de jerga detecta por palabra completa, no substrings', () => {
    const violations = findJargonViolations([
      { id: 'ok-copy', text: 'Conecta la impresora por WebUSB y configura la IP.' },
      { id: 'permiso', text: 'Permiso para continuar' },
      { id: 'chip', text: 'El chip de la impresora' },
    ]);
    expect(violations).toHaveLength(2);
    expect(violations[0]).toContain('ok-copy');
    expect(violations[0]).toContain('WebUSB');
    expect(violations[1]).toContain('IP');
  });
});

function targetToDefaultCause(target: DiagnosticTarget): DiagnosticCauseCode {
  switch (target) {
    case 'printer_usb':
      return 'PRINTER_NOT_FOUND';
    case 'printer_network':
      return 'NETWORK_PRINTER_NOT_FOUND';
    case 'scale':
      return 'SCALE_NOT_FOUND';
    case 'vitrina':
      return 'VITRINA_NO_SCREEN';
  }
}
