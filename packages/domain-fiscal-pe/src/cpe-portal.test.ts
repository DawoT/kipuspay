/**
 * H4 (auditoría 0031) — portal CPE operativo end-to-end.
 * Enlace distribuible por derivación determinista + constancia de recepción
 * (estado CDR autoritativo en D1) + enlaces de descarga en el HTML.
 */
import { describe, expect, it } from 'vitest';
import {
  buildCpePortalUrl,
  mintPortalToken,
  renderCpePortalHtml,
  renderCpeReceiptXml,
  type CpeReceiptInput,
} from './cpe-portal.js';

const NOW = Date.parse('2026-08-24T12:00:00.000Z');

function lookupFixture(overrides: Partial<Parameters<typeof renderCpePortalHtml>[0]> = {}) {
  return {
    tenantId: 't1',
    saleId: 's-cpe-1',
    issuedAtMs: NOW - 1000,
    xmlHash: 'abc123',
    documentType: '01',
    series: 'F001',
    correlative: 1,
    totalAmountCents: 1180,
    ...overrides,
  };
}

describe('H4: enlace distribuible del portal CPE (derivación determinista)', () => {
  it('buildCpePortalUrl deriva URL estable con el token de mintPortalToken', async () => {
    const { url, token } = await buildCpePortalUrl({
      baseUrl: 'https://api.kipuspay.com',
      tenantId: 't1',
      saleId: 's-cpe-1',
      secret: 'whsec-portal-test',
    });
    expect(token).toBe(await mintPortalToken('t1', 's-cpe-1', 'whsec-portal-test'));
    expect(url).toBe(`https://api.kipuspay.com/v1/cpe/portal/t1/s-cpe-1?token=${token}`);
  });

  it('normaliza baseUrl con slash final (misma URL que sin slash)', async () => {
    const con = await buildCpePortalUrl({
      baseUrl: 'https://api.kipuspay.com/',
      tenantId: 't1',
      saleId: 's1',
      secret: 'sec',
    });
    const sin = await buildCpePortalUrl({
      baseUrl: 'https://api.kipuspay.com',
      tenantId: 't1',
      saleId: 's1',
      secret: 'sec',
    });
    expect(con.url).toBe(sin.url);
  });

  it('tokens de ventas distintas no colisionan (enlace por documento)', async () => {
    const a = await buildCpePortalUrl({
      baseUrl: 'https://api',
      tenantId: 't1',
      saleId: 's1',
      secret: 'sec',
    });
    const b = await buildCpePortalUrl({
      baseUrl: 'https://api',
      tenantId: 't1',
      saleId: 's2',
      secret: 'sec',
    });
    expect(a.token).not.toBe(b.token);
  });
});

describe('H4: HTML del portal con descargas XML/constancia', () => {
  it('con fileUrls incluye enlaces de descarga escapados', () => {
    const view = renderCpePortalHtml(
      lookupFixture({
        fileUrls: {
          xml: '/v1/cpe/portal/t1/s?token=ab&file=xml',
          cdr: '/v1/cpe/portal/t1/s?token=ab&file=cdr',
        },
      }),
      NOW,
    );
    expect(view.html).toContain('href="/v1/cpe/portal/t1/s?token=ab&amp;file=xml"');
    expect(view.html).toContain('href="/v1/cpe/portal/t1/s?token=ab&amp;file=cdr"');
  });

  it('sin fileUrls no incluye enlaces de descarga (compatibilidad)', () => {
    const view = renderCpePortalHtml(lookupFixture(), NOW);
    expect(view.html).not.toContain('file=xml');
    expect(view.html).not.toContain('file=cdr');
  });
});

describe('H4: constancia de recepción desde estado autoritativo D1', () => {
  const base: CpeReceiptInput = {
    documentType: '01',
    series: 'F001',
    correlative: 1,
    issuedAtMs: NOW - 1000,
    sunatStatus: 'ACCEPTED',
    responseCode: null,
    responseMessage: null,
    dailySummary: null,
  };

  it('factura ACCEPTED unitaria → XML con comprobante y estado', () => {
    const xml = renderCpeReceiptXml(base);
    expect(xml).toContain('<ConstanciaRecepcionCPE');
    expect(xml).toContain('tipo="01"');
    expect(xml).toContain('serie="F001"');
    expect(xml).toContain('numero="00000001"');
    expect(xml).toContain('<EstadoSunat>ACCEPTED</EstadoSunat>');
    expect(xml).toContain('generador="KipusPay"');
  });

  it('boleta aceptada vía RC incluye los datos del resumen diario', () => {
    const xml = renderCpeReceiptXml({
      ...base,
      documentType: '03',
      series: 'B001',
      correlative: 7,
      responseCode: null,
      dailySummary: { id: 'rc-1', status: 'ACCEPTED', cdrCode: '0', cdrMessage: 'OK' },
    });
    expect(xml).toContain('<ResumenDiario');
    expect(xml).toContain('id="rc-1"');
    expect(xml).toContain('codigoCDR="0"');
  });

  it('escapa valores dinámicos del mensaje SUNAT (sin XML roto)', () => {
    const xml = renderCpeReceiptXml({
      ...base,
      responseMessage: 'Rechazado <b>& "grave"',
    });
    expect(xml).toContain('&lt;b&gt;&amp; &quot;grave&quot;');
    expect(xml).not.toContain('<b>');
  });
});
