import { describe, expect, it } from 'vitest';
import {
  brandInviteUrl,
  captureAttribution,
  computeKFactor,
  extendTrialEndsAt,
  mintReferralCode,
  normalizeReferralCode,
  planBilateralCredit,
  qualifyAttribution,
  REFERRAL_CREDIT_DAYS,
} from './referral-domain.js';

describe('referral-domain', () => {
  it('normaliza y mintea codigo', () => {
    expect(normalizeReferralCode(' kp-ab12 ')).toBe('KPAB12');
    const code = mintReferralCode('t_demo_abc');
    expect(code.startsWith('KP')).toBe(true);
    expect(code.length).toBeGreaterThanOrEqual(6);
  });

  it('arma URL de invite para /empezar?ref=', () => {
    expect(brandInviteUrl('https://kipuspay.pe/', 'KPABCD')).toBe(
      'https://kipuspay.pe/empezar?ref=KPABCD',
    );
  });

  it('captura atribucion valida y rechaza self-ref / doble', () => {
    const ok = captureAttribution({
      id: 'a1',
      referredTenantId: 't_new',
      referrerTenantId: 't_old',
      code: 'KPOLD1',
      codeOwnerTenantId: 't_old',
      alreadyAttributed: false,
    });
    expect(ok.status).toBe('captured');

    expect(() =>
      captureAttribution({
        id: 'a2',
        referredTenantId: 't_old',
        referrerTenantId: 't_old',
        code: 'KPOLD1',
        codeOwnerTenantId: 't_old',
        alreadyAttributed: false,
      }),
    ).toThrow(/ti mismo/);

    expect(() =>
      captureAttribution({
        id: 'a3',
        referredTenantId: 't_new',
        referrerTenantId: 't_old',
        code: 'KPOLD1',
        codeOwnerTenantId: 't_old',
        alreadyAttributed: true,
      }),
    ).toThrow(/ya tiene/);
  });

  it('califica y planifica credito bilateral idempotente', () => {
    const captured = captureAttribution({
      id: 'a1',
      referredTenantId: 't_new',
      referrerTenantId: 't_old',
      code: 'KPOLD1',
      codeOwnerTenantId: 't_old',
      alreadyAttributed: false,
    });
    const qualified = qualifyAttribution(captured);
    expect(qualified.status).toBe('qualified');
    const plan = planBilateralCredit(qualified);
    expect(plan.creditDays).toBe(REFERRAL_CREDIT_DAYS);
    expect(plan.alreadyCredited).toBe(false);

    const credited = { ...qualified, status: 'credited' as const };
    expect(planBilateralCredit(credited).alreadyCredited).toBe(true);
  });

  it('extiende trial_ends_at desde el max(now, current)', () => {
    const now = '2026-08-05T12:00:00.000Z';
    const extended = extendTrialEndsAt('2026-08-01T12:00:00.000Z', 30, now);
    expect(extended).toBe('2026-09-04T12:00:00.000Z');
  });

  it('calcula K-factor', () => {
    expect(computeKFactor({ creditedAttributions: 0, activeReferrersWithCredit: 0 })).toBeNull();
    expect(computeKFactor({ creditedAttributions: 4, activeReferrersWithCredit: 2 })).toBe(2);
  });
});
