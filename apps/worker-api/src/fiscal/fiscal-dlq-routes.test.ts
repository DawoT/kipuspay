import { describe, expect, it } from 'vitest';
import type { WorkerEnv } from '../auth/control-plane.js';
import {
  runGetFiscalDlqStatusHttp,
  type FiscalDlqItem,
  type FiscalDlqStatusResponseBody,
} from './fiscal-dlq-routes.js';

interface FakeDbOptions {
  salesByTenant?: Record<
    string,
    readonly {
      id: string;
      document_type: string;
      series: string;
      number: number;
      sunat_status: string;
      sunat_response_code: string | null;
      sunat_error_message: string | null;
      total_amount_cents: number;
      issued_at_lima: string;
      must_submit_by: string | null;
      created_at: string;
      outbox_id: string | null;
      outbox_status: string | null;
      outbox_attempt_count: number | null;
      outbox_last_error: string | null;
      outbox_quarantine_reason: string | null;
    }[]
  >;
  nonSaleByTenant?: Record<
    string,
    readonly {
      id: string;
      tenant_id: string;
      document_type: string;
      entity_id: string;
      status: string;
      attempt_count: number;
      must_submit_by: string | null;
      last_error: string | null;
      quarantine_reason: string | null;
      created_at: string;
    }[]
  >;
}

function createFakeDb(opts: FakeDbOptions = {}): {
  db: D1Database;
  queries: { sql: string; params: unknown[] }[];
} {
  const queries: { sql: string; params: unknown[] }[] = [];

  const db = {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          queries.push({ sql, params });
          return {
            all: async <T>() => {
              const tenantId = String(params[0] ?? '');
              if (sql.includes('FROM sales')) {
                const results = opts.salesByTenant?.[tenantId] ?? [];
                return { results: results as unknown as T[] };
              }
              if (sql.includes('FROM fiscal_non_sale_outbox')) {
                const results = opts.nonSaleByTenant?.[tenantId] ?? [];
                return { results: results as unknown as T[] };
              }
              return { results: [] as T[] };
            },
            first: async <T>() => {
              return null as T | null;
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  return { db, queries };
}

describe('runGetFiscalDlqStatusHttp', () => {
  it('RBAC: 403 para cajeros y roles no autorizados', async () => {
    const { db } = createFakeDb();
    const env = { DB: db } as WorkerEnv;

    const cashierRes = await runGetFiscalDlqStatusHttp(env, 'tenant-1', 'cashier');
    expect(cashierRes.status).toBe(403);
    expect(cashierRes.body).toEqual({ error: 'Forbidden', code: 'FORBIDDEN' });

    const viewerRes = await runGetFiscalDlqStatusHttp(env, 'tenant-1', 'viewer');
    expect(viewerRes.status).toBe(403);

    const anonymousRes = await runGetFiscalDlqStatusHttp(env, 'tenant-1', '');
    expect(anonymousRes.status).toBe(403);
  });

  it('401 cuando falta tenantId', async () => {
    const { db } = createFakeDb();
    const env = { DB: db } as WorkerEnv;

    const res = await runGetFiscalDlqStatusHttp(env, '', 'owner');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
  });

  it('503 cuando la base de datos no está disponible', async () => {
    const env = {} as WorkerEnv;
    const res = await runGetFiscalDlqStatusHttp(env, 'tenant-1', 'owner');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'DB unavailable', code: 'DB_UNAVAILABLE' });
  });

  it('200 para admin y owner con estructura vacía si no hay registros DLQ', async () => {
    const { db, queries } = createFakeDb();
    const env = { DB: db } as WorkerEnv;

    const adminRes = await runGetFiscalDlqStatusHttp(env, 'tenant-1', 'admin');
    expect(adminRes.status).toBe(200);

    const body = adminRes.body as unknown as FiscalDlqStatusResponseBody;
    expect(body.metrics).toEqual({
      quarantined: 0,
      failed: 0,
      deadlineExceeded: 0,
      total: 0,
    });
    expect(body.summary).toEqual(body.metrics);
    expect(body.items).toEqual([]);
    expect(body.nonSaleItems).toEqual([]);

    expect(queries.length).toBe(2);
    expect(queries[0].sql).toContain('WHERE s.tenant_id = ?');
    expect(queries[0].params).toEqual(['tenant-1']);
    expect(queries[1].sql).toContain('WHERE tenant_id = ?');
    expect(queries[1].params).toEqual(['tenant-1']);
  });

  it('Aislamiento multi-tenant DAT-12: solo devuelve registros del tenant consultado', async () => {
    const { db, queries } = createFakeDb({
      salesByTenant: {
        'tenant-a': [
          {
            id: 'sale-a1',
            document_type: '01',
            series: 'F001',
            number: 10,
            sunat_status: 'QUARANTINED',
            sunat_response_code: '400',
            sunat_error_message: 'Invalid XML Schema',
            total_amount_cents: 12000,
            issued_at_lima: '2026-08-25 10:00:00',
            must_submit_by: '2026-08-28 23:59:59',
            created_at: '2026-08-25T15:00:00Z',
            outbox_id: 'outbox-a1',
            outbox_status: 'QUARANTINED',
            outbox_attempt_count: 5,
            outbox_last_error: 'POISON_RETRY',
            outbox_quarantine_reason: 'POISON_RETRY',
          },
        ],
        'tenant-b': [
          {
            id: 'sale-b1',
            document_type: '03',
            series: 'B001',
            number: 20,
            sunat_status: 'DEADLINE_EXCEEDED',
            sunat_response_code: null,
            sunat_error_message: null,
            total_amount_cents: 5500,
            issued_at_lima: '2026-08-10 10:00:00',
            must_submit_by: '2026-08-17 23:59:59',
            created_at: '2026-08-10T15:00:00Z',
            outbox_id: 'outbox-b1',
            outbox_status: 'FAILED',
            outbox_attempt_count: 3,
            outbox_last_error: 'DEADLINE_EXCEEDED',
            outbox_quarantine_reason: null,
          },
        ],
      },
    });

    const env = { DB: db } as WorkerEnv;

    const resA = await runGetFiscalDlqStatusHttp(env, 'tenant-a', 'owner');
    expect(resA.status).toBe(200);
    const bodyA = resA.body as unknown as FiscalDlqStatusResponseBody;
    expect(bodyA.metrics.total).toBe(1);
    expect(bodyA.items[0].id).toBe('sale-a1');
    expect(bodyA.items[0].suggestCreditNoteEa).toBe(true);

    const resB = await runGetFiscalDlqStatusHttp(env, 'tenant-b', 'admin');
    expect(resB.status).toBe(200);
    const bodyB = resB.body as unknown as FiscalDlqStatusResponseBody;
    expect(bodyB.metrics.total).toBe(1);
    expect(bodyB.items[0].id).toBe('sale-b1');
    expect(bodyB.items[0].status).toBe('DEADLINE_EXCEEDED');
    expect(bodyB.items[0].suggestCreditNoteEa).toBe(true);

    expect(queries.some((q) => q.params[0] === 'tenant-a')).toBe(true);
    expect(queries.some((q) => q.params[0] === 'tenant-b')).toBe(true);
  });

  it('Calcula correctamente métricas de QUARANTINED, FAILED, DEADLINE_EXCEEDED y REJECTED con non-sales', async () => {
    const { db } = createFakeDb({
      salesByTenant: {
        'tenant-x': [
          {
            id: 'sale-1',
            document_type: '01',
            series: 'F001',
            number: 1,
            sunat_status: 'QUARANTINED',
            sunat_response_code: null,
            sunat_error_message: null,
            total_amount_cents: 1000,
            issued_at_lima: '2026-08-25 10:00:00',
            must_submit_by: null,
            created_at: '2026-08-25T15:00:00Z',
            outbox_id: 'outbox-1',
            outbox_status: 'QUARANTINED',
            outbox_attempt_count: 5,
            outbox_last_error: null,
            outbox_quarantine_reason: 'CHANNEL_ERROR:MISSING_SOL',
          },
          {
            id: 'sale-2',
            document_type: '03',
            series: 'B001',
            number: 2,
            sunat_status: 'DEADLINE_EXCEEDED',
            sunat_response_code: null,
            sunat_error_message: 'Plazo legal vencido',
            total_amount_cents: 2000,
            issued_at_lima: '2026-08-15 10:00:00',
            must_submit_by: '2026-08-22 23:59:59',
            created_at: '2026-08-15T15:00:00Z',
            outbox_id: 'outbox-2',
            outbox_status: 'FAILED',
            outbox_attempt_count: 1,
            outbox_last_error: 'DEADLINE_EXCEEDED',
            outbox_quarantine_reason: null,
          },
          {
            id: 'sale-3',
            document_type: '07',
            series: 'FC01',
            number: 3,
            sunat_status: 'REJECTED',
            sunat_response_code: '2324',
            sunat_error_message: 'Documento modificado no existe',
            total_amount_cents: 3000,
            issued_at_lima: '2026-08-24 10:00:00',
            must_submit_by: null,
            created_at: '2026-08-24T15:00:00Z',
            outbox_id: 'outbox-3',
            outbox_status: 'FAILED',
            outbox_attempt_count: 2,
            outbox_last_error: 'CDR_REJECTED',
            outbox_quarantine_reason: null,
          },
          {
            id: 'sale-4',
            document_type: '08',
            series: 'FD01',
            number: 4,
            sunat_status: 'FAILED',
            sunat_response_code: null,
            sunat_error_message: null,
            total_amount_cents: 4000,
            issued_at_lima: '2026-08-24 10:00:00',
            must_submit_by: null,
            created_at: '2026-08-24T15:00:00Z',
            outbox_id: 'outbox-4',
            outbox_status: 'FAILED',
            outbox_attempt_count: 3,
            outbox_last_error: 'HTTP_500_TIMEOUT',
            outbox_quarantine_reason: null,
          },
          {
            id: 'sale-5',
            document_type: 'NV',
            series: 'NV01',
            number: 5,
            sunat_status: 'FAILED',
            sunat_response_code: 'ERR_500',
            sunat_error_message: null,
            total_amount_cents: 500,
            issued_at_lima: '2026-08-24 10:00:00',
            must_submit_by: null,
            created_at: '2026-08-24T15:00:00Z',
            outbox_id: null,
            outbox_status: null,
            outbox_attempt_count: null,
            outbox_last_error: null,
            outbox_quarantine_reason: null,
          },
        ],
      },
      nonSaleByTenant: {
        'tenant-x': [
          {
            id: 'ns-1',
            tenant_id: 'tenant-x',
            document_type: '31',
            entity_id: 'guide-1',
            status: 'QUARANTINED',
            attempt_count: 1,
            must_submit_by: null,
            last_error: null,
            quarantine_reason: 'MISSING_XADES',
            created_at: '2026-08-25T16:00:00Z',
          },
          {
            id: 'ns-2',
            tenant_id: 'tenant-x',
            document_type: '20',
            entity_id: 'ret-1',
            status: 'FAILED',
            attempt_count: 2,
            must_submit_by: null,
            last_error: 'NETWORK_TIMEOUT',
            quarantine_reason: null,
            created_at: '2026-08-25T16:05:00Z',
          },
          {
            id: 'ns-3',
            tenant_id: 'tenant-x',
            document_type: '02',
            entity_id: 'per-1',
            status: 'FAILED',
            attempt_count: 0,
            must_submit_by: null,
            last_error: null,
            quarantine_reason: null,
            created_at: '2026-08-25T16:10:00Z',
          },
        ],
      },
    });

    const env = { DB: db } as WorkerEnv;
    const res = await runGetFiscalDlqStatusHttp(env, 'tenant-x', 'owner');
    expect(res.status).toBe(200);

    const body = res.body as unknown as FiscalDlqStatusResponseBody;
    expect(body.metrics).toEqual({
      quarantined: 2,
      deadlineExceeded: 1,
      failed: 5,
      total: 8,
    });

    expect(body.items.length).toBe(8);
    expect(body.nonSaleItems.length).toBe(3);

    const sale1 = body.items.find((i) => i.id === 'sale-1') as FiscalDlqItem;
    expect(sale1.status).toBe('QUARANTINED');
    expect(sale1.reason).toBe('CHANNEL_ERROR:MISSING_SOL');
    expect(sale1.suggestCreditNoteEa).toBe(true);

    const sale2 = body.items.find((i) => i.id === 'sale-2') as FiscalDlqItem;
    expect(sale2.status).toBe('DEADLINE_EXCEEDED');
    expect(sale2.suggestCreditNoteEa).toBe(true);

    const sale3 = body.items.find((i) => i.id === 'sale-3') as FiscalDlqItem;
    expect(sale3.status).toBe('REJECTED');
    expect(sale3.suggestCreditNoteEa).toBe(true);

    const sale5 = body.items.find((i) => i.id === 'sale-5') as FiscalDlqItem;
    expect(sale5.reason).toBe('ERR_500');
    expect(sale5.suggestCreditNoteEa).toBe(false); // NV no es CPE

    const ns1 = body.items.find((i) => i.id === 'ns-1') as FiscalDlqItem;
    expect(ns1.status).toBe('QUARANTINED');
    expect(ns1.reason).toBe('MISSING_XADES');
    expect(ns1.suggestCreditNoteEa).toBe(false);

    const ns3 = body.items.find((i) => i.id === 'ns-3') as FiscalDlqItem;
    expect(ns3.reason).toBe('NON_SALE_ERROR');
  });

  it('Cobertura de branches: outbox DEADLINE_EXCEEDED, outbox QUARANTINED, fallback reason', async () => {
    const { db } = createFakeDb({
      salesByTenant: {
        'tenant-y': [
          {
            id: 'sale-y1',
            document_type: '01',
            series: 'F001',
            number: 1,
            sunat_status: 'PENDING',
            sunat_response_code: null,
            sunat_error_message: null,
            total_amount_cents: 1000,
            issued_at_lima: '2026-08-25 10:00:00',
            must_submit_by: null,
            created_at: '2026-08-25T15:00:00Z',
            outbox_id: 'outbox-y1',
            outbox_status: 'FAILED',
            outbox_attempt_count: 1,
            outbox_last_error: 'DEADLINE_EXCEEDED',
            outbox_quarantine_reason: null,
          },
          {
            id: 'sale-y2',
            document_type: '01',
            series: 'F001',
            number: 2,
            sunat_status: 'PENDING',
            sunat_response_code: null,
            sunat_error_message: null,
            total_amount_cents: 1000,
            issued_at_lima: '2026-08-25 10:00:00',
            must_submit_by: null,
            created_at: '2026-08-25T15:00:00Z',
            outbox_id: 'outbox-y2',
            outbox_status: 'QUARANTINED',
            outbox_attempt_count: 5,
            outbox_last_error: null,
            outbox_quarantine_reason: null,
          },
          {
            id: 'sale-y3',
            document_type: '01',
            series: 'F001',
            number: 3,
            sunat_status: 'OTHER_UNKNOWN',
            sunat_response_code: null,
            sunat_error_message: null,
            total_amount_cents: 1000,
            issued_at_lima: '2026-08-25 10:00:00',
            must_submit_by: null,
            created_at: '2026-08-25T15:00:00Z',
            outbox_id: null,
            outbox_status: null,
            outbox_attempt_count: 0,
            outbox_last_error: null,
            outbox_quarantine_reason: null,
          },
        ],
      },
    });

    const env = { DB: db } as WorkerEnv;
    const res = await runGetFiscalDlqStatusHttp(env, 'tenant-y', 'owner');
    expect(res.status).toBe(200);

    const body = res.body as unknown as FiscalDlqStatusResponseBody;
    const y1 = body.items.find((i) => i.id === 'sale-y1') as FiscalDlqItem;
    expect(y1.status).toBe('DEADLINE_EXCEEDED');

    const y2 = body.items.find((i) => i.id === 'sale-y2') as FiscalDlqItem;
    expect(y2.status).toBe('QUARANTINED');
    expect(y2.reason).toBe('QUARANTINED'); // fallback reason

    const y3 = body.items.find((i) => i.id === 'sale-y3') as FiscalDlqItem;
    expect(y3.status).toBe('FAILED');
    expect(y3.reason).toBe('FAILED'); // fallback reason
  });
});
