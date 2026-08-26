import { describe, expect, it } from 'vitest';
import { FEATURED_CLAIMS, type FeaturedClaimId } from './registry.js';
import { PUBLIC_CLAIMS, publicBadge, publicLabel } from './public.js';
import { allVerticals } from '../content/verticals.js';

const PREPARING: FeaturedClaimId[] = ['kds_split', 'blind_z_audit'];
const AVAILABLE: FeaturedClaimId[] = [
  'services_core',
  'owner_ranking',
  'fefo_lots',
  'merma_xfer',
  'fuel_fleet',
];

describe('visibilidad pública de claims (M1 — control interno vs público)', () => {
  it('el mapa público cubre los 7 claims del registry', () => {
    for (const id of Object.keys(FEATURED_CLAIMS) as FeaturedClaimId[]) {
      expect(PUBLIC_CLAIMS[id], `${id} en PUBLIC_CLAIMS`).toBeDefined();
    }
  });

  it('los claims post-QG NO se anuncian como disponibles al público (solo control interno)', () => {
    for (const id of PREPARING) {
      const status = FEATURED_CLAIMS[id];
      expect(status.kind, `${id} interno sigue live (QG cerrado)`).toBe('live');
      const badge = publicBadge(PUBLIC_CLAIMS[id]);
      expect(badge, `${id} badge público`).not.toContain('Disponible');
      expect(badge).toBe('En preparación');
    }
  });

  it('núcleo y ranking (GTM-03) sí se venden: badge disponible', () => {
    for (const id of AVAILABLE) {
      expect(publicBadge(PUBLIC_CLAIMS[id])).toContain('Disponible');
    }
    expect(publicLabel(PUBLIC_CLAIMS.owner_ranking, 'Ranking de locales en Modo Dueno')).toContain(
      'Ranking',
    );
  });

  it('cada vertical con un claim en preparación lo encuadra como roadmap (FAQ o meta)', () => {
    for (const v of allVerticals()) {
      const claims = [v.featuredClaimId, v.secondaryClaimId].filter((c): c is FeaturedClaimId =>
        Boolean(c),
      );
      if (!claims.some((c) => PUBLIC_CLAIMS[c].kind === 'preparing')) continue;
      const copy = [...v.faq.map((f) => f.a), v.metaDescription].join(' ');
      expect(copy.toLowerCase(), `${v.slug} encuadre roadmap`).toContain('roadmap');
    }
  });

  it('las verticales cuyos claims son todos disponibles nunca dicen roadmap', () => {
    for (const slug of ['servicios', 'farmacias', 'cadenas', 'grifos'] as const) {
      const v = allVerticals().find((item) => item.slug === slug);
      expect(v, `vertical ${slug} encontrada`).toBeDefined();
      const copy = [...(v?.faq.map((f) => f.a) ?? []), v?.metaDescription ?? ''].join(' ');
      expect(copy.toLowerCase(), `${slug} no debe decir roadmap`).not.toContain('roadmap');
    }
  });
});
