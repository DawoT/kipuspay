import { describe, expect, it } from 'vitest';
import { claimBadge, resolveClaim } from '../claims/registry.js';
import { COMPETITOR_SLUGS, getCompare } from './compare.js';
import { allVerticals, getVertical, VERTICAL_SLUGS } from './verticals.js';

describe('content model', () => {
  it('cinco verticales con dolor, gancho y claim-gate', () => {
    expect(VERTICAL_SLUGS).toHaveLength(5);
    for (const v of allVerticals()) {
      expect(v.pain.length).toBeGreaterThan(10);
      expect(v.hook.length).toBeGreaterThan(10);
      const status = resolveClaim(v.featuredClaimId);
      const badge = claimBadge(status);
      if (status.kind === 'roadmap') {
        expect(badge).toContain(`Sprint ${status.unlockSprint}`);
        expect(badge).not.toBe('Disponible');
      }
    }
  });

  it('slug desconocido → null', () => {
    expect(getVertical('otro')).toBeNull();
    expect(getCompare('otro')).toBeNull();
  });

  it('tres competidores', () => {
    expect(COMPETITOR_SLUGS).toEqual(['bsale', 'alegra', 'siigo']);
    expect(getCompare('bsale')?.name).toBe('Bsale');
  });
});
