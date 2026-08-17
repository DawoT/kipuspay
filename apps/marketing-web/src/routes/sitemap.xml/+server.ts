import { VERTICAL_SLUGS } from '$lib/content/verticals';
import { publishedPosts } from '$lib/content/blog';

export const prerender = true;

export function GET(): Response {
  const blogSlugs = publishedPosts().map((p) => `/blog/${p.slug}`);
  const urls = [
    '/',
    '/precios',
    '/empezar',
    '/seguridad',
    '/ayuda',
    '/casos-de-exito',
    '/terminos',
    '/privacidad',
    '/reclamaciones',
    '/blog',
    ...blogSlugs,
    ...VERTICAL_SLUGS.map((s) => `/para/${s}`),
    '/comparar',
  ];
  const header = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="https://www.sitemaps.org/schemas/sitemap/0.9">',
  ].join('\n');
  const body = urls
    .map((path) => {
      const loc = `https://kipuspay.com${path}`;
      return `  <url><loc>${loc}</loc><changefreq>weekly</changefreq></url>`;
    })
    .join('\n');
  const xml = `${header}\n${body}\n</urlset>\n`;
  return new Response(xml, {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
}
