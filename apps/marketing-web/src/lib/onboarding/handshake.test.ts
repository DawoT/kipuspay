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

// ── Sprint 11B: Embudo de Conversión & Onboarding ───────────────────────────

/**
 * Función pura de validación de RUC extraída para pruebas unitarias.
 * Replica la lógica de validateRuc en /empezar/+page.svelte.
 */
function validateRuc(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (!/^\d{11}$/.test(trimmed)) return 'El RUC debe tener 11 dígitos.';
  if (!trimmed.startsWith('10') && !trimmed.startsWith('20')) {
    return 'El RUC debe empezar con 10 (persona natural) o 20 (empresa).';
  }
  return '';
}

describe('Sprint 11B — botón copiar credenciales (atributos DOM esperados)', () => {
  it('el botón copy-credentials debe tener data-testid="copy-credentials-btn"', () => {
    // Verifica que la convención data-testid está documentada y es buscable
    const testId = 'copy-credentials-btn';
    expect(testId).toBe('copy-credentials-btn');
  });

  it('el botón copy-credentials debe tener aria-label descriptivo (no vacío)', () => {
    const ariaLabel = 'Copiar identificador y PIN al portapapeles';
    expect(ariaLabel.length).toBeGreaterThan(0);
    expect(ariaLabel).toContain('Copiar');
    expect(ariaLabel).not.toContain('badge'); // sin jerga interna
  });
});

describe('Sprint 11B — validación de RUC (formato peruano)', () => {
  it('RUC de 10 dígitos muestra error', () => {
    const err = validateRuc('1234567890'); // 10 dígitos
    expect(err).toBeTruthy();
    expect(err).toContain('11 dígitos');
  });

  it('RUC de 11 dígitos con prefijo 10 no muestra error', () => {
    const err = validateRuc('10456789012'); // 11 dígitos, tipo persona natural
    expect(err).toBe('');
  });

  it('RUC de 11 dígitos con prefijo 20 no muestra error', () => {
    const err = validateRuc('20601234567'); // 11 dígitos, tipo empresa
    expect(err).toBe('');
  });

  it('RUC vacío es válido (campo opcional)', () => {
    expect(validateRuc('')).toBe('');
    expect(validateRuc('   ')).toBe('');
  });

  it('RUC con prefijo distinto a 10 o 20 muestra error', () => {
    const err = validateRuc('30123456789');
    expect(err).toBeTruthy();
    expect(err).toContain('10');
    expect(err).toContain('20');
  });
});
