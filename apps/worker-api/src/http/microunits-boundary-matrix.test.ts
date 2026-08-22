/**
 * US-05 — Driver de la matriz de frontera compartida (AC1/AC2/AC4/AC5):
 * la MISMA tabla (`MICROUNITS_BOUNDARY_CELLS`) se replayea con it.each contra
 * los 5 endpoints que ingieren *Microunits, con expected EXPLÍCITO por celda
 * y aserción EXACTA de body.code (status + code, nunca "algún 4xx"). Los
 * guards de US-01 son fail-closed: el rechazo ocurre ANTES de tocar D1, por
 * eso un stub de env basta y ninguna celda de rechazo consume idempotencyKey.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { processQuoteCreateAtomic } from '@kipuspay/adapters-d1';
import {
  runInventoryLocationPickingHttp,
  runInventoryLocationTransferHttp,
} from '../inventory/inventory-location-routes.js';
import { runCreateLayawayHttp } from '../sales/layaway-routes.js';
import { runCreateQuoteHttp } from '../sales/quote-routes.js';
import { runCreateSupplierReturnHttp } from '../purchasing/supplier-return-routes.js';
import type { WorkerEnv } from '../auth/control-plane.js';
import {
  MICROUNITS_BOUNDARY_CELLS,
  boundaryRequestPayload,
  expectedResponseFor,
  type MicrounitsBoundaryCell,
  type MicrounitsEndpointId,
} from './microunits-boundary-matrix.js';

vi.mock('@kipuspay/adapters-d1', () => ({
  // quotes
  processQuoteCreateAtomic: vi.fn(() =>
    Promise.resolve({ quoteId: 'q1', snapshotTotalCents: 1180, emitsFiscalDocument: false }),
  ),
  processQuoteSendAtomic: vi.fn(() => Promise.resolve({ quoteId: 'q1', status: 'SENT' })),
  processQuoteApproveAtomic: vi.fn(() => Promise.resolve({ quoteId: 'q1', status: 'APPROVED' })),
  processQuoteConvertAtomic: vi.fn(() => Promise.resolve({ saleId: 's1', quoteId: 'q1' })),
  processQuoteCancelAtomic: vi.fn(() => Promise.resolve({ quoteId: 'q1', status: 'CANCELLED' })),
  // layaways
  processLayawayCreateAtomic: vi.fn(() => Promise.resolve({ layawayId: 'l1', status: 'ACTIVE' })),
  processLayawayDepositAtomic: vi.fn(() => Promise.resolve({ layawayId: 'l1', status: 'ACTIVE' })),
  processLayawayConvertAtomic: vi.fn(() => Promise.resolve({ saleId: 's1', layawayId: 'l1' })),
  processLayawayCancelAtomic: vi.fn(() => Promise.resolve({ layawayId: 'l1', status: 'CANCELLED' })),
  // purchasing returns
  processSupplierReturnCreateAtomic: vi.fn(() =>
    Promise.resolve({ returnId: 'r1', status: 'OPEN' }),
  ),
  processSupplierReturnCloseAtomic: vi.fn(() => Promise.resolve({ returnId: 'r1', status: 'CLOSED' })),
  processSupplierReturnCancelAtomic: vi.fn(() => Promise.resolve({ returnId: 'r1', status: 'CANCELLED' })),
  // inventory locations
  processInventoryLocationTransferAtomic: vi.fn(() =>
    Promise.resolve({
      transferId: 'tr-1',
      sourceAfterMicrounits: 500_000,
      destinationAfterMicrounits: 500_000,
      alreadyApplied: false,
    }),
  ),
  createInventoryLocationAtomic: vi.fn(() => Promise.resolve({ locationId: 'loc-1' })),
  updateInventoryLocationAtomic: vi.fn(() => Promise.resolve({ locationId: 'loc-1' })),
  deactivateInventoryLocationAtomic: vi.fn(() =>
    Promise.resolve({ locationId: 'loc-1', active: false }),
  ),
}));

/**
 * Env con los 4 flags activos y un stub D1 que NUNCA debe ser llamado por las
 * celdas de rechazo (el guard es fail-closed previo); para las celdas
 * aceptadas de picking entrega stock MAX_SAFE_INTEGER en un lote vigente, de
 * modo que allocateStockByLocation cubra cualquier cantidad aceptada.
 */
function matrixEnv(): WorkerEnv {
  const stmt = {
    bind: () => stmt,
    first: () => Promise.resolve(null),
    all: () =>
      Promise.resolve({
        results: [
          {
            location_id: 'loc-a',
            location_code: 'A-01',
            batch_id: 'batch-1',
            expiration_date: '2999-12-31',
            quantity_microunits: Number.MAX_SAFE_INTEGER,
          },
        ],
        success: true,
        meta: {},
      }),
    run: () => Promise.resolve({ results: [], success: true, meta: {} }),
  };
  return {
    FEATURE_SALES_QUOTES: '1',
    FEATURE_SALES_LAYAWAY: '1',
    FEATURE_PURCHASING_RETURNS: '1',
    FEATURE_INVENTORY_LOCATIONS: '1',
    DB: { prepare: () => stmt },
  } as unknown as WorkerEnv;
}

interface MatrixEndpoint {
  readonly id: MicrounitsEndpointId;
  readonly run: (env: WorkerEnv, payload: Record<string, unknown>) => Promise<{
    status: number;
    body: Record<string, unknown>;
  }>;
}

const MATRIX_ENDPOINTS: readonly MatrixEndpoint[] = [
  {
    id: 'POST /api/sales/quotes',
    run: (env, payload) => runCreateQuoteHttp(env, 'tenant-us05', 'user-us05', payload),
  },
  {
    id: 'POST /api/sales/layaways',
    run: (env, payload) => runCreateLayawayHttp(env, 'tenant-us05', 'user-us05', payload),
  },
  {
    id: 'POST /api/purchasing/returns',
    run: (env, payload) => runCreateSupplierReturnHttp(env, 'tenant-us05', 'user-us05', payload),
  },
  {
    id: 'POST /api/inventory/locations/transfer',
    run: (env, payload) =>
      runInventoryLocationTransferHttp(env, 'tenant-us05', 'user-us05', 'owner', payload),
  },
  {
    id: 'GET /api/inventory/locations/picking',
    run: (env, payload) => runInventoryLocationPickingHttp(env, 'tenant-us05', 'cashier', payload),
  },
];

describe.each(MATRIX_ENDPOINTS)('matriz de frontera microunits — $id', (endpoint) => {
  it.each(MICROUNITS_BOUNDARY_CELLS)('$id [$group] → status+code exactos por celda', async (cell) => {
    const res = await endpoint.run(matrixEnv(), boundaryRequestPayload(endpoint.id, cell));
    const expected = expectedResponseFor(endpoint.id, cell);
    expect(res.status).toBe(expected.status);
    if (expected.code === null) {
      // Celda aceptada: la ruta NUNCA inventa un code de error.
      expect(res.body).not.toHaveProperty('code');
      expect(res.body).not.toHaveProperty('error');
    } else {
      // Aserción EXACTA de body.code: el motivo discriminado del guard
      // (INVALID_QUANTITY | QUANTITY_OUT_OF_RANGE | BAD_REQUEST en picking).
      expect(res.body.code).toBe(expected.code);
    }
  });
});

/**
 * Exactitud de valor (no solo de rechazo): en la celda aceptada la capa
 * atómica debe recibir EXACTAMENTE expectedMicrounits — identidad bit a bit,
 * sin drift float (MAX_SAFE_INTEGER incluido) y con la semántica trim()
 * documentada (NBSP → 12). Se prueba en POST /api/sales/quotes, cuyo mapeo de
 * items es 1:1 con el parser compartido que usan los otros 4 endpoints.
 */
describe('matriz de frontera microunits — valor exacto que llega a la atómica', () => {
  const acceptedCells = MICROUNITS_BOUNDARY_CELLS.filter(
    (cell) => cell.expectedGuard === null,
  ) as readonly (MicrounitsBoundaryCell & { expectedMicrounits: number })[];

  beforeEach(() => {
    vi.mocked(processQuoteCreateAtomic).mockClear();
  });

  it.each(acceptedCells)('$id: la atómica recibe exactamente $expectedMicrounits microunits', async (cell) => {
    const res = await runCreateQuoteHttp(
      matrixEnv(),
      'tenant-us05',
      'user-us05',
      boundaryRequestPayload('POST /api/sales/quotes', cell),
    );
    expect(res.status).toBe(200);
    const call = vi.mocked(processQuoteCreateAtomic).mock.calls.at(-1);
    const input = call?.[3] as { items?: { enteredQuantityMicrounits?: number }[] } | undefined;
    expect(input?.items?.[0]?.enteredQuantityMicrounits).toBe(cell.expectedMicrounits);
  });
});
