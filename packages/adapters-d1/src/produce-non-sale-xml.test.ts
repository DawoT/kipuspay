import { describe, expect, it } from 'vitest';
import { produceFiscalXmlForNonSale } from './produce-non-sale-xml.js';

function mockDb(world: {
  outbox?: {
    id: string;
    document_type: '31' | '02' | '20';
    entity_id: string;
    r2_xml_key: string | null;
  } | null;
  tenant?: { ruc: string; business_name: string } | null;
  gre?: Record<string, unknown> | null;
  items?: { quantity_microunits: number; uom_code: string; description: string }[];
  withholding?: Record<string, unknown> | null;
}): never {
  const first = (sql: string) => {
    if (sql.includes('FROM fiscal_non_sale_outbox')) return world.outbox ?? null;
    if (sql.includes('FROM tenants')) return world.tenant ?? null;
    if (sql.includes('FROM remission_guides')) return world.gre ?? null;
    if (sql.includes('FROM perceptions') || sql.includes('FROM retentions')) {
      return world.withholding ?? null;
    }
    return null;
  };
  return {
    prepare: (sql: string) => ({
      bind: () => ({
        first: () => Promise.resolve(first(sql)),
        all: () => Promise.resolve({ results: world.items ?? [] }),
        run: () => Promise.resolve({ success: true }),
      }),
    }),
  } as never;
}

describe('produceFiscalXmlForNonSale', () => {
  it('GRE 31: quantity microunits / 1e6 y DespatchAdvice', async () => {
    let stored = '';
    const r2 = {
      put: (_key: string, xml: string) => {
        stored = xml;
        return Promise.resolve();
      },
    };
    const key = await produceFiscalXmlForNonSale({
      db: mockDb({
        outbox: { id: 'o1', document_type: '31', entity_id: 'g1', r2_xml_key: null },
        tenant: { ruc: '20123456789', business_name: 'Emisor SAC' },
        gre: {
          series: 'T001',
          number: 1,
          transfer_reason_code: '01',
          transport_mode_code: '01',
          vehicle_plate: 'ABC-123',
          carrier_document_type: '1',
          carrier_document_number: '12345678',
          carrier_name: 'Carlos',
          origin_ubigeo: '150101',
          origin_address: 'Av Lima',
          destination_ubigeo: '070101',
          destination_address: 'Callao',
          transfer_started_at: '2026-08-21T20:00:00.000Z',
        },
        items: [{ quantity_microunits: 2_000_000, uom_code: 'NIU', description: 'Caja' }],
      }),
      r2,
      tenantId: 't1',
      outboxId: 'o1',
    });
    expect(key).toContain('nonsale-g1.xml');
    expect(stored).toContain('<DespatchAdvice');
    expect(stored).toContain('>2</cbc:DeliveredQuantity>');
    expect(stored).not.toContain('contingencia');
  });
});
