import { describe, expect, it } from 'vitest';
import type { WorkerEnv } from '../auth/control-plane.js';
import {
  getReferralStore,
  runCaptureReferralHttp,
  runEnsureReferralCodeHttp,
  runFirstSaleReferralHttp,
} from './referral-routes.js';

const dummyEnv = {} as WorkerEnv;

describe('referral-routes HTTP handlers unit tests', () => {
  it('handles runEnsureReferralCodeHttp validation and generation', () => {
    expect(runEnsureReferralCodeHttp(dummyEnv, null)).toEqual({
      status: 400,
      body: { error: 'Invalid JSON', code: 'BAD_REQUEST' },
    });
    expect(runEnsureReferralCodeHttp(dummyEnv, {})).toEqual({
      status: 422,
      body: { error: 'tenantId requerido', code: 'INVALID' },
    });
    const res = runEnsureReferralCodeHttp(dummyEnv, { tenantId: 'tenant-test' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('code');
    expect(res.body).toHaveProperty('inviteUrl');
  });

  it('handles runCaptureReferralHttp validation and capture', () => {
    expect(runCaptureReferralHttp(dummyEnv, 'invalid')).toEqual({
      status: 400,
      body: { error: 'Invalid JSON', code: 'BAD_REQUEST' },
    });
    expect(runCaptureReferralHttp(dummyEnv, { referredTenantId: 't1' })).toEqual({
      status: 422,
      body: { error: 'referredTenantId y ref requeridos', code: 'INVALID' },
    });

    const store = getReferralStore();
    store.codes.set('REF123', {
      tenantId: 'referrer-tenant',
      code: 'REF123',
    });

    const res = runCaptureReferralHttp(dummyEnv, {
      referredTenantId: 'referred-tenant',
      ref: 'REF123',
    });
    expect(res.status).toBe(201);
  });

  it('handles runFirstSaleReferralHttp validation and credit', () => {
    expect(runFirstSaleReferralHttp(dummyEnv, null)).toEqual({
      status: 400,
      body: { error: 'Invalid JSON', code: 'BAD_REQUEST' },
    });
    expect(runFirstSaleReferralHttp(dummyEnv, {})).toEqual({
      status: 422,
      body: { error: 'tenantId requerido', code: 'INVALID' },
    });
    const res = runFirstSaleReferralHttp(dummyEnv, { tenantId: 'referred-tenant' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('credited');
  });
});
