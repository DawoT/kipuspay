import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildOnboardingRedirect } from './handshake.js';

/**
 * Contrato dual-app (enterprise gaps): marketing /empezar → bootstrap → redirect
 * con token; /reclamaciones → 201 + REC-. Evidencia runtime staging usa
 * E2E_STAGING_* en Playwright del POS; aquí ratchet de fuente + handshake.
 */
describe('dual-app contract (empezar → claim, reclamaciones REC-)', () => {
  it('/empezar posta bootstrap y redirige con onboarding_token (sin PIN)', () => {
    const source = readFileSync(
      new URL('../../routes/empezar/+page.svelte', import.meta.url),
      'utf8',
    );
    expect(source).toContain('/v1/onboarding/bootstrap');
    expect(source).toContain('buildOnboardingRedirect');
    expect(source).toContain('goToPos');
    expect(source).not.toMatch(/onboarding_token.*ownerPin|pin=/);
  });

  it('redirect POS lleva tenant + token; claim lo consume en app', () => {
    const href = buildOnboardingRedirect({
      posOrigin: 'https://app.kipuspay.com',
      tenantId: 't_dual',
      token: 'tok_bootstrap_once',
      mode: 'FORMALIZING',
      vertical: 'farmacias',
      name: 'Botica Sur',
    });
    const url = new URL(href);
    expect(url.origin).toBe('https://app.kipuspay.com');
    expect(url.searchParams.get('onboarding')).toBe('1');
    expect(url.searchParams.get('tenant')).toBe('t_dual');
    expect(url.searchParams.get('onboarding_token')).toBe('tok_bootstrap_once');
    expect(url.searchParams.has('pin')).toBe(false);
  });

  it('/reclamaciones posta /v1/reclamaciones y muestra caseNumber REC-', () => {
    const source = readFileSync(
      new URL('../../routes/reclamaciones/+page.svelte', import.meta.url),
      'utf8',
    );
    expect(source).toContain('/v1/reclamaciones');
    expect(source).toContain('caseNumber');
    expect(source).toContain('reclamacion-ack');
    expect(source).toMatch(/Número de caso/);
  });
});
