/**
 * Visibilidad PÚBLICA de las features destacadas (M1).
 *
 * El registry (registry.ts) es CONTROL INTERNO: refleja los Quality Gates
 * cerrados (estado "live"). Lo que un visitante puede leer en el sitio es
 * otra cosa: las capabilities post-QG aún no se anuncian como disponibles
 * (producción/piloto NO-GO hasta staging real y firma A+V independiente).
 * Esta capa decide el copy público; el registry jamás se renderiza.
 */

import type { FeaturedClaimId } from './registry.js';

export type PublicClaimStatus =
  { readonly kind: 'available' } | { readonly kind: 'preparing'; readonly label: string };

/** Fuente de verdad del copy público por claim (única capa renderizable). */
export const PUBLIC_CLAIMS: Readonly<Record<FeaturedClaimId, PublicClaimStatus>> = {
  // Post-QG internos, aún no anunciables al público (go-live externo pendiente).
  kds_split: { kind: 'preparing', label: 'Comandas sincronizadas de cocina' },
  blind_z_audit: { kind: 'preparing', label: 'Arqueo ciego con auditoría' },
  // Descongelados con copy acotado (GTM-16 gate S18, GTM-13 gate S20).
  fefo_lots: { kind: 'available' },
  merma_xfer: { kind: 'available' },
  // Núcleo ya vendido (servicios) y ranking descongelado (GTM-03).
  services_core: { kind: 'available' },
  owner_ranking: { kind: 'available' },
};

export function publicStatus(id: FeaturedClaimId): PublicClaimStatus {
  return PUBLIC_CLAIMS[id];
}

export function publicBadge(status: PublicClaimStatus): string {
  return status.kind === 'available' ? 'Disponible' : 'En preparación';
}

export function publicLabel(status: PublicClaimStatus, fallback: string): string {
  return status.kind === 'preparing' ? status.label : fallback;
}
