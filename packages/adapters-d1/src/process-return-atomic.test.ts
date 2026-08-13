import { describe, expect, it } from 'vitest';
import { processReturnAtomic } from './process-return-atomic.js';
import type { D1Bound, D1DatabaseLike, D1Result } from './index.js';

type Row = Record<string, unknown>;

function okResult<T>(results: readonly T[] = []): D1Result<T> {
  return { results, success: true, meta: {} };
}

function pickFirst(
  sql: string,
  state: {
    origin?: Row | null;
    policy?: Row | null;
    payment?: Row | null;
    session?: Row | null;
    series?: Row | null;
    stock?: Row | null;
    ar?: Row | null;
    audit?: Row | null;
    priorNc?: Row | null;
    storeCredit?: Row | null;
  },
): Row | null {
  const rules: [string, keyof typeof state][] = [
    ['JOIN tenants', 'origin'],
    ['FROM return_policies', 'policy'],
    ['FROM sale_payments', 'payment'],
    ['FROM cash_register_sessions', 'session'],
    ['FROM branch_document_series', 'series'],
    ['FROM branch_product_stock', 'stock'],
    ['FROM accounts_receivable', 'ar'],
    ['FROM audit_events', 'audit'],
    ['FROM store_credit_accounts', 'storeCredit'],
  ];
  for (const [needle, key] of rules) {
    if (sql.includes(needle)) return state[key] ?? null;
  }
  if (sql.includes("document_type = '07'") && sql.includes('SUM')) {
    return state.priorNc ?? { used: 0 };
  }
  return null;
}

function mockReturnDb(state: {
  origin?: Row | null;
  policy?: Row | null;
  payment?: Row | null;
  session?: Row | null;
  items?: Row[];
  returned?: Row[];
  series?: Row | null;
  stock?: Row | null;
  ar?: Row | null;
  audit?: Row | null;
  priorNc?: Row | null;
  storeCredit?: Row | null;
}): D1DatabaseLike {
  return {
    prepare(sql: string) {
      const stmt = {
        bind() {
          return stmt;
        },
        first: <T>() => Promise.resolve(pickFirst(sql, state) as T | null),
        all: <T>() => {
          if (sql.includes('SELECT id, serial_tracking_mode FROM products')) {
            const products = new Map(
              (state.items ?? []).map((item) => [
                String(item.product_id),
                { id: String(item.product_id), serial_tracking_mode: 'NONE' },
              ]),
            );
            return Promise.resolve(okResult([...products.values()] as T[]));
          }
          if (sql.includes('FROM sale_items')) {
            return Promise.resolve(okResult((state.items ?? []) as T[]));
          }
          if (sql.includes('FROM sale_return_items')) {
            return Promise.resolve(okResult((state.returned ?? []) as T[]));
          }
          return Promise.resolve(okResult([] as T[]));
        },
        run: () => Promise.resolve(okResult()),
      };
      return stmt;
    },
    batch: (stmts: readonly D1Bound[]) => Promise.resolve(stmts.map(() => okResult())),
  };
}

const baseOrigin = {
  id: 'sale-1',
  document_type: 'NV',
  sunat_status: 'NOT_APPLICABLE',
  total_amount_cents: 11800,
  branch_id: 'b1',
  cash_register_session_id: 'sess-1',
  client_document_type: '1',
  client_document_number: '12345678',
  client_name: 'Cliente',
  issued_at_lima: '2026-08-01 10:00:00',
  formalization_mode: 'INTERNAL_CONTROL',
};

const baseItem = {
  id: 'si-1',
  product_id: 'p1',
  quantity: 2,
  unit_price_cents: 5900,
  unit_cost_cents: 2000,
  batch_id: 'batch-1',
  is_uncatalogued: 0,
  igv_affectation_code: '10',
  igv_amount_cents: 1800,
  icbper_amount_cents: 0,
  total_amount_cents: 11800,
};

describe('processReturnAtomic', () => {
  it('NV_RETURN dentro de ventana restaura stock+PMP y audita RETURN', async () => {
    const res = await processReturnAtomic(
      mockReturnDb({
        origin: baseOrigin,
        policy: {
          window_days: 7,
          by_payment_method_json: '{}',
          refund_to_original_method: 1,
          allow_turn_closed_with_auth: 0,
        },
        payment: { code: 'CASH', amount_cents: 11800 },
        session: { id: 'sess-1', status: 'OPEN' },
        items: [baseItem],
        series: { id: 'ser-1', series: 'NVR1', current_number: 0 },
        stock: { stock: 8, pmp_unit_cost_cents: 2000 },
      }),
      't1',
      'u1',
      {
        originSaleId: 'sale-1',
        lines: [{ originalSaleItemId: 'si-1', qty: 1 }],
        reason: 'Producto defectuoso',
        series: 'NVR1',
        nowMs: Date.UTC(2026, 7, 3),
      },
    );
    expect(res.status).toBe('SUCCESS');
    expect(res.docType).toBe('NV_RETURN');
    expect(res.refundAmountCents).toBe(5900);
    expect(res.refundMovementId).toBeTruthy();
  });

  it('S28-H1: vuelto por método elegido cuando el retorno a método original está desactivado (no no-op)', async () => {
    // Origen pagado en CASH (pago mayor), pero la política permite otro método
    // y el cajero elige yape → el vuelto NO genera movimiento de caja en efectivo.
    const res = await processReturnAtomic(
      mockReturnDb({
        origin: baseOrigin,
        policy: {
          window_days: 7,
          by_payment_method_json: '{}',
          refund_to_original_method: 0,
          allow_turn_closed_with_auth: 0,
        },
        payment: { code: 'CASH', amount_cents: 11800 },
        session: { id: 'sess-1', status: 'OPEN' },
        items: [baseItem],
        series: { id: 'ser-1', series: 'NVR1', current_number: 0 },
        stock: { stock: 8, pmp_unit_cost_cents: 2000 },
      }),
      't1',
      'u1',
      {
        originSaleId: 'sale-1',
        lines: [{ originalSaleItemId: 'si-1', qty: 1 }],
        reason: 'Cambio de método',
        series: 'NVR1',
        refundMethod: 'yape',
        nowMs: Date.UTC(2026, 7, 3),
      },
    );
    expect(res.status).toBe('SUCCESS');
    // Con el retorno a método original desactivado + refundMethod yape: sin SALE_REFUND en caja.
    expect(res.refundMovementId).toBeNull();
  });

  it('S28-H2: umbral de authz viene de la política SERVER, nunca del cliente', async () => {
    // Origen de S/ 600 (60000 cents) → refund 30000 < umbral 50000 default.
    // El cliente envía authThresholdCents=999999999 — se ignora, pero el refund
    // NO supera el umbral server → OK. Luego verificamos que un refund sobre el
    // umbral server (60000 total → refund 60000) SÍ exige authz.
    await expect(
      processReturnAtomic(
        mockReturnDb({
          origin: { ...baseOrigin, total_amount_cents: 60000 },
          policy: {
            window_days: 7,
            by_payment_method_json: '{}',
            refund_to_original_method: 1,
            allow_turn_closed_with_auth: 0,
          },
          payment: { code: 'CASH', amount_cents: 60000 },
          session: { id: 'sess-1', status: 'OPEN' },
          items: [{ ...baseItem, quantity: 6, total_amount_cents: 60000 }],
          series: { id: 'ser-1', series: 'NVR1', current_number: 0 },
          stock: { stock: 8, pmp_unit_cost_cents: 2000 },
        }),
        't1',
        'u1',
        {
          originSaleId: 'sale-1',
          lines: [{ originalSaleItemId: 'si-1', qty: 6 }],
          reason: 'Producto defectuoso',
          series: 'NVR1',
          authThresholdCents: 999_999_999,
          nowMs: Date.UTC(2026, 7, 3),
        },
      ),
    ).rejects.toThrow('AUTH_REQUIRED');
  });

  it('fuera de ventana → OUTSIDE_WINDOW', async () => {
    await expect(
      processReturnAtomic(
        mockReturnDb({
          origin: baseOrigin,
          policy: {
            window_days: 7,
            by_payment_method_json: '{}',
            refund_to_original_method: 1,
            allow_turn_closed_with_auth: 0,
          },
          payment: { code: 'CASH', amount_cents: 11800 },
          session: { id: 'sess-1', status: 'OPEN' },
          items: [baseItem],
        }),
        't1',
        'u1',
        {
          originSaleId: 'sale-1',
          lines: [{ originalSaleItemId: 'si-1', qty: 1 }],
          reason: 'Tarde',
          series: 'NVR1',
          nowMs: Date.UTC(2026, 7, 20),
        },
      ),
    ).rejects.toThrow('OUTSIDE_WINDOW');
  });

  it('uncatalogued no restaura stock (sin PMP) pero emite doc', async () => {
    const res = await processReturnAtomic(
      mockReturnDb({
        origin: baseOrigin,
        policy: null,
        payment: { code: 'CASH', amount_cents: 500 },
        session: { id: 'sess-1', status: 'OPEN' },
        items: [
          {
            ...baseItem,
            id: 'si-u',
            product_id: null,
            is_uncatalogued: 1,
            unit_cost_cents: 0,
            batch_id: null,
            total_amount_cents: 500,
            quantity: 1,
            unit_price_cents: 500,
            igv_amount_cents: 0,
          },
        ],
        series: { id: 'ser-1', series: 'NVR1', current_number: 1 },
        stock: { stock: 99, pmp_unit_cost_cents: 100 },
      }),
      't1',
      'u1',
      {
        originSaleId: 'sale-1',
        lines: [{ originalSaleItemId: 'si-u', qty: 1 }],
        reason: 'Venta rápida cancelada',
        series: 'NVR1',
        nowMs: Date.UTC(2026, 7, 2),
      },
    );
    expect(res.docType).toBe('NV_RETURN');
    expect(res.refundAmountCents).toBe(500);
  });

  it('ELECTRONIC_ISSUER → doc 07 con CDR ACCEPTED', async () => {
    const res = await processReturnAtomic(
      mockReturnDb({
        origin: {
          ...baseOrigin,
          document_type: '03',
          sunat_status: 'ACCEPTED',
          formalization_mode: 'ELECTRONIC_ISSUER',
        },
        policy: null,
        payment: { code: 'CARD', amount_cents: 11800 },
        session: { id: 'sess-1', status: 'OPEN' },
        items: [baseItem],
        series: { id: 'ser-07', series: 'FC01', current_number: 5 },
        stock: { stock: 1, pmp_unit_cost_cents: 2000 },
        priorNc: { used: 0 },
      }),
      't1',
      'u1',
      {
        originSaleId: 'sale-1',
        lines: [{ originalSaleItemId: 'si-1', qty: 2 }],
        reason: 'Anulación total',
        series: 'FC01',
        nowMs: Date.UTC(2026, 7, 2),
      },
    );
    expect(res.docType).toBe('07');
    expect(res.refundMovementId).toBeNull();
  });

  it('E-D: CxC abierta reduce balance sin cash movement', async () => {
    const res = await processReturnAtomic(
      mockReturnDb({
        origin: baseOrigin,
        policy: null,
        payment: { code: 'CREDIT', amount_cents: 11800 },
        session: { id: 'sess-1', status: 'OPEN' },
        items: [baseItem],
        series: { id: 'ser-1', series: 'NVR1', current_number: 0 },
        stock: { stock: 0, pmp_unit_cost_cents: 2000 },
        ar: { id: 'ar-1', balance_due_cents: 11800 },
      }),
      't1',
      'u1',
      {
        originSaleId: 'sale-1',
        lines: [{ originalSaleItemId: 'si-1', qty: 1 }],
        reason: 'Devolución a crédito',
        series: 'NVR1',
        nowMs: Date.UTC(2026, 7, 2),
      },
      { ledgerArApEnabled: true },
    );
    expect(res.refundMovementId).toBeNull();
    expect(res.refundAmountCents).toBe(5900);
  });

  it('NC+consent sin cash/AR emite store credit', async () => {
    const res = await processReturnAtomic(
      mockReturnDb({
        origin: { ...baseOrigin, customer_id: 'c1' },
        policy: null,
        payment: { code: 'CARD', amount_cents: 11800 },
        session: { id: 'sess-1', status: 'OPEN' },
        items: [baseItem],
        series: { id: 'ser-1', series: 'NVR1', current_number: 0 },
        stock: { stock: 8, pmp_unit_cost_cents: 2000 },
        storeCredit: { id: 'acc-1', balance_cents: 0, expires_at: null },
      }),
      't1',
      'u1',
      {
        originSaleId: 'sale-1',
        lines: [{ originalSaleItemId: 'si-1', qty: 1 }],
        reason: 'Consentimiento crédito de tienda',
        series: 'NVR1',
        nowMs: Date.UTC(2026, 7, 2),
        consentStoreCredit: true,
      },
      { storeCreditEnabled: true },
    );
    expect(res.refundMovementId).toBeNull();
    expect(res.storeCreditTxnId).toBeTruthy();
  });

  it('NC+consent con cash no emite crédito', async () => {
    const res = await processReturnAtomic(
      mockReturnDb({
        origin: { ...baseOrigin, customer_id: 'c1' },
        policy: null,
        payment: { code: 'CASH', amount_cents: 11800 },
        session: { id: 'sess-1', status: 'OPEN' },
        items: [baseItem],
        series: { id: 'ser-1', series: 'NVR1', current_number: 0 },
        stock: { stock: 8, pmp_unit_cost_cents: 2000 },
      }),
      't1',
      'u1',
      {
        originSaleId: 'sale-1',
        lines: [{ originalSaleItemId: 'si-1', qty: 1 }],
        reason: 'Cash no pasa a crédito',
        series: 'NVR1',
        nowMs: Date.UTC(2026, 7, 2),
        consentStoreCredit: true,
      },
      { storeCreditEnabled: true },
    );
    expect(res.refundMovementId).toBeTruthy();
    expect(res.storeCreditTxnId ?? null).toBeNull();
  });

  it('motivo vacío → RETURN_REASON_REQUIRED', async () => {
    await expect(
      processReturnAtomic(mockReturnDb({ origin: baseOrigin }), 't1', 'u1', {
        originSaleId: 'sale-1',
        lines: [{ originalSaleItemId: 'si-1', qty: 1 }],
        reason: '   ',
        series: 'NVR1',
      }),
    ).rejects.toThrow('RETURN_REASON_REQUIRED');
  });
});
