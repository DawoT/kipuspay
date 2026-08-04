import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FEATURED_CLAIMS, type FeaturedClaimId } from './registry.js';

/**
 * Guard de deriva (H5): el claim-gate es la única fuente de disponibilidad de
 * features destacadas y DEBE permanecer sincronizado con la tabla GTM §2.
 * Si se edita GTM.md o registry.ts sin tocar al otro, este test falla.
 */
const GTM_PATH = new URL('../../../../../docs/GTM.md', import.meta.url);

/** Marcador GTM §2 por claim (la fila del sector y su "Listo tras"). */
const GTM_MARKER: Record<FeaturedClaimId, string> = {
  kds_split: 'Sprint 19',
  fefo_lots: 'Sprint 18',
  blind_z_audit: 'Sprint 17',
  services_core: 'Núcleo',
  owner_ranking: 'Crece+',
  merma_xfer: 'Sprint 20',
};

function gtmTableRows(): string[] {
  const gtm = readFileSync(GTM_PATH, 'utf8');
  const start = gtm.indexOf('| **Restaurantes');
  const end = gtm.indexOf('Cada vertical necesita');
  expect(start, 'tabla GTM §2 presente').toBeGreaterThan(-1);
  expect(end, 'fin de la tabla GTM §2').toBeGreaterThan(start);
  return gtm
    .slice(start, end)
    .split('\n')
    .filter((l) => l.startsWith('|') && !l.includes('---'));
}

function sprintsIn(cell: string): number[] {
  return [...cell.matchAll(/Sprint\s+(\d+)/g)].map((m) => Number(m[1]));
}

describe('marketing claim-gate drift vs GTM §2', () => {
  const rows = gtmTableRows();

  it('todo claim destacado tiene su fila en GTM §2', () => {
    for (const claimId of Object.keys(FEATURED_CLAIMS) as FeaturedClaimId[]) {
      const marker = GTM_MARKER[claimId];
      expect(
        rows.some((r) => r.includes(marker)),
        `${claimId} → "${marker}" en GTM §2`,
      ).toBe(true);
    }
  });

  it('claims roadmap: unlockSprint coincide con GTM §2 y es >= 17', () => {
    for (const claimId of Object.keys(FEATURED_CLAIMS) as FeaturedClaimId[]) {
      const status = FEATURED_CLAIMS[claimId];
      if (status.kind !== 'roadmap') continue;
      const row = rows.find((r) => r.includes(GTM_MARKER[claimId]))!;
      expect(sprintsIn(row)).toContain(status.unlockSprint);
      expect(status.unlockSprint).toBeGreaterThanOrEqual(17);
    }
  });

  it('claims live: el plan / núcleo coincide con GTM §2', () => {
    const services = rows.find((r) => r.includes(GTM_MARKER.services_core))!;
    expect(services).toContain('Núcleo');
    const ranking = rows.find((r) => r.includes(GTM_MARKER.owner_ranking))!;
    expect(ranking).toContain('Crece+');
    const owner = FEATURED_CLAIMS.owner_ranking;
    if (owner.kind === 'live') {
      expect(owner.plan).toBe('Crece+');
    }
  });
});
