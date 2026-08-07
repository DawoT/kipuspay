/**
 * printRouter — resolve paper/line width desde pos_terminals (§5.3 / S25).
 */
import type { D1DatabaseLike } from './index.js';

export interface PosTerminalConfig {
  readonly terminalId: string;
  readonly paperWidthMm: 58 | 80;
  readonly lineWidth: 32 | 48;
  readonly printerStrategy: string;
}

function lineWidthForPaper(mm: 58 | 80): 32 | 48 {
  return mm === 80 ? 48 : 32;
}

export async function resolvePosTerminalConfig(
  db: D1DatabaseLike,
  tenantId: string,
  branchId: string,
  terminalId?: string | null,
): Promise<PosTerminalConfig | null> {
  if (terminalId?.trim()) {
    const row = await db
      .prepare(
        `SELECT id, paper_width_mm, line_width, printer_strategy FROM pos_terminals
         WHERE tenant_id = ? AND branch_id = ? AND id = ? AND active = 1 LIMIT 1`,
      )
      .bind(tenantId, branchId, terminalId)
      .first<{
        id: string;
        paper_width_mm: number;
        line_width: number;
        printer_strategy: string;
      }>();
    if (row) return normalizeTerminal(row);
  }
  const fallback = await db
    .prepare(
      `SELECT id, paper_width_mm, line_width, printer_strategy FROM pos_terminals
       WHERE tenant_id = ? AND branch_id = ? AND active = 1
       ORDER BY created_at ASC LIMIT 1`,
    )
    .bind(tenantId, branchId)
    .first<{
      id: string;
      paper_width_mm: number;
      line_width: number;
      printer_strategy: string;
    }>();
  return fallback ? normalizeTerminal(fallback) : null;
}

function normalizeTerminal(row: {
  id: string;
  paper_width_mm: number;
  line_width: number;
  printer_strategy: string;
}): PosTerminalConfig {
  const paperWidthMm: 58 | 80 = row.paper_width_mm === 80 ? 80 : 58;
  return {
    terminalId: row.id,
    paperWidthMm,
    lineWidth: lineWidthForPaper(paperWidthMm),
    printerStrategy: row.printer_strategy,
  };
}
