import { describe, expect, it } from 'vitest';
import { OFFICIAL_CHANNELS, PRIVACY_PAGE, RECLAMATIONS_PAGE, TERMS_PAGE } from './legal.js';

function blobOf(page: { sections: readonly { heading: string; body: string }[] }): string {
  return page.sections.map((s) => `${s.heading} ${s.body}`).join(' ');
}

describe('páginas legales (M2 — GTM §3.2, copy LPDP §5.7.2)', () => {
  it('términos: cupo, gracia y nota de venta sin jerga interna', () => {
    const blob = blobOf(TERMS_PAGE);
    expect(blob).toMatch(/1,000/);
    expect(blob).toMatch(/0\.05/);
    expect(blob).toMatch(/gracia/i);
    expect(blob).toMatch(/nota de venta/i);
    expect(blob).not.toMatch(/Sprint\s+\d+/i);
    expect(blob).not.toMatch(/GTM-\d+/);
    expect(blob).not.toMatch(/HTTP\s*\d{3}/);
    expect(blob).not.toMatch(/\b(PSE|CDR|UBL|ACID|D1|Edge|Workers)\b/i);
  });

  it('privacidad: consentimiento por propósito y retención fiscal junto al borrado', () => {
    const blob = blobOf(PRIVACY_PAGE);
    expect(blob).toMatch(/Mensajes por WhatsApp/);
    expect(blob).toMatch(/Promociones y avisos comerciales/);
    expect(blob).toMatch(/5 años/);
    expect(blob).toMatch(/sin tu nombre/);
    expect(blob).not.toMatch(/cuando quieras/);
    expect(blob).not.toMatch(/borramos todo/i);
    expect(blob).not.toMatch(/LPDP/);
  });
});

describe('documento maestro legal (M4A — versión final)', () => {
  it('canales oficiales en dominio kipuspay.com', () => {
    expect(OFFICIAL_CHANNELS).toMatchObject({
      contacto: 'contacto@kipuspay.com',
      soporte: 'soporte@kipuspay.com',
      privacidad: 'privacidad@kipuspay.com',
      facturacion: 'facturacion@kipuspay.com',
    });
  });

  it('libro de reclamaciones con procedimiento y respuesta en 15 días hábiles (Ley N° 31435)', () => {
    expect(RECLAMATIONS_PAGE.title).toContain('Reclamaciones');
    const blob = [
      RECLAMATIONS_PAGE.lede,
      ...RECLAMATIONS_PAGE.steps.map((s) => `${s.title} ${s.body}`),
    ].join(' ');
    expect(blob).toMatch(/15 días hábiles/);
    expect(blob).toMatch(/contacto@kipuspay\.com/);
    expect(blob).toMatch(/libro de reclamaciones/i);
    expect(RECLAMATIONS_PAGE.steps.length).toBeGreaterThanOrEqual(3);
  });

  it('privacidad incluye derechos ARCO con canal oficial', () => {
    const blob = blobOf(PRIVACY_PAGE);
    expect(blob).toMatch(/privacidad@kipuspay\.com/);
    expect(blob).toMatch(/rectific|acceso|oposición|cancelación/i);
  });

  it('términos: reembolsos, SLA y jurisdicción del contrato', () => {
    const blob = blobOf(TERMS_PAGE);
    expect(blob).toMatch(/15 días hábiles/);
    expect(blob).toMatch(/facturacion@kipuspay\.com/);
    expect(blob).toMatch(/99\.9%/);
    expect(blob).toMatch(/1 hora/);
    expect(blob).toMatch(/4 horas hábiles/);
    expect(blob).toMatch(/Lima/);
    expect(blob).toMatch(/reclamaciones/i);
  });

  it('F-12: jurisdicción precisa y citas de ley (29571 / 29733)', () => {
    const terms = blobOf(TERMS_PAGE);
    const privacy = blobOf(PRIVACY_PAGE);
    expect(terms).toMatch(/Distrito Judicial de Lima Centro/);
    expect(terms).toMatch(/Ley 29571/);
    expect(terms).not.toMatch(/tribunales de Lima/);
    expect(privacy).toMatch(/Ley 29733/);
    expect(privacy).toMatch(/003-2013-JUS/);
  });

  it('términos sin jerga interna de severidad', () => {
    const blob = blobOf(TERMS_PAGE);
    expect(blob).not.toMatch(/SEV-\d/);
  });
});
