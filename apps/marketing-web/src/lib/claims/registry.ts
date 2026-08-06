/**
 * Claim-gate GTM §2 — feature destacada live vs roadmap+sprint.
 * Una sola fuente; landings no inventan disponibilidad.
 */

export type ClaimStatus =
  | { readonly kind: 'live'; readonly plan?: string }
  | { readonly kind: 'roadmap'; readonly unlockSprint: number; readonly label: string };

export type FeaturedClaimId =
  'kds_split' | 'fefo_lots' | 'blind_z_audit' | 'services_core' | 'owner_ranking' | 'merma_xfer';

/** Estado canónico post–QG de cada feature destacada de vertical (GTM §2). */
export const FEATURED_CLAIMS: Readonly<Record<FeaturedClaimId, ClaimStatus>> = {
  kds_split: {
    kind: 'live',
  },
  fefo_lots: {
    kind: 'live',
  },
  blind_z_audit: {
    kind: 'live',
  },
  services_core: {
    kind: 'live',
  },
  owner_ranking: {
    kind: 'live',
    plan: 'Crece+',
  },
  merma_xfer: {
    kind: 'live',
  },
};
export function resolveClaim(id: FeaturedClaimId): ClaimStatus {
  return FEATURED_CLAIMS[id];
}

/** Texto seguro para UI: nunca presenta roadmap como disponible. */
export function claimBadge(status: ClaimStatus): string {
  if (status.kind === 'live')
    return status.plan ? `Disponible (plan ${status.plan})` : 'Disponible';
  return `En el roadmap (Sprint ${status.unlockSprint})`;
}

export function isClaimLive(status: ClaimStatus): boolean {
  return status.kind === 'live';
}
