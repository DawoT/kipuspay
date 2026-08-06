import type {
  CatalogImportInput,
  CatalogImportPlan,
  CatalogImportResult,
  CatalogImportRow,
} from '@kipuspay/domain-integrations';
import {
  externalKeyFor,
  mapExternalTax,
  planCatalogImport,
  summarizeImportPlan,
} from '@kipuspay/domain-integrations';
import type { D1DatabaseLike } from './index.js';
import { runD1AtomicPlan } from './index.js';

interface ExternalKeyRow {
  readonly internal_id: string;
}

interface TaxRow {
  readonly id: string;
}

/**
 * Maestro de import de catálogo (S21, §5.4 regla 1).
 * - preview: dry-run puro (no escribe D1).
 * - commit: materializa SOLO lo aprobado por el preview, atómicamente y con
 *   idempotencia vía external_entity_map (re-import no duplica).
 */
export class CatalogImporter {
  private readonly db: D1DatabaseLike;

  constructor(db: D1DatabaseLike) {
    this.db = db;
  }

  async preview(input: CatalogImportInput): Promise<CatalogImportPlan> {
    return planCatalogImport({ ...input, existingExternalKeys: await this.existingKeys(input) });
  }

  async commit(plan: CatalogImportPlan): Promise<CatalogImportResult> {
    const created = plan.actions.filter((a) => a.kind === 'create');
    if (created.length === 0) {
      return summarizeImportPlan(plan);
    }

    const taxIds = await this.taxIdsFor(plan);
    const keys = await this.existingKeys(planToInput(plan));

    await runD1AtomicPlan(this.db, (builder) => {
      for (const action of created) {
        const row = action.row;
        const internalId = crypto.randomUUID();
        keys.set(externalKeyFor(row.entityType, row.externalId), internalId);
        this.writeRow(builder, plan.tenantId, plan.source, row, internalId, taxIds);
      }
    });

    return summarizeImportPlan(plan);
  }

  private async existingKeys(input: CatalogImportInput): Promise<Map<string, string>> {
    const keys = new Map<string, string>();
    for (const row of input.rows) {
      const result = await this.db
        .prepare(
          `SELECT internal_id FROM external_entity_map
           WHERE tenant_id = ? AND source = ? AND entity_type = ? AND external_id = ?`,
        )
        .bind(input.tenantId, input.source, row.entityType, row.externalId)
        .first<ExternalKeyRow>();
      if (result) {
        keys.set(externalKeyFor(row.entityType, row.externalId), result.internal_id);
      }
    }
    return keys;
  }

  private async taxIdsFor(plan: CatalogImportPlan): Promise<ReadonlyMap<string, string>> {
    const taxIds = new Map<string, string>();
    for (const action of plan.actions) {
      const row = action.row;
      if (row.entityType !== 'product') continue;
      const mapped = mapExternalTax(row.taxName);
      if (mapped?.kind !== 'known') continue;
      if (taxIds.has(mapped.taxCode)) continue;
      const result = await this.db
        .prepare(`SELECT id FROM taxes WHERE tenant_id = ? AND code = ?`)
        .bind(plan.tenantId, mapped.taxCode)
        .first<TaxRow>();
      taxIds.set(mapped.taxCode, result?.id ?? mapped.taxCode);
    }
    return taxIds;
  }

  private writeRow(
    builder: { add(statement: unknown): void },
    tenantId: string,
    source: string,
    row: CatalogImportRow,
    internalId: string,
    taxIds: ReadonlyMap<string, string>,
  ): void {
    if (row.entityType === 'product') {
      const mapped = mapExternalTax(row.taxName);
      builder.add(
        this.db
          .prepare(
            `INSERT INTO products (id, tenant_id, sku, barcode, name, product_type, unit_code,
               price_cents, cost_cents, currency, stock, igv_affectation_code_default)
             VALUES (?, ?, ?, ?, ?, 'physical', ?, ?, ?, 'PEN', 0, ?)`,
          )
          .bind(
            internalId,
            tenantId,
            row.sku,
            row.barcode,
            row.name,
            row.unitCode,
            row.priceCents,
            row.costCents,
            row.igvAffectationCode,
          ),
      );
      if (mapped?.kind === 'known' && taxIds.has(mapped.taxCode)) {
        builder.add(
          this.db
            .prepare(
              `INSERT INTO product_taxes (id, tenant_id, product_id, tax_id) VALUES (?, ?, ?, ?)`,
            )
            .bind(crypto.randomUUID(), tenantId, internalId, taxIds.get(mapped.taxCode)),
        );
      }
    }
    if (row.entityType === 'customer') {
      builder.add(
        this.db
          .prepare(
            `INSERT INTO customers (id, tenant_id, document_type_code, document_number, name, email, credit_limit_cents)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            internalId,
            tenantId,
            row.documentTypeCode,
            row.documentNumber,
            row.name,
            row.email,
            row.creditLimitCents,
          ),
      );
    }
    if (row.entityType === 'series') {
      builder.add(
        this.db
          .prepare(
            `INSERT INTO branch_document_series (id, tenant_id, branch_id, document_type_code, series)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .bind(internalId, tenantId, tenantId, row.documentTypeCode, row.prefix),
      );
    }
    builder.add(
      this.db
        .prepare(
          `INSERT INTO external_entity_map (id, tenant_id, source, entity_type, external_id, internal_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(crypto.randomUUID(), tenantId, source, row.entityType, row.externalId, internalId),
    );
  }
}

function planToInput(plan: CatalogImportPlan): CatalogImportInput {
  return {
    source: plan.source,
    tenantId: plan.tenantId,
    rows: plan.actions.map((a) => a.row),
    existingExternalKeys: new Map(),
  };
}
