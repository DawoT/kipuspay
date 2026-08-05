/**
 * Borrador de onboarding en localStorage — puente marketing → POS (Sprint 11).
 */

export type FormalizationMode = 'INTERNAL_CONTROL' | 'FORMALIZING' | 'ELECTRONIC_ISSUER';

export const ONBOARDING_STORAGE_KEY = 'kipuspay.onboarding.v1';

export type OnboardingVertical = 'restaurantes' | 'farmacias' | 'retail' | 'servicios' | 'cadenas';

export interface OnboardingDraft {
  readonly tradeName: string;
  readonly ruc: string | null;
  readonly verticalType: OnboardingVertical;
  readonly formalizationMode: FormalizationMode;
  readonly tenantId: string;
  readonly startedAtIso: string;
  readonly firstSaleAtIso: string | null;
}

export function createOnboardingDraft(partial: {
  tradeName: string;
  ruc?: string | null;
  verticalType: OnboardingVertical;
  formalizationMode: FormalizationMode;
  tenantId: string;
}): OnboardingDraft {
  const tradeName = partial.tradeName.trim();
  if (!tradeName) throw new Error('Nombre comercial requerido');
  return {
    tradeName,
    ruc: partial.ruc ?? null,
    verticalType: partial.verticalType,
    formalizationMode: partial.formalizationMode,
    tenantId: partial.tenantId,
    startedAtIso: new Date().toISOString(),
    firstSaleAtIso: null,
  };
}

/** TTFS en ms desde startedAt hasta firstSale; null si aun no hay venta. */
export function ttfsMs(draft: OnboardingDraft): number | null {
  if (!draft.firstSaleAtIso) return null;
  return Date.parse(draft.firstSaleAtIso) - Date.parse(draft.startedAtIso);
}

export function markFirstSale(
  draft: OnboardingDraft,
  atIso = new Date().toISOString(),
): OnboardingDraft {
  return { ...draft, firstSaleAtIso: atIso };
}

export function writeOnboardingDraft(storage: Storage, draft: OnboardingDraft): void {
  storage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(draft));
}

export function readOnboardingDraft(storage: Storage): OnboardingDraft | null {
  const raw = storage.getItem(ONBOARDING_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OnboardingDraft;
  } catch {
    return null;
  }
}
