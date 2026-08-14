import { absolutizeApiUrl } from '../auth/api-client.js';

export type PushPurpose = 'OWNER_ALERTS' | 'OPERATIONAL_MOBILE';

interface PushPolicy {
  readonly amountsEnabled: boolean;
  readonly policyVersion: string;
  readonly vapidPublicKey: string;
}

let pushFetch: typeof fetch = fetch;

export function configureMobilePushApi(fetcher: typeof fetch): void {
  pushFetch = fetcher;
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await pushFetch(absolutizeApiUrl(path), {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...init.headers },
  });
  if (!response.ok) {
    const failure = (await response.json().catch(() => ({}))) as { code?: string };
    throw new Error(failure.code ?? `PUSH_HTTP_${response.status}`);
  }
  return response.status === 204 ? ({} as T) : ((await response.json()) as T);
}

function applicationServerKey(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
  const bytes = Uint8Array.from(raw, (character) => character.charCodeAt(0));
  const output = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(output).set(bytes);
  return output;
}

export async function readPushPolicy(): Promise<PushPolicy> {
  return api<PushPolicy>('/api/push/privacy');
}

export async function registerBrowserPush(
  purpose: PushPurpose,
  privacyMode: 'REDACTED' | 'AMOUNTS' = 'REDACTED',
): Promise<{ readonly consentId: string; readonly subscriptionId: string }> {
  const policy = await readPushPolicy();
  if (!policy.vapidPublicKey) throw new Error('PUSH_VAPID_UNAVAILABLE');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('PUSH_PERMISSION_DENIED');
  const worker = await navigator.serviceWorker.ready;
  const subscription =
    (await worker.pushManager.getSubscription()) ??
    (await worker.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey(policy.vapidPublicKey),
    }));
  const consent = await api<{ id: string }>('/api/push/consents', {
    method: 'POST',
    body: JSON.stringify({
      purpose,
      policyVersion: policy.policyVersion,
      privacyMode,
      ownerAmountsOptIn: privacyMode === 'AMOUNTS',
    }),
  });
  const registered = await api<{ id: string }>('/api/push/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      purpose,
      provider: 'WEB_PUSH',
      encryptedRegistration: JSON.stringify(subscription.toJSON()),
      consentPolicyVersion: policy.policyVersion,
    }),
  });
  return { consentId: consent.id, subscriptionId: registered.id };
}

export async function rotateBrowserPush(subscriptionId: string): Promise<void> {
  const worker = await navigator.serviceWorker.ready;
  const subscription = await worker.pushManager.getSubscription();
  if (!subscription) throw new Error('PUSH_SUBSCRIPTION_MISSING');
  await api('/api/push/subscriptions/rotate', {
    method: 'PUT',
    body: JSON.stringify({
      subscriptionId,
      encryptedRegistration: JSON.stringify(subscription.toJSON()),
    }),
  });
}

export async function unregisterBrowserPush(
  purpose: PushPurpose,
  subscriptionId: string,
  consentId: string,
): Promise<void> {
  await api('/api/push/subscriptions', {
    method: 'DELETE',
    body: JSON.stringify({ purpose, subscriptionId }),
  });
  await api('/api/push/consents', {
    method: 'DELETE',
    body: JSON.stringify({ purpose, consentId }),
  });
  const worker = await navigator.serviceWorker.ready;
  await (await worker.pushManager.getSubscription())?.unsubscribe();
}

export async function updateBrowserPushPrivacy(
  purpose: PushPurpose,
  consentId: string,
  privacyMode: 'REDACTED' | 'AMOUNTS',
): Promise<void> {
  await api('/api/push/privacy', {
    method: 'PATCH',
    body: JSON.stringify({
      purpose,
      consentId,
      privacyMode,
      ownerAmountsOptIn: privacyMode === 'AMOUNTS',
    }),
  });
}

export async function listBrowserPushDevices(): Promise<readonly Record<string, unknown>[]> {
  const result = await api<{ devices: readonly Record<string, unknown>[] }>('/api/push/devices');
  return result.devices;
}

export async function queueBrowserPushTest(purpose: PushPurpose): Promise<void> {
  await api('/api/push/test', { method: 'POST', body: JSON.stringify({ purpose }) });
}
