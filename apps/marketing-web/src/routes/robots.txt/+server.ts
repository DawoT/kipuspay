export const prerender = true;

export function GET(): Response {
  const body = `User-agent: *
Allow: /
Sitemap: https://kipuspay.com/sitemap.xml
`;
  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
