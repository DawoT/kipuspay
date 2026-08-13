import { describe, expect, it } from 'vitest';
import { readStoredTheme, resolveInitialTheme } from './theme';

describe('resolveInitialTheme', () => {
  it('vuelve a oscuro sin preferencia guardada', () => {
    expect(resolveInitialTheme(null)).toBe('dark');
  });

  it('respeta la preferencia clara guardada', () => {
    expect(resolveInitialTheme('light')).toBe('light');
  });

  it('respeta la preferencia oscura guardada', () => {
    expect(resolveInitialTheme('dark')).toBe('dark');
  });

  it('descarta valores inválidos y vuelve a oscuro', () => {
    expect(resolveInitialTheme('sepias')).toBe('dark');
  });
});

describe('readStoredTheme', () => {
  it('lee la preferencia guardada del storage', () => {
    const storage = { getItem: () => 'light' } satisfies Pick<Storage, 'getItem'>;
    expect(readStoredTheme(storage)).toBe('light');
  });

  it('vuelve a oscuro si el storage no responde', () => {
    const storage: Pick<Storage, 'getItem'> = {
      getItem: () => {
        throw new Error('Storage denegado');
      },
    };
    expect(readStoredTheme(storage)).toBe('dark');
  });
});
