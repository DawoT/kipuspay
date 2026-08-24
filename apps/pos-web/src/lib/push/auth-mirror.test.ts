import { describe, expect, it } from 'vitest';
import {
  clearMirroredAuthToken,
  mirrorAuthTokenForServiceWorker,
  readMirroredAuthToken,
} from './auth-mirror.js';

/**
 * El espejo de auth es fail-soft por diseño: en entornos sin IndexedDB
 * (Node/happy-dom) ninguna operación debe lanzar y la lectura devuelve null.
 * La validación del contrato IDB real vive en el E2E de dispositivo (H4).
 */
describe('auth-mirror (fail-soft sin IndexedDB)', () => {
  it('no lanza al escribir/leer/limpiar sin indexedDB', async () => {
    await expect(mirrorAuthTokenForServiceWorker('tok', 'tenant')).resolves.toBeUndefined();
    await expect(readMirroredAuthToken()).resolves.toBeNull();
    await expect(clearMirroredAuthToken()).resolves.toBeUndefined();
  });

  it('rechaza inputs vacíos sin tocar storage', async () => {
    await expect(mirrorAuthTokenForServiceWorker('', 'tenant')).resolves.toBeUndefined();
    await expect(mirrorAuthTokenForServiceWorker('tok', '')).resolves.toBeUndefined();
  });
});
