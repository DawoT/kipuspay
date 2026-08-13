import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { CONTENT_SECURITY_POLICY } from './hooks.server.js';
import { FCM_VENDOR_MANIFEST } from './lib/mobile/mobile-push-pwa.js';

describe('Sprint 45 CSP and vendored FCM supply-chain checks (RED)', () => {
  it('keeps a restrictive CSP without unsafe script execution or arbitrary connections', () => {
    expect(CONTENT_SECURITY_POLICY).toContain("default-src 'self'");
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("base-uri 'none'");
    expect(CONTENT_SECURITY_POLICY).not.toContain("'unsafe-eval'");
    expect(CONTENT_SECURITY_POLICY).not.toContain('data: *');
  });

  it('matches the vendored module bytes and CycloneDX component', async () => {
    const vendorUrl = new URL(
      '../static/vendor/fcm-registration-adapter-v1.0.0.js',
      import.meta.url,
    );
    const sbomUrl = new URL(
      '../static/vendor/fcm-registration-adapter-v1.0.0.cdx.json',
      import.meta.url,
    );
    const bytes = await readFile(vendorUrl);
    const sbom = JSON.parse(await readFile(sbomUrl, 'utf8')) as {
      components: Array<{ purl: string; hashes: Array<{ alg: string; content: string }> }>;
    };
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(FCM_VENDOR_MANIFEST.sha256);
    expect(sbom.components).toContainEqual(
      expect.objectContaining({
        purl: FCM_VENDOR_MANIFEST.sbomComponent,
        hashes: expect.arrayContaining([{ alg: 'SHA-256', content: FCM_VENDOR_MANIFEST.sha256 }]),
      }),
    );
  });
});
