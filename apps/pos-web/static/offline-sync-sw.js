/* KipusPay unified POS Service Worker. Keep IndexedDB untouched across upgrades. */
const VERSION = 'kipuspay-pos-sw-v2';
const CACHE = `kipuspay-pos-shell-${VERSION}`;
let kipuspayApiBase = '';
const SHELL_ALLOWLIST = ['/', '/caja/cobro', '/offline.html', '/manifest.webmanifest'];
const ROUTES = {
  cash_close: '/caja',
  cash_discrepancy: '/caja',
  inventory: '/owner/stock',
  installment: '/caja/cuotas',
  accounts_receivable: '/ledger/receivables',
  customer_order: '/orders/customer',
  recurring_sale: '/admin/membresias',
  billing: '/settings/billing',
};
const COPY = {
  CASH_CLOSE: ['Cierre de caja', 'Revisa el cierre al iniciar sesión.'],
  CASH_DISCREPANCY: ['Alerta de caja', 'Revisa el detalle al iniciar sesión.'],
  INVENTORY_STOCKOUT: ['Alerta de inventario', 'Revisa el stock al iniciar sesión.'],
  INSTALLMENT_OVERDUE: ['Alerta de cobranza', 'Revisa el detalle al iniciar sesión.'],
  ACCOUNTS_RECEIVABLE_OVERDUE: ['Alerta de cobranza', 'Revisa el detalle al iniciar sesión.'],
  CUSTOMER_ORDER_EXPIRY: ['Alerta de pedido', 'Revisa el pedido al iniciar sesión.'],
  RECURRING_GRACE: ['Alerta de membresía', 'Revisa el detalle al iniciar sesión.'],
};

function safeRoute(kind, entityId) {
  if (!Object.hasOwn(ROUTES, kind) || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(entityId || '')) {
    return '/login';
  }
  return `${ROUTES[kind]}?alert=${encodeURIComponent(entityId)}`;
}

function safePayload(value) {
  const payload = value && typeof value === 'object' ? value : {};
  // El wire no lleva eventType (allowlist del transporte): el copy se deriva
  // de deepLink.kind — drill fcm-vapid-real (2026-08-24).
  const KIND_EVENT = {
    cash_close: 'CASH_CLOSE',
    cash_discrepancy: 'CASH_DISCREPANCY',
    inventory: 'INVENTORY_STOCKOUT',
    installment: 'INSTALLMENT_OVERDUE',
    accounts_receivable: 'ACCOUNTS_RECEIVABLE_OVERDUE',
    customer_order: 'CUSTOMER_ORDER_EXPIRY',
    recurring_sale: 'RECURRING_GRACE',
    billing: 'BILLING_REMINDER',
  };
  const eventType =
    typeof payload.eventType === 'string' ? payload.eventType : KIND_EVENT[payload.deepLink?.kind];
  const copy = Object.hasOwn(COPY, eventType)
    ? COPY[eventType]
    : ['Alerta operativa', 'Revisa el detalle al iniciar sesión.'];
  return {
    title: copy[0],
    body: copy[1],
    route: safeRoute(
      payload.deepLink?.kind || payload.deep_link_kind,
      payload.deepLink?.entityId || payload.deep_link_entity_id,
    ),
    deliveryId: /^[A-Za-z0-9_-]{1,128}$/.test(payload.deliveryId || '') ? payload.deliveryId : '',
    receipt: /^[A-Za-z0-9_-]{16,1024}\.[A-Za-z0-9_-]{16,1024}$/.test(payload.receipt || '')
      ? payload.receipt
      : '',
  };
}

async function cacheShell() {
  const cache = await caches.open(CACHE);
  await Promise.all(
    SHELL_ALLOWLIST.map(async (url) => {
      try {
        const response = await fetch(url, { cache: 'reload' });
        if (response.ok) await cache.put(url, response);
      } catch {
        // Installation must not block checkout when one optional shell asset is unavailable.
      }
    }),
  );
}

async function notifyClients(type) {
  const windows = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  for (const client of windows) client.postMessage({ type, version: VERSION });
}

async function readAuthMirror() {
  // El SW no ve localStorage: el login espejea {token, tenantId} en IDB
  // (kipus_push_auth/auth/current) para que el ACK pueda autenticar.
  return idbGet('auth', 'current', (v) =>
    v &&
    typeof v.token === 'string' &&
    v.token.length > 0 &&
    typeof v.tenantId === 'string' &&
    v.tenantId.length > 0
      ? { token: v.token, tenantId: v.tenantId }
      : null,
  );
}

async function idbOpen() {
  if (typeof indexedDB === 'undefined') return null;
  return new Promise((resolve) => {
    const req = indexedDB.open('kipus_push_auth', 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('auth')) db.createObjectStore('auth');
      if (!db.objectStoreNames.contains('config')) db.createObjectStore('config');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

async function idbGet(store, key, validate) {
  try {
    const db = await idbOpen();
    if (!db) return null;
    const value = await new Promise((resolve, reject) => {
      const tx = db['transaction'](store, 'readonly');
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IDB_GET_FAILED'));
    });
    db.close();
    return validate(value);
  } catch {
    return null;
  }
}

async function idbPut(store, key, value) {
  try {
    const db = await idbOpen();
    if (!db) return;
    await new Promise((resolve, reject) => {
      const tx = db['transaction'](store, 'readwrite');
      tx.objectStore(store).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IDB_PUT_FAILED'));
    });
    db.close();
  } catch {
    // Fail-soft: la configuración persistida es optimización, no requisito.
  }
}

async function dispatchDisplayedAck(deliveryId, receipt, displayedAt) {
  if (!deliveryId || !receipt) return;
  try {
    // Cold start: un SW despertado por un push pierde el estado de módulo —
    // el apiBase se recupera de IDB (persistido por SET_API_BASE).
    let apiBase = kipuspayApiBase;
    if (!apiBase)
      apiBase =
        (await idbGet('config', 'apiBase', (v) => (typeof v === 'string' ? v : null))) ?? '';
    const headers = { 'content-type': 'application/json' };
    const auth = await readAuthMirror();
    if (auth) {
      headers.authorization = `Bearer ${auth.token}`;
      headers['x-tenant-id'] = auth.tenantId;
    }
    const response = await fetch(`${apiBase}/api/push/ack`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({ deliveryId, receipt, displayedAt }),
    });
    // Un 401/403/410 resuelto como éxito = ACK perdido en silencio (hallazgo
    // BLOQUEANTE-2 auditoría 2026-08-24): telemetría visible + señal a clients.
    if (!response.ok) {
      await notifyClients(`DISPLAYED_ACK_HTTP_${response.status}`);
    }
  } catch {
    await notifyClients('DISPLAYED_ACK_PENDING');
  }
}

async function displayNotification(rawPayload) {
  const payload = safePayload(rawPayload);
  await self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: '/icons/kipuspay-pos-192.svg?v=2',
    badge: '/icons/kipuspay-pos-192.svg?v=2',
    tag: payload.receipt || undefined,
    renotify: false,
    data: { route: payload.route },
  });
  await dispatchDisplayedAck(payload.deliveryId, payload.receipt, new Date().toISOString());
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheShell());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('kipuspay-pos-shell-') && key !== CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  if (
    event.request.method !== 'GET' ||
    new URL(event.request.url).origin !== self.location.origin
  ) {
    return;
  }
  event.respondWith(
    fetch(event.request).catch(async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      if (event.request.mode === 'navigate') {
        return (await caches.match('/offline.html')) || Response.error();
      }
      return Response.error();
    }),
  );
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'kipuspay-offline-sales') {
    event.waitUntil(notifyClients('FLUSH_OFFLINE_QUEUE'));
  }
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  // Retornar la promesa es no-op para el navegador (waitUntil manda) pero
  // hace determinista el harness de tests que await-ea el handler.
  const shown = displayNotification(payload);
  event.waitUntil(shown);
  return shown;
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SET_API_BASE' && typeof event.data.apiBase === 'string') {
    kipuspayApiBase = String(event.data.apiBase).replace(/\/$/, '');
    // Persistir para cold starts: el push despierta una instancia nueva sin estado.
    if (kipuspayApiBase) void idbPut('config', 'apiBase', kipuspayApiBase);
  }
  if (event.data && event.data.type === 'FLUSH_OFFLINE_QUEUE') {
    event.source?.postMessage({ type: 'FLUSH_ACK', version: VERSION });
  }
  if (event.data && event.data.type === 'FCM_BACKGROUND_MESSAGE') {
    event.waitUntil(displayNotification(event.data.payload));
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const route =
    typeof event.notification.data?.route === 'string' &&
    (event.notification.data.route === '/login' ||
      Object.values(ROUTES).some((prefix) =>
        event.notification.data.route.startsWith(`${prefix}?alert=`),
      ))
      ? event.notification.data.route
      : '/login';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
      const existing = windows[0];
      if (existing) {
        await existing.navigate(route);
        return existing.focus();
      }
      return self.clients.openWindow(route);
    })(),
  );
});
