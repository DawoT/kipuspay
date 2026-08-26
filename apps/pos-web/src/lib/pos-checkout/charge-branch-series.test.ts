/**
 * BLOQUEANTE #2 — Serie + taxRegime hardcodeados en cobro (TDD RED→GREEN)
 *
 * Verifica:
 *  - taxRegime se lee de PosTenantSession, no literal 'RG' en +page.svelte
 *  - seriesForDocumentType / resolveChargeDocument lee branch_document_series por sucursal
 *  - NRUS con RUC no puede emitir factura (boleta con serie del branch)
 *  - Offline queue indexa branch_id
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { BranchSeries } from '../branch-series/client.js';
import { resolveSeriesForBranch } from '../branch-series/client.js';
import type { OfflineSalePayload } from '@kipuspay/domain-sales';
import { createMemoryOfflineIdb, OfflineQueueStore } from '../offline-sync/offline-queue.js';
import { defaultTenantSession } from '../tenant/session.js';
import { resolveChargeDocument, seriesForDocumentType } from './charge.js';

function branchSeriesFixture(): BranchSeries[] {
  return [
    { id: 's-f001', series: 'F002', documentTypeCode: '01', currentNumber: 10, isActive: true, authorizationStatus: 'AUTHORIZED' },
    { id: 's-b001', series: 'B002', documentTypeCode: '03', currentNumber: 20, isActive: true, authorizationStatus: 'AUTHORIZED' },
    { id: 's-nv', series: 'NV02', documentTypeCode: 'NV', currentNumber: 5, isActive: true, authorizationStatus: 'INTERNAL' },
    { id: 's-nv-ret', series: 'NV02', documentTypeCode: 'NV_RETURN', currentNumber: 5, isActive: true, authorizationStatus: 'INTERNAL' },
  ];
}

describe('BLOQUEANTE #2 — taxRegime y serie por sucursal', () => {
  it('resolveChargeDocument respeta taxRegime NRUS: RUC → boleta B002, no factura F002', () => {
    const series = branchSeriesFixture();
    const r = resolveChargeDocument({
      formalizationMode: 'ELECTRONIC_ISSUER',
      taxRegime: 'NRUS',
      clientDocumentType: '6',
      clientDocumentNumber: '20612913251',
      branchSeries: series,
    });
    // NRUS no puede emitir 01 (factura) → debe ser boleta 03 con serie del branch
    expect(r.documentType).toBe('03');
    expect(r.series).toBe('B002');
  });

  it('RER con RUC emite factura con serie F002 del branch, no F001 hardcodeado', () => {
    const series = branchSeriesFixture();
    const r = resolveChargeDocument({
      formalizationMode: 'ELECTRONIC_ISSUER',
      taxRegime: 'RER',
      clientDocumentType: '6',
      clientDocumentNumber: '20612913251',
      branchSeries: series,
    });
    expect(r.documentType).toBe('01');
    expect(r.series).toBe('F002');
  });

  it('RMT con DNI emite boleta con serie B002 del branch', () => {
    const series = branchSeriesFixture();
    const r = resolveChargeDocument({
      formalizationMode: 'ELECTRONIC_ISSUER',
      taxRegime: 'RMT',
      clientDocumentType: '1',
      clientDocumentNumber: '12345678',
      branchSeries: series,
    });
    expect(r.documentType).toBe('03');
    expect(r.series).toBe('B002');
  });

  it('seriesForDocumentType lee de branch_document_series: sucursal B usa B002/F002', () => {
    const series = branchSeriesFixture();
    expect(seriesForDocumentType('01', series)).toBe('F002');
    expect(seriesForDocumentType('03', series)).toBe('B002');
    expect(seriesForDocumentType('NV', series)).toBe('NV02');
    // sin branchSeries → fallback F001/B001/NV01 (dev sin DB)
    expect(seriesForDocumentType('01', [])).toBe('F001');
    expect(seriesForDocumentType('03', null)).toBe('B001');
  });

  it('resolveSeriesForBranch prioriza AUTHORIZED sobre INTERNAL/PENDING', () => {
    const mixed: BranchSeries[] = [
      { id: 's1', series: 'F001', documentTypeCode: '01', currentNumber: 1, isActive: true, authorizationStatus: 'PENDING_SUNAT' },
      { id: 's2', series: 'F002', documentTypeCode: '01', currentNumber: 10, isActive: true, authorizationStatus: 'AUTHORIZED' },
    ];
    expect(resolveSeriesForBranch(mixed, '01')).toBe('F002');
  });

  it('PosTenantSession tiene taxRegime y no default RG (fail-closed UNKNOWN)', () => {
    const s = defaultTenantSession();
    expect(s.taxRegime).toBe('UNKNOWN');
    expect(['UNKNOWN', 'NRUS', 'RER', 'RMT', 'RG']).toContain(s.taxRegime);
  });

  it('+page.svelte no hardcodea taxRegime RG (debe leer de session.taxRegime)', () => {
    const pagePath = path.resolve(__dirname, '../../routes/+page.svelte');
    const content = fs.readFileSync(pagePath, 'utf8');
    // debe contener session.taxRegime
    expect(content).toContain('session.taxRegime');
    // no debe contener literal hardcodeado taxRegime: 'RG' (con comillas simples o dobles)
    expect(content).not.toMatch(/taxRegime:\s*['"]RG['"]/);
    // tampoco series hardcodeadas en seriesForDocumentType sin branch?
    // charge.ts no debe tener solo return 'F001' sin rama branchSeries
    const chargePath = path.resolve(__dirname, './charge.ts');
    const chargeContent = fs.readFileSync(chargePath, 'utf8');
    expect(chargeContent).toContain('branchSeries');
    expect(chargeContent).toContain('resolveSeriesForBranch');
  });

  it('kiosk también lee taxRegime de session, no RG hardcodeado', () => {
    const kioskPath = path.resolve(__dirname, '../../routes/kiosk/+page.svelte');
    const content = fs.readFileSync(kioskPath, 'utf8');
    expect(content).not.toMatch(/taxRegime:\s*['"]RG['"]/);
    expect(content).toContain('tenant.taxRegime');
  });

  it('offline queue indexa branch_id (payload.branchId denormalizado)', async () => {
    const queue = new OfflineQueueStore(createMemoryOfflineIdb());
    await queue.enqueue({
      offlineSaleId: 'off-1',
      branchId: 'branch-A',
      cashRegisterSessionId: 's1',
      documentType: 'NV',
      series: 'NV02',
      clientDocumentType: '1',
      clientDocumentNumber: '00000000',
      clientName: 'Cliente',
      items: [{ productId: 'p1', quantity: 1 }],
      payments: [{ paymentMethodId: 'pm1', amountCents: 1000 }],
    } as unknown as OfflineSalePayload);
    await queue.enqueue({
      offlineSaleId: 'off-2',
      branchId: 'branch-B',
      cashRegisterSessionId: 's1',
      documentType: 'NV',
      series: 'NV01',
      clientDocumentType: '1',
      clientDocumentNumber: '00000001',
      clientName: 'Cliente2',
      items: [{ productId: 'p1', quantity: 1 }],
      payments: [{ paymentMethodId: 'pm1', amountCents: 1000 }],
    } as unknown as OfflineSalePayload);
    const all = await queue.listPending();
    expect(all.length).toBe(2);
    expect(all[0]!.branchId).toBe('branch-A');
    expect(all[0]!.payload.branchId).toBe('branch-A');
    const byA = await queue.listPendingByBranch('branch-A');
    expect(byA.length).toBe(1);
    expect(byA[0]!.offlineSaleId).toBe('off-1');
  });

  it('fetchBranchSeries contrato: GET /api/branches/:id/series debe existir en worker-api', () => {
    const indexPath = path.resolve(__dirname, '../../../../worker-api/src/index.ts');
    const idx = fs.readFileSync(indexPath, 'utf8');
    expect(idx).toContain("/api/branches/:id/series");
    expect(idx).toContain('runListBranchSeriesHttp');
  });
});
