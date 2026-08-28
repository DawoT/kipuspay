/**
 * Contexto de tenant en POS (Sprint 11) — query/onboarding o default fail-closed
 * (tenantId ''; nunca un valor demo enviado al servidor).
 */

export type FormalizationMode = 'INTERNAL_CONTROL' | 'FORMALIZING' | 'ELECTRONIC_ISSUER';

export type TaxRegime = 'UNKNOWN' | 'NRUS' | 'RER' | 'RMT' | 'RG';

/**
 * Vertical del tenant (GTM). Fuente canónica: apps/marketing-web/src/lib/content/types.ts VerticalSlug
 * DRY: esta unión replica el catálogo canónico; VERTICAL_ALIAS_ES_TO_EN en domain-onboarding/tour.ts
 * mantiene el mapeo ES→EN mediante diccionario declarativo (ADR-ARCH-002).
 */
export type PosVertical =
  'restaurantes' | 'farmacias' | 'retail' | 'servicios' | 'cadenas' | 'grifos';

export const POS_VERTICALS: readonly PosVertical[] = [
  'restaurantes',
  'farmacias',
  'retail',
  'servicios',
  'cadenas',
  'grifos',
] as const;

export function isPosVertical(value: string): value is PosVertical {
  return (POS_VERTICALS as readonly string[]).includes(value);
}

export const TENANT_SESSION_KEY = 'kipuspay.pos.tenant.v1';

export interface PosTenantSession {
  readonly tenantId: string;
  readonly tradeName: string;
  readonly formalizationMode: FormalizationMode;
  /** Régimen tributario SUNAT del tenant (NRUS/RER/RMT/RG). Fuente de verdad para selector fiscal. */
  readonly taxRegime: TaxRegime;
  readonly verticalType: PosVertical;
  readonly onboardingStartedAtIso: string | null;
  readonly firstSaleAtIso: string | null;
  /** ADR-0009: default on; opt-out en Admin. */
  readonly brandQrEnabled: boolean;
  readonly referralCode: string | null;
  /** Ola 2 — capabilities dinámicas SaaS (ADR-ARCH-003): snapshot desde GET /api/auth/session */
  readonly capabilities: readonly string[];
  readonly capabilitiesEpoch: number;
  readonly capabilitiesFetchedAt: number | null;
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
    capabilities: [],
    capabilitiesEpoch: 0,
    capabilitiesFetchedAt: null,
  };
}

export function tenantFromSearchParams(params: URLSearchParams): PosTenantSession | null {
  if (params.get('onboarding') !== '1') return null;
  const mode = params.get('mode');
  if (!isMode(mode)) return null;
  const rawRegime = params.get('taxRegime') ?? params.get('regime') ?? params.get('r');
  const rawVertical = params.get('vertical') ?? 'retail';
  return {
    tenantId: params.get('tenant') ?? '',
    tradeName: params.get('name') || 'Mi negocio',
    formalizationMode: mode,
    taxRegime: isTaxRegime(rawRegime) ? rawRegime : 'UNKNOWN',
    verticalType: isPosVertical(rawVertical) ? rawVertical : 'retail',
    onboardingStartedAtIso: new Date().toISOString(),
    firstSaleAtIso: null,
    brandQrEnabled: true,
    referralCode: null,
    capabilities: [],
    capabilitiesEpoch: 0,
    capabilitiesFetchedAt: null,
  };
}

export function readTenantSession(storage: Storage): PosTenantSession {
  const raw = storage.getItem(TENANT_SESSION_KEY);
  if (!raw) return defaultTenantSession();
  try {
    const parsed = JSON.parse(raw) as Partial<PosTenantSession>;
    const rawVertical = (parsed as Record<string, unknown>).verticalType;
    const rawCaps = (parsed as Record<string, unknown>).capabilities;
    const rawEpoch = (parsed as Record<string, unknown>).capabilitiesEpoch;
    const rawFetchedAt = (parsed as Record<string, unknown>).capabilitiesFetchedAt;
    return {
      ...defaultTenantSession(),
      ...parsed,
      verticalType:
        typeof rawVertical === 'string' && isPosVertical(rawVertical) ? rawVertical : 'retail',
      taxRegime: normalizeTaxRegime((parsed as Record<string, unknown>).taxRegime),
      capabilities: Array.isArray(rawCaps) ? rawCaps.map(String).sort() : [],
      capabilitiesEpoch: typeof rawEpoch === 'number' && Number.isFinite(rawEpoch) ? rawEpoch : 0,
      capabilitiesFetchedAt:
        typeof rawFetchedAt === 'number' && Number.isFinite(rawFetchedAt) ? rawFetchedAt : null,
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
