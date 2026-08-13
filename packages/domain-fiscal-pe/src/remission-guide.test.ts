import { describe, expect, it } from 'vitest';
import {
  assertRemissionGuideAllowed,
  remissionStockImpact,
  TRANSFER_REASON_CODES,
  TRANSPORT_MODE_CODES,
  type RemissionGuideRequest,
} from './remission-guide.js';

const BASE: RemissionGuideRequest = {
  series: 'T001',
  transferReasonCode: '01',
  transportModeCode: '01',
  vehiclePlate: 'ABC-123',
  carrier: { documentType: '01', documentNumber: '12345678', name: 'Carlos Ruiz' },
  origin: { ubigeo: '150101', address: 'Av. Lima 100' },
  destination: { ubigeo: '070101', address: 'Jr. Callao 200' },
  transferStartedAt: '2026-08-12T15:00:00.000Z',
  items: [{ productId: 'p1', quantityMicrounits: 5_000_000, uomCode: 'NIU' }],
};

describe('Guía de Remisión (P1b, ADR-FISCAL-004)', () => {
  it('acepta una GRE válida con documento relacionado opcional', () => {
    expect(assertRemissionGuideAllowed(BASE).ok).toBe(true);
    const withRelated = assertRemissionGuideAllowed({
      ...BASE,
      relatedDocument: { documentType: '01', series: 'F001', number: 12 },
    });
    expect(withRelated.ok).toBe(true);
  });

  it('motivos catálogo 18 cerrados: 01/02/04/08/13/14/16', () => {
    expect(TRANSFER_REASON_CODES).toEqual(['01', '02', '04', '08', '13', '14', '16']);
    const invalid = assertRemissionGuideAllowed({ ...BASE, transferReasonCode: '99' });
    expect(invalid).toEqual({ ok: false, code: 'INVALID_TRANSFER_REASON' });
  });

  it('modalidad cerrada 01/02', () => {
    expect(TRANSPORT_MODE_CODES).toEqual(['01', '02']);
    const invalid = assertRemissionGuideAllowed({ ...BASE, transportModeCode: '03' });
    expect(invalid).toEqual({ ok: false, code: 'INVALID_TRANSPORT_MODE' });
  });

  it('fecha/hora de inicio de traslado obligatoria y válida', () => {
    const invalid = assertRemissionGuideAllowed({ ...BASE, transferStartedAt: 'no-fecha' });
    expect(invalid).toEqual({ ok: false, code: 'INVALID_TRANSFER_START' });
  });

  it('transportista y puntos origen/destino obligatorios', () => {
    expect(assertRemissionGuideAllowed({ ...BASE, vehiclePlate: '  ' }).ok).toBe(false);
    expect(
      assertRemissionGuideAllowed({ ...BASE, carrier: { ...BASE.carrier, documentNumber: '' } }).ok,
    ).toBe(false);
    expect(
      assertRemissionGuideAllowed({ ...BASE, origin: { ...BASE.origin, ubigeo: '' } }).ok,
    ).toBe(false);
  });

  it('tipo de documento del transportista cerrado (01-04)', () => {
    const invalid = assertRemissionGuideAllowed({
      ...BASE,
      carrier: { ...BASE.carrier, documentType: '6' },
    });
    expect(invalid).toEqual({ ok: false, code: 'INVALID_CARRIER_DOCUMENT_TYPE' });
  });

  it('al menos un ítem con cantidad microunits > 0', () => {
    expect(assertRemissionGuideAllowed({ ...BASE, items: [] })).toEqual({
      ok: false,
      code: 'EMPTY_ITEMS',
    });
    expect(
      assertRemissionGuideAllowed({
        ...BASE,
        items: [{ productId: 'p1', quantityMicrounits: 0, uomCode: 'NIU' }],
      }),
    ).toEqual({ ok: false, code: 'INVALID_ITEM_QUANTITY' });
  });

  it('documento relacionado mal formado → rechazo', () => {
    const invalid = assertRemissionGuideAllowed({
      ...BASE,
      relatedDocument: { documentType: '01', series: '', number: 12 },
    });
    expect(invalid).toEqual({ ok: false, code: 'INVALID_RELATED_DOCUMENT' });
  });

  it('la GRE jamás impacta stock ni saldos', () => {
    expect(remissionStockImpact()).toBe(0);
  });
});
