import { describe, expect, it } from 'vitest';
/* eslint-disable no-secrets/no-secrets -- fixtures XML de prueba */
import {
  produceFiscalXmlForSale,
  r2XmlKeyForSale,
  type FiscalXmlR2Like,
} from './fiscal-xml-producer.js';
import type { D1DatabaseLike } from './index.js';

/** R2 en memoria que también expone el contenido para asserts. */
function memoryR2(): FiscalXmlR2Like & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    put: (k, v) => {
      map.set(k, v);
      return Promise.resolve();
    },
  };
}

interface MemoryDbState {
  outbox: { sale_id: string; r2_xml_key: string | null }[];
  referenced: {
    document_type: string | null;
    series?: string;
    number?: number;
    total_amount_cents?: number;
  };
  sale: Record<string, unknown> | null;
  items: Record<string, unknown>[];
  referencedItems: Record<string, unknown>[];
  tenant: { ruc: string | null; business_name: string } | null;
  updates: { sql: string; params: unknown[] }[];
}

/**
 * Memoria D1 orientada al producer: despacha por fragmento SQL. Sigue el
 * patrón de fiscal-drain.test.ts (memory DB) pero con el contrato D1 real.
 */
function memoryDb(state: MemoryDbState): D1DatabaseLike {
  const impl = (sql: string, params: unknown[]) => ({
    all<T = unknown>() {
      if (sql.includes('FROM sale_items')) {
        const isReferenced = sql.includes('ref.') || sql.includes('orig.');
        const rows = (isReferenced ? state.referencedItems : state.items) as T[];
        return Promise.resolve({ results: rows, success: true, meta: {} });
      }
      return Promise.resolve({ results: [] as T[], success: true, meta: {} });
    },
    first<T = unknown>() {
      if (sql.includes('FROM fiscal_outbox')) {
        const saleId = params[0];
        const row = state.outbox.find((o) => o.sale_id === saleId);
        return Promise.resolve((row ?? null) as T | null);
      }
      if (sql.includes('deleted_at IS NULL')) {
        return Promise.resolve((state.sale ?? null) as T | null);
      }
      if (sql.includes('FROM sales')) {
        return Promise.resolve(state.referenced as T | null);
      }
      if (sql.includes('FROM tenants')) {
        return Promise.resolve((state.tenant ?? null) as T | null);
      }
      return Promise.resolve(null as T | null);
    },
    run() {
      state.updates.push({ sql, params });
      return Promise.resolve({ results: [], success: true, meta: { changes: 1 } });
    },
  });
  const chainable = (sql: string) => ({
    bind: (...p: unknown[]) => {
      const bound = (...inner: unknown[]) => ({ ...impl(sql, [...p, ...inner]) });
      return {
        all: <T>() => bound().all<T>(),
        first: <T>() => bound().first<T>(),
        run: () => bound().run(),
      };
    },
  });
  return {
    prepare(sql: string) {
      return chainable(sql);
    },
    batch(stmts: readonly unknown[]) {
      for (const stmt of stmts) {
        // stmts ya bindeados: no tenemos el SQL fácil; los escribimos como marca.
        void stmt;
      }
      state.updates.push({ sql: 'BATCH', params: [] });
      return Promise.resolve([]);
    },
  } as unknown as D1DatabaseLike;
}

const baseSale = {
  id: 'sale-1',
  tenant_id: 't1',
  document_type: '01',
  referenced_sale_id: null,
  series: 'F001',
  number: 7,
  client_document_type: '6',
  client_document_number: '20987654321',
  client_name: 'Cliente SAC',
  total_taxable_cents: 1000,
  total_igv_cents: 180,
  total_icbper_cents: 0,
  total_amount_cents: 1180,
  issued_at_lima: '2026-08-04T15:00:00.000Z',
  credit_note_motive_code: null,
};

const baseItems = [
  {
    id: 'i1',
    product_name: 'Producto A&B',
    quantity: 1,
    unit_price_cents: 1000,
    igv_affectation_code: '10',
    igv_amount_cents: 180,
    icbper_amount_cents: 0,
    total_amount_cents: 1180,
  },
];

function freshState(sale: Record<string, unknown> | null = baseSale): MemoryDbState {
  return {
    outbox: [],
    referenced: { document_type: null },
    sale,
    items: baseItems,
    referencedItems: baseItems,
    tenant: { ruc: '20123456789', business_name: 'KipusPay SAC' },
    updates: [],
  };
}

describe('produceFiscalXmlForSale (C6 producer)', () => {
  it('factura 01 → genera XML, persiste a R2 y setea r2_xml_key + hash', async () => {
    const state = freshState();
    const r2 = memoryR2();
    const result = await produceFiscalXmlForSale({
      db: memoryDb(state),
      r2,
      tenantId: 't1',
      saleId: 'sale-1',
    });

    expect(result.outcome).toBe('PRODUCED');
    if (result.outcome !== 'PRODUCED') throw new Error('expected PRODUCED');
    const key = r2XmlKeyForSale('t1', 'sale-1');
    expect(result.r2XmlKey).toBe(key);
    const xml = r2.map.get(key);
    expect(xml).toBeDefined();
    expect(xml).toContain('F001-00000007');
    expect(xml).toContain('A&amp;B');
    expect(result.xmlHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('idempotente: si el outbox ya tiene r2_xml_key → no-op sin re-generar', async () => {
    const state = freshState();
    state.outbox = [{ sale_id: 'sale-1', r2_xml_key: 'fiscal-xml/t1/sale-1.xml' }];
    const r2 = memoryR2();
    const result = await produceFiscalXmlForSale({
      db: memoryDb(state),
      r2,
      tenantId: 't1',
      saleId: 'sale-1',
    });
    expect(result.outcome).toBe('NOOP_ALREADY_HAS_KEY');
    expect(r2.map.size).toBe(0);
  });

  it('boleta 03 → SKIP_RC (no genera XML unitario)', async () => {
    const state = freshState({ ...baseSale, document_type: '03' });
    const r2 = memoryR2();
    const result = await produceFiscalXmlForSale({
      db: memoryDb(state),
      r2,
      tenantId: 't1',
      saleId: 'sale-1',
    });
    expect(result).toEqual({ outcome: 'SKIP_RC', channel: 'RC' });
    expect(r2.map.size).toBe(0);
  });

  it('07 que referencia factura → PRODUCED (XML unitario de NC, Ops-3)', async () => {
    const state = freshState({
      ...baseSale,
      document_type: '07',
      referenced_sale_id: 'sale-0',
      series: 'FC01',
      number: 1,
      total_taxable_cents: 1000,
      total_igv_cents: 180,
      total_amount_cents: 1180,
      credit_note_motive_code: '01',
    });
    state.referenced = {
      document_type: '01',
      series: 'F001',
      number: 7,
      total_amount_cents: 1180,
    };
    const r2 = memoryR2();
    const result = await produceFiscalXmlForSale({
      db: memoryDb(state),
      r2,
      tenantId: 't1',
      saleId: 'sale-1',
    });
    expect(result.outcome).toBe('PRODUCED');
    const xml = r2.map.get(r2XmlKeyForSale('t1', 'sale-1'));
    expect(xml).toBeDefined();
    expect(xml).toContain('<CreditNote');
    expect(xml).toContain(
      '<cbc:CreditNoteTypeCode listID="0101" listAgencyName="PE:SUNAT" listName="Tipo de Operacion">07</cbc:CreditNoteTypeCode>',
    );
    expect(xml).toContain('<cbc:ReferenceID>F001-00000007</cbc:ReferenceID>');
    expect(xml).toContain('<cac:BillingReference>');
    expect(xml).toContain('<cbc:ResponseCode>01</cbc:ResponseCode>');
    expect(xml).toContain('<cbc:Description>Anulacion de la operacion</cbc:Description>');
    expect(xml).toContain('<cbc:DocumentTypeCode>01</cbc:DocumentTypeCode>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="PEN">11.80</cbc:PayableAmount>');
    expect(xml).toContain('FC01-00000001');
  });

  it('08 que referencia factura → PRODUCED (XML unitario de ND, Ops-3)', async () => {
    const state = freshState({
      ...baseSale,
      document_type: '08',
      referenced_sale_id: 'sale-0',
      series: 'FD01',
      number: 2,
      total_taxable_cents: 500,
      total_igv_cents: 90,
      total_amount_cents: 590,
      credit_note_motive_code: '02',
    });
    state.referenced = {
      document_type: '01',
      series: 'F001',
      number: 8,
      total_amount_cents: 1180,
    };
    const r2 = memoryR2();
    const result = await produceFiscalXmlForSale({
      db: memoryDb(state),
      r2,
      tenantId: 't1',
      saleId: 'sale-1',
    });
    expect(result.outcome).toBe('PRODUCED');
    const xml = r2.map.get(r2XmlKeyForSale('t1', 'sale-1'));
    expect(xml).toBeDefined();
    expect(xml).toContain('<DebitNote');
    expect(xml).toContain(
      '<cbc:DebitNoteTypeCode listID="0101" listAgencyName="PE:SUNAT" listName="Tipo de Operacion">08</cbc:DebitNoteTypeCode>',
    );
    expect(xml).toContain('<cbc:ReferenceID>F001-00000008</cbc:ReferenceID>');
    expect(xml).toContain('<cbc:ResponseCode>02</cbc:ResponseCode>');
    expect(xml).toContain('<cbc:Description>Aumento en el valor</cbc:Description>');
    expect(xml).toContain('<cbc:DocumentTypeCode>01</cbc:DocumentTypeCode>');
    expect(xml).toContain('FD01-00000002');
  });

  it('07 que referencia boleta → SKIP_RC', async () => {
    const state = freshState({ ...baseSale, document_type: '07', referenced_sale_id: 'sale-0' });
    state.referenced = { document_type: '03' };
    const r2 = memoryR2();
    const result = await produceFiscalXmlForSale({
      db: memoryDb(state),
      r2,
      tenantId: 't1',
      saleId: 'sale-1',
    });
    expect(result).toEqual({ outcome: 'SKIP_RC', channel: 'RC' });
    expect(r2.map.size).toBe(0);
  });

  it('NV → SKIP_NONE (nunca SUNAT)', async () => {
    const state = freshState({ ...baseSale, document_type: 'NV' });
    const r2 = memoryR2();
    const result = await produceFiscalXmlForSale({
      db: memoryDb(state),
      r2,
      tenantId: 't1',
      saleId: 'sale-1',
    });
    expect(result).toEqual({ outcome: 'SKIP_NONE', channel: 'NONE' });
    expect(r2.map.size).toBe(0);
  });

  it('venta inexistente → NOT_FOUND', async () => {
    const state = freshState(null);
    const r2 = memoryR2();
    const result = await produceFiscalXmlForSale({
      db: memoryDb(state),
      r2,
      tenantId: 't1',
      saleId: 'nope',
    });
    expect(result.outcome).toBe('NOT_FOUND');
    expect(r2.map.size).toBe(0);
  });

  it('factura sin RUC de emisor → error (invariante fiscal, no produce)', async () => {
    const state = freshState();
    state.tenant = { ruc: null, business_name: 'KipusPay SAC' };
    const r2 = memoryR2();
    await expect(
      produceFiscalXmlForSale({ db: memoryDb(state), r2, tenantId: 't1', saleId: 'sale-1' }),
    ).rejects.toThrow(/INVALID_ISSUER_RUC/);
    expect(r2.map.size).toBe(0);
  });
});
