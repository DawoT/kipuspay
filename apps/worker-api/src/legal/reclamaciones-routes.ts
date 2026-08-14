/**
 * Libro de reclamaciones virtual (Ley 29571) — persistencia D1 + acuse con número de caso.
 */
import type { WorkerEnv } from '../auth/control-plane.js';

const DOCUMENT_TYPES = new Set(['DNI', 'CE', 'RUC', 'PAS']);
const CLAIM_KINDS = new Set(['reclamo', 'queja']);

export interface ReclamacionInput {
  readonly claimantName: string;
  readonly documentType: string;
  readonly documentNumber: string;
  readonly email: string;
  readonly phone?: string;
  readonly claimKind: string;
  readonly detail: string;
}

export function buildReclamacionCaseNumber(now: Date, entropy: string): string {
  const y = String(now.getUTCFullYear());
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const suffix = entropy.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase();
  return `REC-${y}${m}${d}-${suffix}`;
}

export function parseReclamacionBody(raw: unknown): ReclamacionInput | { error: string; code: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: 'Invalid JSON', code: 'BAD_REQUEST' };
  }
  const o = raw as Record<string, unknown>;
  const claimantName = typeof o.claimantName === 'string' ? o.claimantName.trim() : '';
  const documentType = typeof o.documentType === 'string' ? o.documentType.trim().toUpperCase() : '';
  const documentNumber = typeof o.documentNumber === 'string' ? o.documentNumber.trim() : '';
  const email = typeof o.email === 'string' ? o.email.trim() : '';
  const phone = typeof o.phone === 'string' ? o.phone.trim() : '';
  const claimKind = typeof o.claimKind === 'string' ? o.claimKind.trim().toLowerCase() : '';
  const detail = typeof o.detail === 'string' ? o.detail.trim() : '';
  if (!claimantName || !documentNumber || !email || !detail) {
    return { error: 'Campos requeridos incompletos', code: 'INVALID' };
  }
  if (!DOCUMENT_TYPES.has(documentType)) {
    return { error: 'Tipo de documento inválido', code: 'INVALID_DOCUMENT' };
  }
  if (!CLAIM_KINDS.has(claimKind)) {
    return { error: 'Tipo de reclamo inválido', code: 'INVALID_KIND' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Correo inválido', code: 'INVALID_EMAIL' };
  }
  return {
    claimantName,
    documentType,
    documentNumber,
    email,
    ...(phone ? { phone } : {}),
    claimKind,
    detail,
  };
}

export async function runCreateReclamacionHttp(
  env: WorkerEnv | undefined,
  raw: unknown,
  now: Date = new Date(),
): Promise<{ status: number; body: Record<string, unknown> }> {
  const parsed = parseReclamacionBody(raw);
  if ('error' in parsed) {
    return { status: 422, body: parsed };
  }
  if (!env?.DB) {
    return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
  }
  const id = crypto.randomUUID();
  const caseNumber = buildReclamacionCaseNumber(now, id);
  const db = env.DB as {
    prepare(sql: string): {
      bind(...params: unknown[]): { run(): Promise<unknown> };
    };
  };
  try {
    await db
      .prepare(
        `INSERT INTO platform_reclamaciones (
           id, case_number, claimant_name, document_type, document_number,
           email, phone, claim_kind, detail, status, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
      )
      .bind(
        id,
        caseNumber,
        parsed.claimantName,
        parsed.documentType,
        parsed.documentNumber,
        parsed.email,
        parsed.phone ?? null,
        parsed.claimKind,
        parsed.detail,
        now.toISOString(),
      )
      .run();
  } catch {
    return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
  }
  return {
    status: 201,
    body: {
      caseNumber,
      receivedAt: now.toISOString(),
      message: 'Reclamo registrado. Conserva el número de caso como acuse. La constancia por correo está en preparación.',
    },
  };
}

function staffAuthorized(env: WorkerEnv | undefined, header: string | undefined): boolean {
  const expected = env?.PLATFORM_STAFF_TOKEN?.trim() ?? '';
  const provided = (header ?? '').trim();
  if (!expected || !provided || expected.length !== provided.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return diff === 0;
}

export async function runListReclamacionesHttp(
  env: WorkerEnv | undefined,
  staffToken: string | undefined,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!env?.PLATFORM_STAFF_TOKEN?.trim()) {
    return { status: 503, body: { error: 'Staff auth unavailable', code: 'STAFF_UNAVAILABLE' } };
  }
  if (!staffAuthorized(env, staffToken)) {
    return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  }
  if (!env.DB) {
    return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
  }
  try {
    const rows = await env.DB.prepare(
      `SELECT id, case_number, claimant_name, document_type, document_number, email,
              phone, claim_kind, detail, status, created_at, responded_at
         FROM platform_reclamaciones
        ORDER BY created_at DESC`,
    ).all();
    return { status: 200, body: { items: rows.results ?? [] } };
  } catch {
    return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
  }
}

export async function runRespondReclamacionHttp(
  env: WorkerEnv | undefined,
  staffToken: string | undefined,
  raw: unknown,
  now: Date = new Date(),
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!env?.PLATFORM_STAFF_TOKEN?.trim()) {
    return { status: 503, body: { error: 'Staff auth unavailable', code: 'STAFF_UNAVAILABLE' } };
  }
  if (!staffAuthorized(env, staffToken)) {
    return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  }
  if (!env.DB) {
    return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { status: 400, body: { error: 'Invalid JSON', code: 'BAD_REQUEST' } };
  }
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' ? o.id.trim() : '';
  const responseText = typeof o.responseText === 'string' ? o.responseText.trim() : '';
  if (!id || !responseText) {
    return { status: 422, body: { error: 'Campos requeridos incompletos', code: 'INVALID' } };
  }
  try {
    const updated = await env.DB.prepare(
      `UPDATE platform_reclamaciones
          SET status = 'responded', responded_at = ?, response_text = ?
        WHERE id = ? AND status = 'open'`,
    )
      .bind(now.toISOString(), responseText, id)
      .run();
    if ((updated.meta?.changes ?? 0) !== 1) {
      return { status: 404, body: { error: 'Not found', code: 'NOT_FOUND' } };
    }
    return { status: 200, body: { id, status: 'responded', respondedAt: now.toISOString() } };
  } catch {
    return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
  }
}
