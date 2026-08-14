import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy } from './hooks.server.js';

describe('CSP del POS (M6C)', () => {
  it('permite el mismo origen y los servicios de push', () => {
    const csp = buildContentSecurityPolicy('');
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain('https://firebaseinstallations.googleapis.com');
    expect(csp).toContain('https://fcmregistrations.googleapis.com');
  });

  it('incluye la base de API en connect-src (necesario para el claim/API)', () => {
    const csp = buildContentSecurityPolicy('https://api.kipuspay.com/');
    const connect = csp.split('; ').find((d) => d.startsWith('connect-src')) ?? '';
    expect(connect).toContain("'self'");
    expect(connect).toContain('https://api.kipuspay.com');
    expect(connect).toContain('wss://api.kipuspay.com');
    expect(csp).not.toContain('https://evil.example');
  });

  it('mantiene las directivas duras de seguridad', () => {
    const csp = buildContentSecurityPolicy('');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");
  });
});
