import { describe, expect, it } from 'vitest';
import { corsHeadersFor } from './public-cors.js';

describe('CORS público del worker (M6B — desacoplado por ALLOWED_ORIGINS)', () => {
  it('permite un origen de la allow-list', () => {
    const headers = corsHeadersFor(
      { ALLOWED_ORIGINS: 'https://kipuspay.com,https://www.kipuspay.com' },
      'https://kipuspay.com',
    );
    expect(headers['Access-Control-Allow-Origin']).toBe('https://kipuspay.com');
    expect(headers['Access-Control-Allow-Methods']).toContain('GET');
    expect(headers['Access-Control-Allow-Methods']).toContain('POST');
    expect(headers['Access-Control-Allow-Methods']).toContain('PUT');
    expect(headers['Access-Control-Allow-Methods']).toContain('PATCH');
    expect(headers['Access-Control-Allow-Methods']).toContain('DELETE');
    expect(headers['Access-Control-Allow-Headers']).toContain('content-type');
    expect(headers['Access-Control-Allow-Credentials']).toBe('true');
    expect(headers.Vary).toBe('Origin');
  });

  it('niega orígenes fuera de la lista (fail-closed, sin header)', () => {
    const headers = corsHeadersFor({ ALLOWED_ORIGINS: 'https://kipuspay.com' }, 'https://evil.example');
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('sin ALLOWED_ORIGINS configurado → sin CORS (solo mismo origen)', () => {
    const headers = corsHeadersFor({}, 'https://kipuspay.com');
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('wildcard explícito permite cualquier origen sin credenciales', () => {
    const headers = corsHeadersFor({ ALLOWED_ORIGINS: '*' }, 'https://cualquiera.example');
    expect(headers['Access-Control-Allow-Origin']).toBe('*');
    expect(headers['Access-Control-Allow-Credentials']).toBeUndefined();
  });
});
