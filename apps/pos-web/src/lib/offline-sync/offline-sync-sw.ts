/**
 * Contrato Service Worker offline-sync — registro desde UI; flush vía postMessage.
 * El script SW real se sirve como asset estático en deploy; aquí el contrato testeable.
 */

export const OFFLINE_SYNC_SW_VERSION = 'kipuspay-pos-sw-v2';
export const OFFLINE_SYNC_SW_HANDLERS = [
  'install',
  'activate',
  'sync',
  'push',
  'fcm-background-message',
  'notificationclick',
  'displayed-ack',
] as const;

export function buildFlushMessage(): { type: 'FLUSH_OFFLINE_QUEUE' } {
  return { type: 'FLUSH_OFFLINE_QUEUE' };
}

export function isFlushAck(data: unknown): boolean {
  return (
    typeof data === 'object' && data !== null && (data as { type?: string }).type === 'FLUSH_ACK'
  );
}

export function buildSetApiBaseMessage(apiBase: string): { type: 'SET_API_BASE'; apiBase: string } {
  return { type: 'SET_API_BASE', apiBase: apiBase.replace(/\/$/, '') };
}

/**
 * C8: mensaje FCM de fondo que el host (WebView/Android nativo) reenvía al único
 * SW del POS para su display + ACK (spec §5.12.7). El SW ya lo maneja.
 */
export function buildFcmBackgroundMessage(payload: unknown): {
  type: 'FCM_BACKGROUND_MESSAGE';
  payload: unknown;
} {
  return { type: 'FCM_BACKGROUND_MESSAGE', payload };
}

/** Registra SW si el entorno lo soporta (no-op en tests/SSR). */
export async function registerOfflineSyncServiceWorker(
  scriptUrl: string = '/offline-sync-sw.js',
  scope: string = '/',
  apiBase: string = '',
): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  const registration = await navigator.serviceWorker.register(scriptUrl, { scope });
  const msg = buildSetApiBaseMessage(apiBase);
  registration.active?.postMessage(msg);
  void navigator.serviceWorker.ready.then((ready) => ready.active?.postMessage(msg));
  return registration;
}
