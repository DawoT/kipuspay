import type { ComparePage, CompetitorSlug } from './types.js';

const BY_SLUG: Readonly<Record<CompetitorSlug, ComparePage>> = {
  bsale: {
    slug: 'bsale',
    name: 'Bsale',
    title: 'KipusPay vs Bsale',
    metaDescription: 'Compara KipusPay con Bsale: vende aunque se corte el internet, en minutos.',
    intro: 'Si buscas una alternativa a Bsale, mira la diferencia en el día a día de tu caja.',
  },
  alegra: {
    slug: 'alegra',
    name: 'Alegra',
    title: 'KipusPay vs Alegra',
    metaDescription: 'Compara KipusPay con Alegra: cobro simple y facturación sin drama.',
    intro: 'Si evaluas salir de Alegra, esto es lo que cambia en tu mostrador.',
  },
  siigo: {
    slug: 'siigo',
    name: 'Siigo',
    title: 'KipusPay vs Siigo',
    metaDescription: 'Compara KipusPay con Siigo: implementacion en minutos, no en semanas.',
    intro: 'Si Siigo se siente pesado para tu local, mira cómo KipusPay simplifica el cobro.',
  },
};

export const COMPETITOR_SLUGS: readonly CompetitorSlug[] = ['bsale', 'alegra', 'siigo'];

export function getCompare(slug: string): ComparePage | null {
  if ((COMPETITOR_SLUGS as readonly string[]).includes(slug)) {
    return BY_SLUG[slug as CompetitorSlug];
  }
  return null;
}

/** Filas de negocio GTM §5.7 — sin jerga técnica. */
export const COMPARE_ROWS: readonly {
  readonly label: string;
  readonly traditional: string;
  readonly kipus: string;
}[] = [
  {
    label: 'Si se corta el internet',
    traditional: 'Dejas de vender',
    kipus: 'Sigues vendiendo normal',
  },
  {
    label: 'Implementacion',
    traditional: 'Semanas, con instalador',
    kipus: 'Minutos, tu solo',
  },
  {
    label: 'Costo mensual',
    traditional: 'Cuotas altas + instalacion + soporte aparte',
    kipus: 'Desde un plan claro, todo incluido',
  },
  {
    label: 'Soporte',
    traditional: 'Ticket y espera',
    kipus: 'Chat segun plan; prioritario Enterprise cuando el gate lo habilite',
  },
];
