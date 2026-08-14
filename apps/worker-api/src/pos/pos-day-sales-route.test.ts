import { describe, expect, it } from 'vitest';
import { runDaySalesHttp } from './pos-day-sales-route.js';
import type { WorkerEnv } from '../auth/control-plane.js';

function mockEnv(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  const meta = {
    duration: 0,
    size_after: 0,
    rows_read: 0,
    rows_written: 0,
    last_row_id: 0,
    changed_db: false,
    changes: 0,
  };
  const okResult = <T>(results: T[] = [] as T[]) => ({
    success: true as const,
    meta,
    results,
  });
  const db = {
    prepare(sql: string) {
      const binds: unknown[] = [];
      return {
        bind(...args: unknown[]) {
          binds.push(...args);
          return this;
        },
        first<T>() {
          if (sql.includes('COUNT(*)')) {
            return Promise.resolve({ n: 2, total: 3_500 } as T);
          }
          return Promise.resolve(null as T);
        },
        all<T>() {
          if (sql.includes('FROM sales')) {
            return Promise.resolve(
              okResult<T>([
                {
                  id: 's-2',
                  series: 'B001',
                  number: 2,
                  document_type: '03',
                  total_amount_cents: 2_500,
                  issued_at_lima: '2026-08-14 09:15:00',
                  client_name: 'CLIENTE GENERICO',
                  void_status: 'NONE',
                },
                {
                  id: 's-1',
                  series: 'B001',
                  number: 1,
                  document_type: 'NV',
                  total_amount_cents: 1_000,
                  issued_at_lima: '2026-08-14 08:00:00',
                  client_name: 'CLIENTE GENERICO',
                  void_status: 'NONE',
                },
              ] as T[]),
            );
          }
          return Promise.resolve(okResult<T>());
        },
        run<T>() {
          return Promise.resolve(okResult<T>());
        },
        raw<T>(): Promise<[string[], ...T[]]> {
          return Promise.resolve([[] as string[], ...([] as T[])]);
        },
      };
    },
    batch<T>(stmts: unknown[]) {
      return Promise.resolve(stmts.map(() => okResult<T>()));
    },
    exec() {
      return Promise.resolve({ count: 0, duration: 0 });
    },
    withSession() {
      return { prepare: db.prepare.bind(db), batch: db.batch.bind(db) };
    },
    dump() {
      return Promise.resolve(new ArrayBuffer(0));
    },
  } as unknown as D1Database;
  return { DB: db, ...overrides } as WorkerEnv;
}

describe('Historial del día (F3, POS)', () => {
  it('cajero ve las ventas de HOY de su sucursal con totales en cents', async () => {
    const res = await runDaySalesHttp(mockEnv(), 't1', 'cashier-1', 'cashier', 'b1');
    expect(res.status).toBe(200);
    const body = res.body as {
      items: {
        id: string;
        series: string;
        number: number;
        documentType: string;
        totalCents: number;
        issuedAtLima: string;
      }[];
      countToday: number;
      totalTodayCents: number;
    };
    expect(body.countToday).toBe(2);
    expect(body.totalTodayCents).toBe(3_500);
    expect(body.items[0]).toMatchObject({
      id: 's-2',
      series: 'B001',
      number: 2,
      totalCents: 2_500,
    });
    expect(body.items[1]?.documentType).toBe('NV');
  });

  it('sin branch el cajero recibe 403 (rol de caja exige sucursal)', async () => {
    const res = await runDaySalesHttp(mockEnv(), 't1', 'cashier-1', 'cashier', '');
    expect(res.status).toBe(403);
  });

  it('rol desconocido → 403 fail-closed', async () => {
    const res = await runDaySalesHttp(mockEnv(), 't1', 'x', 'vendor', 'b1');
    expect(res.status).toBe(403);
  });

  it('503 si no hay DB', async () => {
    const res = await runDaySalesHttp({} as WorkerEnv, 't1', 'u1', 'admin', '');
    expect(res.status).toBe(503);
  });
});
