import { readFileSync } from 'node:fs';
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
    expect(blob).not.toMatch(/GTM-\d+/);
    expect(blob).not.toMatch(/Sprint\s+\d+/i);
    expect(blob).not.toMatch(/HTTP\s*\d{3}/);
    expect(blob).not.toMatch(/Quality\s*Gate/i);
    for (const re of SECURITY_FORBIDDEN) {
      expect(blob).not.toMatch(re);
    }
  });

  it('amplía con el flujo SUNAT (4 pasos reales), retención y SLA sin jerga (M3)', () => {
    expect(SECURITY_PAGE.sunatFlow.steps).toHaveLength(4);
    const flow = SECURITY_PAGE.sunatFlow.steps.map((s) => `${s.title} ${s.body}`).join(' ');
    expect(flow).toMatch(/SUNAT/);
    expect(flow).not.toMatch(/PSE|CDR|UBL|ACID|D1|Edge|Workers|HTTP\s*\d{3}|GTM-\d+/i);
    expect(SECURITY_PAGE.retention.body).toMatch(/5 anos|5 años/);
    expect(SECURITY_PAGE.retention.body).toMatch(/sin su nombre/);
    expect(SECURITY_PAGE.sla.body).toMatch(/Enterprise/);
  });

  it('F-12: SLA detalla niveles de soporte por prioridad de negocio sin jerga técnica (AUD-07)', () => {
    expect(SECURITY_PAGE.sla.severities).toHaveLength(3);
    const titles = SECURITY_PAGE.sla.severities.map((s) => s.title).join(' ');
    expect(titles).toMatch(/Prioridad Crítica/);
    expect(titles).toMatch(/Prioridad Alta/);
    expect(titles).toMatch(/Prioridad Normal/);
    expect(titles).not.toMatch(/SEV-\d/);
    const blob = SECURITY_PAGE.sla.severities.map((s) => `${s.title} ${s.body}`).join(' ');
    expect(blob).toMatch(/1 hora/);
    expect(blob).toMatch(/4 horas/);
    expect(blob).toMatch(/soporte@kipuspay\.com/);
  });

  it('mantiene la trazabilidad interna como comentario, fuera del copy público', () => {
    const source = readFileSync(new URL('./security.ts', import.meta.url), 'utf8');
    expect(source).toMatch(/Sprint 2/);
    expect(source).toMatch(/Sprints 42\/47/);
    expect(source).toMatch(/GTM-02/);
    expect(source).toMatch(/support_sla_enterprise/);
  });
});
