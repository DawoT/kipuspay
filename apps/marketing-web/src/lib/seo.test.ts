import { describe, expect, it } from 'vitest';
import { absoluteUrl, ogImageFor, pageTitle } from './seo.js';

describe('seo helpers', () => {
  it('absoluteUrl y pageTitle', () => {
    expect(absoluteUrl('/para/retail')).toBe('https://kipuspay.pe/para/retail');
    expect(pageTitle('Retail')).toBe('Retail · KipusPay');
    expect(pageTitle('KipusPay vs Bsale')).toBe('KipusPay vs Bsale');
  });

  it('og:image es PNG absoluto, por rubro o de marca', () => {
    expect(ogImageFor()).toBe('https://kipuspay.pe/media/og-kipuspay.png');
    expect(ogImageFor('retail')).toBe('https://kipuspay.pe/media/og-retail.png');
    expect(ogImageFor('retail').endsWith('.png')).toBe(true);
  });
});
