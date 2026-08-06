import { describe, expect, it } from 'vitest';
import { claimBadge, isClaimLive, resolveClaim } from './registry.js';
import { HOME } from '../content/home.js';

describe('marketing claim-gate', () => {
  it('KDS live post-QG S19; merma sigue roadmap; FEFO y arqueo Z live', () => {
    expect(isClaimLive(resolveClaim('kds_split'))).toBe(true);
    const merma = resolveClaim('merma_xfer');
    expect(merma.kind).toBe('roadmap');
    if (merma.kind === 'roadmap') {
      expect(merma.unlockSprint).toBe(20);
      expect(claimBadge(merma)).toContain('roadmap');
      expect(isClaimLive(merma)).toBe(false);
    }
    expect(isClaimLive(resolveClaim('fefo_lots'))).toBe(true);
    expect(isClaimLive(resolveClaim('blind_z_audit'))).toBe(true);
  });

  it('servicios núcleo y ranking Dueño son live', () => {
    expect(isClaimLive(resolveClaim('services_core'))).toBe(true);
    expect(isClaimLive(resolveClaim('owner_ranking'))).toBe(true);
  });

  it('owner_ranking exige plan Crece+ (GTM-03 / GTM §2)', () => {
    const status = resolveClaim('owner_ranking');
    expect(status.kind).toBe('live');
    if (status.kind === 'live') expect(status.plan).toBe('Crece+');
    expect(claimBadge(status)).toBe('Disponible (plan Crece+)');
  });

  it('no promete prueba social sin evidencia (GTM-12)', () => {
    expect(HOME.trustLine).not.toMatch(/ya venden|miles de|clientes/);
  });

  it('no promete el registro completo como disponible hoy', () => {
    expect(HOME.steps[0].body).not.toContain('traemos tus datos');
    // El aviso se mantiene, pero en lenguaje de comercio: nada de numeros de sprint.
    expect(HOME.steps[0].body).toMatch(/se habilita cuando/);
    expect(HOME.steps[0].body).not.toMatch(/Sprint/i);
  });
});
