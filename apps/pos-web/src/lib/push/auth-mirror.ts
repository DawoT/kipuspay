/**
 * Espejo de credenciales para el Service Worker (F-6 / ACK de push).
 *
 * El SW no tiene acceso a localStorage; sin este espejo, `dispatchDisplayedAck`
 * postea `/api/push/ack` sin `Authorization` y el gate Bearer-only lo rechaza
 * siempre (bug de contrato detectado en auditoría staging 2026-08-24).
 *
 * Patrón: mismo estilo zero-dep que `createBrowserOfflineIdb` (offline-queue).
 * Fail-soft: cualquier fallo de IDB degrada a "sin espejo" y el flujo de login
 * jamás se interrumpe.
 */

const AUTH_MIRROR_DB = 'kipus_push_auth';
/**
 * Debe coincidir con la versión que abre el Service Worker
 * (offline-sync-sw.js idbOpen). Abrir en versión menor que la existente lanza
 * VersionError y el fail-soft lo tragaría → espejo muerto tras el primer open
 * del SW (hallazgo BLOQUEANTE-1 de la auditoría 2026-08-24).
 */
export const AUTH_MIRROR_DB_VERSION = 2;
const AUTH_MIRROR_STORE = 'auth';
const AUTH_MIRROR_KEY = 'current';

export interface MirroredAuth {
  readonly token: string;
  readonly tenantId: string;
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openMirrorDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(AUTH_MIRROR_DB, AUTH_MIRROR_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(AUTH_MIRROR_STORE)) {
        db.createObjectStore(AUTH_MIRROR_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('PUSH_AUTH_IDB_OPEN_FAILED'));
  });
}

/** Persiste el token vigente para que el SW pueda autenticar el ACK. */
export async function mirrorAuthTokenForServiceWorker(
  token: string,
  tenantId: string,
): Promise<void> {
  if (!hasIndexedDb() || token.length === 0 || tenantId.length === 0) return;
  try {
    const db = await openMirrorDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db['transaction'](AUTH_MIRROR_STORE, 'readwrite');
      tx.objectStore(AUTH_MIRROR_STORE).put({ token, tenantId }, AUTH_MIRROR_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('PUSH_AUTH_IDB_PUT_FAILED'));
    });
    db.close();
  } catch {
    // Fail-soft: sin espejo el SW postea sin auth y el ack queda pendiente.
  }
}

/** Lectura para el Service Worker. Devuelve null si no hay espejo válido. */
export async function readMirroredAuthToken(): Promise<MirroredAuth | null> {
  if (!hasIndexedDb()) return null;
  try {
    const db = await openMirrorDb();
    const value = await new Promise<unknown>((resolve, reject) => {
      const tx = db['transaction'](AUTH_MIRROR_STORE, 'readonly');
      const req = tx.objectStore(AUTH_MIRROR_STORE).get(AUTH_MIRROR_KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('PUSH_AUTH_IDB_GET_FAILED'));
    });
    db.close();
    if (typeof value !== 'object' || value === null) return null;
    const rec = value as Partial<MirroredAuth>;
    if (typeof rec.token === 'string' && typeof rec.tenantId === 'string') {
      return { token: rec.token, tenantId: rec.tenantId };
    }
    return null;
  } catch {
    return null;
  }
}

/** Limpieza en logout: el espejo nunca sobrevive a la sesión. */
export async function clearMirroredAuthToken(): Promise<void> {
  if (!hasIndexedDb()) return;
  try {
    const db = await openMirrorDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db['transaction'](AUTH_MIRROR_STORE, 'readwrite');
      tx.objectStore(AUTH_MIRROR_STORE).delete(AUTH_MIRROR_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('PUSH_AUTH_IDB_DELETE_FAILED'));
    });
    db.close();
  } catch {
    // Fail-soft simétrico al write.
  }
}
