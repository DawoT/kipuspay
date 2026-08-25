import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { absoluteUrl, ogImageFor, pageTitle } from './seo.js';

describe('seo helpers & Twitter Cards (AUD-06)', () => {
  it('absoluteUrl y pageTitle', () => {
    expect(absoluteUrl('/para/retail')).toBe('https://kipuspay.com/para/retail');
    expect(pageTitle('Retail')).toBe('Retail · KipusPay');
    expect(pageTitle('KipusPay vs Bsale')).toBe('KipusPay vs Bsale');
  });

  it('og:image es PNG absoluto, por rubro o de marca', () => {
    expect(ogImageFor()).toBe('https://kipuspay.com/media/og-kipuspay.png');
    expect(ogImageFor('home')).toBe('https://kipuspay.com/media/og-kipuspay.png');
    expect(ogImageFor('retail')).toBe('https://kipuspay.com/media/og-retail.png');
    expect(ogImageFor('retail').endsWith('.png')).toBe(true);
  });

  it('layout y app.html inyectan etiquetas Twitter Cards estándar', () => {
    const layout = readFileSync(new URL('../routes/+layout.svelte', import.meta.url), 'utf8');
    expect(layout).toContain('name="twitter:card" content="summary_large_image"');
    expect(layout).toContain('name="twitter:title"');
    expect(layout).toContain('name="twitter:description"');
    expect(layout).toContain('name="twitter:image"');

    const appHtml = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
    expect(appHtml).toContain('name="twitter:card" content="summary_large_image"');
    expect(appHtml).toContain('name="twitter:title"');
    expect(appHtml).toContain('name="twitter:description"');
    expect(appHtml).toContain('name="twitter:image"');
  });
});
