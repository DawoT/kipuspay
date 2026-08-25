/**
 * Rutas fiscal RC: void boleta, alertas Dueño, portal CPE, cron RC/plazos.
 */
import {
  createHttpRcCdrPort,
  createSunatRcCdrPort,
  parseSunatBillChannel,
  resolveSunatBillEndpoint,
  SunatChannelError,
} from '@kipuspay/adapters-sunat';
import {
  buildDailySummary,
  createTenantCertSigner,
  processFiscalDeadlines,
  runDailySummarySweep,
  voidBoletaAtomic,
  type D1DatabaseLike,
} from '@kipuspay/adapters-d1';
import {
  createMockRcCdrPort,
  mintPortalToken,
  renderCpePortalHtml,
  summaryDateLima,
  type RcCdrPort,
} from '@kipuspay/domain-fiscal-pe';
import type { WorkerEnv } from '../auth/control-plane.js';

export function isFiscalRcEnabled(env: WorkerEnv): boolean {
  return env.FEATURE_FISCAL_RC === '1';
}

export function isCpePortalEnabled(env: WorkerEnv): boolean {
  return env.FEATURE_CPE_PORTAL === '1';
}

/** Puerto RC fail-closed: rechazo 503 tipado, nunca ACCEPTED sin CDR real. */
function failClosedRcPort(cdrMessage: string): RcCdrPort {
  return {
    submit: () => Promise.resolve({ accepted: false, cdrCode: '503', cdrMessage }),
  };
}

/**
 * Rama producción (FL-2): emisión directa exige plugins + SOL propia + URL
 * oficial exacta; sin ellos, puerto fail-closed 503 tipado (nunca mock).
 */
function buildProductionRcCdrPort(env: WorkerEnv): RcCdrPort {
  if (env.FEATURE_FISCAL_TRANSPORT_PLUGINS !== '1') {
    return failClosedRcPort('SUNAT_PRODUCTION_PLUGINS_OFF');
  }
  const solUser = env.SUNAT_SOL_USER?.trim();
  if (!solUser || !env.SUNAT_SOL_PASSWORD) {
    return failClosedRcPort('SUNAT_PRODUCTION_SOL_MISSING');
  }
  try {
    const { endpointUrl } = resolveSunatBillEndpoint({
      channel: 'production',
      endpointUrl: env.SUNAT_BILL_ENDPOINT_URL,
    });
    return createSunatRcCdrPort({
      solUser,
      solPassword: env.SUNAT_SOL_PASSWORD,
      endpointUrl,
      channel: 'production',
      ...(env.FISCAL_PSE_FETCH ? { fetchImpl: env.FISCAL_PSE_FETCH } : {}),
    });
  } catch (err) {
    if (err instanceof SunatChannelError) return failClosedRcPort(err.code);
    throw err;
  }
}

/**
 * C6 / ADR-FISCAL-007: SOL + flag → sendSummary SOAP; si no, PSE HTTP JSON;
 * si no, mock staging. `.invalid` del PSE no se usa cuando hay SOL.
 *
 * Canal dual (FL-2): el canal production exige emisión directa (SOL propia +
 * URL oficial exacta). Sin SOL o con URL no oficial → puerto fail-closed 503
 * tipado; jamás fallback a PSE/mock/RPC en producción.
 */
export function buildRcCdrPort(env: WorkerEnv): RcCdrPort {
  if (parseSunatBillChannel(env.SUNAT_BILL_CHANNEL) === 'production') {
    return buildProductionRcCdrPort(env);
  }
  if (
    env.FEATURE_FISCAL_TRANSPORT_PLUGINS === '1' &&
    env.SUNAT_SOL_USER?.trim() &&
    env.SUNAT_SOL_PASSWORD
  ) {
    const billUrl = env.SUNAT_BILL_ENDPOINT_URL?.trim();
    return createSunatRcCdrPort({
      solUser: env.SUNAT_SOL_USER.trim(),
      solPassword: env.SUNAT_SOL_PASSWORD,
      ...(billUrl ? { endpointUrl: billUrl } : {}),
      ...(env.FISCAL_PSE_FETCH ? { fetchImpl: env.FISCAL_PSE_FETCH } : {}),
    });
  }
  const fiscal = env.FISCAL;
  if (fiscal?.submitRc) {
    const boundSubmitRc = fiscal.submitRc.bind(fiscal);
    return { submit: (input) => boundSubmitRc(input) };
  }
  const endpoint = env.FISCAL_PSE_ENDPOINT_URL?.trim();
  if (env.FEATURE_FISCAL_TRANSPORT_PLUGINS === '1' && endpoint) {
    return createHttpRcCdrPort({ endpointUrl: endpoint });
  }
  return createMockRcCdrPort();
}

function asD1(db: D1Database): D1DatabaseLike {
  return db;
}

async function readTenantCertEnvelope(env: WorkerEnv): Promise<string | null> {
  const binding = env.TENANT_CERT_ENVELOPE;
  if (!binding) return null;
  if (typeof binding === 'string') return binding;
  return binding.get();
}

function rcSigner(env: WorkerEnv) {
  if (!env.DB || !env.BACKUP_KMS) return undefined;
  const kms = env.BACKUP_KMS;
  return createTenantCertSigner({
    db: asD1(env.DB),
    kms: {
      unwrapDek: (input) => {
        if (!kms.unwrapDek) return Promise.reject(new Error('MISSING_KMS'));
        return kms.unwrapDek(input);
      },
    },
    secrets: { get: () => readTenantCertEnvelope(env) },
  });
}

/** Comparación de token portal (evita timing-attack lint; SHA-256 hex). */
function portalTokenMatches(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export async function runVoidBoletaHttp(
  env: WorkerEnv,
  tenantId: string,
  saleId: string,
  userId = 'system',
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!isFiscalRcEnabled(env)) {
    return { status: 404, body: { error: 'FEATURE_FISCAL_RC off', code: 'FEATURE_OFF' } };
  }
  if (!env.DB) {
    return { status: 503, body: { error: 'DB unavailable', code: 'DB_UNAVAILABLE' } };
  }
  try {
    const result = await voidBoletaAtomic(asD1(env.DB), tenantId, saleId, userId);
    return { status: 200, body: { ...result } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'VOID_FAILED';
    if (msg === 'VOID_AFTER_RC_SENT') {
      return { status: 422, body: { error: msg, code: msg } };
    }
    if (msg === 'SALE_NOT_FOUND') {
      return { status: 404, body: { error: msg, code: msg } };
    }
    return { status: 400, body: { error: msg, code: msg } };
  }
}

export async function runRcPendingBannerHttp(
  env: WorkerEnv,
  tenantId: string,
  nowMs: number = Date.now(),
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!isFiscalRcEnabled(env)) {
    return { status: 404, body: { error: 'FEATURE_FISCAL_RC off', code: 'FEATURE_OFF' } };
  }
  if (!env.DB) {
    return { status: 503, body: { error: 'DB unavailable', code: 'DB_UNAVAILABLE' } };
  }
  // F5b-5: boletas emitidas HOY (día Lima) aún sin RC — el banner Dueño
  // recuerda que "boletas del día sin RC ≠ cierre Z" (criterio Sprint 5b).
  const todayLima = summaryDateLima(nowMs);
  const pending = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM sales
     WHERE tenant_id = ? AND deleted_at IS NULL
       AND document_type IN ('03','12')
       AND sunat_status IN ('PENDING','PROCESSING')
       AND daily_summary_id IS NULL
       AND date(issued_at_lima) = ?`,
  )
    .bind(tenantId, todayLima)
    .first<{ n: number }>();
  const count = pending?.n ?? 0;
  return {
    status: 200,
    body: {
      summaryDate: todayLima,
      pendingRcTickets: count,
      banner: count > 0 ? 'boletas-del-dia-sin-rc' : 'ok',
    },
  };
}

export async function runOwnerAlertsHttp(
  env: WorkerEnv,
  tenantId: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!isFiscalRcEnabled(env)) {
    return { status: 404, body: { error: 'FEATURE_FISCAL_RC off', code: 'FEATURE_OFF' } };
  }
  if (!env.DB) {
    return { status: 503, body: { error: 'DB unavailable', code: 'DB_UNAVAILABLE' } };
  }
  const rows = await env.DB.prepare(
    `SELECT id, alert_kind, suggest_credit_note_ea, payload_json, created_at
     FROM fiscal_owner_alerts
     WHERE tenant_id = ?
     ORDER BY created_at DESC
     LIMIT 50`,
  )
    .bind(tenantId)
    .all<{
      id: string;
      alert_kind: string;
      suggest_credit_note_ea: number;
      payload_json: string;
      created_at: string;
    }>();
  return {
    status: 200,
    body: {
      alerts: (rows.results ?? []).map((r) => ({
        id: r.id,
        alertKind: r.alert_kind,
        suggestCreditNoteEa: r.suggest_credit_note_ea === 1,
        payload: JSON.parse(r.payload_json) as unknown,
        createdAt: r.created_at,
      })),
    },
  };
}

export async function runCpePortalHttp(
  env: WorkerEnv,
  tenantId: string,
  saleId: string,
  token: string,
  nowMs: number = Date.now(),
): Promise<{ status: number; body: Record<string, unknown> | string; contentType?: string }> {
  if (!isCpePortalEnabled(env)) {
    return { status: 404, body: { error: 'FEATURE_CPE_PORTAL off', code: 'FEATURE_OFF' } };
  }
  if (!env.DB) {
    return { status: 503, body: { error: 'DB unavailable', code: 'DB_UNAVAILABLE' } };
  }
  // F5b-6: fail-closed — sin CPE_PORTAL_SECRET configurado no hay portal.
  // Un fallback hardcodeado haría el token predecible (token de 1 año de vida).
  const secret = env.CPE_PORTAL_SECRET;
  if (!secret) {
    return {
      status: 503,
      body: { error: 'Portal secret not configured', code: 'PORTAL_UNAVAILABLE' },
    };
  }
  const expected = await mintPortalToken(tenantId, saleId, secret);
  if (!portalTokenMatches(token, expected)) {
    return { status: 401, body: { error: 'Invalid portal token', code: 'PORTAL_UNAUTHORIZED' } };
  }
  const sale = await env.DB.prepare(
    `SELECT id, document_type, series, number, total_amount_cents, issued_at_lima, sunat_xml_hash
     FROM sales WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
  )
    .bind(saleId, tenantId)
    .first<{
      id: string;
      document_type: string;
      series: string;
      number: number;
      total_amount_cents: number;
      issued_at_lima: string;
      sunat_xml_hash: string | null;
    }>();
  if (!sale) {
    return { status: 404, body: { error: 'CPE not found', code: 'NOT_FOUND' } };
  }
  try {
    const view = renderCpePortalHtml(
      {
        tenantId,
        saleId: sale.id,
        issuedAtMs: Date.parse(sale.issued_at_lima),
        xmlHash: sale.sunat_xml_hash,
        documentType: sale.document_type,
        series: sale.series,
        correlative: sale.number,
        totalAmountCents: sale.total_amount_cents,
      },
      nowMs,
    );
    return { status: 200, body: view.html, contentType: 'text/html; charset=utf-8' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'PORTAL_ERROR';
    return { status: 410, body: { error: msg, code: msg } };
  }
}

export async function runFiscalCronHttp(
  env: WorkerEnv,
  body: {
    readonly action: 'deadlines' | 'daily-summary' | 'daily-summary-sweep';
    readonly tenantId?: string;
    readonly summaryDate?: string;
    readonly nowMs?: number;
  },
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!isFiscalRcEnabled(env)) {
    return { status: 404, body: { error: 'FEATURE_FISCAL_RC off', code: 'FEATURE_OFF' } };
  }
  if (!env.DB) {
    return { status: 503, body: { error: 'DB unavailable', code: 'DB_UNAVAILABLE' } };
  }
  const db = asD1(env.DB);
  const nowMs = body.nowMs ?? Date.now();
  const signer = rcSigner(env);
  if (body.action === 'deadlines') {
    const result = await processFiscalDeadlines(
      db,
      nowMs,
      body.tenantId ? { tenantId: body.tenantId } : {},
    );
    return { status: 200, body: { ...result } };
  }
  if (body.action === 'daily-summary-sweep') {
    // F5b-1: cron diario — RC para todos los emisores con boletas del día.
    const summaryDate = body.summaryDate ?? summaryDateLima(nowMs);
    const result = await runDailySummarySweep(db, {
      summaryDate,
      nowMs,
      cdr: buildRcCdrPort(env),
      ...(signer ? { signer } : {}),
    });
    return { status: 200, body: { ...result } };
  }
  if (!body.tenantId || !body.summaryDate) {
    return {
      status: 400,
      body: { error: 'tenantId and summaryDate required', code: 'BAD_REQUEST' },
    };
  }
  const result = await buildDailySummary(db, {
    tenantId: body.tenantId,
    summaryDate: body.summaryDate,
    nowMs,
    cdr: buildRcCdrPort(env),
    ...(signer ? { signer } : {}),
  });
  return { status: 200, body: { ...result, limaHint: summaryDateLima(nowMs) } };
}
