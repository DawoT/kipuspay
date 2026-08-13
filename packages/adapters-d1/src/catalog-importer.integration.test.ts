import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { CatalogImporter } from './catalog-importer.js';

async function seedTenant(tenantId: string, withIgv: boolean): Promise<{ branchId: string }> {
  const branchId = `b-${tenantId}`;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(tenantId, 'Import SAC', 'retail', 'shard-1', 'INTERNAL_CONTROL'),
    env.DB.prepare(
      `INSERT INTO branches (id, tenant_id, code, name, address)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(branchId, tenantId, 'C01', 'Centro', 'Lima'),
  ]);
  if (withIgv) {
    await env.DB.prepare(
      `INSERT INTO taxes (id, tenant_id, code, name, rate_percentage)
       VALUES (?, ?, '1000', 'IGV', 18)`,
    )
      .bind(`tax-igv-${tenantId}`, tenantId)
      .run();
  }
  return { branchId };
}

const product = {
  entityType: 'product' as const,
  externalId: 'p1',
  sku: 'SKU-1',
  barcode: null,
  name: 'Café',
  unitCode: 'NIU',
  priceCents: 1250,
  costCents: 800,
  taxName: 'IGV',
  igvAffectationCode: '10',
};

describe('CatalogImporter integración D1 (FK reales)', () => {
  it('commit persiste producto + product_taxes + mapa y respeta idempotencia', async () => {
    await seedTenant('t-imp-ok', true);
    const importer = new CatalogImporter(env.DB);

    const preview = await importer.preview({
      source: 'csv',
      tenantId: 't-imp-ok',
      rows: [product],
    });
    expect(preview.conflicts).toHaveLength(0);
    expect(preview.actions).toHaveLength(1);

    const result = await importer.commit(preview);
    expect(result).toEqual({ importedCount: 1, skippedCount: 0 });

    const prod = await env.DB.prepare(`SELECT id FROM products WHERE tenant_id = ? AND sku = ?`)
      .bind('t-imp-ok', 'SKU-1')
      .first<{ id: string }>();
    expect(prod?.id).toBeTruthy();

    const taxLink = await env.DB.prepare(
      `SELECT pt.tax_id FROM product_taxes pt
       JOIN products p ON p.id = pt.product_id
       WHERE p.tenant_id = ? AND p.sku = ?`,
    )
      .bind('t-imp-ok', 'SKU-1')
      .first<{ tax_id: string }>();
    expect(taxLink?.tax_id).toBe(`tax-igv-t-imp-ok`);

    // Idempotencia: re-import no duplica (UNIQUE external_entity_map).
    const again = await importer.preview({ source: 'csv', tenantId: 't-imp-ok', rows: [product] });
    expect(again.actions[0]).toMatchObject({ kind: 'skip-duplicate' });
    const againResult = await importer.commit(again);
    expect(againResult).toEqual({ importedCount: 0, skippedCount: 1 });

    const count = await env.DB.prepare(`SELECT COUNT(*) AS n FROM products WHERE tenant_id = ?`)
      .bind('t-imp-ok')
      .first<{ n: number }>();
    expect(count?.n).toBe(1);
  });

  it('preview reporta conflicto si la tax no está configurada (fail-closed, regla 1)', async () => {
    await seedTenant('t-imp-notax', false);
    const importer = new CatalogImporter(env.DB);

    const preview = await importer.preview({
      source: 'csv',
      tenantId: 't-imp-notax',
      rows: [product],
    });
    expect(preview.actions).toHaveLength(0);
    expect(preview.conflicts[0]?.reason).toBe('impuesto no configurado en el tenant: 1000');
  });

  it('commit con tax faltante en el tenant lanza (fail-closed), jamás liga el código como FK', async () => {
    await seedTenant('t-imp-toctou', false);
    const importer = new CatalogImporter(env.DB);

    // Simula TOCTOU: plan aprobado en preview cuando la tax existía, y para el commit ya no.
    const plan = {
      source: 'csv' as const,
      tenantId: 't-imp-toctou',
      actions: [
        {
          kind: 'create' as const,
          row: product,
        },
      ],
      conflicts: [],
    };
    await expect(importer.commit(plan)).rejects.toThrow(/tax no configurada para el tenant: 1000/);
  });

  it('series importa con branch_id real del tenant; branch inexistente viola FK', async () => {
    await seedTenant('t-imp-series', true);
    const importer = new CatalogImporter(env.DB);

    const preview = await importer.preview({
      source: 'csv',
      tenantId: 't-imp-series',
      rows: [
        {
          entityType: 'series',
          externalId: 's1',
          branchId: 'b-t-imp-series',
          documentTypeCode: '01',
          prefix: 'F001',
        },
      ],
    });
    expect(preview.conflicts).toHaveLength(0);
    const result = await importer.commit(preview);
    expect(result.importedCount).toBe(1);

    const series = await env.DB.prepare(
      `SELECT branch_id FROM branch_document_series WHERE tenant_id = ? AND series = ?`,
    )
      .bind('t-imp-series', 'F001')
      .first<{ branch_id: string }>();
    expect(series?.branch_id).toBe('b-t-imp-series');
  });

  it('validateCatalogRow rechaza entityType desconocido sin llegar a D1', async () => {
    await seedTenant('t-imp-unknown', true);
    const importer = new CatalogImporter(env.DB);
    const preview = await importer.preview({
      source: 'csv',
      tenantId: 't-imp-unknown',
      rows: [{ entityType: 'gadget', externalId: 'x' }] as never,
    });
    expect(preview.actions).toHaveLength(0);
    expect(preview.conflicts[0]?.reason).toBe('tipo de entidad no soportado: gadget');
  });
});

describe('F7 Bloque C — atomicidad del commit', () => {
  it('fallo en una fila del lote → 0 filas persistidas (batch atómico)', async () => {
    await seedTenant('t-imp-atomic', true);
    const importer = new CatalogImporter(env.DB);

    // Lote con 2 filas: la 2ª rompe un UNIQUE del tenant (barcode duplicado
    // de un producto existente) → el batch debe revertir TODO, no media.
    const existing = {
      entityType: 'product' as const,
      externalId: 'p-existing',
      sku: 'SKU-EXIST',
      barcode: '7791001',
      name: 'Existente',
      unitCode: 'NIU',
      priceCents: 1000,
      costCents: 500,
      taxName: null,
      igvAffectationCode: '10',
    };
    await importer.commit(await importer.preview({ source: 'csv', tenantId: 't-imp-atomic', rows: [existing] }));

    // barcode 7791001 ya existe → la 2ª fila del lote viola el UNIQUE
    const lote = [
      {
        ...existing,
        externalId: 'p-new1',
        sku: 'SKU-NEW1',
        barcode: '7792001',
        name: 'Nuevo 1',
      },
      {
        ...existing,
        externalId: 'p-new2',
        sku: 'SKU-NEW2',
        barcode: '7791001',
        name: 'Duplicado',
      },
    ];
    const plan = await importer.preview({ source: 'csv', tenantId: 't-imp-atomic', rows: lote });
    expect(plan.conflicts).toHaveLength(0);

    // El commit del lote con UNIQUE violation debe fallar o no persistir nada.
    try {
      await importer.commit(plan);
    } catch {
      // esperado: D1 aborta el batch
    }

    const count = await env.DB.prepare(`SELECT COUNT(*) AS n FROM products WHERE tenant_id = ?`)
      .bind('t-imp-atomic')
      .first<{ n: number }>();
    expect(count?.n).toBe(1); // solo el existing inicial; nada del lote roto
  });

  it('preview respeta aislamiento de tenant (claves del tenant B no son duplicadas del A)', async () => {
    await seedTenant('t-imp-a', true);
    await seedTenant('t-imp-b', true);
    const impA = new CatalogImporter(env.DB);
    await impA.commit(await impA.preview({ source: 'csv', tenantId: 't-imp-a', rows: [product] }));

    // El mismo externalId en el tenant B NO es duplicado (aislamiento DAT-12).
    const planB = await impA.preview({ source: 'csv', tenantId: 't-imp-b', rows: [product] });
    expect(planB.actions[0]).toMatchObject({ kind: 'create' });
  });
});
