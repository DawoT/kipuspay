import { COMPETITOR_SLUGS } from '$lib/content/compare';
import { VERTICAL_SLUGS } from '$lib/content/verticals';

export const prerender = true;

export function GET(): Response {
  const urls = [
    '/',
    '/precios',
    '/empezar',
    '/seguridad',
    '/casos-de-exito',
    '/blog',
    ...VERTICAL_SLUGS.map((s) => `/para/${s}`),
    ...COMPETITOR_SLUGS.map((s) => `/comparar/${s}`),
  ];
  const header = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="https://www.sitemaps.org/schemas/sitemap/0.9">',
  ].join('\n');
  const body = urls
    .map((path) => {
      const loc = `https://kipuspay.pe${path}`;
      return `  <url><loc>${loc}</loc><changefreq>weekly</changefreq></url>`;
    })
    .join('\n');
  const xml = `${header}\n${body}\n</urlset>\n`;
  return new Response(xml, {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
}
