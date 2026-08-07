import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerEnv } from '../auth/control-plane.js';
import { parseCreditNoteEaBody } from './parse-ea-body.js';
import {
  isFiscalCircuitBreakerFlag,
  runCreditNoteEaHttp,
  runOwnerBacklogHttp,
} from './owner-ea-routes.js';

const processCreditNoteAtomic = vi.fn();

vi.mock('@kipuspay/adapters-d1', () => ({
  processCreditNoteAtomic: (...args: unknown[]) =>
    processCreditNoteAtomic(...args) as Promise<unknown>,
}));

function mockDb(opts: {
  backlog?: readonly {
    id: string;
    document_type: string;
    sunat_status: string;
    total_amount_cents: number;
  }[];
  origin?: { total_amount_cents: number } | null;
}): D1Database {
  return {
    prepare() {
      return {
        bind() {
          return {
            all: () => Promise.resolve({ results: opts.backlog ?? [] }),
            first: () => Promise.resolve(opts.origin ?? null),
          };
        },
      };
    },
  } as unknown as D1Database;
}

describe('parseCreditNoteEaBody', () => {
  it('acepta campos tipados y ignora basura', () => {
    expect(parseCreditNoteEaBody(null)).toEqual({});
    expect(parseCreditNoteEaBody('x')).toEqual({});
    expect(
      parseCreditNoteEaBody({
        originSaleId: 's1',
        confirmed: true,
        motiveCode: '01',
        series: 'FC01',
        extra: 1,
      }),
    ).toEqual({
      originSaleId: 's1',
      confirmed: true,
      motiveCode: '01',
      series: 'FC01',
    });
    expect(parseCreditNoteEaBody({ originSaleId: 1, confirmed: 'yes' })).toEqual({});
  });
});

describe('owner E-A routes Sprint 26', () => {
  beforeEach(() => {
    processCreditNoteAtomic.mockReset();
  });

  it('FEATURE_FISCAL_CIRCUIT_BREAKER flag', () => {
    expect(isFiscalCircuitBreakerFlag({} as WorkerEnv)).toBe(false);
    expect(isFiscalCircuitBreakerFlag({ FEATURE_FISCAL_CIRCUIT_BREAKER: '0' } as WorkerEnv)).toBe(
      false,
    );
    expect(isFiscalCircuitBreakerFlag({ FEATURE_FISCAL_CIRCUIT_BREAKER: '1' } as WorkerEnv)).toBe(
      true,
    );
    expect(
      isFiscalCircuitBreakerFlag({ FEATURE_FISCAL_CIRCUIT_BREAKER: 'true' } as WorkerEnv),
    ).toBe(true);
  });

  it('backlog flag off → 404; sin DB → 503; ok → items', async () => {
    expect(await runOwnerBacklogHttp({} as WorkerEnv, 't1')).toMatchObject({ status: 404 });
    expect(
      await runOwnerBacklogHttp({ FEATURE_FISCAL_CIRCUIT_BREAKER: '1' } as WorkerEnv, 't1'),
    ).toMatchObject({ status: 503, body: { code: 'DB_UNAVAILABLE' } });
    const ok = await runOwnerBacklogHttp(
      {
        FEATURE_FISCAL_RC: '1',
        DB: mockDb({
          backlog: [
            {
              id: 'sale-1',
              document_type: '01',
              sunat_status: 'QUARANTINED',
              total_amount_cents: 1000,
            },
          ],
        }),
      } as WorkerEnv,
      't1',
    );
    expect(ok.status).toBe(200);
    expect(ok.body.items).toEqual([
      {
        saleId: 'sale-1',
        documentType: '01',
        sunatStatus: 'QUARANTINED',
        totalCents: 1000,
        suggestCreditNoteEa: true,
      },
    ]);
  });

  it('NC E-A exige confirmación y venta origen', async () => {
    expect(await runCreditNoteEaHttp({} as WorkerEnv, 't1', 'u1', {})).toMatchObject({
      status: 404,
    });
    expect(
      await runCreditNoteEaHttp({ FEATURE_FISCAL_CPE: '1' } as WorkerEnv, 't1', 'u1', {
        confirmed: false,
      }),
    ).toMatchObject({ status: 400, body: { code: 'EA_CONFIRMATION_REQUIRED' } });
    expect(
      await runCreditNoteEaHttp({ FEATURE_FISCAL_CIRCUIT_BREAKER: '1' } as WorkerEnv, 't1', 'u1', {
        confirmed: true,
      }),
    ).toMatchObject({ status: 503 });
    expect(
      await runCreditNoteEaHttp(
        {
          FEATURE_FISCAL_CIRCUIT_BREAKER: '1',
          DB: mockDb({ origin: null }),
        } as WorkerEnv,
        't1',
        'u1',
        { confirmed: true, originSaleId: 'missing' },
      ),
    ).toMatchObject({ status: 404, body: { code: 'SALE_NOT_FOUND' } });
  });

  it('NC E-A confirmada llama processCreditNoteAtomic', async () => {
    processCreditNoteAtomic.mockResolvedValue({
      creditNoteSaleId: 'nc-1',
      requiresNoCdrAudit: true,
    });
    const res = await runCreditNoteEaHttp(
      {
        FEATURE_FISCAL_CIRCUIT_BREAKER: '1',
        DB: mockDb({ origin: { total_amount_cents: 2500 } }),
      } as WorkerEnv,
      't1',
      'u1',
      { confirmed: true, originSaleId: 's1', motiveCode: '01', series: 'FC01' },
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ creditNoteSaleId: 'nc-1', requiresNoCdrAudit: true });
    expect(processCreditNoteAtomic).toHaveBeenCalledOnce();
  });

  it('NC E-A propaga error de dominio', async () => {
    processCreditNoteAtomic.mockRejectedValue(new Error('CREDIT_NOTE_INVALID'));
    const res = await runCreditNoteEaHttp(
      {
        FEATURE_FISCAL_CPE: '1',
        DB: mockDb({ origin: { total_amount_cents: 100 } }),
      } as WorkerEnv,
      't1',
      'u1',
      { confirmed: true, originSaleId: 's1' },
    );
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CREDIT_NOTE_INVALID');
  });
});
