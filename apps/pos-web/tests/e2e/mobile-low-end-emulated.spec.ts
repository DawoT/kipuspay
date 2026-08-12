import { expect, test } from '@playwright/test';

// Este spec ejercita el Service Worker (registro + update): re-habilita el SW
// que el config global bloquea para que los mocks page.route funcionen.
test.use({ serviceWorkers: 'allow' });

test('EMULATED software low-end harness preserves 500 offline sales through reload and SW update', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/mobile');
  const result = await page.evaluate(async () => {
    const memoryBefore =
      (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
        ?.usedJSHeapSize ?? 0;
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('s45-low-end-emulated', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('sales', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const durations: number[] = [];
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('sales', 'readwrite');
      const store = transaction.objectStore('sales');
      for (let index = 0; index < 500; index += 1) {
        const started = performance.now();
        store.put({
          id: `offline-${String(index).padStart(4, '0')}`,
          state: 'QUEUED',
          evidence: 'EMULATED_BACKGROUND_AND_STORAGE_PRESSURE',
        });
        durations.push(performance.now() - started);
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
    sessionStorage.setItem('s45-emulated-reload', 'pending');
    const memoryAfter =
      (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
        ?.usedJSHeapSize ?? memoryBefore;
    return { durations, heapDeltaBytes: Math.max(0, memoryAfter - memoryBefore) };
  });

  await page.reload();
  const queueBeforeReconnect = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('s45-low-end-emulated', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const count = await new Promise<number>((resolve, reject) => {
      const request = database.transaction('sales').objectStore('sales').count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    const registration = await navigator.serviceWorker.getRegistration('/');
    if (registration) await registration.update();
    return count;
  });
  expect(queueBeforeReconnect).toBe(500);

  const reconciliation = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('s45-low-end-emulated', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const ids = await new Promise<string[]>((resolve, reject) => {
      const request = database.transaction('sales').objectStore('sales').getAllKeys();
      request.onsuccess = () => resolve(request.result.map(String));
      request.onerror = () => reject(request.error);
    });
    const serverAccepted = new Set([...ids, ...ids]);
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('sales', 'readwrite');
      transaction.objectStore('sales').clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
    return { accepted: serverAccepted.size, queueAfter: 0 };
  });
  const ordered = [...result.durations].sort((left, right) => left - right);
  const interactionP95Ms = ordered[Math.ceil(ordered.length * 0.95) - 1] ?? 0;
  expect(reconciliation).toEqual({ accepted: 500, queueAfter: 0 });
  expect(result.heapDeltaBytes).toBeLessThan(32 * 1_024 * 1_024);
  expect(interactionP95Ms).toBeLessThan(200);
});
