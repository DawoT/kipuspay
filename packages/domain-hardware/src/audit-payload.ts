import type { DiagnosticReport } from './diagnostics.js';

/**
 * Payload canónico para `audit_events` action `HARDWARE_DIAG` (regla 37b).
 * El timestamp `testedAtIso` + `created_at` de la fila dan el rastro para
 * soporte remoto; el servidor lo persiste sin interpretar el copy (DRY).
 */

export interface HardwareDiagAuditPayload {
  readonly target: string;
  readonly ok: boolean;
  readonly causeCode: string;
  readonly nextStepId: string | null;
  readonly durationMs: number;
  readonly testedAtIso: string;
  readonly paperWidthMm?: number;
}

export function buildHardwareDiagAuditPayload(report: DiagnosticReport): string {
  const payload: HardwareDiagAuditPayload = {
    target: report.target,
    ok: report.ok,
    causeCode: report.causeCode,
    nextStepId: report.nextStepId,
    durationMs: report.durationMs,
    testedAtIso: report.testedAtIso,
    ...(report.paperWidthMm !== undefined ? { paperWidthMm: report.paperWidthMm } : {}),
  };
  return JSON.stringify(payload);
}

export function parseHardwareDiagAuditPayload(raw: string): HardwareDiagAuditPayload | null {
  try {
    const parsed = JSON.parse(raw) as Partial<HardwareDiagAuditPayload>;
    if (typeof parsed.target !== 'string' || typeof parsed.causeCode !== 'string') return null;
    if (typeof parsed.ok !== 'boolean') return null;
    return parsed as HardwareDiagAuditPayload;
  } catch {
    return null;
  }
}
