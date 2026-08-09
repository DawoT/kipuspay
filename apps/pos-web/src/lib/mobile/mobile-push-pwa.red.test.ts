/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call -- absent Sprint 45 module is the intentional RED boundary */
import { describe, expect, it } from 'vitest';
import {
  FCM_VENDOR_MANIFEST,
  installMobilePosPwa,
  registerUnifiedPosServiceWorker,
  runLowEndOfflineParity,
} from './mobile-push-pwa.js';

describe('Sprint 45 unified Service Worker and PWA contract (RED)', () => {
  it('registers one versioned worker for offline sync, push, FCM, click, and ACK', async () => {
    const registration = await registerUnifiedPosServiceWorker({
      scope: '/',
      existingOfflineQueueEntries: 500,
    });
    expect(registration).toMatchObject({
      registrations: 1,
      scope: '/',
      handlers: expect.arrayContaining([
        'install',
        'activate',
        'sync',
        'push',
        'fcm-background-message',
        'notificationclick',
        'displayed-ack',
      ]),
      preservedOfflineQueueEntries: 500,
    });
  });

  it('pins the lazy FCM web module with version, license, SHA-256, and SBOM component', () => {
    expect(FCM_VENDOR_MANIFEST).toMatchObject({
      load: 'LAZY',
      version: expect.stringMatching(/^\d+\.\d+\.\d+$/),
      license: expect.any(String),
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      sbomComponent: expect.any(String),
      npmRuntimeDependency: false,
    });
  });

  it('installs a standalone manifest without creating a mobile role or domain fork', async () => {
    const result = await installMobilePosPwa({
      capability: 'client.mobile_pos',
      role: 'cashier',
      terminalId: 'terminal-mobile-a',
      terminalSessionId: 'session-a',
    });
    expect(result).toMatchObject({
      display: 'standalone',
      usesExistingCheckout: true,
      usesExistingRbac: true,
      usesExistingTerminalSession: true,
      usesExistingOfflineQueue: true,
      createsRole: false,
      createsDomainFork: false,
    });
  });

  it('keeps exactly 500 low-end offline sales across F5, SW upgrade, and reconnect', async () => {
    const result = await runLowEndOfflineParity({
      widthPx: 360,
      availableMemoryMb: 1_024,
      offlineSales: 500,
      reload: true,
      upgradeServiceWorker: true,
      reconnectConcurrently: true,
    });
    expect(result).toMatchObject({
      acceptedOfflineSales: 500,
      synchronizedSales: 500,
      lostSales: 0,
      duplicateSales: 0,
      blockedByPush: 0,
      blockedByInstall: 0,
      queueParity: true,
    });
  });
});
