export function absoluteUrl(path: string, origin = 'https://kipuspay.com'): string {
  if (path.startsWith('https://')) return path;
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}

export function pageTitle(title: string): string {
  return title.includes('KipusPay') ? title : `${title} · KipusPay`;
}

/**
 * Tarjeta social. PNG y no SVG: los rastreadores sociales no renderizan SVG.
 * Sin `slug` (o 'home') devuelve la tarjeta de marca; solo los rubros y
 * comparativas tienen tarjeta propia.
 */
const SOCIAL_IMAGE_SLUGS = new Set(['restaurantes', 'farmacias', 'retail', 'servicios', 'cadenas']);

export function ogImageFor(slug?: string): string {
  const asset = slug && SOCIAL_IMAGE_SLUGS.has(slug) ? slug : 'kipuspay';
  return absoluteUrl(`/media/og-${asset}.png`);
}
