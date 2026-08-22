import { describe, expect, it } from 'vitest';
import { configuracionUrl, httpsReturnOrEmpty, resolvePosAppOrigin } from './app-origin.js';

describe('resolvePosAppOrigin (D0 pages.dev, no dominio comprado)', () => {
  it('POS_APP_ORIGIN gana y no cae a app.kipuspay.com', () => {
    expect(
      resolvePosAppOrigin({
        POS_APP_ORIGIN: 'https://kipuspay-app.pages.dev/',
        ALLOWED_ORIGINS: 'https://app.kipuspay.com',
      }),
    ).toBe('https://kipuspay-app.pages.dev');
  });

  it('sin POS_APP_ORIGIN usa el Pages del POS en ALLOWED_ORIGINS', () => {
    expect(
      resolvePosAppOrigin({
        ALLOWED_ORIGINS: 'https://kipuspay-app.pages.dev,https://kipuspay-web.pages.dev',
      }),
    ).toBe('https://kipuspay-app.pages.dev');
  });

  it('sin env no inventa kipuspay.com', () => {
    expect(resolvePosAppOrigin(undefined)).toBe('');
    expect(resolvePosAppOrigin({})).toBe('');
    expect(configuracionUrl(undefined)).toBe('');
    expect(configuracionUrl(undefined)).not.toContain('kipuspay.com');
  });

  it('httpsReturnOrEmpty rechaza no-https y el fallback vacío', () => {
    expect(httpsReturnOrEmpty('ftp://evil', 'https://kipuspay-app.pages.dev/x')).toBe('');
    expect(
      httpsReturnOrEmpty(undefined, 'https://kipuspay-app.pages.dev/admin/configuracion'),
    ).toBe('https://kipuspay-app.pages.dev/admin/configuracion');
  });
});
