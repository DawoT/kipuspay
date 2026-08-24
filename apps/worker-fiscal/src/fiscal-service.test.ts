import { describe, expect, it } from 'vitest';
import {
  bytesToBase64,
  issueSelfSignedX509,
  randomDek,
  sealPkcs8WithDek,
  serializeTenantCertEnvelope,
} from '@kipuspay/domain-fiscal-pe';
import FiscalService, { type FiscalServiceEnv } from './fiscal-service.js';
import type { FiscalXmlR2 } from './fiscal-drain.js';

/** R2 en memoria con mapa expuesto. */
function memoryR2(): FiscalXmlR2 & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    put: (k, v) => {
      map.set(k, v);
      return Promise.resolve();
    },
    get: (k) => {
      const v = map.get(k);
      if (v === undefined) return Promise.resolve(null);
      return Promise.resolve({ text: () => Promise.resolve(v) });
    },
  };
}

const executionContextStub = {} as unknown as ExecutionContext;

function makeService(env: Partial<FiscalServiceEnv>): FiscalService {
  return new FiscalService(executionContextStub, env);
}

interface OutboxMem {
  id: string;
  tenant_id: string;
  sale_id: string;
  status: string;
  attempt_count: number;
  must_submit_by: string | null;
  r2_xml_key: string | null;
  next_attempt_at: string;
}

interface MemSale {
  id: string;
  tenant_id: string;
  document_type: string;
  referenced_sale_id: string | null;
  series: string;
  number: number;
  client_document_type: string;
  client_document_number: string;
  client_name: string;
  total_taxable_cents: number;
  total_igv_cents: number;
  total_icbper_cents: number;
  total_amount_cents: number;
  issued_at_lima: string;
  deleted_at: string | null;
}

interface MemTenant {
  id: string;
  ruc: string | null;
  business_name: string;
  pse_mode?: string;
}

interface MemItem {
  id: string;
  sale_id: string;
  tenant_id: string;
  product_name: string;
  quantity: number;
  unit_price_cents: number;
  igv_affectation_code: string;
  igv_amount_cents: number;
  icbper_amount_cents: number;
  total_amount_cents: number;
}

interface TenantCertRow {
  tenant_id: string;
  alias: string;
  private_key_kms_ref: string;
  cert_chain_pem: string;
}

/** Aplica el efecto real de un UPDATE del producer/drain sobre la memoria. */
function applyUpdateEffect(
  state: {
    outbox: OutboxMem[];
    sales: MemSale[];
  },
  sql: string,
  params: unknown[],
): void {
  if (sql.includes('r2_xml_key = ?') && typeof params[0] === 'string') {
    const row = state.outbox.find((r) => r.sale_id === params[1]);
    if (row) row.r2_xml_key = params[0];
  }
  if (sql.includes('sunat_xml_hash')) {
    const sale = state.sales.find((s) => s.id === params[1]);
    if (sale && typeof params[0] === 'string') {
      (sale as { sunat_xml_hash?: string }).sunat_xml_hash = params[0];
    }
  }
  if (sql.includes("status = 'SENT'")) {
    const row = state.outbox.find((r) => r.id === params[0]);
    if (row) row.status = 'SENT';
  }
  if (sql.includes("status = 'FAILED'")) {
    const row = state.outbox.find((r) => r.id === params[0]);
    if (row) row.status = 'FAILED';
  }
  if (sql.includes("SET status = 'PENDING'")) {
    const row = state.outbox.find((r) => r.id === params[0]);
    if (row) row.status = 'PENDING';
  }
  if (sql.includes("status = 'QUARANTINED'")) {
    const row = state.outbox.find((r) => r.id === params[0]);
    if (row) row.status = 'QUARANTINED';
  }
}

/** DB en memoria: outbox + sales + items + tenants con dispatcher por fragmento SQL. */
function memoryDb(
  rows: OutboxMem[],
  sales: MemSale[],
  tenants: MemTenant[],
  items: MemItem[] = [],
  certs: TenantCertRow[] = [],
) {
  const state = {
    outbox: rows,
    sales,
    tenants,
    items,
    certs,
    updates: [] as { sql: string; params: unknown[] }[],
  };
  const claim = (limit: number): number => {
    let claimed = 0;
    for (const r of state.outbox) {
      if (claimed >= limit) break;
      if (r.status === 'PENDING' || r.status === 'FAILED') {
        r.status = 'PROCESSING';
        r.next_attempt_at = new Date(Date.now()).toISOString();
        claimed += 1;
      }
    }
    return claimed;
  };
  const impl = (sql: string, params: unknown[]) => ({
    all<T = unknown>() {
      if (sql.includes("f.status = 'PROCESSING'")) {
        return Promise.resolve({
          results: state.outbox
            .filter((r) => r.status === 'PROCESSING')
            .sort((a, b) =>
              String(a.must_submit_by ?? 'z').localeCompare(String(b.must_submit_by ?? 'z')),
            )
            .map((r) => {
              const sale = state.sales.find((s) => s.id === r.sale_id);
              const ref = sale
                ? state.sales.find((s) => s.id === sale.referenced_sale_id)
                : undefined;
              return {
                ...r,
                document_type: sale?.document_type ?? null,
                referenced_document_type: ref?.document_type ?? null,
              };
            }) as unknown as T[],
        });
      }
      if (sql.includes('FROM sale_items')) {
        return Promise.resolve({
          results: state.items.filter((i) => i.sale_id === params[0]) as unknown as T[],
        });
      }
      return Promise.resolve({ results: [] });
    },
    first<T = unknown>() {
      if (sql.includes('FROM fiscal_outbox')) {
        const row = state.outbox.find((r) => r.sale_id === params[0]);
        return Promise.resolve((row ?? null) as T | null);
      }
      if (sql.includes('deleted_at IS NULL')) {
        const sale = state.sales.find((s) => s.id === params[0] && s.tenant_id === params[1]);
        return Promise.resolve((sale ?? null) as T | null);
      }
      if (sql.includes('FROM sales')) {
        const sale = state.sales.find((s) => s.id === params[0]);
        return Promise.resolve((sale ?? null) as T | null);
      }
      if (sql.includes('FROM tenants')) {
        const tenant = state.tenants.find((t) => t.id === params[0]);
        return Promise.resolve((tenant ?? null) as T | null);
      }
      if (sql.includes('FROM tenant_certificates')) {
        const row = state.certs.find((c) => c.tenant_id === params[0]);
        return Promise.resolve((row ?? null) as T | null);
      }
      return Promise.resolve(null as T | null);
    },
    run() {
      if (sql.includes("SET status = 'PROCESSING'")) {
        return Promise.resolve({ meta: { changes: claim(Number(params[1] ?? 20)) } });
      }
      state.updates.push({ sql, params });
      applyUpdateEffect(state, sql, params);
      return Promise.resolve({ meta: { changes: 1 } });
    },
  });
  const chainable = (sql: string) => {
    const bound = (params: unknown[]) => ({
      ...impl(sql, params),
      _sql: sql,
      _params: params,
      bind: (...p: unknown[]) => bound(p),
    });
    return {
      bind: (...p: unknown[]) => bound(p),
      all: <T>() => impl(sql, []).all<T>(),
      first: <T>() => impl(sql, []).first<T>(),
      run: () => impl(sql, []).run(),
    };
  };
  return {
    state,
    prepare(sql: string) {
      return chainable(sql);
    },
    batch(stmts: readonly { _sql?: string; _params?: unknown[] }[]) {
      state.updates.push({ sql: 'BATCH', params: [] });
      // la batch del producer ejecuta los UPDATEs reales: simulamos los efectos
      for (const stmt of stmts) {
        applyUpdateEffect(state, stmt._sql ?? '', stmt._params ?? []);
      }
      return Promise.resolve([]);
    },
  };
}

const baseSale: MemSale = {
  id: 's1',
  tenant_id: 't1',
  document_type: '01',
  referenced_sale_id: null,
  series: 'F001',
  number: 5,
  client_document_type: '6',
  client_document_number: '20987654321',
  client_name: 'Cliente SAC',
  total_taxable_cents: 1000,
  total_igv_cents: 180,
  total_icbper_cents: 0,
  total_amount_cents: 1180,
  issued_at_lima: '2026-08-04T15:00:00.000Z',
  deleted_at: null,
};

describe('FiscalService (C6 entrypoint)', () => {
  const items: MemItem[] = [
    {
      id: 'i1',
      sale_id: 's1',
      tenant_id: 't1',
      product_name: 'Producto A&B',
      quantity: 1,
      unit_price_cents: 1000,
      igv_affectation_code: '10',
      igv_amount_cents: 180,
      icbper_amount_cents: 0,
      total_amount_cents: 1180,
    },
  ];

  it('produceMissing: factura 01 sin r2_xml_key → produce XML a R2 y setea key', async () => {
    const db = memoryDb(
      [
        {
          id: 'o1',
          tenant_id: 't1',
          sale_id: 's1',
          status: 'PENDING',
          attempt_count: 0,
          must_submit_by: '2026-08-20T00:00:00.000Z',
          r2_xml_key: null,
          next_attempt_at: '',
        },
      ],
      [baseSale],
      [{ id: 't1', ruc: '20123456789', business_name: 'KipusPay SAC' }],
      items,
    );
    const r2 = memoryR2();
    const svc = makeService({ DB: db as never, FISCAL_XML_R2: r2 });
    const result = await svc.produceMissing({ tenantId: 't1', saleId: 's1' });
    expect(result).toMatchObject({ outcome: 'PRODUCED' });
    expect(r2.map.has('fiscal-xml/t1/s1.xml')).toBe(true);
    expect(r2.map.get('fiscal-xml/t1/s1.xml')).toContain('F001-00000005');
  });

  it('produceMissing: sin DB o R2 → FEATURE_OFF (fail-closed)', async () => {
    const svc = makeService({});
    const result = await svc.produceMissing({ tenantId: 't1', saleId: 's1' });
    expect(result).toEqual({ outcome: 'FEATURE_OFF' });
  });

  it('drain: boleta (RC) nunca se envía; factura sin key se produce y envía', async () => {
    const db = memoryDb(
      [
        {
          id: 'o1',
          tenant_id: 't1',
          sale_id: 's-boleta',
          status: 'PENDING',
          attempt_count: 0,
          must_submit_by: '2026-08-20T00:00:00.000Z',
          r2_xml_key: 'boleta.xml',
          next_attempt_at: '',
        },
        {
          id: 'o2',
          tenant_id: 't2',
          sale_id: 's-factura',
          status: 'PENDING',
          attempt_count: 0,
          must_submit_by: '2026-08-09T00:00:00.000Z',
          r2_xml_key: null,
          next_attempt_at: '',
        },
      ],
      [
        { ...baseSale, id: 's-boleta', document_type: '03' },
        { ...baseSale, id: 's-factura', tenant_id: 't2', number: 9 },
      ],
      [
        { id: 't1', ruc: '20123456789', business_name: 'RC SAC' },
        { id: 't2', ruc: '20123456789', business_name: 'Factura SAC' },
      ],
      [{ ...items[0]!, id: 'i-f', sale_id: 's-factura', tenant_id: 't2' }],
    );
    const r2 = memoryR2();
    r2.map.set('boleta.xml', '<Invoice/>');
    const svc = makeService({ DB: db as never, FISCAL_XML_R2: r2 });
    const result = (await svc.drain({ limit: 20 })) as {
      accepted: number;
      skippedRc: number;
    };
    // boleta RC → skip; factura producida → R2 + enviada (mock PSE → accepted)
    expect(result.skippedRc).toBe(1);
    expect(result.accepted).toBe(1);
    expect(r2.map.has('fiscal-xml/t2/s-factura.xml')).toBe(true);
  });

  it('produceMissing TENANT_CERT sin KMS → MISSING_SIGNER', async () => {
    const db = memoryDb(
      [],
      [baseSale],
      [{ id: 't1', ruc: '20612913251', business_name: 'Rosa Negra', pse_mode: 'TENANT_CERT' }],
      items,
    );
    const r2 = memoryR2();
    const svc = makeService({ DB: db as never, FISCAL_XML_R2: r2 });
    const result = await svc.produceMissing({ tenantId: 't1', saleId: 's1' });
    expect(result).toEqual({ outcome: 'MISSING_SIGNER' });
    expect(r2.map.size).toBe(0);
  });

  it('produceMissing TENANT_CERT + mock KMS → PRODUCED firmado', async () => {
    const pair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
      },
      true,
      ['sign', 'verify'],
    );
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
    const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
    const certDer = await issueSelfSignedX509({
      privateKeyPkcs8Der: pkcs8,
      spkiDer: spki,
      commonName: 'Signer Fixture',
      organization: 'KipusPay Test',
      country: 'PE',
    });
    const dek = randomDek();
    const sealed = await sealPkcs8WithDek(dek, pkcs8);
    const envelope = serializeTenantCertEnvelope({
      kekVersion: 'v1',
      backupId: 'tenant-cert:SUNAT',
      wrappedDekB64: bytesToBase64(new Uint8Array(60).fill(7)),
      nonceB64: bytesToBase64(sealed.nonce),
      ciphertextB64: bytesToBase64(sealed.ciphertext),
    });
    const certPem = `-----BEGIN CERTIFICATE-----\n${bytesToBase64(certDer)}\n-----END CERTIFICATE-----`;
    const db = memoryDb(
      [],
      [baseSale],
      [{ id: 't1', ruc: '20612913251', business_name: 'Rosa Negra', pse_mode: 'TENANT_CERT' }],
      items,
      [
        {
          tenant_id: 't1',
          alias: 'SUNAT',
          private_key_kms_ref: 'secret:TENANT_CERT_ENVELOPE',
          cert_chain_pem: certPem,
        },
      ],
    );
    const r2 = memoryR2();
    const svc = makeService({
      DB: db as never,
      FISCAL_XML_R2: r2,
      TENANT_CERT_ENVELOPE: envelope,
      BACKUP_KMS: { unwrapDek: () => Promise.resolve(dek) },
    });
    const result = await svc.produceMissing({ tenantId: 't1', saleId: 's1' });
    expect(result).toMatchObject({ outcome: 'PRODUCED' });
    expect(r2.map.get('fiscal-xml/t1/s1.xml')).toContain('<ds:Signature');
  });

  it('wrapTenantDek sin KMS → MISSING_KMS; con wrapDek → wrappedDekB64', async () => {
    const missing = makeService({});
    await expect(
      missing.wrapTenantDek({ tenantId: 't1', dek: new Uint8Array(32) }),
    ).resolves.toEqual({ error: 'MISSING_KMS' });
    const wrappedDek = new Uint8Array(60).fill(4);
    const svc = makeService({
      BACKUP_KMS: {
        unwrapDek: () => Promise.resolve(new Uint8Array(32)),
        wrapDek: () => Promise.resolve({ wrappedDek, kekVersion: 'v1' }),
      },
    });
    const out = await svc.wrapTenantDek({
      tenantId: 'tenant_stg_rosa_negra_001',
      dek: new Uint8Array(32).fill(1),
    });
    expect(out).toMatchObject({ kekVersion: 'v1' });
    if ('wrappedDekB64' in out) expect(out.wrappedDekB64.length).toBeGreaterThan(20);
  });

  it('submitRc sin SOL → SOL_UNAVAILABLE; con SOL llama sendSummary', async () => {
    const missing = makeService({});
    await expect(
      missing.submitRc({ tenantId: 't1', summaryId: 'RC-1', xml: '<SummaryDocuments/>' }),
    ).resolves.toEqual({ accepted: false, cdrCode: '503', cdrMessage: 'SOL_UNAVAILABLE' });

    const urls: string[] = [];
    const svc = makeService({
      FEATURE_FISCAL_TRANSPORT_PLUGINS: '1',
      SUNAT_SOL_USER: '20612913251TESTUSER',
      SUNAT_SOL_PASSWORD: 'sol-pass-fixture',
      SUNAT_BILL_ENDPOINT_URL: 'https://e-beta.example.test/billService',
      FISCAL_PSE_FETCH: (url) => {
        urls.push(typeof url === 'string' ? url : 'bill');
        return Promise.resolve(new Response('gateway', { status: 503 }));
      },
    });
    const out = await svc.submitRc({
      tenantId: 't1',
      summaryId: 'RC-20260821-003',
      xml: '<SummaryDocuments/>',
    });
    expect(out.accepted).toBe(false);
    expect(urls).toEqual(['https://e-beta.example.test/billService']);
  });
});
