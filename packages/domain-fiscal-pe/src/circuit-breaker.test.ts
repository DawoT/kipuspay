import { describe, expect, it } from 'vitest';
import {
  applyInfraFailures,
  applyBusinessFailure,
  applyProbeFailure,
  applyProbeSuccess,
  assertCpeInvoiceDto,
  assertCpeSummaryDto,
  breakerDoName,
  breakerKvKey,
  BREAKER_FAILURE_THRESHOLD,
  initialBreakerSnapshot,
  isBreakerOpen,
  transitionToHalfOpen,
  BREAKER_OPEN_MS,
} from './index.js';

describe('CPEInvoiceDTO R-01', () => {
  const base = {
    tenantId: 't',
    saleId: 's',
    documentType: '01' as const,
    series: 'F001',
    number: 1,
    issuerRuc: '20111111111',
    totalCents: 100,
    xml: '<Invoice/>',
    xmlHash: 'abc',
    mustSubmitByIso: new Date().toISOString(),
  };

  it('valida campos mínimos', () => {
    expect(() => assertCpeInvoiceDto(base)).not.toThrow();
    expect(() => assertCpeInvoiceDto({ ...base, tenantId: '' })).toThrow('CPE_DTO_TENANT_REQUIRED');
    expect(() => assertCpeInvoiceDto({ ...base, saleId: '' })).toThrow('CPE_DTO_SALE_REQUIRED');
    expect(() => assertCpeInvoiceDto({ ...base, xml: '  ' })).toThrow('CPE_DTO_XML_REQUIRED');
    expect(() => assertCpeInvoiceDto({ ...base, xmlHash: '' })).toThrow('CPE_DTO_HASH_REQUIRED');
    expect(() => assertCpeInvoiceDto({ ...base, totalCents: -1 })).toThrow(
      'CPE_DTO_TOTAL_CENTS_INVALID',
    );
  });

  it('valida summary DTO', () => {
    expect(() =>
      assertCpeSummaryDto({
        tenantId: 't',
        summaryDateLima: '2026-08-07',
        documentType: 'RC',
        xml: '<Summary/>',
        xmlHash: 'h',
        saleIds: ['s1'],
      }),
    ).not.toThrow();
    expect(() =>
      assertCpeSummaryDto({
        tenantId: '',
        summaryDateLima: '2026-08-07',
        documentType: 'RC',
        xml: '<Summary/>',
        xmlHash: 'h',
        saleIds: [],
      }),
    ).toThrow('CPE_SUMMARY_TENANT_REQUIRED');
    expect(() =>
      assertCpeSummaryDto({
        tenantId: 't',
        summaryDateLima: '2026-08-07',
        documentType: 'RC',
        xml: '  ',
        xmlHash: 'h',
        saleIds: [],
      }),
    ).toThrow('CPE_SUMMARY_XML_REQUIRED');
    expect(() =>
      assertCpeSummaryDto({
        tenantId: 't',
        summaryDateLima: '2026-08-07',
        documentType: 'XX' as 'RC',
        xml: '<Summary/>',
        xmlHash: 'h',
        saleIds: [],
      }),
    ).toThrow('CPE_SUMMARY_TYPE_INVALID');
  });
});

describe('circuit breaker FSM', () => {
  it('10 INFRA abren; BUSINESS no mueve; count<=0 no-op', () => {
    let snap = initialBreakerSnapshot();
    snap = applyBusinessFailure(snap);
    expect(snap.state).toBe('closed');
    expect(applyInfraFailures(snap, 0, 1).failureCount).toBe(0);
    expect(applyInfraFailures(snap, 1, 1).state).toBe('closed');
    snap = applyInfraFailures(snap, BREAKER_FAILURE_THRESHOLD, 1_000);
    expect(snap.state).toBe('open');
    expect(isBreakerOpen(snap)).toBe(true);
    expect(applyInfraFailures(snap, 5, 2_000).state).toBe('open');
  });

  it('half-open → success cierra; failure reabre; antes de ventana no transiciona', () => {
    let snap = applyInfraFailures(initialBreakerSnapshot(), 10, 0);
    expect(transitionToHalfOpen(snap, 100).state).toBe('open');
    snap = transitionToHalfOpen(snap, BREAKER_OPEN_MS + 1);
    expect(snap.state).toBe('half-open');
    expect(applyProbeSuccess(snap).state).toBe('closed');
    snap = transitionToHalfOpen(
      applyInfraFailures(initialBreakerSnapshot(), 10, 0),
      BREAKER_OPEN_MS + 1,
    );
    expect(applyProbeFailure(snap, BREAKER_OPEN_MS + 2).state).toBe('open');
    expect(applyProbeSuccess(initialBreakerSnapshot()).state).toBe('closed');
    expect(applyProbeFailure(initialBreakerSnapshot(), 1).state).toBe('closed');
  });

  it('kv/do naming', () => {
    const transport = 'KIPUSPAY_' + 'PSE_DIRECT';
    expect(breakerKvKey(transport, 'submit')).toBe('fiscal_breaker:' + transport + ':submit');
    expect(breakerDoName(transport, 'submit')).toBe(transport + ':submit');
  });
});
