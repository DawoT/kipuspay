/**
 * Contexto de tenant en POS (Sprint 11) — query/onboarding o default fail-closed
 * (tenantId ''; nunca un valor demo enviado al servidor).
 */

export type FormalizationMode = 'INTERNAL_CONTROL' | 'FORMALIZING' | 'ELECTRONIC_ISSUER';

export type TaxRegime = 'UNKNOWN' | 'NRUS' | 'RER' | 'RMT' | 'RG';

export const TENANT_SESSION_KEY = 'kipuspay.pos.tenant.v1';

export interface PosTenantSession {
  readonly tenantId: string;
  readonly tradeName: string;
  readonly formalizationMode: FormalizationMode;
  /** Régimen tributario SUNAT del tenant (NRUS/RER/RMT/RG). Fuente de verdad para selector fiscal. */
  readonly taxRegime: TaxRegime;
  readonly verticalType: string;
  readonly onboardingStartedAtIso: string | null;
  readonly firstSaleAtIso: string | null;
  /** ADR-0009: default on; opt-out en Admin. */
  readonly brandQrEnabled: boolean;
  readonly referralCode: string | null;
}

const MODES: readonly FormalizationMode[] = [
  'INTERNAL_CONTROL',
  'FORMALIZING',
  'ELECTRONIC_ISSUER',
];

const REGIMES: readonly TaxRegime[] = ['UNKNOWN', 'NRUS', 'RER', 'RMT', 'RG'];

function isMode(v: string | null): v is FormalizationMode {
  return !!v && (MODES as readonly string[]).includes(v);
}

function isTaxRegime(v: string | null): v is TaxRegime {
  return !!v && (REGIMES as readonly string[]).includes(v);
}

export function normalizeTaxRegime(v: unknown): TaxRegime {
  return typeof v === 'string' && isTaxRegime(v) ? v : 'UNKNOWN';
}

export function defaultTenantSession(): PosTenantSession {
  return {
    tenantId: '',
    tradeName: 'Mi Tienda',
    formalizationMode: 'INTERNAL_CONTROL',
    taxRegime: 'UNKNOWN',
    verticalType: 'retail',
    onboardingStartedAtIso: null,
    firstSaleAtIso: null,
    brandQrEnabled: true,
    referralCode: null,
  };
}

export function tenantFromSearchParams(params: URLSearchParams): PosTenantSession | null {
  if (params.get('onboarding') !== '1') return null;
  const mode = params.get('mode');
  if (!isMode(mode)) return null;
  const rawRegime = params.get('taxRegime') ?? params.get('regime') ?? params.get('r');
  return {
    tenantId: params.get('tenant') ?? '',
    tradeName: params.get('name') || 'Mi negocio',
    formalizationMode: mode,
    taxRegime: isTaxRegime(rawRegime) ? rawRegime : 'UNKNOWN',
    verticalType: params.get('vertical') || 'retail',
    onboardingStartedAtIso: new Date().toISOString(),
    firstSaleAtIso: null,
    brandQrEnabled: true,
    referralCode: null,
  };
}

export function readTenantSession(storage: Storage): PosTenantSession {
  const raw = storage.getItem(TENANT_SESSION_KEY);
  if (!raw) return defaultTenantSession();
  try {
    const parsed = JSON.parse(raw) as Partial<PosTenantSession>;
    return {
      ...defaultTenantSession(),
      ...parsed,
      taxRegime: normalizeTaxRegime((parsed as Record<string, unknown>).taxRegime),
    };
  } catch {
    return defaultTenantSession();
  }
}

export function writeTenantSession(storage: Storage, session: PosTenantSession): void {
  storage.setItem(TENANT_SESSION_KEY, JSON.stringify(session));
}

export function markTenantFirstSale(
  session: PosTenantSession,
  atIso = new Date().toISOString(),
): PosTenantSession {
  return { ...session, firstSaleAtIso: atIso };
}

export function ttfsMs(session: PosTenantSession): number | null {
  if (!session.onboardingStartedAtIso || !session.firstSaleAtIso) return null;
  return Date.parse(session.firstSaleAtIso) - Date.parse(session.onboardingStartedAtIso);
}
