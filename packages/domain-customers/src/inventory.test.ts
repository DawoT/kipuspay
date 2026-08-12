import { describe, expect, it } from 'vitest';
import {
  CUSTOMER_PII_CATALOG,
  isPiiCatalogField,
  projectCustomerListItem,
  projectPiiInventory,
  type CustomerRow,
} from './inventory.js';

const row: CustomerRow = {
  id: 'c1',
  tenantId: 't1',
  documentTypeCode: '1',
  documentNumber: '12345678',
  name: 'Ana Pérez',
  email: 'ana@example.com',
  phone: '999111222',
  address: 'Jr. Lima 123',
  piiErased: false,
  deleted: false,
};

describe('inventario PII', () => {
  it('proyecta el catálogo completo de PII', () => {
    const entry = projectPiiInventory(row);
    expect(entry).toEqual({
      id: 'c1',
      documentTypeCode: '1',
      documentNumber: '12345678',
      name: 'Ana Pérez',
      email: 'ana@example.com',
      phone: '999111222',
      address: 'Jr. Lima 123',
      piiErased: false,
    });
  });

  it('anonimizada solo expone documento retenido y NULLs (SEC-07)', () => {
    const entry = projectPiiInventory({ ...row, piiErased: true });
    expect(entry).toEqual({
      id: 'c1',
      documentTypeCode: '1',
      documentNumber: '12345678',
      name: null,
      email: null,
      phone: null,
      address: null,
      piiErased: true,
    });
    const deleted = projectPiiInventory({ ...row, deleted: true });
    expect(deleted.name).toBeNull();
    expect(deleted.piiErased).toBe(true);
  });

  it('el listado proyecta solo identificación fiscal y estado, sin PII (LPDP-04)', () => {
    const item = projectCustomerListItem(row);
    expect(item).toEqual({
      id: 'c1',
      documentTypeCode: '1',
      documentNumber: '12345678',
      piiErased: false,
    });
    expect(item).not.toHaveProperty('name');
    expect(item).not.toHaveProperty('email');
    expect(item).not.toHaveProperty('phone');
    expect(item).not.toHaveProperty('address');
    expect(projectCustomerListItem({ ...row, piiErased: true }).piiErased).toBe(true);
    expect(projectCustomerListItem({ ...row, deleted: true }).piiErased).toBe(true);
  });

  it('catálogo y validador de campos', () => {
    expect(CUSTOMER_PII_CATALOG).toContain('email');
    expect(CUSTOMER_PII_CATALOG).toContain('document_number');
    expect(isPiiCatalogField('name')).toBe(true);
    expect(isPiiCatalogField('created_at')).toBe(false);
  });
});
