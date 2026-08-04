import type { VerticalLanding, VerticalSlug } from './types.js';

const BY_SLUG: Readonly<Record<VerticalSlug, VerticalLanding>> = {
  restaurantes: {
    slug: 'restaurantes',
    title: 'KipusPay para restaurantes',
    pain: 'Comandas perdidas, cuentas divididas mal cobradas, cocina desincronizada del salón.',
    hook: 'Tu cocina y tu caja, siempre en el mismo minuto.',
    metaDescription:
      'POS para restaurantes y food service: cobra sin fricción y prepárate para comandas sincronizadas.',
    featuredClaimId: 'kds_split',
    heroPoster: '/media/hero-poster.svg',
  },
  farmacias: {
    slug: 'farmacias',
    title: 'KipusPay para farmacias',
    pain: 'Vencimientos sin control, quiebres de stock y presión fiscal todos los días.',
    hook: 'Nunca más un cliente se va sin su medicina por falta de stock.',
    metaDescription:
      'POS para farmacias: vende y factura con control, y el control de vencimientos llega en el roadmap.',
    featuredClaimId: 'fefo_lots',
    heroPoster: '/media/hero-poster.svg',
  },
  retail: {
    slug: 'retail',
    title: 'KipusPay para retail y minimarkets',
    pain: 'Robo hormiga, descuadres de caja y poco control cuando hay más de un local.',
    hook: 'Sabe exactamente qué pasó en cada una de tus tiendas, hoy.',
    metaDescription:
      'POS para retail y ferreterías: cobra offline, ve tu día y prepara el arqueo ciego del roadmap.',
    featuredClaimId: 'blind_z_audit',
    heroPoster: '/media/hero-poster.svg',
  },
  servicios: {
    slug: 'servicios',
    title: 'KipusPay para servicios',
    pain: 'Citas y cobros desconectados, sin producto físico que descontar del inventario.',
    hook: 'Cobra sin inventario, sin fricción, sin complicarte.',
    metaDescription:
      'POS para spas, talleres y consultorios: cobra y factura sin pelearte con el stock.',
    featuredClaimId: 'services_core',
    heroPoster: '/media/hero-poster.svg',
  },
  cadenas: {
    slug: 'cadenas',
    title: 'KipusPay para cadenas y multi-local',
    pain: 'Poco visibilidad consolidada y reportería lenta entre sucursales.',
    hook: 'Un solo panel para saber cómo le va a cada una de tus tiendas — cuando sincroniza.',
    metaDescription:
      'POS multi-local: ranking de locales en Modo Dueño; merma y transferencias en el roadmap.',
    featuredClaimId: 'owner_ranking',
    secondaryClaimId: 'merma_xfer',
    heroPoster: '/media/hero-poster.svg',
  },
};

export const VERTICAL_SLUGS: readonly VerticalSlug[] = [
  'restaurantes',
  'farmacias',
  'retail',
  'servicios',
  'cadenas',
];

export function getVertical(slug: string): VerticalLanding | null {
  if ((VERTICAL_SLUGS as readonly string[]).includes(slug)) {
    return BY_SLUG[slug as VerticalSlug];
  }
  return null;
}

export function allVerticals(): readonly VerticalLanding[] {
  return VERTICAL_SLUGS.map((s) => BY_SLUG[s]);
}
