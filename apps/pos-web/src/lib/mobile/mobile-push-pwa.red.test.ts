import { describe, expect, it } from 'vitest';
import unifiedWorker from '../../../static/offline-sync-sw.js?raw';
import {
  FCM_VENDOR_MANIFEST,
  buildSafeNotification,
  loadFcmRegistrationAdapter,
  installMobilePosPwa,
  registerUnifiedPosServiceWorker,
  resolveNotificationRoute,
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

  it('ACKs the canonical route with delivery, signed receipt, and displayed time', () => {
    expect(unifiedWorker).toContain("fetch('/api/push/ack'");
    expect(unifiedWorker).toContain('deliveryId');
    expect(unifiedWorker).toContain('receipt');
    expect(unifiedWorker).toContain('displayedAt');
    expect(unifiedWorker).not.toContain('/api/mobile-push/deliveries/ack');
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
      evidenceKind: 'EMULATED_SOFTWARE_HARNESS',
      acceptedOfflineSales: 500,
      synchronizedSales: 500,
      lostSales: 0,
      duplicateSales: 0,
      blockedByPush: 0,
      blockedByInstall: 0,
      queueParity: true,
      queueEntriesBeforeReconnect: 500,
      queueEntriesAfterReconnect: 0,
    });
    expect(result.peakEstimatedHeapBytes).toBeLessThan(128 * 1_024 * 1_024);
    expect(result.interactionP95Ms).toBeLessThan(200);
  });

  it('redacts lockscreen payloads and rejects arbitrary deep links', () => {
    expect(
      buildSafeNotification({
        eventType: 'CASH_DISCREPANCY',
        deepLinkKind: 'cash_close',
        deepLinkEntityId: 'close_2A-9',
        title: 'Cliente Ada debe S/ 90',
        body: 'DNI 12345678',
      }),
    ).toMatchObject({
      title: 'Alerta de caja',
      body: 'Revisa el detalle al iniciar sesión.',
    });
    expect(resolveNotificationRoute('cash_close', 'close_2A-9')).toBe('/caja?alert=close_2A-9');
    expect(resolveNotificationRoute('https://evil.example', 'close_2A-9')).toBe('/login');
    expect(resolveNotificationRoute('cash_close', '../admin')).toBe('/login');
  });

  it('degrades failed FCM bootstrap to polling without claiming registration', async () => {
    const result = await loadFcmRegistrationAdapter(() =>
      Promise.reject(new Error('provider unavailable')),
    );
    expect(result).toEqual({
      registered: false,
      channel: 'POLLING_BANNER',
      reason: 'FCM_UNAVAILABLE',
    });
  });
});
