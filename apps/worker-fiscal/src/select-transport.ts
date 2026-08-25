/**
 * Selección del FiscalTransport (ADR-FISCAL-002 / ADR-FISCAL-007).
 * TENANT_CERT + SOL → billService SOAP; si no, PSE HTTP o MISCONFIGURED.
 * `FISCAL_PSE_ENDPOINT_URL` de staging no se usa cuando hay SOL.
 *
 * Canal dual (FL-2): `SUNAT_BILL_CHANNEL` = staging (default, e-beta) |
 * production. Producción es emisión directa por negocio: exige plugins on +
 * credenciales SOL propias + URL oficial exacta (allowlist). Cualquier
 * prerrequisito ausente → SunatChannelError ANTES de encolar o enviar;
 * jamás fallback a PSE tercero ni a mock.
 *
 * Routing SOL por tenant: con `loadTenantSol` inyectado, cada submit resuelve
 * las credenciales SOL DEL TENANT (tenant_sol_credentials, envelope KMS);
 * sin fila → fallback al env del worker (comportamiento previo intacto);
 * credencial corrupta → TenantSolChannelError (jamás emitir con el SOL de
 * otro emisor). El kill-switch global (plugins off) sigue siendo mock puro.
 */
import {
  createHttpPseTransport,
  createMisconfiguredFiscalTransport,
  createMockPseTransport,
  createSunatBillTransport,
  parseSunatBillChannel,
  resolveSunatBillEndpoint,
  SunatChannelError,
  type FiscalTransport,
  type SunatBillChannel,
} from '@kipuspay/adapters-sunat';

export interface FiscalTransportSelectEnv {
  readonly FEATURE_FISCAL_TRANSPORT_PLUGINS?: string;
  readonly FISCAL_PSE_ENDPOINT_URL?: string;
  readonly FISCAL_PSE_FETCH?: typeof fetch;
  readonly SUNAT_SOL_USER?: string;
  readonly SUNAT_SOL_PASSWORD?: string;
  readonly SUNAT_BILL_ENDPOINT_URL?: string;
  readonly SUNAT_BILL_CHANNEL?: string;
}

/** Credenciales SOL desenvelopadas de un tenant (puerto adapters-d1). */
export interface TenantSolCredentials {
  readonly user: string;
  readonly password: string;
}

/**
 * Loader de credenciales SOL por tenant. Contrato:
 * - fila ausente → null (fallback legítimo al env);
 * - material corrupto/KMS falla → reject (NUNCA null: evitaría mezclar emisores).
 */
export type TenantSolCredentialsLoader = (tenantId: string) => Promise<TenantSolCredentials | null>;

/** Error de canal por credenciales SOL de tenant inservibles (fail-closed visible). */
export class TenantSolChannelError extends Error {
  readonly code = 'TENANT_SOL_UNAVAILABLE' as const;
  readonly tenantId: string;

  constructor(tenantId: string, cause?: unknown) {
    super(
      `TENANT_SOL_UNAVAILABLE: credenciales SOL del tenant ${tenantId} no utilizables`,
      ...(cause !== undefined ? [{ cause }] : []),
    );
    this.name = 'TenantSolChannelError';
    this.tenantId = tenantId;
  }
}

/** FiscalTransport con resolución de transporte por tenant (drain multi-tenant). */
export interface TenantSolRoutingTransport extends FiscalTransport {
  resolveForTenant(tenantId: string): Promise<FiscalTransport>;
}

export function isTenantSolRoutingTransport(
  transport: FiscalTransport,
): transport is TenantSolRoutingTransport {
  return 'resolveForTenant' in transport;
}

export function isFiscalTransportPluginsEnabled(env: FiscalTransportSelectEnv): boolean {
  return (
    env.FEATURE_FISCAL_TRANSPORT_PLUGINS === '1' || env.FEATURE_FISCAL_TRANSPORT_PLUGINS === 'true'
  );
}

export function hasSunatSolCredentials(env: FiscalTransportSelectEnv): boolean {
  return Boolean(env.SUNAT_SOL_USER?.trim() && env.SUNAT_SOL_PASSWORD);
}

/**
 * Homologación/sandbox PSE acreditado: HTTPS y hostname que no sea `.invalid`.
 * Staging usa `.invalid` a propósito (fail-closed). No cambia el transporte:
 * un URL placeholder sigue yendo por HTTP para que el submit falle, no por mock.
 */
export function isAccreditedPseEndpoint(url: string | undefined): boolean {
  const raw = url?.trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' && !parsed.hostname.endsWith('.invalid');
  } catch {
    return false;
  }
}

function fetchImplOf(env: FiscalTransportSelectEnv): typeof fetch | undefined {
  return env.FISCAL_PSE_FETCH;
}

/**
 * Canal producción (FL-2): emisión directa por negocio. Exige plugins on +
 * credenciales SOL propias + URL oficial exacta (allowlist); cualquier
 * prerrequisito ausente → SunatChannelError antes de encolar o enviar.
 */
function selectProductionBillTransport(env: FiscalTransportSelectEnv): FiscalTransport {
  if (!isFiscalTransportPluginsEnabled(env)) {
    throw new SunatChannelError(
      'SUNAT_PRODUCTION_PLUGINS_OFF',
      'FEATURE_FISCAL_TRANSPORT_PLUGINS off no puede operar canal production (seria mock)',
    );
  }
  const solUser = env.SUNAT_SOL_USER?.trim();
  const solPassword = env.SUNAT_SOL_PASSWORD;
  if (!solUser || !solPassword) {
    throw new SunatChannelError(
      'SUNAT_PRODUCTION_SOL_MISSING',
      'canal production exige SUNAT_SOL_USER/SUNAT_SOL_PASSWORD del RUC emisor',
    );
  }
  const { endpointUrl } = resolveSunatBillEndpoint({
    channel: 'production',
    endpointUrl: env.SUNAT_BILL_ENDPOINT_URL,
  });
  const fetchImpl = fetchImplOf(env);
  return createSunatBillTransport({
    solUser,
    solPassword,
    endpointUrl,
    channel: 'production',
    ...(fetchImpl ? { fetchImpl } : {}),
  });
}

/** Selección staging histórica: bill beta con env SOL | PSE HTTP | MISCONFIGURED. */
function selectStagingBaseTransport(env: FiscalTransportSelectEnv): FiscalTransport {
  const solUser = env.SUNAT_SOL_USER?.trim();
  const solPassword = env.SUNAT_SOL_PASSWORD;
  if (solUser && solPassword) {
    const billUrl = env.SUNAT_BILL_ENDPOINT_URL?.trim();
    const fetchImpl = fetchImplOf(env);
    return createSunatBillTransport({
      solUser,
      solPassword,
      ...(billUrl ? { endpointUrl: billUrl } : {}),
      ...(fetchImpl ? { fetchImpl } : {}),
    });
  }
  const endpoint = env.FISCAL_PSE_ENDPOINT_URL?.trim();
  if (endpoint) {
    const fetchImpl = fetchImplOf(env);
    return createHttpPseTransport({
      endpointUrl: endpoint,
      ...(fetchImpl ? { fetchImpl } : {}),
    });
  }
  return createMisconfiguredFiscalTransport();
}

/**
 * Wrapper de routing: resuelve el transporte REAL por tenant con caché por
 * invocación (un drain de N filas del mismo tenant desenvelopa 1 vez).
 */
function createTenantSolRoutingTransport(input: {
  readonly env: FiscalTransportSelectEnv;
  readonly channel: SunatBillChannel;
  /** Fallback del env para tenants sin fila (staging); en producción puede ser null. */
  readonly baseTransport: FiscalTransport | null;
  readonly loadTenantSol: TenantSolCredentialsLoader;
}): TenantSolRoutingTransport {
  const transports = new Map<string, Promise<FiscalTransport>>();

  const resolveForTenant = (tenantId: string): Promise<FiscalTransport> => {
    const cached = transports.get(tenantId);
    if (cached) return cached;
    const resolved = (async (): Promise<FiscalTransport> => {
      let creds: TenantSolCredentials | null;
      try {
        creds = await input.loadTenantSol(tenantId);
      } catch (err) {
        // Material corrupto ≠ sin fila: jamás degradar al SOL de otro emisor.
        console.error(`TENANT_SOL_LOAD_FAILED tenant=${tenantId}`, err);
        throw new TenantSolChannelError(tenantId, err);
      }
      if (!creds) {
        if (input.channel === 'production') {
          if (input.baseTransport) return input.baseTransport;
          throw new SunatChannelError(
            'SUNAT_PRODUCTION_SOL_MISSING',
            `canal production sin SOL para tenant ${tenantId} ni en el worker`,
          );
        }
        return input.baseTransport ?? createMisconfiguredFiscalTransport();
      }
      const { endpointUrl } = resolveSunatBillEndpoint({
        channel: input.channel,
        endpointUrl: input.env.SUNAT_BILL_ENDPOINT_URL,
      });
      const fetchImpl = fetchImplOf(input.env);
      return createSunatBillTransport({
        solUser: creds.user,
        solPassword: creds.password,
        endpointUrl,
        channel: input.channel,
        ...(fetchImpl ? { fetchImpl } : {}),
      });
    })();
    transports.set(tenantId, resolved);
    return resolved;
  };

  return {
    get mode(): FiscalTransport['mode'] {
      return input.channel === 'production'
        ? (input.baseTransport?.mode ?? 'sunat_bill_production')
        : (input.baseTransport?.mode ?? 'MISCONFIGURED');
    },
    async submit(request) {
      const transport = await resolveForTenant(request.tenantId);
      return transport.submit(request);
    },
    queryCdr(ticketId) {
      // La consulta por ticket es de canal: el getStatus real ocurre dentro del
      // transport que emitió (sunat-bill-transport), este puerto es best-effort.
      return (input.baseTransport ?? createMisconfiguredFiscalTransport()).queryCdr(ticketId);
    },
    resolveForTenant,
  };
}

export interface SelectFiscalTransportOptions {
  /** Routing SOL por tenant (adapters-d1 loadTenantSolCredentials vía bindings). */
  readonly loadTenantSol?: TenantSolCredentialsLoader | undefined;
}

/**
 * Flag off → MOCK_STAGING.
 * Canal production → SOAP billService directo (ver selectProductionBillTransport);
 *   con routing por tenant la validación SOL pasa a ser lazy por emisor.
 * Flag on + SOL user/password (staging) → SOAP billService (beta por defecto).
 * Flag on + solo endpoint PSE → HTTP JSON del PSE KipusPay.
 * Flag on sin SOL ni endpoint → MISCONFIGURED (unreachable, nunca ACCEPTED).
 * Con `loadTenantSol`, cada submit usa la SOL del TENANT; sin fila → env.
 */
export function selectFiscalTransport(
  env: FiscalTransportSelectEnv,
  options?: SelectFiscalTransportOptions,
): FiscalTransport {
  const channel = parseSunatBillChannel(env.SUNAT_BILL_CHANNEL);
  const loader = options?.loadTenantSol;
  if (channel === 'production') {
    if (!isFiscalTransportPluginsEnabled(env)) {
      throw new SunatChannelError(
        'SUNAT_PRODUCTION_PLUGINS_OFF',
        'FEATURE_FISCAL_TRANSPORT_PLUGINS off no puede operar canal production (seria mock)',
      );
    }
    if (loader) {
      const base = hasSunatSolCredentials(env) ? selectProductionBillTransport(env) : null;
      return createTenantSolRoutingTransport({
        env,
        channel,
        baseTransport: base,
        loadTenantSol: loader,
      });
    }
    return selectProductionBillTransport(env);
  }
  if (!isFiscalTransportPluginsEnabled(env)) {
    return createMockPseTransport();
  }
  const base = selectStagingBaseTransport(env);
  if (loader) {
    return createTenantSolRoutingTransport({
      env,
      channel,
      baseTransport: base,
      loadTenantSol: loader,
    });
  }
  return base;
}
