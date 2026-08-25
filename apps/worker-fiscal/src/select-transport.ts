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
  const fetchImpl = env.FISCAL_PSE_FETCH;
  return createSunatBillTransport({
    solUser,
    solPassword,
    endpointUrl,
    channel: 'production',
    ...(fetchImpl ? { fetchImpl } : {}),
  });
}

/**
 * Flag off → MOCK_STAGING.
 * Canal production → SOAP billService directo (ver selectProductionBillTransport).
 * Flag on + SOL user/password (staging) → SOAP billService (beta por defecto).
 * Flag on + solo endpoint PSE → HTTP JSON del PSE KipusPay.
 * Flag on sin SOL ni endpoint → MISCONFIGURED (unreachable, nunca ACCEPTED).
 */
export function selectFiscalTransport(env: FiscalTransportSelectEnv): FiscalTransport {
  if (parseSunatBillChannel(env.SUNAT_BILL_CHANNEL) === 'production') {
    return selectProductionBillTransport(env);
  }
  const fetchImpl = env.FISCAL_PSE_FETCH;
  if (!isFiscalTransportPluginsEnabled(env)) {
    return createMockPseTransport();
  }
  const solUser = env.SUNAT_SOL_USER?.trim();
  const solPassword = env.SUNAT_SOL_PASSWORD;
  if (solUser && solPassword) {
    const billUrl = env.SUNAT_BILL_ENDPOINT_URL?.trim();
    return createSunatBillTransport({
      solUser,
      solPassword,
      ...(billUrl ? { endpointUrl: billUrl } : {}),
      ...(fetchImpl ? { fetchImpl } : {}),
    });
  }
  const endpoint = env.FISCAL_PSE_ENDPOINT_URL?.trim();
  if (endpoint) {
    return createHttpPseTransport({
      endpointUrl: endpoint,
      ...(fetchImpl ? { fetchImpl } : {}),
    });
  }
  return createMisconfiguredFiscalTransport();
}
