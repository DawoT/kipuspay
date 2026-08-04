import type { FeaturedClaimId } from '../claims/registry.js';
import type { IconName } from '../brand/icons.js';

export type VerticalSlug = 'restaurantes' | 'farmacias' | 'retail' | 'servicios' | 'cadenas';

export interface VerticalLanding {
  readonly slug: VerticalSlug;
  /** Nombre legible en navegacion y migas; el slug nunca se muestra crudo. */
  readonly navLabel: string;
  readonly title: string;
  readonly pain: string;
  readonly hook: string;
  readonly metaDescription: string;
  /** Puntos ya embarcados (nunca claims gated) — GTM §2. */
  readonly points: readonly string[];
  readonly featuredClaimId: FeaturedClaimId;
  /** Segunda claim opcional (cadenas: merma roadmap). */
  readonly secondaryClaimId?: FeaturedClaimId;
  readonly heroPoster: string;
  /** Pantalla de cobro del rubro (GTM §5.3). */
  readonly checkout: CheckoutDemo;
  /** Dolor en primera persona y su alivio, en el lenguaje del rubro. */
  readonly pains: readonly {
    readonly icon: IconName;
    readonly pain: string;
    readonly relief: string;
  }[];
  readonly faq: readonly { readonly q: string; readonly a: string }[];
}

/** Linea de la pantalla de cobro de ejemplo. Dinero en centimos enteros. */
export interface CheckoutLineData {
  readonly qty: number;
  readonly name: string;
  readonly amount_cents: number;
}

export interface CheckoutDemo {
  readonly documentLabel: string;
  readonly register: string;
  readonly caption: string;
  readonly syncState: 'pending' | 'synced';
  readonly lines: readonly CheckoutLineData[];
}

export type CompetitorSlug = 'bsale' | 'alegra' | 'siigo';

export interface CompareRow {
  readonly label: string;
  /** Lo que reportan quienes migran; nunca una afirmacion sobre el producto ajeno. */
  readonly reported: string;
  readonly kipus: string;
}

export interface ComparePage {
  readonly slug: CompetitorSlug;
  readonly name: string;
  readonly title: string;
  readonly metaDescription: string;
  readonly intro: string;
  /** Gancho del hero, en el lenguaje de quien evalua migrar. */
  readonly hook: string;
  readonly whyMigrate: readonly {
    readonly icon: IconName;
    readonly title: string;
    readonly body: string;
  }[];
  /** Filas propias del competidor, ademas de las compartidas. */
  readonly rows: readonly CompareRow[];
  readonly faq: readonly { readonly q: string; readonly a: string }[];
}

export interface StubPage {
  readonly path: string;
  readonly title: string;
  readonly unlockSprint: number;
  readonly blurb: string;
}
