import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * B1 (auditoría pre-promoción): contrato JSON-LD del HTML prerenderizado.
 *
 * Svelte 5 NO evalúa expresiones dentro de `<script>` del markup: un
 * `<script type="application/ld+json">{@html orgLd}</script>` sale a producción
 * con el texto literal "{@html orgLd}" como contenido (o se descarta), así que
 * Google nunca ve Organization/WebSite/FAQPage/ItemList/Product.
 *
 * El fix contractual es envolver el elemento completo:
 *   {@html `<script type="application/ld+json">${json}</script>`}
 *
 * Este test lee el HTML prerenderizado (correr antes:
 *   pnpm --filter @kipuspay/marketing-web run build
 * ) y exige que TODO bloque ld+json sea JSON parseable con `@type`.
 */

const PAGES_DIR = fileURLToPath(
  new URL('../../.svelte-kit/output/prerendered/pages', import.meta.url),
);

interface LdBlock {
  json: { '@type'?: string | string[]; [key: string]: unknown };
  raw: string;
}

function readPrerendered(page: string): string {
  const file = `${PAGES_DIR}/${page}`;
  if (!existsSync(file)) {
    throw new Error(
      `Falta ${file}. Corre primero: pnpm --filter @kipuspay/marketing-web run build`,
    );
  }
  return readFileSync(file, 'utf8');
}

function extractLdBlocks(html: string): LdBlock[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (m) => ({ raw: m[1], json: JSON.parse(m[1]) }),
  );
}

function typesOf(block: LdBlock): string[] {
  const t = block.json['@type'];
  return Array.isArray(t) ? t : t !== undefined ? [t] : [];
}

describe('seo-prerender: JSON-LD parseable en HTML prerenderizado (B1)', () => {
  it('index.html — cada bloque ld+json es JSON con @type (Organization, WebSite, FAQPage, ItemList)', () => {
    const html = readPrerendered('index.html');

    expect(html).not.toContain('{@html');

    const blocks = extractLdBlocks(html);
    expect(blocks.length).toBeGreaterThanOrEqual(4);

    for (const block of blocks) {
      expect(typesOf(block).length).toBeGreaterThan(0);
    }

    const found = new Set(blocks.flatMap(typesOf));
    for (const expected of ['Organization', 'WebSite', 'FAQPage', 'ItemList']) {
      expect(found, `index.html debe declarar @type ${expected}`).toContain(expected);
    }
  });

  it('precios.html — Product con ofertas PEN parseables', () => {
    const html = readPrerendered('precios.html');

    expect(html).not.toContain('{@html');

    const products = extractLdBlocks(html).filter((b) => typesOf(b).includes('Product'));
    expect(products.length).toBe(1);

    const offers = products[0].json['offers'];
    expect(Array.isArray(offers)).toBe(true);
    for (const offer of offers as Array<Record<string, unknown>>) {
      expect(offer['@type']).toBe('Offer');
      expect(offer['priceCurrency']).toBe('PEN');
    }
  });

  it('ayuda.html — FAQPage parseable', () => {
    const html = readPrerendered('ayuda.html');

    expect(html).not.toContain('{@html');

    const faqs = extractLdBlocks(html).filter((b) => typesOf(b).includes('FAQPage'));
    expect(faqs.length).toBe(1);
    expect(Array.isArray(faqs[0].json['mainEntity'])).toBe(true);
  });
});
