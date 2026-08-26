import { describe, expect, it } from 'vitest';
import { GET } from './+server.js';

describe('sitemap.xml (AUD-03)', () => {
  it('genera XML válido con namespace estándar y rutas de comparativas', async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/xml');

    const xml = await res.text();
    expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
    expect(xml).not.toContain('xmlns="https://www.sitemaps.org/schemas/sitemap/0.9"');

    // Rutas canónicas y comparativas
    expect(xml).toContain('<loc>https://kipuspay.com/</loc>');
    expect(xml).toContain('<loc>https://kipuspay.com/blog</loc>');
    expect(xml).toContain('<loc>https://kipuspay.com/blog/primera-venta-el-mismo-dia</loc>');
    expect(xml).toContain('<loc>https://kipuspay.com/blog/ruc-10-vs-ruc-20-emitir-boletas</loc>');
    expect(xml).toContain('<loc>https://kipuspay.com/blog/como-cuadrar-caja-minimarket</loc>');
    expect(xml).toContain('<loc>https://kipuspay.com/blog/cobrar-yape-plin-evitar-estafas</loc>');
    expect(xml).toContain(
      '<loc>https://kipuspay.com/blog/checklist-abrir-restaurante-cafeteria-peru</loc>',
    );
    expect(xml).toContain('<loc>https://kipuspay.com/comparar</loc>');
    // Las comparativas por competidor hacen 301 a /comparar?vs=X: un sitemap
    // no lista redirecciones, solo la URL canónica (G2, AUD-03).
    expect(xml).not.toContain('<loc>https://kipuspay.com/comparar/bsale</loc>');
    expect(xml).not.toContain('<loc>https://kipuspay.com/comparar/alegra</loc>');
    expect(xml).not.toContain('<loc>https://kipuspay.com/comparar/siigo</loc>');
    expect(xml).toContain('<loc>https://kipuspay.com/reclamaciones</loc>');
  });
});
