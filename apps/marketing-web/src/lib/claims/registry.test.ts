import { describe, expect, it } from 'vitest';
import { claimBadge, isClaimLive, resolveClaim } from './registry.js';

describe('marketing claim-gate', () => {
  it('KDS/FEFO/arqueo Z / merma son roadmap con sprint', () => {
    for (const id of ['kds_split', 'fefo_lots', 'blind_z_audit', 'merma_xfer'] as const) {
      const s = resolveClaim(id);
      expect(s.kind).toBe('roadmap');
      if (s.kind === 'roadmap') {
        expect(s.unlockSprint).toBeGreaterThanOrEqual(17);
        expect(claimBadge(s)).toContain('roadmap');
        expect(claimBadge(s)).toMatch(/Sprint \d+/);
        expect(isClaimLive(s)).toBe(false);
      }
    }
  });

  it('servicios núcleo y ranking Dueño son live', () => {
    expect(isClaimLive(resolveClaim('services_core'))).toBe(true);
    expect(isClaimLive(resolveClaim('owner_ranking'))).toBe(true);
    expect(claimBadge(resolveClaim('owner_ranking'))).toBe('Disponible');
  });
});
