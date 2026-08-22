/**
 * US-04 — Suite de tests hostiles de la capa de cantidades `*Microunits`
 * (objetivo V-21, CAL-01 §13.3). Cuatro frentes:
 *
 * 1. circular/valueOf: inputs que bajo `Number()` se silencian
 *    (`Number(true)=1`, `Number([])=0`) o explotan (`valueOf` que lanza)
 *    deben producir un 400 INVALID_QUANTITY_MICROUNITS estable, sin invocar
 *    jamás `valueOf`/`toString` del input ni tocar D1.
 * 2. ráfaga 100 con aserción de estado-módulo: 100 requests concurrentes
 *    intercalando hostiles/válidos; cada respuesta corresponde a su propio
 *    request y el módulo queda con el mismo comportamiento canónico
 *    (fingerprint antes/después) — sin fuga de estado compartido.
 * 3. spy del guard de longitud: el guard pasa por el camino real de la
 *    request y acota el overflow (16+ dígitos → rechazo).
 * 4. helper inyectado que lanza: la ruta cae al 400 estable con D1 intacto
 *    (cero prepare/batch, cero llamada al adaptador atómico).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_MICROUNITS_DIGITS,
  microunitsLengthGuard,
  parseMicrounitsInput,
  type MicrounitsParser,
} from './microunits-input.js';
import { runCreateQuoteHttp } from '../sales/quote-routes.js';
import { runCreateLayawayHttp } from '../sales/layaway-routes.js';
import { runCreateSupplierReturnHttp } from '../purchasing/supplier-return-routes.js';
import {
  runInventoryLocationPickingHttp,
  runInventoryLocationTransferHttp,
} from '../inventory/inventory-location-routes.js';
import type { WorkerEnv } from '../auth/control-plane.js';

const atomicMocks = vi.hoisted(() => ({
  processQuoteCreateAtomic: vi.fn(),
  processLayawayCreateAtomic: vi.fn(),
  processSupplierReturnCreateAtomic: vi.fn(),
  processInventoryLocationTransferAtomic: vi.fn(),
}));

vi.mock('@kipuspay/adapters-d1', () => atomicMocks);

/** D1 que ROMPE si alguien lo toca: para rutas donde D1 debe quedar intacto. */
function intactDb(): WorkerEnv['DB'] {
  const boom = () => {
    throw new Error('D1 debe permanecer intacto');
  };
  return {
    prepare: vi.fn(boom),
    batch: vi.fn(boom),
  } as unknown as WorkerEnv['DB'];
}

/** D1 consultable mínima (SELECT … bind … all) para el path válido de picking. */
function selectableDb(): WorkerEnv['DB'] {
  const stmt = {
    bind: () => stmt,
    first: () => Promise.resolve(null),
    all: () =>
      Promise.resolve({
        results: [
          {
            location_id: 'l1',
            location_code: 'A1',
            batch_id: 'bat1',
            expiration_date: null,
            quantity_microunits: 250_000,
          },
        ],
        success: true,
        meta: {},
      }),
    run: () => Promise.resolve({ results: [], success: true, meta: {} }),
  };
  return {
    prepare: vi.fn(() => stmt),
    batch: vi.fn(() => Promise.resolve([])),
  } as unknown as WorkerEnv['DB'];
}

function env(feature: string, db: WorkerEnv['DB']): WorkerEnv {
  return { [feature]: '1', DB: db } as unknown as WorkerEnv;
}

/** Objeto con referencia circular (bajo Number() no revienta pero es basura). */
function circularObject(): Record<string, unknown> {
  const hostile: Record<string, unknown> = { kind: 'circular' };
  hostile.self = hostile;
  return hostile;
}

/** valueOf que lanza: bajo coerción Number() rompería el request. */
function throwingValueOf(): unknown {
  return {
    valueOf() {
      throw new Error('valueOf hostil');
    },
  };
}

/** valueOf mentiroso: Number() lo convertiría en 1_000_000 microunidades. */
function lyingValueOf(): unknown {
  return {
    toString() {
      return '1000000';
    },
    valueOf() {
      return 1_000_000;
    },
  };
}

const HOSTILE_QUANTITIES: readonly (() => unknown)[] = [
  circularObject,
  throwingValueOf,
  lyingValueOf,
  () => [5_000_000],
  () => ['500000'],
  () => true,
  () => null,
  () => ({}),
];

function expectStableInvalid(result: { status: number; body: Record<string, unknown> }): void {
  expect(result.status).toBe(400);
  expect(result.body['code']).toBe('INVALID_QUANTITY_MICROUNITS');
}

beforeEach(() => {
  atomicMocks.processQuoteCreateAtomic.mockReset().mockResolvedValue({
    quoteId: 'q1',
    snapshotTotalCents: 1180,
    emitsFiscalDocument: false,
    reservesStock: false,
  });
  atomicMocks.processLayawayCreateAtomic
    .mockReset()
    .mockResolvedValue({ layawayId: 'lay1', status: 'ACTIVE' });
  atomicMocks.processSupplierReturnCreateAtomic
    .mockReset()
    .mockResolvedValue({ returnId: 'ret1', status: 'OPEN' });
  atomicMocks.processInventoryLocationTransferAtomic
    .mockReset()
    .mockResolvedValue({ transferred: true });
});

describe('microunits-input: batería hostil circular/valueOf (unidad)', () => {
  it('rechaza todo tipo hostil SIN invocar valueOf ni colgarse', () => {
    expect(() => parseMicrounitsInput(throwingValueOf())).not.toThrow();
    expect(parseMicrounitsInput(circularObject()).ok).toBe(false);
    expect(parseMicrounitsInput(lyingValueOf()).ok).toBe(false);
    for (const make of HOSTILE_QUANTITIES) {
      const parsed = parseMicrounitsInput(make());
      expect(parsed).toEqual({ ok: false, errorName: 'MICROUNITS_INVALID' });
    }
  });

  it('rechaza números no enteros, negativos, -0 y fuera de rango seguro', () => {
    for (const bad of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      1.5,
      BigInt(10),
      Symbol('x'),
    ]) {
      expect(parseMicrounitsInput(bad)).toEqual({ ok: false, errorName: 'MICROUNITS_INVALID' });
    }
    for (const bad of [-1, -0, 2 ** 53]) {
      expect(parseMicrounitsInput(bad)).toEqual({
        ok: false,
        errorName: 'MICROUNITS_OUT_OF_RANGE',
      });
    }
  });

  it('acepta exactamente enteros seguros >= 0 y dígitos canónicos', () => {
    expect(parseMicrounitsInput(0)).toEqual({ ok: true, microunits: 0 });
    expect(parseMicrounitsInput(500_000)).toEqual({ ok: true, microunits: 500_000 });
    expect(parseMicrounitsInput(Number.MAX_SAFE_INTEGER)).toEqual({
      ok: true,
      microunits: Number.MAX_SAFE_INTEGER,
    });
    // formato cableado de query GET: texto de dígitos → aritmética de dígitos
    expect(parseMicrounitsInput('250000')).toEqual({ ok: true, microunits: 250_000 });
    expect(parseMicrounitsInput('').ok).toBe(false);
    expect(parseMicrounitsInput('1e3').ok).toBe(false);
    expect(parseMicrounitsInput('-5').ok).toBe(false);
    expect(parseMicrounitsInput('12.5').ok).toBe(false);
  });
});

describe('rutas: tipos inválidos → 400 estable, D1 intacto', () => {
  it('quote: circular y valueOf mentiroso jamás llegan al adaptador', async () => {
    const db = intactDb();
    for (const make of [circularObject, throwingValueOf, lyingValueOf]) {
      const res = await runCreateQuoteHttp(env('FEATURE_SALES_QUOTES', db), 't1', 'u1', {
        branchId: 'b1',
        items: [{ productId: 'p1', enteredQuantityMicrounits: make() }],
      });
      expectStableInvalid(res);
    }
    expect(atomicMocks.processQuoteCreateAtomic).not.toHaveBeenCalled();
    expect(db.prepare).not.toHaveBeenCalled();
    expect(db.batch).not.toHaveBeenCalled();
  });

  it('layaway/supplier-return/location-transfer: mismo fail-closed', async () => {
    const layawayDb = intactDb();
    const layawayRes = await runCreateLayawayHttp(
      env('FEATURE_SALES_LAYAWAY', layawayDb),
      't1',
      'u1',
      {
        branchId: 'b1',
        cashRegisterSessionId: 's1',
        items: [{ productId: 'p1', enteredQuantityMicrounits: circularObject() }],
      },
    );
    expectStableInvalid(layawayRes);
    expect(atomicMocks.processLayawayCreateAtomic).not.toHaveBeenCalled();

    const returnDb = intactDb();
    const returnRes = await runCreateSupplierReturnHttp(
      env('FEATURE_PURCHASING_RETURNS', returnDb),
      't1',
      'u1',
      {
        purchaseReceiptId: 'pr1',
        items: [{ productId: 'p1', enteredQuantityMicrounits: lyingValueOf() }],
      },
    );
    expectStableInvalid(returnRes);
    expect(atomicMocks.processSupplierReturnCreateAtomic).not.toHaveBeenCalled();

    const transferDb = intactDb();
    const transferRes = await runInventoryLocationTransferHttp(
      env('FEATURE_INVENTORY_LOCATIONS', transferDb),
      't1',
      'u1',
      'admin',
      { branchId: 'b1', quantityMicrounits: throwingValueOf() },
    );
    expectStableInvalid(transferRes);
    expect(atomicMocks.processInventoryLocationTransferAtomic).not.toHaveBeenCalled();
    expect(transferDb.prepare).not.toHaveBeenCalled();
  });

  it('picking (query GET crudo): basura → 400 BAD_REQUEST con D1 intacto', async () => {
    const db = intactDb();
    // ' 5' se recorta en parseQuantityMicrounitsQuery (HEAD US-04-v2) y sería
    // válido: no forma parte de la batería de rechazo fail-closed.
    for (const raw of ['abc', '1e3', '-5', '12.5', '', '0x10']) {
      const res = await runInventoryLocationPickingHttp(
        env('FEATURE_INVENTORY_LOCATIONS', db),
        't1',
        'cashier',
        { branchId: 'b1', productId: 'p1', quantityMicrounits: raw },
      );
      expect(res.status).toBe(400);
      expect(res.body['code']).toBe('BAD_REQUEST');
    }
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it('picking: dígitos válidos del wire llegan al SELECT como entero', async () => {
    const db = selectableDb();
    const res = await runInventoryLocationPickingHttp(
      env('FEATURE_INVENTORY_LOCATIONS', db),
      't1',
      'cashier',
      { branchId: 'b1', productId: 'p1', quantityMicrounits: '250000' },
    );
    expect(res.status).toBe(200);
    expect(db.prepare).toHaveBeenCalledTimes(1);
    expect((res.body['items'] as unknown[]).length).toBe(1);
  });
});

describe('US-04 ráfaga 100 con aserción de estado-módulo', () => {
  /** Fingerprint del comportamiento canónico del módulo (antes vs después). */
  function moduleFingerprint(): string {
    const probes: unknown[] = [0, 500_000, '250000', circularObject(), lyingValueOf(), true, 1.5];
    return JSON.stringify({
      parsed: probes.map((p) => parseMicrounitsInput(p)),
      maxDigits: MAX_MICROUNITS_DIGITS,
      guard: microunitsLengthGuard('9'.repeat(MAX_MICROUNITS_DIGITS)),
      runnerType: typeof runCreateQuoteHttp,
    });
  }

  it('100 requests concurrentes: cada respuesta es de SU request y el módulo no muta', async () => {
    const before = moduleFingerprint();
    const db = intactDb();
    const sharedEnv = env('FEATURE_SALES_QUOTES', db);
    // El adaptador devuelve la huella de SU propio request: si hubiera estado
    // compartido en el módulo, las 100 corridas se contaminarían entre sí.
    atomicMocks.processQuoteCreateAtomic.mockImplementation(
      async (
        _db: unknown,
        tenantId: string,
        _userId: string,
        input: {
          items: { enteredQuantityMicrounits: number }[];
        },
      ) => ({
        quoteId: `q-${String(tenantId)}`,
        snapshotTotalCents: 1180,
        emitsFiscalDocument: false,
        reservesStock: false,
        echoedMicrounits: input.items.map((i) => i.enteredQuantityMicrounits),
      }),
    );

    const requests = Array.from({ length: 100 }, (_, i) => {
      const hostile = i % 2 === 1;
      const quantity = hostile
        ? HOSTILE_QUANTITIES[i % HOSTILE_QUANTITIES.length]()
        : 1_000_000 + i;
      return { tenantId: `t${i}`, hostile, quantity };
    });

    const responses = await Promise.all(
      requests.map(({ tenantId, hostile, quantity }) =>
        runCreateQuoteHttp(sharedEnv, tenantId, 'u1', {
          branchId: 'b1',
          items: [{ productId: 'p1', enteredQuantityMicrounits: quantity }],
        }).then((res) => ({ tenantId, hostile, res })),
      ),
    );

    let validSeen = 0;
    const tenantsCallingAdapter = new Map<string, number>();
    for (let i = 0; i < responses.length; i++) {
      const { tenantId, hostile, res } = responses[i]!;
      if (hostile) {
        expectStableInvalid(res);
        continue;
      }
      expect(res.status).toBe(200);
      // aserción de estado-módulo: la respuesta lleva los DATOS DEL PROPIO
      // request (sin contaminación cruzada entre las 100 corridas).
      expect(res.body['quoteId']).toBe(`q-${tenantId}`);
      expect(res.body['echoedMicrounits']).toEqual([1_000_000 + i]);
      tenantsCallingAdapter.set(tenantId, i);
      validSeen++;
    }
    expect(validSeen).toBe(50);
    expect(atomicMocks.processQuoteCreateAtomic).toHaveBeenCalledTimes(50);
    const calls = atomicMocks.processQuoteCreateAtomic.mock.calls as unknown[][];

    for (const [tenantId, i] of tenantsCallingAdapter) {
      const call = calls.find((c) => c[1] === tenantId);
      expect(call, `tenant ${tenantId} debe haber llegado al adaptador`).toBeDefined();
      const items = (call![3] as { items: { enteredQuantityMicrounits: number }[] }).items;
      expect(items).toHaveLength(1);
      expect(items[0]!.enteredQuantityMicrounits).toBe(1_000_000 + i);
    }
    expect(tenantsCallingAdapter.size).toBe(50);
    // D1 jamás fue tocado directamente (todo pasó por el adaptador mockeado).
    expect(db.prepare).not.toHaveBeenCalled();
    expect(db.batch).not.toHaveBeenCalled();
    // el módulo quedó exactamente igual que antes de la ráfaga
    expect(moduleFingerprint()).toBe(before);
  });
});

describe('US-04 spy del guard de longitud', () => {
  it('el guard pasa por el camino real de la request (inyección espiada)', async () => {
    const guard = vi.fn(microunitsLengthGuard);
    const spiedParser: MicrounitsParser = (value) => parseMicrounitsInput(value, guard);
    const db = intactDb();
    const res = await runInventoryLocationTransferHttp(
      env('FEATURE_INVENTORY_LOCATIONS', db),
      't1',
      'u1',
      'admin',
      {
        branchId: 'b1',
        sourceLocationId: 'l1',
        destinationLocationId: 'l2',
        productId: 'p1',
        quantityMicrounits: '500000',
      },
      spiedParser,
    );
    expect(res.status).toBe(200);
    expect(guard).toHaveBeenCalledWith('500000');
    expect(guard).toHaveReturnedWith(true);
    const payload = atomicMocks.processInventoryLocationTransferAtomic.mock.calls[0]![3] as {
      quantityMicrounits: number;
    };
    expect(payload.quantityMicrounits).toBe(500_000);
  });

  it('16+ dígitos → el guard corta el overflow (fail-closed)', () => {
    const guard = vi.fn(microunitsLengthGuard);
    const overflow = '9'.repeat(MAX_MICROUNITS_DIGITS + 1);
    expect(parseMicrounitsInput(overflow, guard).ok).toBe(false);
    expect(guard).toHaveReturnedWith(false);
    // borde exacto: MAX_MICROUNITS_DIGITS dígitos sí caben en un safe integer
    const limit = '9'.repeat(MAX_MICROUNITS_DIGITS);
    expect(parseMicrounitsInput(limit)).toEqual({ ok: true, microunits: 999_999_999_999_999 });
    expect(microunitsLengthGuard(limit)).toBe(true);
  });
});

describe('US-04 helper inyectado que lanza → D1 intacto', () => {
  const explosiveHelper: MicrounitsParser = () => {
    throw new Error('helper hostil: explosión controlada');
  };

  it('quote: lanza el helper → 400 estable, sin mensaje filtrado, D1 intacto', async () => {
    const db = intactDb();
    const res = await runCreateQuoteHttp(
      env('FEATURE_SALES_QUOTES', db),
      't1',
      'u1',
      { branchId: 'b1', items: [{ productId: 'p1', enteredQuantityMicrounits: 1 }] },
      explosiveHelper,
    );
    expectStableInvalid(res);
    expect(JSON.stringify(res.body)).not.toContain('explosión');
    expect(atomicMocks.processQuoteCreateAtomic).not.toHaveBeenCalled();
    expect(db.prepare).not.toHaveBeenCalled();
    expect(db.batch).not.toHaveBeenCalled();
  });

  it('layaway, supplier-return y location-transfer: mismo contrato', async () => {
    const layawayDb = intactDb();
    const layawayRes = await runCreateLayawayHttp(
      env('FEATURE_SALES_LAYAWAY', layawayDb),
      't1',
      'u1',
      {
        branchId: 'b1',
        cashRegisterSessionId: 's1',
        items: [{ productId: 'p1', enteredQuantityMicrounits: 1 }],
      },
      explosiveHelper,
    );
    expectStableInvalid(layawayRes);
    expect(atomicMocks.processLayawayCreateAtomic).not.toHaveBeenCalled();

    const returnDb = intactDb();
    const returnRes = await runCreateSupplierReturnHttp(
      env('FEATURE_PURCHASING_RETURNS', returnDb),
      't1',
      'u1',
      { purchaseReceiptId: 'pr1', items: [{ productId: 'p1', enteredQuantityMicrounits: 1 }] },
      explosiveHelper,
    );
    expectStableInvalid(returnRes);
    expect(atomicMocks.processSupplierReturnCreateAtomic).not.toHaveBeenCalled();

    const transferDb = intactDb();
    const transferRes = await runInventoryLocationTransferHttp(
      env('FEATURE_INVENTORY_LOCATIONS', transferDb),
      't1',
      'u1',
      'admin',
      { branchId: 'b1', sourceLocationId: 'l1', destinationLocationId: 'l2', productId: 'p1' },
      explosiveHelper,
    );
    expectStableInvalid(transferRes);
    expect(atomicMocks.processInventoryLocationTransferAtomic).not.toHaveBeenCalled();
    expect(layawayDb.prepare).not.toHaveBeenCalled();
    expect(returnDb.prepare).not.toHaveBeenCalled();
    expect(transferDb.prepare).not.toHaveBeenCalled();
  });
});
