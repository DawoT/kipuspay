import { describe, expect, it } from 'vitest';
import {
  ND_MOTIVE_INTERNAL_PENDING_WIRE,
  ND_MOTIVE_WIRE_CATALOG,
  NdMotiveWireUnhomologatedError,
  translateNdMotiveToWire,
  UnknownNdMotiveError,
} from './nd-motive-catalog.js';
import { DEBIT_NOTE_MOTIVE_CODES } from './debit-note.js';
import { buildUblDebitNoteXml, type UblDebitNoteInput } from './ubl-debit-note.js';

const ndSample = (motiveCode: string): UblDebitNoteInput => ({
  ublVersion: '2.1',
  customizationId: '2.0',
  id: 'FD01-00000004',
  issueDate: '2026-08-24',
  issueTime: '11:00:00',
  currency: 'PEN',
  issuerRuc: '20612913251',
  issuerName: 'ROSA NEGRA DIGITAL SOLUCIONES S.A.C.',
  customerDocType: '6',
  customerDocNumber: '20987654321',
  customerName: 'Cliente SAC',
  referencedDocId: 'F001-00000007',
  motiveCode,
  totalTaxableCents: 500,
  totalIgvCents: 90,
  totalIcbperCents: 0,
  totalAmountCents: 590,
  lines: [
    {
      id: 1,
      description: 'Intereses por mora del período',
      quantity: 1,
      unitCode: 'NIU',
      igvAffectationCode: '10',
      igvCents: 90,
      lineTotalCents: 590,
      icbperCents: 0,
    },
  ],
});

describe('nd-motive-catalog — traducción interna→wire catálogo 10 (FL-1, CDR 2172)', () => {
  it('tabla completa internal→wire contra el catálogo 10 oficial', () => {
    // Golden independiente de la implementación (Anexo Nro. 8, Catálogo 10):
    // 01 Intereses por mora · 02 Aumento en el valor · 03 Penalidades / otros.
    const expected: Record<string, { responseCode: string; description: string }> = {
      '01': { responseCode: '01', description: 'Intereses por mora' },
      '02': { responseCode: '02', description: 'Aumento en el valor' },
      '03': { responseCode: '03', description: 'Penalidades / otros conceptos' },
    };
    for (const [internal, wire] of Object.entries(expected)) {
      expect(translateNdMotiveToWire(internal)).toEqual(wire);
      expect(ND_MOTIVE_WIRE_CATALOG[internal]).toEqual(wire);
    }
    expect(Object.keys(ND_MOTIVE_WIRE_CATALOG).sort()).toEqual(['01', '02', '03']);
  });

  it('exhaustividad: taxonomía interna cubierta sin omisiones ni duplicados', () => {
    const translated = new Set(Object.keys(ND_MOTIVE_WIRE_CATALOG));
    const pending = ND_MOTIVE_INTERNAL_PENDING_WIRE;
    // Todo motivo interno tiene destino definido (traducido o bloqueado).
    for (const motive of DEBIT_NOTE_MOTIVE_CODES) {
      expect(translated.has(motive) || pending.has(motive)).toBe(true);
    }
    // Sin solapamiento: un motivo no es traducido Y pendiente a la vez.
    for (const motive of pending) {
      expect(translated.has(motive)).toBe(false);
    }
    // Nada inventado fuera de la taxonomía interna.
    expect([...translated, ...pending].sort()).toEqual([...DEBIT_NOTE_MOTIVE_CODES].sort());
  });

  it('cada wire es ResponseCode de 2 dígitos con descripción oficial no vacía', () => {
    for (const wire of Object.values(ND_MOTIVE_WIRE_CATALOG)) {
      expect(wire.responseCode).toMatch(/^\d{2}$/);
      expect(wire.description.length).toBeGreaterThan(0);
    }
  });

  it('FD01-4 estable: interno 01 → wire 01 "Intereses por mora" (CDR 0 en e-beta)', () => {
    expect(translateNdMotiveToWire('01')).toEqual({
      responseCode: '01',
      description: 'Intereses por mora',
    });
    const xml = buildUblDebitNoteXml(ndSample('01'));
    expect(xml).toContain('<cbc:ResponseCode>01</cbc:ResponseCode>');
    expect(xml).toContain('<cbc:Description>Intereses por mora</cbc:Description>');
  });

  it('motivo desconocido → UnknownNdMotiveError; jamás wire válido (06 = CDR 2172 FL-1)', () => {
    // '06' es el código que FL-1 envió y e-beta rechazó con CDR 2172
    // ("Valor no se encuentra en el catalogo: 10"); 04–09/11/12 son de otros
    // catálogos o inexistentes para ND.
    for (const unknown of [
      '06',
      '04',
      '05',
      '07',
      '08',
      '09',
      '11',
      '12',
      '',
      '0',
      '1',
      '99',
      'ABC',
      '01 ',
      ' abc',
    ]) {
      let err: unknown;
      try {
        translateNdMotiveToWire(unknown);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(UnknownNdMotiveError);
      expect((err as UnknownNdMotiveError).code).toBe('UNKNOWN_ND_MOTIVE');
    }
  });

  it('interno 10 válido en taxonomía pero sin wire homologado → error tipado propio', () => {
    expect(DEBIT_NOTE_MOTIVE_CODES).toContain('10');
    let err: unknown;
    try {
      translateNdMotiveToWire('10');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(NdMotiveWireUnhomologatedError);
    expect((err as NdMotiveWireUnhomologatedError).code).toBe('ND_MOTIVE_WIRE_UNHOMOLOGATED');
  });

  it('builder fail-closed: motivo inválido o sin homologar NO produce XML', () => {
    expect(() => buildUblDebitNoteXml(ndSample('06'))).toThrow(UnknownNdMotiveError);
    expect(() => buildUblDebitNoteXml(ndSample('99'))).toThrow(UnknownNdMotiveError);
    expect(() => buildUblDebitNoteXml(ndSample('10'))).toThrow(NdMotiveWireUnhomologatedError);
  });
});
