import { describe, expect, it } from 'vitest';
import {
  ALREADY_ERASED,
  ANONYMIZED_DOCUMENT,
  ANONYMIZED_NAME,
  assertNotErased,
  CUSTOMER_PII_NULLABLE_FIELDS,
  isAnonymousDocument,
  planCustomerErase,
  type CustomerForErase,
  type FiscalSnapshotForErase,
} from './erase.js';

const customer: CustomerForErase = {
  id: 'c1',
  tenantId: 't1',
  piiErased: false,
  deleted: false,
};

const snapshots: readonly FiscalSnapshotForErase[] = [
  { saleId: 's1', tenantId: 't1', clientName: 'Ana Pérez', clientDocumentNumber: '12345678' },
  {
    saleId: 's2',
    tenantId: 't1',
    clientName: ANONYMIZED_NAME,
    clientDocumentNumber: ANONYMIZED_DOCUMENT,
  },
  { saleId: 's3', tenantId: 't2', clientName: 'Otro tenant', clientDocumentNumber: '87654321' },
];

const consents = [
  { consentId: 'cr1', purpose: 'marketing', tenantId: 't1', customerId: 'c1' },
  { consentId: 'cr2', purpose: 'messaging_whatsapp', tenantId: 't2', customerId: 'c1' },
];

describe('erase LPDP-03', () => {
  it('anula perfil PII a NULL y sella snapshots fiscales', () => {
    const plan = planCustomerErase(customer, snapshots, consents);
    expect(plan.customerId).toBe('c1');
    expect(plan.profileFields.map((f) => f.field)).toEqual([...CUSTOMER_PII_NULLABLE_FIELDS]);
    expect(plan.profileFields.every((f) => f.value === null)).toBe(true);
    // Solo el snapshot no anonimizado del tenant correcto se toca.
    expect(plan.fiscalSnapshots).toEqual([
      { saleId: 's1', clientName: ANONYMIZED_NAME, clientDocumentNumber: ANONYMIZED_DOCUMENT },
    ]);
    // Solo consentimientos del tenant del titular.
    expect(plan.consentRevocations).toEqual([consents[0]!]);
  });

  it('lanza ALREADY_ERASED si pii_erased o deleted', () => {
    expect(() => assertNotErased({ ...customer, piiErased: true })).toThrow(ALREADY_ERASED);
    expect(() => assertNotErased({ ...customer, deleted: true })).toThrow(ALREADY_ERASED);
    expect(() => assertNotErased(customer)).not.toThrow();
  });

  it('isAnonymousDocument reconoce vacío y 00000000', () => {
    expect(isAnonymousDocument('')).toBe(true);
    expect(isAnonymousDocument('00000000')).toBe(true);
    expect(isAnonymousDocument('12345678')).toBe(false);
  });
});
