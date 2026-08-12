import { describe, expect, it } from 'vitest';
import {
  buildInsightSelect,
  INSIGHT_SCHEMA,
  isWhitelistedColumn,
  type InsightSqlResult,
} from './sql-schema.js';

describe('insights sql-schema estricto (Sprint 49 / PERF-12)', () => {
  it('genera SELECT parametrizado con tenant forzado y LIMIT 50 (edge A)', () => {
    const result = buildInsightSelect({
      action: 'SALES_SUMMARY',
      tenantId: 't1',
      branchId: 'b1',
      reportDate: '2026-08-03',
    });
    expect(result.status).toBe('OK');
    if (result.status !== 'OK') return;
    expect(result.sql).toContain('tenant_id = ?');
    expect(result.sql).toMatch(/LIMIT\s+50/);
    expect(result.sql).not.toContain('*');
    expect(result.sql).not.toMatch(/JOIN\s+(?!daily)/i);
    expect(result.params).toContain('t1');
  });

  it('no permite columnas fuera de la whitelist (PII-free, edge C)', () => {
    expect(isWhitelistedColumn('sales', 'email')).toBe(false);
    expect(isWhitelistedColumn('sales', 'phone')).toBe(false);
    expect(isWhitelistedColumn('customers', 'email')).toBe(false);
    expect(isWhitelistedColumn('customers', 'document_number')).toBe(false);
    expect(isWhitelistedColumn('customers', 'address')).toBe(false);
    expect(isWhitelistedColumn('sales', 'customer_id')).toBe(true);
    expect(isWhitelistedColumn('sales', 'total_amount_cents')).toBe(true);
  });

  it('la consulta generada no contiene texto del LLM concatenado (parametrizada)', () => {
    const result = buildInsightSelect({
      action: 'BREAKAGE',
      tenantId: 't1',
    });
    expect(result.status).toBe('OK');
    if (result.status !== 'OK') return;
    expect(result.sql).not.toMatch(/['"]/);
    expect(result.sql).toMatch(/^\s*SELECT/);
  });

  it('listas amplias sin agregación → TOO_WIDE con copy de descarga', () => {
    const result = buildInsightSelect({
      action: 'RAW_ITEMS',
      tenantId: 't1',
    }) as Extract<InsightSqlResult, { status: 'TOO_WIDE' }>;
    expect(result.status).toBe('TOO_WIDE');
    expect(result.message).toMatch(/Excel/);
  });

  it('el schema declara tablas y columnas conocidas', () => {
    expect(INSIGHT_SCHEMA.sales).toBeDefined();
    expect(INSIGHT_SCHEMA.daily_financial_rollups).toBeDefined();
    expect(INSIGHT_SCHEMA.daily_product_rollups).toBeDefined();
    expect(INSIGHT_SCHEMA.customers).toBeUndefined();
  });
});
