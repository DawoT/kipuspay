export function absoluteUrl(path: string, origin = 'https://kipuspay.pe'): string {
  if (path.startsWith('https://')) return path;
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}

export function pageTitle(title: string): string {
  return title.includes('KipusPay') ? title : `${title} · KipusPay`;
}

/**
 * Tarjeta social. PNG y no SVG: los rastreadores sociales no renderizan SVG.
 * Sin `slug` devuelve la tarjeta de marca.
 */
export function ogImageFor(slug?: string): string {
  return absoluteUrl(slug ? `/media/og-${slug}.png` : '/media/og-kipuspay.png');
}
