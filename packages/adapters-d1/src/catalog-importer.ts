import type {
  CatalogImportInput,
  CatalogImportPlan,
  CatalogImportResult,
  CatalogImportRow,
  CatalogImporterPort,
} from '@kipuspay/domain-integrations';
import {
  externalKeyFor,
  mapExternalTax,
  planCatalogImport,
  summarizeImportPlan,
} from '@kipuspay/domain-integrations';
import type { AtomicPlanBuilder, D1DatabaseLike } from './index.js';
import { runD1AtomicPlan } from './index.js';

interface ExternalKeyRow {
  readonly entity_type: string;
  readonly external_id: string;
  readonly internal_id: string;
}

interface TaxCodeRow {
  readonly code: string;
}

interface TaxIdRow {
  readonly id: string;
}

/**
 * Maestro de import de catálogo (S21, §5.4 regla 1).
 * - preview: dry-run puro (no escribe D1).
 * - commit: materializa SOLO lo aprobado por el preview, atómicamente y con
 *   idempotencia vía external_entity_map (re-import no duplica).
 */
export class CatalogImporter implements CatalogImporterPort {
  private readonly db: D1DatabaseLike;

  constructor(db: D1DatabaseLike) {
    this.db = db;
  }

  async preview(input: CatalogImportInput): Promise<CatalogImportPlan> {
    const availableTaxCodes = await this.availableTaxCodes(input.tenantId);
    return planCatalogImport({
      ...input,
      existingExternalKeys: await this.existingKeys(input),
      availableTaxCodes,
    });
  }

  async commit(plan: CatalogImportPlan): Promise<CatalogImportResult> {
    const created = plan.actions.filter((a) => a.kind === 'create');
    if (created.length === 0) {
      return summarizeImportPlan(plan);
    }

    const taxIds = await this.taxIdsFor(plan);

    await runD1AtomicPlan(this.db, (builder) => {
      for (const action of created) {
        const row = action.row;
        const internalId = crypto.randomUUID();
        this.writeRow(builder, plan.tenantId, plan.source, row, internalId, taxIds);
      }
    });

    return summarizeImportPlan(plan);
  }

  private async existingKeys(input: CatalogImportInput): Promise<Map<string, string>> {
    if (input.rows.length === 0) return new Map();
    const keys = new Map<string, string>();
    const pairs = input.rows.map((r) => [r.entityType, r.externalId] as const);
    const placeholders = pairs.map(() => '(?, ?)').join(', ');
    const binds: unknown[] = [input.tenantId, input.source];
    for (const [entityType, externalId] of pairs) binds.push(entityType, externalId);

    const rows = await this.db
      .prepare(
        `SELECT entity_type, external_id, internal_id FROM external_entity_map
         WHERE tenant_id = ? AND source = ?
           AND (entity_type, external_id) IN (${placeholders})`,
      )
      .bind(...binds)
      .all<ExternalKeyRow>();
    for (const row of rows.results ?? []) {
      keys.set(
        externalKeyFor(row.entity_type as CatalogImportRow['entityType'], row.external_id),
        row.internal_id,
      );
    }
    return keys;
  }

  /** Códigos de impuesto canónicos que el tenant tiene configurados en `taxes`. */
  private async availableTaxCodes(tenantId: string): Promise<ReadonlySet<string>> {
    const rows = await this.db
      .prepare(`SELECT code FROM taxes WHERE tenant_id = ?`)
      .bind(tenantId)
      .all<TaxCodeRow>();
    return new Set((rows.results ?? []).map((r) => r.code));
  }

  /**
   * Resuelve el internal id de cada tax canónica que el plan necesita.
   * Fail-closed (regla 1): si la tax no existe, lanza — jamás liga el código como FK.
   */
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
        .first<TaxIdRow>();
      if (!result) {
        throw new Error(`tax no configurada para el tenant: ${mapped.taxCode}`);
      }
      taxIds.set(mapped.taxCode, result.id);
    }
    return taxIds;
  }

  private writeRow(
    builder: AtomicPlanBuilder,
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
          .bind(internalId, tenantId, row.branchId, row.documentTypeCode, row.prefix),
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
