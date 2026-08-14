import { describe, expect, it, vi } from 'vitest';
import { buildOnboardingRedirect } from './handshake.js';

async function loadHandshake() {
  vi.resetModules();
  return import('./handshake.js');
}

async function withPublicEnv(name: string, value: string | undefined, run: () => Promise<void>) {
  const prev = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    await run();
  } finally {
    if (prev === undefined) delete process.env[name];
    else process.env[name] = prev;
  }
}

describe('handshake marketing→POS (M6B)', () => {
  it('resolvePosOrigin defaulta al origen del POS (nunca cadena vacía)', async () => {
    await withPublicEnv('PUBLIC_POS_ORIGIN', undefined, async () => {
      const { resolvePosOrigin } = await loadHandshake();
      expect(resolvePosOrigin()).toBe('https://app.kipuspay.com');
    });
    await withPublicEnv('PUBLIC_POS_ORIGIN', 'https://caja.example.com/', async () => {
      const { resolvePosOrigin } = await loadHandshake();
      expect(resolvePosOrigin()).toBe('https://caja.example.com');
    });
  });

  it('resolveOnboardingApiBase: PUBLIC_API_BASE o mismo origen (proxy Pages)', async () => {
    await withPublicEnv('PUBLIC_API_BASE', 'https://api.kipuspay.com', async () => {
      const { resolveOnboardingApiBase } = await loadHandshake();
      expect(resolveOnboardingApiBase()).toBe('https://api.kipuspay.com');
    });
    await withPublicEnv('PUBLIC_API_BASE', undefined, async () => {
      const { resolveOnboardingApiBase } = await loadHandshake();
      expect(resolveOnboardingApiBase()).toBe('');
    });
  });

  it('el redirect lleva el token pero NUNCA el PIN', () => {
    const href = buildOnboardingRedirect({
      posOrigin: 'https://app.kipuspay.com',
      tenantId: 't_abc',
      token: 'jwt.onboarding',
      mode: 'INTERNAL_CONTROL',
      vertical: 'retail',
      name: 'Bodega Doña Pepa',
    });
    expect(href).toContain('https://app.kipuspay.com/');
    expect(href).toContain('onboarding=1');
    expect(href).toContain('onboarding_token=jwt.onboarding');
    expect(href).toContain('tenant=t_abc');
    expect(href).not.toContain('ownerPin');
    expect(href).not.toContain('pin=');
  });

  it('posOrigin vacío usa el mismo origen', () => {
    const href = buildOnboardingRedirect({
      posOrigin: '',
      tenantId: 't_abc',
      token: 'jwt.onboarding',
      mode: 'INTERNAL_CONTROL',
      vertical: 'retail',
      name: 'Bodega',
    });
    expect(href).toContain('/?onboarding=1');
  });
});
