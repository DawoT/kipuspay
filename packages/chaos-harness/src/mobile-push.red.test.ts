/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- absent Sprint 45 module is the intentional RED boundary */
import { describe, expect, it } from 'vitest';
import { MOBILE_PUSH_FAULTS, judgeMobilePushChaos, runMobilePushChaos } from './mobile-push.js';

describe('Sprint 45 mobile push and low-end chaos 500 contract (RED)', () => {
  it('covers 500 deterministic balanced provider, ACK, SW, storage, and device faults', async () => {
    const first = await runMobilePushChaos(500);
    const replay = await runMobilePushChaos(500);
    expect(replay).toEqual(first);
    expect(first.cycles).toBe(500);
    expect(first.samples).toHaveLength(500);
    expect(Object.keys(first.coverage)).toEqual(MOBILE_PUSH_FAULTS);
    expect(first).toMatchObject({
      pushWithoutConsent: 0,
      piiOrSecretLeaks: 0,
      duplicateVisibleNotifications: 0,
      falseDisplayedAcks: 0,
      acceptedConfusedWithDisplayed: 0,
      crossTenantDeliveries: 0,
      revokedDeviceDeliveries: 0,
      lostOfflineSales: 0,
      duplicateOfflineSales: 0,
      blockedOriginOperations: 0,
      lostQueueEntries: 0,
    });
    expect(first.samples.filter((sample) => !sample.invariantsHeld)).toEqual([]);
    expect(judgeMobilePushChaos(first)).toBe('PASS');
  });

  it('includes required faults and labels offline/doze outside normal-network SLO', async () => {
    expect(MOBILE_PUSH_FAULTS).toEqual(
      expect.arrayContaining([
        'providerTimeout',
        'providerQuota',
        'provider5xx',
        'fcmTokenStale',
        'vapidRotation',
        'offline',
        'doze',
        'serviceWorkerUpgrade',
        'reload',
        'indexedDbQuota',
        'terminalRevoked',
        'ackLate',
        'ackForged',
        'ackReplay',
        'concurrentDispatch',
      ]),
    );
    const result = await runMobilePushChaos(500);
    expect(result.normalNetworkSlo.excludedByContext).toMatchObject({
      OFFLINE: expect.any(Number),
      DOZE: expect.any(Number),
    });
    expect(result.normalNetworkSlo.p95Ms).toBeLessThan(10_000);
    expect(result.normalNetworkSlo.displayedRate).toBeGreaterThanOrEqual(0.99);
  });
});
