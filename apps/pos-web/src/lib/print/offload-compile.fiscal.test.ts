import { describe, expect, it } from 'vitest';
// HALLAZGO H2 (auditoría 0031): el payload QR fiscal no se construía en
// ningún punto del repo. Este es EL punto único de construcción en el flujo
// POS post-cobro: buildSaleTicketSnapshot arma la cadena RS 402-2019 con el
// builder del package print-templates cuando hay datos CPE completos.
// Fail-closed: sin RUC/hash/fecha (CPE pendiente) NO se inventa QR parcial.
import { buildSaleTicketSnapshot, snapshotToTicketData } from './offload-compile';

const fiscalInput = {
  enterprise: 'Bodega Demo',
  ruc: '20512345678',
  documentType: '01',
  series: 'F001',
  number: 123,
  totalCents: 70800,
  items: [{ name: 'Producto', qty: 2, totalCents: 70800 }],
  lineWidth: 48 as const,
  issueDateIso: '2026-08-24',
  igvCents: 10800,
  digestValue: 'digestvalue-fixture-0001',
  buyer: { name: 'Comercial Andina SAC', docType: '6', docNumber: '20600695771' },
};

describe('buildSaleTicketSnapshot — construcción del payload QR fiscal (RS 402-2019)', () => {
  it('CPE firmado: construye qrPayload con los 10 campos normativos', () => {
    const snap = buildSaleTicketSnapshot(fiscalInput);
    expect(snap.qrPayload).toBe(
      '20512345678|01|F001|00000123|108.00|708.00|2026-08-24|6|20600695771|digestvalue-fixture-0001',
    );
    expect(snap.digestValue).toBe('digestvalue-fixture-0001');
    expect(snap.issueDateIso).toBe('2026-08-24');
    expect(snap.igvCents).toBe(10800);
    expect(snap.buyer?.docNumber).toBe('20600695771');
  });

  it('CPE pendiente (sin hash): no genera QR parcial ni afirma aceptación', () => {
    const snap = buildSaleTicketSnapshot({ ...fiscalInput, digestValue: undefined });
    expect(snap.qrPayload).toBeUndefined();
  });

  it('sin RUC expuesto por la sesión: no genera QR (fail-closed)', () => {
    const snap = buildSaleTicketSnapshot({ ...fiscalInput, ruc: '' });
    expect(snap.qrPayload).toBeUndefined();
  });

  it('NV interna: jamás lleva QR fiscal aunque llegue un hash residual', () => {
    const snap = buildSaleTicketSnapshot({ ...fiscalInput, documentType: 'NV' });
    expect(snap.qrPayload).toBeUndefined();
  });

  it('los campos fiscales sobreviven snapshotToTicketData (recompilación ESC/POS)', () => {
    const data = snapshotToTicketData(buildSaleTicketSnapshot(fiscalInput));
    expect(data.qrPayload).toBe(
      '20512345678|01|F001|00000123|108.00|708.00|2026-08-24|6|20600695771|digestvalue-fixture-0001',
    );
    expect(data.issueDateIso).toBe('2026-08-24');
    expect(data.igvCents).toBe(10800);
    expect(data.buyer?.name).toBe('Comercial Andina SAC');
  });
});
