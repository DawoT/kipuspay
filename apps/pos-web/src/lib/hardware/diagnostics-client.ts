/**
 * Reporte server-side de diagnóstico (regla 37b): el servidor persiste el
 * report en audit_events (action HARDWARE_DIAG) con su cadena de hashes.
 */
import { buildHardwareDiagAuditPayload, type DiagnosticReport } from '@kipuspay/domain-hardware';

export interface ReportDiagnosticsResult {
  readonly ok: boolean;
  readonly status: number;
}

export async function reportDiagnostics(
  reports: readonly DiagnosticReport[],
): Promise<ReportDiagnosticsResult> {
  const payload = reports.map((r) => JSON.parse(buildHardwareDiagAuditPayload(r)) as unknown);
  let response: Response;
  try {
    response = await fetch('/api/hardware/diagnostics', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reports: payload }),
    });
  } catch {
    return { ok: false, status: 0 };
  }
  return { ok: response.ok, status: response.status };
}
