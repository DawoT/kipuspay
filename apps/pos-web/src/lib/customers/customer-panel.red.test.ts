import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../../routes/admin/clientes/+page.svelte', import.meta.url),
  'utf8',
);

describe('Sprint 47 customer panel UI contract (GREEN)', () => {
  it('gates the view behind FEATURE_LPDP and admin roles', () => {
    expect(source).toContain('isLpdpEnabled()');
    expect(source).toContain("['owner', 'admin', 'supervisor']");
  });

  it('lists customers without exposing PII and never sends tenant from the client', () => {
    expect(source).toContain('data-testid="customers-row"');
    expect(source).toContain('customer.documentNumber');
    expect(source).toContain('Aquí ves solo la identificación');
    expect(source).not.toMatch(/customer\.(name|email|phone|address)/);
    expect(source).not.toMatch(/tenantId/);
  });

  it('shows consents by purpose with GRANT/REVOKE and honest copy', () => {
    expect(source).toContain('Consentimientos por propósito');
    expect(source).toContain('data-testid="customers-consent-toggle"');
    expect(source).toContain('purposeLabel(consent.purpose)');
    expect(source).toContain('Mensajes por WhatsApp');
    expect(source).toContain('Promociones y avisos comerciales');
  });

  it('exposes export (LPDP-02) and double-confirmation erase (LPDP-03)', () => {
    expect(source).toContain('Descargar copia de sus datos');
    expect(source).toContain('data-testid="customers-export-btn"');
    expect(source).toContain('data-testid="customers-erase-btn"');
    expect(source).toContain('data-testid="customers-understand-check"');
    expect(source).toContain('data-testid="customers-erase-next-btn"');
    expect(source).toContain('data-testid="customers-erase-confirm-btn"');
    expect(source).toContain('Esto no se puede deshacer');
    expect(source).toContain('comprobantes fiscales se conservan');
  });

  it('meets accessibility, motion, focus and narrow-screen contracts', () => {
    expect(source).toMatch(/aria-live="polite"/);
    expect(source).toMatch(/role="alert"/);
    expect(source).toMatch(/role="dialog"/);
    expect(source).toMatch(/min-height:\s*44px/);
    expect(source).toMatch(/prefers-reduced-motion/);
    expect(source).toMatch(/:focus-visible/);
    expect(source).toMatch(/@media \(max-width: 650px\)/);
  });
});
