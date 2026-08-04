/**
 * Contrato Service Worker offline-sync — registro desde UI; flush vía postMessage.
 * El script SW real se sirve como asset estático en deploy; aquí el contrato testeable.
 */

export const OFFLINE_SYNC_SW_VERSION = 'kipuspay-offline-sync-v1';

export function buildFlushMessage(): { type: 'FLUSH_OFFLINE_QUEUE' } {
  return { type: 'FLUSH_OFFLINE_QUEUE' };
}

export function isFlushAck(data: unknown): boolean {
  return (
    typeof data === 'object' && data !== null && (data as { type?: string }).type === 'FLUSH_ACK'
  );
}

/** Registra SW si el entorno lo soporta (no-op en tests/SSR). */
export async function registerOfflineSyncServiceWorker(
  scriptUrl: string = '/offline-sync-sw.js',
): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  return navigator.serviceWorker.register(scriptUrl);
}
