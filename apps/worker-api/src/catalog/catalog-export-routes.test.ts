import { describe, expect, it, vi } from 'vitest';
import { runExportCatalogCsvHttp, runExportSalesCsvHttp } from './catalog-export-routes.js';

function env(rows: unknown[] | null) {
  return {
    DB: {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          all: vi.fn(() =>
            Promise.resolve({ results: rows ?? [] }),
          ),
        })),
      })),
    },
  } as never;
}

describe('runExportCatalogCsvHttp (S11-E10)', () => {
  it('exporta catálogo del tenant en CSV con header', async () => {
    const res = await runExportCatalogCsvHttp(
      env([
        { id: 'p1', sku: 'SKU-1', barcode: null, name: 'Arroz', price_cents: 990, stock: 10, unit_code: 'NIU', is_active: 1 },
        { id: 'p2', sku: 'SKU,2', barcode: '123', name: 'Leche "A"', price_cents: 450, stock: 0, unit_code: 'NIU', is_active: 0 },
      ]),
      't1',
    );
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('string');
    const csv = res.body as string;
    expect(csv.startsWith('id,sku,barcode,name,price_cents,stock,unit_code,is_active\n')).toBe(true);
    expect(csv).toContain('Arroz,990,10,NIU,1');
    // Comillas y comas escapadas.
    expect(csv).toContain('"SKU,2"');
    expect(csv).toContain('"Leche ""A"""');
  });

  it('sin DB o sin tenant → 503 fail-closed', async () => {
    expect((await runExportCatalogCsvHttp(undefined, 't1')).status).toBe(503);
    expect((await runExportCatalogCsvHttp(env([]), '')).status).toBe(503);
  });
});

describe('runExportSalesCsvHttp (Q4 ventas)', () => {
  it('exporta ventas del tenant en CSV con cents INTEGER', async () => {
    const res = await runExportSalesCsvHttp(
      env([
        {
          issued_at_lima: '2026-08-14 10:00:00',
          series: 'B001',
          number: 12,
          document_type: '03',
          total_amount_cents: 2230,
          sunat_status: 'PENDING',
          void_status: 'NONE',
        },
      ]),
      't1',
    );
    expect(res.status).toBe(200);
    const csv = res.body as string;
    expect(csv.startsWith('issued_at_lima,series,number,document_type,total_amount_cents,sunat_status,void_status\n')).toBe(
      true,
    );
    expect(csv).toContain('B001,12,03,2230,PENDING,NONE');
    expect(csv).not.toMatch(/22\.30/);
  });

  it('sin DB o sin tenant → 503', async () => {
    expect((await runExportSalesCsvHttp(undefined, 't1')).status).toBe(503);
    expect((await runExportSalesCsvHttp(env([]), '')).status).toBe(503);
  });
});
