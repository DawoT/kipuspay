/**
 * H3 (auditoría 0031) — conservación SUNAT del sobre RC firmado y del CDR.
 *
 * La obligación de conservar CPEs, CDRs y resúmenes es del EMISOR (Código de
 * Comercio art. 190 / Reglamento SUNAT). El XML unitario ya sigue el patrón
 * R2 (`fiscal_outbox.r2_xml_key`, mig 0019); el RC y su CDR no lo seguían.
 *
 * Contrato nuevo:
 *  (a) tras SUCCESS del RC, el sobre firmado se persiste en R2 en
 *      `rc/<tenant>/<id>.xml` y la fila lo referencia (r2_rc_xml_key);
 *  (b) el CDR que el transporte entrega como zip se persiste en
 *      `rc/<tenant>/<id>-cdr.zip` con referencia (r2_cdr_key); si el PSE aún
 *      no entrega zip, se archiva receipt JSON `rc/<tenant>/<id>-cdr.json`;
 *  (d) fallo de R2 NO revierte el SUCCESS del CDR (best-effort + warn): las
 *      claves quedan NULL — clave en D1 ⇒ objeto en R2 (referencia honesta).
 */
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { issueSelfSignedX509, signCpeXml } from '@kipuspay/domain-fiscal-pe';
import {
  buildDailySummary,
  rcCdrArchiveKey,
  rcCdrReceiptArchiveKey,
  rcXmlArchiveKey,
} from './build-daily-summary.js';

function memoryArchive(): {
  put(key: string, value: string | Uint8Array): Promise<void>;
  map: Map<string, string | Uint8Array>;
} {
  const map = new Map<string, string | Uint8Array>();
  return {
    map,
    put: (key, value) => {
      map.set(key, value);
      return Promise.resolve();
    },
  };
}

function bytesOf(value: string | Uint8Array | undefined): Uint8Array {
  if (value instanceof Uint8Array) return value;
  return new TextEncoder().encode(value ?? '');
}

async function seedRcTenant(tenantId: string): Promise<{
  branchId: string;
  sessionId: string;
  userId: string;
  saleId: string;
}> {
  const branchId = `b-${tenantId}`;
  const registerId = `cr-${tenantId}`;
  const userId = `u-${tenantId}`;
  const sessionId = `s-${tenantId}`;
  const saleId = `sale-${tenantId}`;
  const ruc = `20${String(Date.now()).slice(-9)}`;

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode, tax_regime, ruc)
       VALUES (?, ?, 'retail', 'shard-1', 'ELECTRONIC_ISSUER', 'RG', ?)`,
    ).bind(tenantId, 'RC Archive SAC', ruc),
    env.DB.prepare(
      `INSERT INTO branches (id, tenant_id, code, name, address) VALUES (?, ?, ?, ?, ?)`,
    ).bind(branchId, tenantId, 'C01', 'Centro', 'Lima'),
    env.DB.prepare(
      `INSERT INTO cash_registers (id, tenant_id, branch_id, name) VALUES (?, ?, ?, ?)`,
    ).bind(registerId, tenantId, branchId, 'Caja 1'),
    env.DB.prepare(
      `INSERT INTO users (id, tenant_id, branch_id, email, role) VALUES (?, ?, ?, ?, ?)`,
    ).bind(userId, tenantId, branchId, `${tenantId}@example.com`, 'cashier'),
    env.DB.prepare(
      `INSERT INTO cash_register_sessions
         (id, tenant_id, branch_id, cash_register_id, user_id, opening_balance_cents, status)
       VALUES (?, ?, ?, ?, ?, 0, 'OPEN')`,
    ).bind(sessionId, tenantId, branchId, registerId, userId),
    env.DB.prepare(
      `INSERT INTO branch_document_series
         (id, tenant_id, branch_id, document_type_code, series, current_number, authorization_status)
       VALUES (?, ?, ?, '03', 'B001', 0, 'INTERNAL')`,
    ).bind(`ser-${tenantId}`, tenantId, branchId),
    env.DB.prepare(
      `INSERT INTO sales (
         id, tenant_id, branch_id, cash_register_session_id, user_id,
         client_document_type, client_document_number, client_name,
         document_type, series, number, total_amount_cents,
         issued_at_lima, must_submit_by, void_status, sunat_status, alert_t24_sent, alert_t6_sent
       ) VALUES (?, ?, ?, ?, ?, '1', '12345678', 'Cliente', '03', 'B001', 1, 400,
                 '2026-08-01 12:00:00', '2026-08-08T23:59:59.999Z', 'NONE', 'PENDING', 0, 0)`,
    ).bind(saleId, tenantId, branchId, sessionId, userId),
  ]);

  return { branchId, sessionId, userId, saleId };
}

async function testSigner() {
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
    commonName: 'RC Archive Fixture',
    organization: 'KipusPay Test',
    country: 'PE',
  });
  return {
    sign: (xml: string) =>
      signCpeXml(xml, {
        privateKeyPkcs8Der: pkcs8,
        certDer,
        signingTime: '2026-08-21T16:00:00.000Z',
      }),
  };
}

async function summaryRow(summaryId: string): Promise<{
  status: string;
  r2_rc_xml_key: string | null;
  r2_cdr_key: string | null;
}> {
  const row = await env.DB.prepare(
    `SELECT status, r2_rc_xml_key, r2_cdr_key FROM sunat_daily_summaries WHERE id = ?`,
  )
    .bind(summaryId)
    .first<{ status: string; r2_rc_xml_key: string | null; r2_cdr_key: string | null }>();
  return {
    status: row?.status ?? '',
    r2_rc_xml_key: row?.r2_rc_xml_key ?? null,
    r2_cdr_key: row?.r2_cdr_key ?? null,
  };
}

describe('H3 — archivo R2 del sobre RC firmado y del CDR', () => {
  it('(a) SUCCESS persiste el sobre RC FIRMADO en rc/<tenant>/<id>.xml + referencia D1', async () => {
    const tenantId = `t-h3a-${Date.now()}`;
    await seedRcTenant(tenantId);
    const archive = memoryArchive();
    const result = await buildDailySummary(env.DB, {
      tenantId,
      summaryDate: '2026-08-01',
      nowMs: Date.parse('2026-08-02T12:00:00.000Z'),
      signer: await testSigner(),
      archive,
    });
    expect(result.status).toBe('SUCCESS');
    const xmlKey = rcXmlArchiveKey(tenantId, result.dailySummaryId!);

    expect(archive.map.has(xmlKey)).toBe(true);
    const stored = bytesOf(archive.map.get(xmlKey));
    const xml = new TextDecoder().decode(stored);
    expect(xml).toContain('<SummaryDocuments');
    expect(xml).toContain('<ds:Signature'); // sobre FIRMADO, no placeholder

    const row = await summaryRow(result.dailySummaryId!);
    expect(row.status).toBe('ACCEPTED');
    expect(row.r2_rc_xml_key).toBe(xmlKey);
  });

  it('(b) CDR zip del transporte → rc/<tenant>/<id>-cdr.zip (bytes exactos) + referencia D1', async () => {
    const tenantId = `t-h3b-${Date.now()}`;
    await seedRcTenant(tenantId);
    const archive = memoryArchive();
    const cdrZip = new TextEncoder().encode('PK\x03\x04 cdr-fixture-zip-body');
    const cdrZipB64 = btoa(String.fromCharCode(...cdrZip));
    const result = await buildDailySummary(env.DB, {
      tenantId,
      summaryDate: '2026-08-01',
      nowMs: Date.parse('2026-08-02T12:00:00.000Z'),
      archive,
      cdr: {
        submit: () =>
          Promise.resolve({ accepted: true, cdrCode: '0', cdrMessage: 'ok', cdrZipB64 }),
      },
    });
    expect(result.status).toBe('SUCCESS');
    const zipKey = rcCdrArchiveKey(tenantId, result.dailySummaryId!);

    expect(archive.map.has(zipKey)).toBe(true);
    expect(bytesOf(archive.map.get(zipKey))).toEqual(cdrZip); // sin pérdida

    const row = await summaryRow(result.dailySummaryId!);
    expect(row.r2_cdr_key).toBe(zipKey);
  });

  it('(b2) PSE sin zip → receipt JSON rc/<tenant>/<id>-cdr.json + referencia D1', async () => {
    const tenantId = `t-h3b2-${Date.now()}`;
    await seedRcTenant(tenantId);
    const archive = memoryArchive();
    const result = await buildDailySummary(env.DB, {
      tenantId,
      summaryDate: '2026-08-01',
      nowMs: Date.parse('2026-08-02T12:00:00.000Z'),
      archive,
      cdr: {
        submit: () =>
          Promise.resolve({ accepted: true, cdrCode: '0', cdrMessage: 'Mock RC CDR accepted' }),
      },
    });
    expect(result.status).toBe('SUCCESS');
    const receiptKey = rcCdrReceiptArchiveKey(tenantId, result.dailySummaryId!);

    expect(archive.map.has(receiptKey)).toBe(true);
    const receipt = JSON.parse(new TextDecoder().decode(bytesOf(archive.map.get(receiptKey))));
    expect(receipt.cdrCode).toBe('0');
    expect(receipt.accepted).toBe(true);
    expect(receipt.summaryId).toBe(result.dailySummaryId);

    const row = await summaryRow(result.dailySummaryId!);
    expect(row.r2_cdr_key).toBe(receiptKey);
  });

  it('(d) chaos: fallo de R2 NO revierte el SUCCESS del CDR — claves NULL + warn', async () => {
    const tenantId = `t-h3d-${Date.now()}`;
    await seedRcTenant(tenantId);
    const failingArchive = {
      put: (_key: string, _value: string | Uint8Array) =>
        Promise.reject(new Error('R2_UNAVAILABLE')),
    };
    let warned = '';
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warned = args.map(String).join(' ');
    };
    try {
      const result = await buildDailySummary(env.DB, {
        tenantId,
        summaryDate: '2026-08-01',
        nowMs: Date.parse('2026-08-02T12:00:00.000Z'),
        archive: failingArchive,
      });
      // El CDR ya es válido ante SUNAT: el SUCCESS permanece intacto.
      expect(result.status).toBe('SUCCESS');

      const row = await summaryRow(result.dailySummaryId!);
      expect(row.status).toBe('ACCEPTED'); // estado fiscal intacto
      expect(row.r2_rc_xml_key).toBeNull(); // referencia honesta: sin objeto ⇒ sin clave
      expect(row.r2_cdr_key).toBeNull();

      const sales = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM sales WHERE tenant_id = ? AND sunat_status = 'ACCEPTED'`,
      )
        .bind(tenantId)
        .first<{ n: number }>();
      expect(sales?.n).toBe(1); // la venta no se pierde ni se revierte
      expect(warned).toContain('RC_ARCHIVE_FAILED');
    } finally {
      console.warn = originalWarn;
    }
  });
});
