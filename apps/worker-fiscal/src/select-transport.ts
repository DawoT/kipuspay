/**
 * Selección del FiscalTransport (ADR-FISCAL-002 / ADR-FISCAL-007).
 * TENANT_CERT + SOL → billService SOAP; si no, PSE HTTP o mock.
 * `FISCAL_PSE_ENDPOINT_URL` de staging no se usa cuando hay SOL.
 */
import {
  createHttpPseTransport,
  createMockPseTransport,
  createSunatBillTransport,
  type FiscalTransport,
} from '@kipuspay/adapters-sunat';

export interface FiscalTransportSelectEnv {
  readonly FEATURE_FISCAL_TRANSPORT_PLUGINS?: string;
  readonly FISCAL_PSE_ENDPOINT_URL?: string;
  readonly FISCAL_PSE_FETCH?: typeof fetch;
  readonly SUNAT_SOL_USER?: string;
  readonly SUNAT_SOL_PASSWORD?: string;
  readonly SUNAT_BILL_ENDPOINT_URL?: string;
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
 * Flag off → MOCK_STAGING.
 * Flag on + SOL user/password → SOAP billService (beta por defecto).
 * Flag on + solo endpoint PSE → HTTP JSON del PSE KipusPay.
 * Flag on sin SOL ni endpoint → MOCK_STAGING (fail-closed de configuración).
 */
export function selectFiscalTransport(env: FiscalTransportSelectEnv): FiscalTransport {
  if (!isFiscalTransportPluginsEnabled(env)) {
    return createMockPseTransport();
  }
  const fetchImpl = env.FISCAL_PSE_FETCH;
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
  return createMockPseTransport();
}
