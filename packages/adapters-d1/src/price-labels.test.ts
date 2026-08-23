import { describe, expect, it } from 'vitest';
import type { D1Bound, D1DatabaseLike, D1Result } from './index.js';
import {
  acknowledgePriceLabelItems,
  createPriceLabelBatchAtomic,
  createPriceLabelTemplate,
  listPriceLabelTemplates,
  reprintPriceLabelBatchAtomic,
  retirePriceLabelTemplate,
  retryPriceLabelBatch,
  versionPriceLabelTemplate,
  type CreatePriceLabelBatchInput,
} from './price-labels.js';

const TEMPLATE = {
  dslVersion: 'PRICE_LABEL_V1',
  blocks: [
    { type: 'TEXT', field: 'product_name', align: 'CENTER' },
    { type: 'PRICE', field: 'price', align: 'CENTER' },
    { type: 'BARCODE', field: 'barcode', align: 'CENTER' },
  ],
};

interface RecordedStatement extends D1Bound {
  readonly sql: string;
  params: unknown[];
}

interface FakeOptions {
  actor?: boolean;
  latestVersion?: number | null;
  activeTemplate?: boolean;
  preflight?: readonly (readonly Record<string, unknown>[])[];
  storedBatch?: Record<string, unknown> | null;
  storedItems?: readonly Record<string, unknown>[];
  ownedItemIds?: readonly string[];
  batchStatus?: string;
  retryItemIds?: readonly string[];
  previousAuditHash?: string | null;
  failAtomic?: Error;
}

function result(rows: readonly Record<string, unknown>[] = []): D1Result<unknown> {
  return { results: rows, success: true, meta: {} };
}

class RecordingD1 implements D1DatabaseLike {
  readonly calls: RecordedStatement[] = [];
  readonly batches: RecordedStatement[][] = [];
  private readonly options: FakeOptions;

  constructor(options: FakeOptions = {}) {
    this.options = options;
  }

  prepare(sql: string) {
    const statement: RecordedStatement = {
      sql,
      params: [],
      bind: (...params: unknown[]) => {
        statement.params = params;
        this.calls.push(statement);
        return statement;
      },
      all: <T>() => Promise.resolve(result(this.allRows(sql)) as D1Result<T>),
      first: <T>() => Promise.resolve(this.firstRow(sql) as T | null),
      run: () => Promise.resolve(result()),
    };
    return { bind: (...params: unknown[]) => statement.bind(...params) };
  }

  batch(statements: readonly D1Bound[]): Promise<readonly D1Result<unknown>[]> {
    const recorded = statements as readonly RecordedStatement[];
    this.batches.push([...recorded]);
    if (recorded.length === 5 && recorded[0]?.sql.includes('SELECT b.id AS branch_id')) {
      const rows = this.options.preflight ?? happyPreflight();
      return Promise.resolve(rows.map((entry) => result(entry)));
    }
    if (this.options.failAtomic) return Promise.reject(this.options.failAtomic);
    return Promise.resolve(recorded.map(() => result()));
  }

  private firstRow(sql: string): Record<string, unknown> | null {
    if (sql.includes('SELECT id FROM users'))
      return this.options.actor === false ? null : { id: 'user-1' };
    if (sql.includes('SELECT version FROM price_label_templates')) {
      const version = this.options.latestVersion;
      return version === null || version === undefined ? null : { version };
    }
    if (sql.includes("status = 'ACTIVE' LIMIT 1") && sql.includes('price_label_templates')) {
      return this.options.activeTemplate === false ? null : { id: 'template-1' };
    }
    if (sql.includes('SELECT last_hash FROM audit_chain_heads')) {
      return this.options.previousAuditHash ? { row_hash: this.options.previousAuditHash } : null;
    }
    if (sql.includes('SELECT status FROM price_label_batches')) {
      return { status: this.options.batchStatus ?? 'PARTIAL' };
    }
    if (sql.includes('FROM price_label_batches')) return this.options.storedBatch ?? null;
    return null;
  }

  private allRows(sql: string): readonly Record<string, unknown>[] {
    if (sql.includes('FROM price_label_templates')) {
      return [{ id: 'template-1', status: 'ACTIVE', version: 1 }];
    }
    if (sql.includes('SELECT i.id FROM price_label_items')) {
      return (this.options.ownedItemIds ?? ['item-1']).map((id) => ({ id }));
    }
    if (sql.includes('SELECT id FROM price_label_items')) {
      return (this.options.retryItemIds ?? ['item-2']).map((id) => ({ id }));
    }
    if (sql.includes('FROM price_label_items')) return this.options.storedItems ?? storedItems();
    return [];
  }
}

function happyPreflight(
  overrides: {
    scope?: readonly Record<string, unknown>[];
    template?: readonly Record<string, unknown>[];
    list?: readonly Record<string, unknown>[];
    products?: readonly Record<string, unknown>[];
    existing?: readonly Record<string, unknown>[];
  } = {},
): readonly (readonly Record<string, unknown>[])[] {
  return [
    overrides.scope ?? [{ branch_id: 'branch-1', branch_price_list_id: 'list-1', actor_ok: 1 }],
    overrides.template ?? [
      {
        id: 'template-1',
        template_key: 'shelf',
        version: 2,
        template_json: JSON.stringify(TEMPLATE),
        paper_width_mm: 58,
        status: 'ACTIVE',
        latest_version: 2,
      },
    ],
    overrides.list ?? [{ id: 'list-1', identity: 'EXPLICIT' }],
    overrides.products ?? [
      {
        id: 'product-1',
        name: 'Coffee',
        barcode: '4006381333931',
        product_version: 3,
        base_price_cents: 900,
        list_price_cents: 1290,
        price_rowid: 7,
      },
    ],
    overrides.existing ?? [],
  ];
}

function storedItems(): readonly Record<string, unknown>[] {
  return [
    {
      id: 'item-1',
      product_id: 'product-1',
      ordinal: 0,
      product_name_snapshot: 'Coffee',
      price_cents: 1290,
      barcode_type: 'EAN13',
      barcode_value_snapshot: '4006381333931',
      template_version: 2,
      price_source: 'PRICE_LIST',
      price_resolved_at: '2026-08-08T17:00:00.000Z',
      price_resolution_version: '3:7:2',
      rendered_payload_hash: 'a'.repeat(64),
      rendered_payload_hex: '00',
      status: 'PENDING',
    },
  ];
}

function storedBatch(): Record<string, unknown> {
  return {
    id: 'batch-1',
    branch_id: 'branch-1',
    template_id: 'template-1',
    price_list_id: 'list-1',
    price_list_identity: 'EXPLICIT',
    reprint_of_batch_id: null,
    snapshot_hash: 'b'.repeat(64),
    status: 'PENDING',
  };
}

function batchInput(
  overrides: Partial<CreatePriceLabelBatchInput> = {},
): CreatePriceLabelBatchInput {
  return {
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    actorUserId: 'user-1',
    templateId: 'template-1',
    priceListId: 'list-1',
    products: [{ productId: 'product-1', copies: 1 }],
    idempotencyKey: 'request-1',
    ...overrides,
  };
}

describe('Sprint 41 price-label adapter unit branches', () => {
  it('rejects request bounds, duplicates and all untrusted snapshot fields before D1', async () => {
    const db = new RecordingD1();
    const invalid: unknown[] = [
      batchInput({ tenantId: '' }),
      batchInput({ branchId: '' }),
      batchInput({ actorUserId: '' }),
      batchInput({ templateId: '' }),
      batchInput({ idempotencyKey: '' }),
      batchInput({ idempotencyKey: 'x'.repeat(129) }),
      batchInput({ products: [] }),
      batchInput({
        products: Array.from({ length: 101 }, (_, index) => ({
          productId: `product-${index}`,
          copies: 1,
        })),
      }),
      batchInput({ products: [{ productId: '', copies: 1 }] }),
      batchInput({ products: [{ productId: 'product-1', copies: 0 }] }),
      batchInput({ products: [{ productId: 'product-1', copies: 21 }] }),
      batchInput({
        products: [
          { productId: 'product-1', copies: 1 },
          { productId: 'product-1', copies: 1 },
        ],
      }),
      batchInput({
        products: Array.from({ length: 26 }, (_, index) => ({
          productId: `product-${index}`,
          copies: 20,
        })),
      }),
      { ...batchInput(), priceCents: 1 },
      { ...batchInput(), products: [{ productId: 'product-1', copies: 1, barcode: 'evil' }] },
    ];
    for (const input of invalid) {
      await expect(
        createPriceLabelBatchAtomic(db, input as CreatePriceLabelBatchInput),
      ).rejects.toThrow(/PRICE_LABEL_(REQUEST_INVALID|UNTRUSTED_FIELD)/);
    }
    expect(db.calls).toHaveLength(0);
  });

  it('creates, versions, lists and retires append-only templates with actor guards', async () => {
    const createDb = new RecordingD1();
    const created = await createPriceLabelTemplate(createDb, {
      tenantId: 'tenant-1',
      actorUserId: 'user-1',
      templateKey: 'shelf',
      name: 'Shelf',
      template: TEMPLATE,
      paperWidthMm: 58,
    });
    expect(created.version).toBe(1);
    expect(createDb.batches[0]?.map((statement) => statement.sql).join('\n')).toContain(
      'INSERT INTO price_label_templates',
    );

    await expect(
      createPriceLabelTemplate(new RecordingD1({ actor: false }), {
        tenantId: 'tenant-1',
        actorUserId: 'missing',
        templateKey: 'shelf',
        name: 'Shelf',
        template: TEMPLATE,
        paperWidthMm: 58,
      }),
    ).rejects.toThrow('PRICE_LABEL_SCOPE_MISMATCH');
    await expect(
      createPriceLabelTemplate(new RecordingD1({ latestVersion: 1 }), {
        tenantId: 'tenant-1',
        actorUserId: 'user-1',
        templateKey: 'shelf',
        name: 'Shelf',
        template: TEMPLATE,
        paperWidthMm: 58,
      }),
    ).rejects.toThrow('PRICE_LABEL_TEMPLATE_EXISTS');
    await expect(
      versionPriceLabelTemplate(new RecordingD1(), {
        tenantId: 'tenant-1',
        actorUserId: 'user-1',
        templateKey: 'shelf',
        name: 'Shelf v2',
        template: TEMPLATE,
        paperWidthMm: 80,
      }),
    ).rejects.toThrow('PRICE_LABEL_TEMPLATE_NOT_FOUND');
    await expect(
      versionPriceLabelTemplate(new RecordingD1({ latestVersion: 1 }), {
        tenantId: 'tenant-1',
        actorUserId: 'user-1',
        templateKey: 'shelf',
        name: 'Shelf v2',
        template: TEMPLATE,
        paperWidthMm: 80,
      }),
    ).resolves.toMatchObject({ version: 2 });

    await expect(
      retirePriceLabelTemplate(new RecordingD1({ activeTemplate: false }), {
        tenantId: 'tenant-1',
        actorUserId: 'user-1',
        templateId: 'missing',
      }),
    ).rejects.toThrow('PRICE_LABEL_TEMPLATE_NOT_FOUND');
    await expect(
      retirePriceLabelTemplate(new RecordingD1(), {
        tenantId: 'tenant-1',
        actorUserId: 'user-1',
        templateId: 'template-1',
      }),
    ).resolves.toEqual({ templateId: 'template-1', status: 'RETIRED' });
    await expect(
      listPriceLabelTemplates(new RecordingD1(), {
        tenantId: 'tenant-1',
        includeRetired: false,
      }),
    ).resolves.toHaveLength(1);
    await expect(
      listPriceLabelTemplates(new RecordingD1(), {
        tenantId: 'tenant-1',
        includeRetired: true,
      }),
    ).resolves.toHaveLength(1);
  });

  it('rejects malformed template DTO branches', async () => {
    const base = {
      tenantId: 'tenant-1',
      actorUserId: 'user-1',
      templateKey: 'shelf',
      name: 'Shelf',
      template: TEMPLATE,
      paperWidthMm: 58 as const,
    };
    const invalid = [
      { ...base, tenantId: '' },
      { ...base, actorUserId: '' },
      { ...base, templateKey: 'bad key' },
      { ...base, name: '' },
      { ...base, name: 'x'.repeat(121) },
      { ...base, paperWidthMm: 60 as 58 },
      { ...base, template: { dslVersion: 'PRICE_LABEL_V2', blocks: [] } },
      { ...base, snapshotHash: 'evil' },
    ];
    for (const input of invalid) {
      await expect(createPriceLabelTemplate(new RecordingD1(), input)).rejects.toThrow();
    }
  });

  it.each([
    ['EXPLICIT', 'list-1'],
    ['BRANCH_DEFAULT', undefined],
    ['TENANT_DEFAULT', undefined],
  ] as const)(
    'resolves %s list identity and compiles ordered copies',
    async (identity, explicit) => {
      const products = [
        {
          id: 'product-1',
          name: 'Coffee',
          barcode: '4006381333931',
          product_version: 3,
          base_price_cents: 900,
          list_price_cents: 1290,
          price_rowid: 7,
        },
        {
          id: 'product-2',
          name: 'Tea',
          barcode: '96385074',
          product_version: 4,
          base_price_cents: 800,
          list_price_cents: null,
          price_rowid: null,
        },
        {
          id: 'product-3',
          name: 'Bulk',
          barcode: 'SKU-PRINT',
          product_version: 5,
          base_price_cents: 500,
          list_price_cents: 600,
          price_rowid: 9,
        },
      ];
      const db = new RecordingD1({
        preflight: happyPreflight({
          list: [{ id: 'list-1', identity }],
          products,
        }),
      });
      const created = await createPriceLabelBatchAtomic(
        db,
        batchInput({
          ...(explicit ? { priceListId: explicit } : {}),
          products: [
            { productId: 'product-2', copies: 2 },
            { productId: 'product-1', copies: 1 },
            { productId: 'product-3', copies: 1 },
          ],
        }),
      );
      expect(created.priceListIdentity).toBe(identity);
      expect(created.items.map((item) => item.productId)).toEqual([
        'product-2',
        'product-2',
        'product-1',
        'product-3',
      ]);
      expect(created.items.map((item) => item.priceSource)).toEqual([
        'PRODUCT_DEFAULT',
        'PRODUCT_DEFAULT',
        'PRICE_LIST',
        'PRICE_LIST',
      ]);
      expect(created.items.map((item) => item.barcodeType)).toEqual([
        'EAN8',
        'EAN8',
        'EAN13',
        'CODE128',
      ]);
      expect(created.snapshotHash).toMatch(/^[a-f0-9]{64}$/);
      expect(db.batches.at(-1)?.[0]?.sql).toContain('INSERT INTO atomic_guards');
    },
  );

  it.each(
    [
      happyPreflight({ scope: [] }),
      happyPreflight({
        scope: [{ branch_id: 'branch-1', branch_price_list_id: null, actor_ok: 0 }],
      }),
      happyPreflight({ template: [] }),
      happyPreflight({
        template: [
          {
            id: 'template-1',
            template_key: 'shelf',
            version: 1,
            template_json: JSON.stringify(TEMPLATE),
            paper_width_mm: 58,
            status: 'RETIRED',
            latest_version: 1,
          },
        ],
      }),
      happyPreflight({
        template: [
          {
            id: 'template-1',
            template_key: 'shelf',
            version: 1,
            template_json: JSON.stringify(TEMPLATE),
            paper_width_mm: 58,
            status: 'ACTIVE',
            latest_version: 2,
          },
        ],
      }),
      happyPreflight({ list: [] }),
      happyPreflight({ products: [] }),
    ].map((preflight) => [preflight] as const),
  )('fails closed on missing or stale authority preflight %#', async (preflight) => {
    await expect(
      createPriceLabelBatchAtomic(new RecordingD1({ preflight }), batchInput()),
    ).rejects.toThrow('PRICE_LABEL_SCOPE_MISMATCH');
  });

  it.each([
    [
      {
        id: 'product-1',
        name: 'No barcode',
        barcode: null,
        product_version: 1,
        base_price_cents: 100,
        list_price_cents: 100,
        price_rowid: 1,
      },
      'PRICE_LABEL_BARCODE_INVALID',
    ],
    [
      {
        id: 'product-1',
        name: 'Bad barcode',
        barcode: '4006381333932',
        product_version: 1,
        base_price_cents: 100,
        list_price_cents: 100,
        price_rowid: 1,
      },
      'PRICE_LABEL_BARCODE_INVALID',
    ],
    [
      {
        id: 'product-1',
        name: 'Bad price',
        barcode: '4006381333931',
        product_version: 1,
        base_price_cents: -1,
        list_price_cents: null,
        price_rowid: null,
      },
      'PRICE_LABEL_PRICE_INVALID',
    ],
  ])('rejects invalid authoritative product data %#', async (product, code) => {
    await expect(
      createPriceLabelBatchAtomic(
        new RecordingD1({ preflight: happyPreflight({ products: [product] }) }),
        batchInput(),
      ),
    ).rejects.toThrow(code);
  });

  it('returns the original persisted snapshot for idempotency and retry', async () => {
    const db = new RecordingD1({
      preflight: happyPreflight({ existing: [{ id: 'batch-1' }] }),
      storedBatch: storedBatch(),
      storedItems: storedItems(),
    });
    const duplicate = await createPriceLabelBatchAtomic(db, batchInput());
    expect(duplicate.batchId).toBe('batch-1');
    expect(duplicate.items[0]?.renderedPayloadHex).toBe('00');
    await expect(
      retryPriceLabelBatch(db, {
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        batchId: 'batch-1',
      }),
    ).resolves.toMatchObject({ batchId: 'batch-1' });
    await expect(
      retryPriceLabelBatch(new RecordingD1(), {
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        batchId: 'missing',
      }),
    ).rejects.toThrow('PRICE_LABEL_BATCH_NOT_FOUND');
  });

  it('refreshes explicit reprints and emits a guarded hash-chained audit exactly in the plan', async () => {
    const db = new RecordingD1({
      storedBatch: storedBatch(),
      storedItems: storedItems(),
      previousAuditHash: 'c'.repeat(64),
      preflight: happyPreflight(),
    });
    const reprint = await reprintPriceLabelBatchAtomic(db, {
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      actorUserId: 'user-1',
      terminalId: 'terminal-1',
      batchId: 'batch-1',
      idempotencyKey: 'reprint-1',
    });
    expect(reprint.reprintOfBatchId).toBe('batch-1');
    const planSql =
      db.batches
        .at(-1)
        ?.map((statement) => statement.sql)
        .join('\n') ?? '';
    expect(planSql).toContain('PRICE_LABEL_REPRINT');
    expect(planSql).toContain('SELECT last_hash FROM audit_chain_heads');
    expect(planSql.match(/DELETE FROM atomic_guards/g)?.length).toBeGreaterThanOrEqual(2);
    await expect(
      reprintPriceLabelBatchAtomic(new RecordingD1(), {
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        actorUserId: 'user-1',
        batchId: 'missing',
        idempotencyKey: 'reprint-missing',
      }),
    ).rejects.toThrow('PRICE_LABEL_SCOPE_MISMATCH');
    await expect(
      reprintPriceLabelBatchAtomic(db, {
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        actorUserId: 'user-1',
        batchId: 'batch-1',
        idempotencyKey: 'reprint-extra',
        templateId: 'attacker',
      } as never),
    ).rejects.toThrow('PRICE_LABEL_UNTRUSTED_FIELD');
  });

  it.each([
    ['PENDING', ['item-2']],
    ['PRINTING', ['item-2']],
    ['PARTIAL', ['item-2']],
    ['ACKED', []],
    ['FAILED', ['item-1', 'item-2']],
  ] as const)('derives and returns %s ACK state', async (batchStatus, retryItemIds) => {
    const db = new RecordingD1({
      ownedItemIds: ['item-1', 'item-2'],
      batchStatus,
      retryItemIds,
    });
    const response = await acknowledgePriceLabelItems(db, {
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      batchId: 'batch-1',
      acknowledgements: [
        { itemId: 'item-1', status: 'ACKED' },
        { itemId: 'item-2', status: 'FAILED', errorCode: 'PRINTER_TIMEOUT' },
      ],
    });
    expect(response).toEqual({ batchStatus, retryItemIds: [...retryItemIds] });
    const planSql =
      db.batches
        .at(-1)
        ?.map((statement) => statement.sql)
        .join('\n') ?? '';
    expect(planSql).toContain("THEN 'PARTIAL'");
    expect(planSql).toContain("THEN 'FAILED'");
    expect(planSql).toContain("THEN 'ACKED'");
  });

  it('rejects malformed, duplicate and cross-scope ACKs before mutation', async () => {
    const invalid = [
      { tenantId: '', branchId: 'branch-1', batchId: 'batch-1', acknowledgements: [] },
      { tenantId: 'tenant-1', branchId: '', batchId: 'batch-1', acknowledgements: [] },
      { tenantId: 'tenant-1', branchId: 'branch-1', batchId: '', acknowledgements: [] },
      { tenantId: 'tenant-1', branchId: 'branch-1', batchId: 'batch-1', acknowledgements: [] },
      {
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        batchId: 'batch-1',
        acknowledgements: [{ itemId: '', status: 'ACKED' as const }],
      },
      {
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        batchId: 'batch-1',
        acknowledgements: [
          { itemId: 'item-1', status: 'ACKED' as const },
          { itemId: 'item-1', status: 'FAILED' as const },
        ],
      },
      {
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        batchId: 'batch-1',
        acknowledgements: [{ itemId: 'item-1', status: 'BOGUS' as 'ACKED' }],
      },
      {
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        batchId: 'batch-1',
        acknowledgements: [{ itemId: 'item-1', status: 'FAILED' as const, errorCode: 'bad value' }],
      },
    ];
    for (const input of invalid) {
      await expect(acknowledgePriceLabelItems(new RecordingD1(), input)).rejects.toThrow(
        'PRICE_LABEL_ACK_INVALID',
      );
    }
    await expect(
      acknowledgePriceLabelItems(new RecordingD1({ ownedItemIds: [] }), {
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        batchId: 'batch-1',
        acknowledgements: [{ itemId: 'foreign', status: 'ACKED' }],
      }),
    ).rejects.toThrow('PRICE_LABEL_SCOPE_MISMATCH');
  });

  it('returns raced idempotency snapshot but preserves non-idempotent atomic errors', async () => {
    const raced = new RecordingD1({
      failAtomic: new Error('SQLITE_CONSTRAINT'),
      storedBatch: storedBatch(),
      storedItems: storedItems(),
    });
    await expect(createPriceLabelBatchAtomic(raced, batchInput())).resolves.toMatchObject({
      batchId: 'batch-1',
    });
    await expect(
      createPriceLabelBatchAtomic(
        new RecordingD1({ failAtomic: new Error('ATOMIC_GUARD_FAILED') }),
        batchInput(),
      ),
    ).rejects.toThrow('ATOMIC_GUARD_FAILED');
  });
});
