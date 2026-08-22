/**
 * US-03 — Canal de idempotencia-key para inventory-ops (reenvío exactamente-una-vez).
 *
 * La PRIMERA ejecución 2xx de un endpoint con una `idempotencyKey` dada queda
 * registrada en `inventory_ops_idempotency` (UNIQUE tenant+scope+key) junto a su
 * respuesta exacta; todo REENVÍO con la misma key y el mismo payload devuelve ESA
 * respuesta sin re-ejecutar efectos (exactamente-una-vez). La misma key con un
 * payload distinto es 409 `idempotency_mismatch` (convención US-02 de
 * payment_captures). Sin key el canal es transparente: clientes legacy conservan
 * el comportamiento actual.
 *
 * Contrato fail-closed: si el SELECT del canal falla (DB caída) se responde 503
 * DB_UNAVAILABLE en vez de ejecutar a ciegas — sin canal no hay exactly-once
 * verificable. El registro post-ejecución es best-effort: el efecto YA ocurrió y
 * convertirlo en error provocaría reenvíos que re-aplicarían.
 */
import type { D1DatabaseLike } from '@kipuspay/adapters-d1';

/** Estructuralmente compatible con HttpResult de los run*Http. */
export interface IdempotentResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

export const IDEMPOTENCY_MISMATCH_STATUS = 409;

/** Scopes del canal inventory-ops: uno por endpoint mutante. */
export const INVENTORY_OPS_SCOPES = {
  countCreate: 'inventory-ops:count-create',
  countReview: 'inventory-ops:count-review',
  countApprove: 'inventory-ops:count-approve',
  lossCreate: 'inventory-ops:loss-create',
  lossApprove: 'inventory-ops:loss-approve',
  lossReject: 'inventory-ops:loss-reject',
} as const;

const SELECT_SQL = `SELECT request_hash, response_status, response_body_json FROM inventory_ops_idempotency
    WHERE tenant_id = ? AND scope = ? AND idempotency_key = ? LIMIT 1`;

const INSERT_SQL = `INSERT INTO inventory_ops_idempotency (
       id, tenant_id, scope, idempotency_key, request_hash,
       response_status, response_body_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`;

/**
 * JSON canónico (claves ordenadas, sin claves undefined): la huella del payload
 * no depende del orden de claves del cliente ni de campos undefined.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value) ?? 'null';
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((key) => obj[key] !== undefined)
    .sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(',')}}`;
}

/** SHA-256 hex vía Web Crypto (Workers y vitest/Node comparten crypto.subtle). */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export interface IdempotencyGate {
  /** Respuesta a devolver SIN ejecutar (replay o mismatch), o null si corresponde ejecutar. */
  readonly replay: IdempotentResult | null;
  /** Registra la respuesta del primer uso (solo 2xx; best-effort, nunca lanza). */
  record(result: IdempotentResult): Promise<void>;
}

const PASSTHROUGH_GATE: IdempotencyGate = { replay: null, record: async () => {} };

function staticGate(result: IdempotentResult): IdempotencyGate {
  return { replay: result, record: async () => {} };
}

interface StoredReplayRow {
  readonly request_hash: string;
  readonly response_status: number;
  readonly response_body_json: string;
}

/**
 * Abre el canal para UNA request de inventory-ops. Orden de evaluación en el
 * runner: authz + validación de parámetros ANTES del gate (un replay jamás sirve
 * una respuesta admin cacheada a un rol menor, ni memoriza un 400/403/422 —
 * esos no se cachean y el cliente puede corregir y reintentar con la misma key).
 */
export async function openIdempotencyGate(
  db: D1DatabaseLike,
  tenantId: string,
  scope: string,
  idempotencyKey: string,
  payload: unknown,
): Promise<IdempotencyGate> {
  const key = idempotencyKey.trim();
  if (!key || !tenantId) return PASSTHROUGH_GATE;

  let stored: StoredReplayRow | null;
  try {
    stored = await db.prepare(SELECT_SQL).bind(tenantId, scope, key).first<StoredReplayRow>();
  } catch {
    // Fail-closed: infraestructura caída → 503 estable, jamás ejecución a ciegas.
    return staticGate({
      status: 503,
      body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' },
    });
  }

  if (stored) {
    const requestHash = await sha256Hex(stableStringify(payload));
    if (stored.request_hash !== requestHash) {
      // Misma key + payload distinto: error de cliente (convención US-02),
      // nunca un replay silencioso de una fila ajena.
      return staticGate({
        status: IDEMPOTENCY_MISMATCH_STATUS,
        body: { error: 'idempotency_mismatch', code: 'idempotency_mismatch' },
      });
    }
    try {
      const body = JSON.parse(stored.response_body_json) as Record<string, unknown>;
      return staticGate({ status: stored.response_status, body });
    } catch {
      // Fila corrupta imposible en operación normal: 500 estable, sin SQL crudo.
      return staticGate({
        status: 500,
        body: { error: 'IDEMPOTENCY_STATE_INVALID', code: 'IDEMPOTENCY_STATE_INVALID' },
      });
    }
  }

  const requestHash = await sha256Hex(stableStringify(payload));
  return {
    replay: null,
    record: async (result) => {
      if (result.status < 200 || result.status > 299) return;
      try {
        await db
          .prepare(INSERT_SQL)
          .bind(
            crypto.randomUUID(),
            tenantId,
            scope,
            key,
            requestHash,
            result.status,
            stableStringify(result.body),
          )
          .run();
      } catch {
        // Best-effort: el efecto YA ocurrió; fallar aquí convertiría un 2xx real
        // en retry del cliente y re-aplicaría efectos. En carrera UNIQUE gana la
        // fila del otro request y el próximo replay-probe la resuelve.
        return;
      }
    },
  };
}
