import { isDataBackupEnabled as isFeatureEnabled } from './features.js';

export interface BackupSummary {
  readonly id: string;
  readonly status: string;
  readonly created_at?: string;
  readonly ready_at?: string | null;
  readonly expires_at?: string | null;
  readonly format_version?: string;
  readonly registry_version?: string;
  readonly schema_version?: string;
  readonly kek_version?: string;
  readonly plaintext_size_bytes?: number | null;
  readonly global_hash?: string | null;
}

export interface BackupList {
  readonly items: readonly BackupSummary[];
  readonly offline?: boolean;
}

type FetchPort = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface DataBackupClientDependencies {
  readonly authenticatedFetch?: FetchPort;
  readonly fetcher?: FetchPort;
  readonly online?: () => boolean;
  /** Volatile callback supplied by the reauthentication UI; never persisted here. */
  readonly stepUpToken?: () => string | null;
  readonly sale?: (input: unknown) => Promise<unknown>;
  readonly sync?: () => Promise<unknown>;
  readonly closeZ?: () => Promise<unknown>;
}

function backupError(code: string): Error {
  const error = new Error(code);
  error.name = 'DataBackupClientError';
  return error;
}

async function jsonResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { readonly code?: string };
  if (!response.ok) throw backupError(body.code ?? `BACKUP_HTTP_${response.status}`);
  return body;
}

export function isDataBackupEnabled(): boolean {
  // Flag unificado vía features.ts ($env/dynamic/public, runtime): el patrón
  // import.meta.env.PUBLIC_* se bakea en build y diverge del resto del POS.
  return isFeatureEnabled();
}

export function backupClaimState(input: {
  readonly sprint42Gate: 'RED' | 'GREEN';
  readonly sprint48Gate: 'RED' | 'GREEN';
}) {
  return {
    exportHistory: input.sprint42Gate === 'GREEN' ? 'AVAILABLE_SCOPED' : 'LOCKED',
    restoreDryRun: input.sprint42Gate === 'GREEN' ? 'AVAILABLE' : 'LOCKED',
    restoreApply: input.sprint48Gate === 'GREEN' ? 'AVAILABLE' : 'LOCKED',
    drRto: input.sprint48Gate === 'GREEN' ? 'AVAILABLE' : 'LOCKED',
  } as const;
}

export function backupOfflineWarning(input: {
  readonly pendingIndexedDbMutations: number;
  readonly online: boolean;
}) {
  return {
    visible: input.pendingIndexedDbMutations > 0,
    severity: 'warning' as const,
    code: 'BACKUP_EXCLUDES_UNSYNCED_CHANGES' as const,
    pendingCount: input.pendingIndexedDbMutations,
    canSyncNow: input.online,
    saleBlocked: false,
    checkoutBlocked: false,
    closeZBlocked: false,
  };
}

export function createDataBackupClient(dependencies: DataBackupClientDependencies) {
  const authenticatedFetch = dependencies.authenticatedFetch ?? dependencies.fetcher;
  const online = dependencies.online ?? (() => true);
  let history: readonly BackupSummary[] = [];

  const request = async <T>(
    path: string,
    init: RequestInit,
    options: { readonly needsStepUp?: boolean } = {},
  ): Promise<T> => {
    if (!online()) throw backupError('BACKUP_OFFLINE');
    if (!authenticatedFetch) throw backupError('BACKUP_AUTH_REQUIRED');
    const headers = new Headers(init.headers);
    if (init.body !== undefined) headers.set('content-type', 'application/json');
    if (options.needsStepUp) {
      const token = dependencies.stepUpToken?.() ?? null;
      if (!token) throw backupError('STEP_UP_REQUIRED');
      headers.set('x-step-up-token', token);
    }
    return jsonResponse<T>(await authenticatedFetch(path, { ...init, headers }));
  };

  return {
    async list(): Promise<BackupList> {
      if (!online()) return { items: history, offline: true };
      const response = await request<BackupList>('/api/backups', { method: 'GET' });
      history = response.items;
      return response;
    },
    status(backupId: string): Promise<BackupSummary> {
      return request(`/api/backups/${encodeURIComponent(backupId)}`, { method: 'GET' });
    },
    create(body: { readonly idempotencyKey: string }): Promise<Record<string, unknown>> {
      return request('/api/backups', { method: 'POST', body: JSON.stringify(body) });
    },
    async download(backupId: string): Promise<ReadableStream<Uint8Array>> {
      if (!online()) throw backupError('BACKUP_OFFLINE');
      if (!authenticatedFetch) throw backupError('BACKUP_AUTH_REQUIRED');
      const token = dependencies.stepUpToken?.() ?? null;
      if (!token) throw backupError('STEP_UP_REQUIRED');
      const response = await authenticatedFetch(
        `/api/backups/${encodeURIComponent(backupId)}/download`,
        { method: 'GET', headers: { 'x-step-up-token': token } },
      );
      if (!response.ok) {
        const body = (await response.json()) as { readonly code?: string };
        throw backupError(body.code ?? `BACKUP_HTTP_${response.status}`);
      }
      if (!response.body) throw backupError('BACKUP_DOWNLOAD_STREAM_MISSING');
      return response.body;
    },
    dryRun(
      backupId: string,
      body: { readonly idempotencyKey: string },
    ): Promise<Record<string, unknown>> {
      return request(
        `/api/backups/${encodeURIComponent(backupId)}/restore-dry-run`,
        { method: 'POST', body: JSON.stringify(body) },
        { needsStepUp: true },
      );
    },
    sale: dependencies.sale ?? (() => Promise.reject(backupError('SALE_PORT_UNAVAILABLE'))),
    sync: dependencies.sync ?? (() => Promise.reject(backupError('SYNC_PORT_UNAVAILABLE'))),
    closeZ: dependencies.closeZ ?? (() => Promise.reject(backupError('CLOSE_Z_PORT_UNAVAILABLE'))),
  };
}
