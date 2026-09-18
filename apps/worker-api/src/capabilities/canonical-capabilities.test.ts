import { describe, expect, it } from 'vitest';
import { PLAN_CAPABILITIES } from '@kipuspay/domain-billing';
import { CANONICAL_CAPABILITIES, isCanonicalCapability } from './canonical-capabilities.js';

const CANONICAL_ID = /^[a-z][a-z_]*\.[a-z][a-z_]+$/;

describe('CANONICAL_CAPABILITIES', () => {
  it('rejects duplicate capability ids', () => {
    expect(new Set(CANONICAL_CAPABILITIES).size).toBe(CANONICAL_CAPABILITIES.length);
  });

  it('uses lowercase domain.name ids only', () => {
    for (const capability of CANONICAL_CAPABILITIES) {
      expect(capability, capability).toMatch(CANONICAL_ID);
    }
  });

  it('fails closed for unknown, malformed or padded capabilities', () => {
    for (const capability of [
      '',
      '   ',
      'fuel',
      'fuel.',
      '.dispatch',
      'FUEL.dispatch',
      'fuel.DISPATCH',
      'fuel..dispatch',
      'unknown.capability',
      ' fuel.dispatch',
      'fuel.dispatch ',
      'fuel\t.dispatch',
    ]) {
      expect(isCanonicalCapability(capability), JSON.stringify(capability)).toBe(false);
    }
  });

  it('accepts every capability provisioned by any plan', () => {
    const nonCanonical: string[] = [];
    for (const [plan, capabilities] of Object.entries(PLAN_CAPABILITIES)) {
      for (const capability of capabilities) {
        if (!isCanonicalCapability(capability)) nonCanonical.push(`${plan}:${capability}`);
      }
    }
    expect(nonCanonical).toEqual([]);
  });

  it('keeps the control-plane high-stakes capabilities resolvable', () => {
    for (const capability of [
      'pos.checkout',
      'payments.card_acquirer',
      'payments.qr_wallets',
      'fiscal.rc',
      'data.backup',
      'platform.dr',
      'compliance.lpdp',
      'mobile.push',
      'fuel.dispatch',
    ]) {
      expect(isCanonicalCapability(capability), capability).toBe(true);
    }
  });
});
