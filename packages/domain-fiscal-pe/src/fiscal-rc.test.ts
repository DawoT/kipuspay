import { describe, expect, it } from 'vitest';
import {
  assertRcKeyIsEmisorDay,
  cashCloseMustNotTriggerRc,
  planDailySummary,
} from './daily-summary.js';
import { assertVoidBoletaAllowed, markVoidedAfterRc } from './void-boleta.js';
import { canOmitUnitaryNrus, planNrusDailyConsolidation } from './nrus.js';
import { buildOwnerAlert, requiresOwnerAlert } from './owner-alerts.js';
import {
  assertWithinRetention,
  mintPortalToken,
  renderCpePortalHtml,
  verifyPortalToken,
} from './cpe-portal.js';
import { evaluateDeadline } from './deadlines.js';

describe('daily-summary FIS-03', () => {
  it('agrupa por emisor/día; branch no es clave', () => {
    const plan = planDailySummary('t1', '2026-08-01', [
      {
        saleId: 'a',
        branchId: 'b1',
        documentType: '03',
        totalAmountCents: 1000,
        voidStatus: 'NONE',
        issuedAtMs: 1,
      },
      {
        saleId: 'b',
        branchId: 'b2',
        documentType: '03',
        totalAmountCents: 2000,
        voidStatus: 'VOID_PENDING_RC',
        issuedAtMs: 1,
      },
      {
        saleId: 'skip',
        branchId: 'b1',
        documentType: '01',
        totalAmountCents: 100,
        voidStatus: 'NONE',
        issuedAtMs: 1,
      },
    ]);
    expect(plan.tenantId).toBe('t1');
    expect(plan.ticketCount).toBe(2);
    expect(plan.voidSaleIds).toEqual(['b']);
  });

  it('valida clave y rechaza vacío', () => {
    expect(() => assertRcKeyIsEmisorDay('', '2026-08-01')).toThrow('RC_TENANT_REQUIRED');
    expect(() => assertRcKeyIsEmisorDay('t', 'bad')).toThrow('RC_DATE_INVALID');
    expect(() => planDailySummary('t', '2026-08-01', [])).toThrow('RC_NO_BOLETAS');
  });

  it('H1: NC/ND (07/08) sobre boleta entran al plan del RC; factura (01) jamás', () => {
    const plan = planDailySummary('t1', '2026-08-01', [
      {
        saleId: 'nc',
        branchId: 'b1',
        documentType: '07',
        totalAmountCents: 500,
        voidStatus: 'NONE',
        issuedAtMs: 1,
      },
      {
        saleId: 'nd',
        branchId: 'b1',
        documentType: '08',
        totalAmountCents: 300,
        voidStatus: 'NONE',
        issuedAtMs: 1,
      },
      {
        saleId: 'factura',
        branchId: 'b1',
        documentType: '01',
        totalAmountCents: 100,
        voidStatus: 'NONE',
        issuedAtMs: 1,
      },
    ]);
    expect(plan.saleIds).toEqual(['nc', 'nd']);
    expect(plan.ticketCount).toBe(2);
    expect(plan.voidSaleIds).toEqual([]);
  });

  it('Z no dispara RC', () => {
    expect(cashCloseMustNotTriggerRc()).toBe(false);
  });
});

describe('void boleta E-C', () => {
  it('permite baja pre-RC y PENDING local', () => {
    expect(
      assertVoidBoletaAllowed({
        documentType: '03',
        voidStatus: 'NONE',
        dailySummaryStatus: null,
      }).nextVoidStatus,
    ).toBe('VOID_PENDING_RC');
    expect(
      assertVoidBoletaAllowed({
        documentType: '12',
        voidStatus: 'NONE',
        dailySummaryStatus: 'PENDING',
      }).stockUnchanged,
    ).toBe(true);
  });

  it('422 post-RC ACCEPTED/PROCESSING/DEADLINE', () => {
    expect(() =>
      assertVoidBoletaAllowed({
        documentType: '03',
        voidStatus: 'NONE',
        dailySummaryStatus: 'ACCEPTED',
      }),
    ).toThrow('VOID_AFTER_RC_SENT');
    expect(() =>
      assertVoidBoletaAllowed({
        documentType: '03',
        voidStatus: 'NONE',
        dailySummaryStatus: 'PROCESSING',
      }),
    ).toThrow('VOID_AFTER_RC_SENT');
    expect(() =>
      assertVoidBoletaAllowed({
        documentType: '03',
        voidStatus: 'NONE',
        dailySummaryStatus: 'DEADLINE_EXCEEDED',
      }),
    ).toThrow('VOID_AFTER_RC_SENT');
  });

  it('rechaza no-boleta y doble void', () => {
    expect(() =>
      assertVoidBoletaAllowed({
        documentType: '01',
        voidStatus: 'NONE',
        dailySummaryStatus: null,
      }),
    ).toThrow('VOID_ONLY_BOLETA');
    expect(() =>
      assertVoidBoletaAllowed({
        documentType: '03',
        voidStatus: 'VOID_PENDING_RC',
        dailySummaryStatus: null,
      }),
    ).toThrow('VOID_ALREADY_REQUESTED');
  });

  it('markVoidedAfterRc', () => {
    expect(markVoidedAfterRc('VOID_PENDING_RC')).toBe('VOIDED');
    expect(markVoidedAfterRc('NONE')).toBe('NONE');
  });
});

describe('NRUS consolidación', () => {
  it('omite ≤ 500 cents en NRUS', () => {
    expect(
      canOmitUnitaryNrus({
        taxRegime: 'NRUS',
        totalAmountCents: 500,
        documentType: '03',
      }),
    ).toBe(true);
    expect(
      canOmitUnitaryNrus({
        taxRegime: 'NRUS',
        totalAmountCents: 501,
        documentType: '03',
      }),
    ).toBe(false);
    expect(
      canOmitUnitaryNrus({
        taxRegime: 'RG',
        totalAmountCents: 100,
        documentType: '03',
      }),
    ).toBe(false);
    expect(
      canOmitUnitaryNrus({
        taxRegime: 'NRUS',
        totalAmountCents: 100,
        documentType: '01',
      }),
    ).toBe(false);
    expect(
      planNrusDailyConsolidation([
        { saleId: '1', totalAmountCents: 400 },
        { saleId: '2', totalAmountCents: 600 },
        { saleId: '3', totalAmountCents: 0 },
      ]).omittedSaleIds,
    ).toEqual(['1']);
  });
});

describe('owner alerts + portal', () => {
  it('mensajes T24/T6/DEADLINE y requiere alerta', () => {
    expect(
      buildOwnerAlert({
        alertKind: 'DEADLINE_EXCEEDED',
        saleId: 's1',
        documentType: '01',
        mustSubmitByIso: '2026-08-01T00:00:00.000Z',
      }).suggestCreditNoteEa,
    ).toBe(true);
    expect(
      buildOwnerAlert({
        alertKind: 'T6H',
        saleId: 's1',
        documentType: '01',
        mustSubmitByIso: '2026-08-01T00:00:00.000Z',
      }).message,
    ).toContain('≤6h');
    expect(
      buildOwnerAlert({
        alertKind: 'T24H',
        saleId: 's1',
        documentType: '01',
        mustSubmitByIso: '2026-08-01T00:00:00.000Z',
      }).message,
    ).toContain('≤24h');
    expect(requiresOwnerAlert('T24H')).toBe(true);
  });

  it('portal token + retención 1 año', async () => {
    const token = await mintPortalToken('t', 's', 'secret');
    expect(await verifyPortalToken(token, 't', 's', 'secret')).toBe(true);
    expect(await verifyPortalToken('bad', 't', 's', 'secret')).toBe(false);
    const now = Date.parse('2026-08-01T00:00:00.000Z');
    const view = renderCpePortalHtml(
      {
        tenantId: 't',
        saleId: 's',
        issuedAtMs: now - 1000,
        xmlHash: null,
        documentType: '01',
        series: 'F001',
        correlative: 1,
        totalAmountCents: 1000,
      },
      now,
    );
    expect(view.html).toContain('KipusPay CPE');
    expect(() => assertWithinRetention(now - 366 * 24 * 3600 * 1000, now)).toThrow(
      'CPE_PORTAL_EXPIRED',
    );
    expect(() => assertWithinRetention(now + 7 * 3600 * 1000, now)).toThrow(
      'CPE_PORTAL_ISSUED_FUTURE',
    );
  });
});

describe('deadlines edge', () => {
  it('null si lejos del plazo o alertas ya enviadas', () => {
    expect(
      evaluateDeadline(
        {
          id: 'x',
          documentType: '01',
          sunatStatus: 'PENDING',
          mustSubmitByMs: 1_000_000 + 48 * 3600 * 1000,
          alertT24Sent: false,
          alertT6Sent: false,
        },
        1_000_000,
      ),
    ).toBeNull();
    expect(
      evaluateDeadline(
        {
          id: 'x',
          documentType: '01',
          sunatStatus: 'PENDING',
          mustSubmitByMs: 1_000_000 + 20 * 3600 * 1000,
          alertT24Sent: true,
          alertT6Sent: false,
        },
        1_000_000,
      ),
    ).toBeNull();
  });
});
