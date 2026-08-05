import { describe, expect, it } from 'vitest';
import { SECURITY_FORBIDDEN, SECURITY_PAGE } from './security.js';

describe('security page content', () => {
  it('expone 4 pilares §5.7.1 sin jerga tecnica ni promesas GTM-09/12 falsas', () => {
    expect(SECURITY_PAGE.pillars).toHaveLength(4);
    const blob = [
      SECURITY_PAGE.headline,
      SECURITY_PAGE.lede,
      ...SECURITY_PAGE.pillars.map((p) => `${p.title} ${p.body}`),
      ...SECURITY_PAGE.disclaimers,
    ].join(' ');
    expect(blob).not.toMatch(/\b(PSE|CDR|UBL|ACID|D1|Edge|Workers)\b/i);
    expect(blob).toMatch(/42/);
    expect(blob).toMatch(/47/);
    for (const re of SECURITY_FORBIDDEN) {
      expect(blob).not.toMatch(re);
    }
  });

  it('declara evidencia por pilar', () => {
    for (const p of SECURITY_PAGE.pillars) {
      expect(p.evidenceRef.length).toBeGreaterThan(8);
    }
  });
});
