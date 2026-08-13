export type PosTheme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'kipus_theme';

export function resolveInitialTheme(stored: string | null): PosTheme {
  return stored === 'light' ? 'light' : 'dark';
}

export function readStoredTheme(storage: Pick<Storage, 'getItem'> | null | undefined): PosTheme {
  try {
    return resolveInitialTheme(storage?.getItem(THEME_STORAGE_KEY) ?? null);
  } catch {
    return 'dark';
  }
}

export function applyThemeToDocument(
  theme: PosTheme,
  storage?: Pick<Storage, 'setItem'> | null,
): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
  document.body.setAttribute('data-theme', theme);
  if (storage) {
    try {
      storage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      return;
    }
  }
}

export function readDocumentTheme(): PosTheme {
  if (typeof document === 'undefined') return 'dark';
  const current = document.documentElement.getAttribute('data-theme');
  return resolveInitialTheme(current);
}
