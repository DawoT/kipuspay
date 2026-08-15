import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/** S3 (Sprint 7): security headers del marketing (static/_headers). */
const HEADERS_PATH = new URL('../../static/_headers', import.meta.url).pathname;

describe('marketing security headers (S3)', () => {
  const raw = readFileSync(HEADERS_PATH, 'utf-8');

  it('existe y no es un placeholder', () => {
    expect(raw.length).toBeGreaterThan(50);
    expect(raw).not.toMatch(/TODO|placeholder/i);
  });

  it.each(['X-Frame-Options: DENY', 'X-Content-Type-Options: nosniff'])('%s presente', (header) => {
    expect(raw).toContain(header);
  });

  it('HSTS con preload', () => {
    expect(raw).toMatch(/Strict-Transport-Security: max-age=\d+; includeSubDomains; preload/);
  });

  it('Referrer-Policy estricta', () => {
    expect(raw).toContain('Referrer-Policy: strict-origin-when-cross-origin');
  });

  it('CSP sin unsafe-inline en script-src y frame-ancestors none', () => {
    expect(raw).toMatch(/Content-Security-Policy: /);
    expect(raw).toContain("script-src 'self'");
    expect(raw).toContain("style-src 'self' 'unsafe-inline'");
    expect(raw).toContain("frame-ancestors 'none'");
  });

  it('Permissions-Policy sin cámara/micrófono/geolocalización', () => {
    expect(raw).toMatch(
      /Permissions-Policy: camera=\(\), microphone=\(\), geolocation=\(\), payment=\(\)/,
    );
  });
});
