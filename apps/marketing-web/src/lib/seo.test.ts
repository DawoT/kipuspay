import { describe, expect, it } from 'vitest';
import { absoluteUrl, pageTitle } from './seo.js';

describe('seo helpers', () => {
  it('absoluteUrl y pageTitle', () => {
    expect(absoluteUrl('/para/retail')).toBe('https://kipuspay.pe/para/retail');
    expect(pageTitle('Retail')).toBe('Retail · KipusPay');
    expect(pageTitle('KipusPay vs Bsale')).toBe('KipusPay vs Bsale');
  });
});
