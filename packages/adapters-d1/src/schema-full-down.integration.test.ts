import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import {
  DOWN_0000_SCHEMA_META,
  DOWN_0001_DDL_BASE,
  DOWN_0002_WEBHOOK_EVENTS,
  DOWN_0003_ATOMIC_GUARDS,
  DOWN_0004_AUDIT_EVENTS,
  DOWN_0005_FISCAL_OUTBOX,
  DOWN_0006_FISCAL_ALERTS,
  DOWN_0007_DAILY_ROLLUPS,
  DOWN_0008_PUSH_SUBSCRIPTIONS,
  DOWN_0009_DAILY_PRODUCT_ROLLUPS,
  DOWN_0010_REFERRALS_BRAND_GROWTH,
  DOWN_0011_FASE6_COMMERCIAL_OPS,
  DOWN_0013_CATALOG_IMPORT,
  DOWN_0014_SPRINT20_PO_PARTIAL,
  DOWN_0015_SPRINT22_PAYMENT_CAPTURES,
  DOWN_0016_SPRINT23_API_WEBHOOKS,
  DOWN_0017_SPRINT24_LOYALTY_MESSAGING,
  DOWN_0018_SPRINT25_POS_TERMINALS,
  DOWN_0019_SPRINT26_FISCAL_OUTBOX_R2,
  DOWN_0020_SPRINT27_USAGE_BILLING,
  DOWN_0021_SPRINT28_SALES_RETURNS,
  DOWN_0022_SPRINT29_SUPPLIER_INVOICES,
  DOWN_0023_SPRINT30_PROMOTIONS,
  DOWN_0024_SPRINT31_VARIANTS_UOM,
  DOWN_0025_SPRINT32_LAYAWAY_JOURNAL,
  DOWN_0026_SPRINT33_QUOTES,
  DOWN_0027_SPRINT34_SUPPLIER_RETURNS,
  DOWN_0028_SPRINT35_STORE_CREDIT,
  DOWN_0029_SPRINT36_INSTALLMENTS,
  DOWN_0030_SPRINT37_COMMISSIONS,
  DOWN_0031_SPRINT38_INVENTORY_LOCATIONS,
  DOWN_0032_SPRINT39_INVENTORY_SERIALS,
  DOWN_0033_SPRINT40_INVENTORY_SCALE,
  DOWN_0034_SPRINT41_PRICE_LABELS,
  DOWN_0035_SPRINT42_DATA_BACKUP,
  DOWN_0036_SPRINT43_CUSTOMER_ORDERS,
  DOWN_0037_SPRINT44_RECURRING_SALES,
  DOWN_0038_SPRINT45_MOBILE_PUSH,
  DOWN_0039_SPRINT46_FORECASTING,
  DOWN_0040_SPRINT47_LPDP_CONSENT,
  DOWN_0041_SPRINT49_INSIGHTS,
  DOWN_0042_SPRINT50_QUICK_ADD,
  DOWN_0043_SPRINT51_SHIFT_HANDOFF,
  DOWN_0044_SPRINT52_ONBOARDING_TOUR,
  DOWN_0046_SPRINT_P1B_REMISSION_GUIDE,
  DOWN_0047_SPRINT_P1C_WITHHOLDINGS,
  DOWN_0048_SPRINT_P2_CASH_TIPS_DRAWER,
  DOWN_0049_SPRINT40_SCALE_WEIGHT_READING,
  DOWN_0050_SPRINT51_PIN_LOCKOUT,
  DOWN_0051_SPRINT_M6_PAYMENT_METHODS_PK,
  DOWN_0052_SPRINT_M6_GROWTH_EVENTS_EPOCH,
  DOWN_0053_SPRINT_M6_EPOCH_TRIGGERS_BACKFILL,
  DOWN_0054_PLATFORM_RECLAMACIONES,
  DOWN_0055_PLATFORM_RECLAMACIONES_STATUS,
  DOWN_0056_TENANT_CERTIFICATES,
} from './migrations-down.js';

async function paymentMethodsPkColumns(): Promise<string[]> {
  const rows = await env.DB.prepare(`PRAGMA table_info(payment_methods)`).all<{
    name: string;
    pk: number;
  }>();
  return rows.results
    .filter((row) => row.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((row) => row.name);
}

describe('D1 full down chain (isolate limpio post-migrate)', () => {
  it('down 0056…0000 deja el schema sin tablas de negocio y DOWN_0051 revierte la PK', async () => {
    expect(await paymentMethodsPkColumns()).toEqual(['tenant_id', 'id']);
    const markerBefore = await env.DB.prepare(
      `SELECT value FROM schema_meta WHERE key = 'sprint_m6.payment_methods_pk'`,
    ).first<{ value: string }>();
    expect(markerBefore?.value).toBe('1');

    await env.DB.exec(DOWN_0056_TENANT_CERTIFICATES);
    await env.DB.exec(DOWN_0055_PLATFORM_RECLAMACIONES_STATUS);
    await env.DB.exec(DOWN_0054_PLATFORM_RECLAMACIONES);
    await env.DB.exec(DOWN_0053_SPRINT_M6_EPOCH_TRIGGERS_BACKFILL);
    await env.DB.exec(DOWN_0052_SPRINT_M6_GROWTH_EVENTS_EPOCH);
    await env.DB.exec(DOWN_0051_SPRINT_M6_PAYMENT_METHODS_PK);

    expect(await paymentMethodsPkColumns()).toEqual(['id']);
    const markerAfter = await env.DB.prepare(
      `SELECT value FROM schema_meta WHERE key = 'sprint_m6.payment_methods_pk'`,
    ).first<{ value: string }>();
    expect(markerAfter).toBeNull();

    await env.DB.exec(DOWN_0050_SPRINT51_PIN_LOCKOUT);
    await env.DB.exec(DOWN_0049_SPRINT40_SCALE_WEIGHT_READING);
    await env.DB.exec(DOWN_0048_SPRINT_P2_CASH_TIPS_DRAWER);
    await env.DB.exec(DOWN_0047_SPRINT_P1C_WITHHOLDINGS);
    await env.DB.exec(DOWN_0046_SPRINT_P1B_REMISSION_GUIDE);
    await env.DB.exec(DOWN_0044_SPRINT52_ONBOARDING_TOUR);
    await env.DB.exec(DOWN_0043_SPRINT51_SHIFT_HANDOFF);
    await env.DB.exec(DOWN_0042_SPRINT50_QUICK_ADD);
    await env.DB.exec(DOWN_0041_SPRINT49_INSIGHTS);
    await env.DB.exec(DOWN_0040_SPRINT47_LPDP_CONSENT);
    await env.DB.exec(DOWN_0039_SPRINT46_FORECASTING);
    await env.DB.exec(DOWN_0038_SPRINT45_MOBILE_PUSH);
    await env.DB.exec(DOWN_0037_SPRINT44_RECURRING_SALES);
    await env.DB.exec(DOWN_0036_SPRINT43_CUSTOMER_ORDERS);
    await env.DB.exec(DOWN_0035_SPRINT42_DATA_BACKUP);
    await env.DB.exec(DOWN_0034_SPRINT41_PRICE_LABELS);
    await env.DB.exec(DOWN_0033_SPRINT40_INVENTORY_SCALE);
    await env.DB.exec(DOWN_0032_SPRINT39_INVENTORY_SERIALS);
    await env.DB.exec(DOWN_0031_SPRINT38_INVENTORY_LOCATIONS);
    await env.DB.exec(DOWN_0030_SPRINT37_COMMISSIONS);
    await env.DB.exec(DOWN_0029_SPRINT36_INSTALLMENTS);
    await env.DB.exec(DOWN_0028_SPRINT35_STORE_CREDIT);
    await env.DB.exec(DOWN_0027_SPRINT34_SUPPLIER_RETURNS);
    await env.DB.exec(DOWN_0026_SPRINT33_QUOTES);
    await env.DB.exec(DOWN_0025_SPRINT32_LAYAWAY_JOURNAL);
    await env.DB.exec(DOWN_0024_SPRINT31_VARIANTS_UOM);
    await env.DB.exec(DOWN_0023_SPRINT30_PROMOTIONS);
    await env.DB.exec(DOWN_0022_SPRINT29_SUPPLIER_INVOICES);
    await env.DB.exec(DOWN_0021_SPRINT28_SALES_RETURNS);
    await env.DB.exec(DOWN_0020_SPRINT27_USAGE_BILLING);
    await env.DB.exec(DOWN_0019_SPRINT26_FISCAL_OUTBOX_R2);
    await env.DB.exec(DOWN_0018_SPRINT25_POS_TERMINALS);
    await env.DB.exec(DOWN_0017_SPRINT24_LOYALTY_MESSAGING);
    await env.DB.exec(DOWN_0016_SPRINT23_API_WEBHOOKS);
    await env.DB.exec(DOWN_0015_SPRINT22_PAYMENT_CAPTURES);
    await env.DB.exec(DOWN_0014_SPRINT20_PO_PARTIAL);
    await env.DB.exec(DOWN_0013_CATALOG_IMPORT);
    await env.DB.exec(DOWN_0011_FASE6_COMMERCIAL_OPS);
    await env.DB.exec(DOWN_0010_REFERRALS_BRAND_GROWTH);
    await env.DB.exec(DOWN_0009_DAILY_PRODUCT_ROLLUPS);
    await env.DB.exec(DOWN_0008_PUSH_SUBSCRIPTIONS);
    await env.DB.exec(DOWN_0007_DAILY_ROLLUPS);
    await env.DB.exec(DOWN_0006_FISCAL_ALERTS);
    await env.DB.exec(DOWN_0005_FISCAL_OUTBOX);
    await env.DB.exec(DOWN_0004_AUDIT_EVENTS);
    await env.DB.exec(DOWN_0003_ATOMIC_GUARDS);
    await env.DB.exec(DOWN_0002_WEBHOOK_EVENTS);
    await env.DB.exec(DOWN_0001_DDL_BASE);
    await env.DB.exec(DOWN_0000_SCHEMA_META);

    const tables = await env.DB.prepare(
      `SELECT name FROM sqlite_master
       WHERE type='table'
         AND name NOT LIKE 'sqlite_%'
         AND name NOT LIKE 'd1_%'
         AND name != '_cf_METADATA'
       ORDER BY name`,
    ).all<{ name: string }>();

    expect(tables.results.map((t) => t.name)).toEqual([]);
  });
});
