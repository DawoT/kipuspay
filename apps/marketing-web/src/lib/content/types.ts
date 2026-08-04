import type { FeaturedClaimId } from '../claims/registry.js';

export type VerticalSlug = 'restaurantes' | 'farmacias' | 'retail' | 'servicios' | 'cadenas';

export interface VerticalLanding {
  readonly slug: VerticalSlug;
  readonly title: string;
  readonly pain: string;
  readonly hook: string;
  readonly metaDescription: string;
  readonly featuredClaimId: FeaturedClaimId;
  /** Segunda claim opcional (cadenas: merma roadmap). */
  readonly secondaryClaimId?: FeaturedClaimId;
  readonly heroPoster: string;
}

export type CompetitorSlug = 'bsale' | 'alegra' | 'siigo';

export interface ComparePage {
  readonly slug: CompetitorSlug;
  readonly name: string;
  readonly title: string;
  readonly metaDescription: string;
  readonly intro: string;
}

export interface StubPage {
  readonly path: string;
  readonly title: string;
  readonly unlockSprint: number;
  readonly blurb: string;
}
