export function absoluteUrl(path: string, origin = 'https://kipuspay.pe'): string {
  if (path.startsWith('https://')) return path;
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}

export function pageTitle(title: string): string {
  return title.includes('KipusPay') ? title : `${title} · KipusPay`;
}
