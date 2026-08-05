import { describe, expect, it } from 'vitest';
import {
  createOnboardingDraft,
  markFirstSale,
  ONBOARDING_STORAGE_KEY,
  readOnboardingDraft,
  ttfsMs,
  writeOnboardingDraft,
} from './draft.js';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

describe('onboarding draft', () => {
  it('crea borrador y mide TTFS tras primera venta', () => {
    const draft = createOnboardingDraft({
      tradeName: 'Mi botica',
      verticalType: 'farmacias',
      formalizationMode: 'INTERNAL_CONTROL',
      tenantId: 't_demo',
    });
    expect(draft.tradeName).toBe('Mi botica');
    expect(ttfsMs(draft)).toBeNull();

    const sold = markFirstSale(
      draft,
      new Date(Date.parse(draft.startedAtIso) + 180_000).toISOString(),
    );
    expect(ttfsMs(sold)).toBe(180_000);
  });

  it('persiste y lee borrador; JSON inválido → null', () => {
    const storage = memoryStorage();
    expect(readOnboardingDraft(storage)).toBeNull();

    const draft = createOnboardingDraft({
      tradeName: 'Retail PE',
      verticalType: 'retail',
      formalizationMode: 'FORMALIZING',
      tenantId: 't_1',
    });
    writeOnboardingDraft(storage, draft);
    expect(storage.getItem(ONBOARDING_STORAGE_KEY)).toContain('Retail PE');
    expect(readOnboardingDraft(storage)?.tenantId).toBe('t_1');

    storage.setItem(ONBOARDING_STORAGE_KEY, '{not-json');
    expect(readOnboardingDraft(storage)).toBeNull();
  });

  it('rechaza nombre comercial vacío', () => {
    expect(() =>
      createOnboardingDraft({
        tradeName: '   ',
        verticalType: 'servicios',
        formalizationMode: 'ELECTRONIC_ISSUER',
        tenantId: 't_x',
      }),
    ).toThrow(/Nombre comercial/);
  });
});
