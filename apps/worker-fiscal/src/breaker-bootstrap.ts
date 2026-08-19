/**
 * Bootstrap del breaker en arranque en frío (Sello QA Batch I). Extraído a su
 * propio módulo para que FiscalService (fiscal-service.ts) y el worker (index.ts)
 * lo compartan sin ciclo de imports.
 */
import {
  BREAKER_KV_TTL_SECONDS,
  breakerDoName,
  initialBreakerSnapshot,
  type BreakerSnapshot,
  type FiscalEndpoint,
} from '@kipuspay/domain-fiscal-pe';
import {
  readBreakerOpen,
  seedIsolateClosed,
  writeBreakerOpenToKv,
  type BreakerKvLike,
} from './breaker-read-cache.js';

interface BootstrapEnv {
  readonly FISCAL_BREAKER_KV?: BreakerKvLike;
  readonly FISCAL_CIRCUIT_BREAKER_DO?: {
    idFromName(name: string): unknown;
    get(id: unknown): { fetch(input: RequestInfo, init?: RequestInit): Promise<Response> };
  };
}

/**
 * Bootstrap del breaker en arranque en frío (Sello QA Batch I): cuando el KV
 * aún no tiene la clave (entorno nuevo sin histórico), B8 la lee como OPEN
 * (fail-closed). El DO nace CLOSED — el submit nunca lo muta, así que sin
 * bootstrap el canal quedaría 503 permanentemente. Aquí, SOLO en el estado
 * frío (clave ausente), se consulta el DO /status (lectura, no hot path) y si
 * está closed se persiste '0' (cache) y se continúa; si está open o el DO no
 * responde, se mantiene el 503 fail-closed (invariante 5).
 */
export async function bootstrapBreakerCold(
  env: BootstrapEnv,
  transport: string,
  endpoint: FiscalEndpoint,
): Promise<boolean> {
  const kv = env.FISCAL_BREAKER_KV;
  const doBinding = env.FISCAL_CIRCUIT_BREAKER_DO;
  if (!kv || !doBinding) return false;
  const key = breakerDoName(transport, endpoint);
  const raw = await kv.get(key);
  if (raw !== null) return false;
  try {
    const stub = doBinding.get(doBinding.idFromName(key));
    const res = await stub.fetch(
      `https://do/status?transport=${encodeURIComponent(transport)}&endpoint=${endpoint}`,
    );
    const parsed: Partial<BreakerSnapshot> = await res.json();
    const snap: BreakerSnapshot = { ...initialBreakerSnapshot(), ...parsed };
    if (snap.state === 'open') return false;
    await writeBreakerOpenToKv(kv, transport, endpoint, snap, BREAKER_KV_TTL_SECONDS);
    seedIsolateClosed(transport, endpoint, Date.now());
    return true;
  } catch {
    return false;
  }
}

/** Fail-closed: si la clave existe y dice '0', closed; si no, open. */
export async function isBreakerCacheClosed(kv: BreakerKvLike | null): Promise<boolean> {
  const open = await readBreakerOpen(kv, 'KIPUSPAY_PSE_DIRECT', 'submit');
  return !open;
}
