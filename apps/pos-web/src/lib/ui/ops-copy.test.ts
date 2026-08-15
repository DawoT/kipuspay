import { describe, expect, it } from 'vitest';
import {
  catalogItemLabel,
  documentKindLabel,
  formalizationModeLabel,
  kdsEventLabel,
  ledgerSignLabel,
  orderStatusLabel,
  paymentStatusLabel,
  promoAppliesLabel,
  saleStatusLabel,
  stockKindLabel,
  uomLabel,
  workflowStatusLabel,
} from './ops-copy';

describe('saleStatusLabel', () => {
  it('no muestra ANULADA en mayúsculas de máquina', () => {
    expect(saleStatusLabel('ANULADA')).toBe('Anulada');
    expect(saleStatusLabel('ANULADA')).not.toBe('ANULADA');
  });
});

describe('kdsEventLabel', () => {
  it('traduce eventos de cocina', () => {
    expect(kdsEventLabel('ITEM_FIRED')).toBe('En cocina');
    expect(kdsEventLabel('ORDER_READY')).toBe('Listo');
    expect(kdsEventLabel('ITEM_FIRED')).not.toMatch(/ITEM_/);
  });
});

describe('orderStatusLabel', () => {
  it('traduce estados de pedido', () => {
    expect(orderStatusLabel('OPEN')).toBe('Abierta');
    expect(orderStatusLabel('PARTIAL')).toBe('Parcial');
  });
});

describe('paymentStatusLabel', () => {
  it('traduce PENDING', () => {
    expect(paymentStatusLabel('PENDING')).toBe('Pendiente');
  });
});

describe('stockKindLabel', () => {
  it('no expone STOCKOUT_RISK', () => {
    expect(stockKindLabel('STOCKOUT_RISK')).toBe('Riesgo de quiebre');
    expect(stockKindLabel('REORDER_SUGGESTED')).toBe('Reponer');
  });
});

describe('documentKindLabel', () => {
  it('nombra comprobantes, no códigos SUNAT crudos', () => {
    expect(documentKindLabel('07')).toBe('Nota de crédito');
    expect(documentKindLabel('NV_RETURN')).toBe('Devolución');
  });
});

describe('ledgerSignLabel', () => {
  it('traduce CREDIT/DEBIT', () => {
    expect(ledgerSignLabel('CREDIT')).toBe('Abono');
    expect(ledgerSignLabel('DEBIT')).toBe('Cargo');
  });
});

describe('workflowStatusLabel', () => {
  it('traduce OPEN/PAID/DAMAGED', () => {
    expect(workflowStatusLabel('OPEN')).toBe('Borrador');
    expect(workflowStatusLabel('PAID')).toBe('Pagado');
    expect(workflowStatusLabel('DAMAGED')).toBe('Dañado');
  });
});

describe('uomLabel', () => {
  it('no muestra BASE', () => {
    expect(uomLabel('BASE')).toBe('Unidad');
    expect(uomLabel(undefined)).toBe('Unidad');
  });
});

describe('catalogItemLabel', () => {
  it('usa name y evita volcar el objeto', () => {
    expect(catalogItemLabel({ name: 'Café' }, 0)).toBe('Café');
    expect(catalogItemLabel({}, 2)).toBe('Producto 3');
  });
});

describe('promoAppliesLabel', () => {
  it('no muestra PRODUCT/CART crudos', () => {
    expect(promoAppliesLabel('PRODUCT')).toBe('Producto');
    expect(promoAppliesLabel('CART')).toBe('Carrito');
  });
});

describe('formalizationModeLabel', () => {
  it('no expone INTERNAL_CONTROL / FORMALIZING / ELECTRONIC_ISSUER', () => {
    expect(formalizationModeLabel('INTERNAL_CONTROL')).toBe('Solo notas de venta');
    expect(formalizationModeLabel('FORMALIZING')).toBe('Formalizando');
    expect(formalizationModeLabel('ELECTRONIC_ISSUER')).toBe('Emisión electrónica');
    expect(formalizationModeLabel('INTERNAL_CONTROL')).not.toMatch(/INTERNAL_/);
  });
});
