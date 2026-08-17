<script lang="ts">
  import { onMount } from 'svelte';
  import {
    backupOfflineWarning,
    createDataBackupClient,
    isDataBackupEnabled,
    type BackupSummary,
  } from '$lib/data-backup-client';
  import {
    readAdminAuthenticatedSessionState,
    type AdminAuthenticatedSessionState,
  } from '$lib/admin/authenticated-session';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Badge from '$lib/ui/Badge.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';

  let role = $state<'owner' | 'admin'>('admin');
  let items = $state<readonly BackupSummary[]>([]);
  let pendingOfflineSales = $state(0);
  let online = $state(true);
  let loading = $state(true);
  let busy = $state(false);
  let notice = $state('');
  let error = $state('');
  let stepUpToken = $state('');
  let selected = $state<BackupSummary | null>(null);
  const enabled = isDataBackupEnabled();
  let sessionState = $state<AdminAuthenticatedSessionState | null>(null);
  let authenticatedFetch: typeof fetch | null = null;

  const client = () =>
    createDataBackupClient({
      authenticatedFetch: authenticatedFetch ?? undefined,
      online: () => online,
      stepUpToken: () => stepUpToken || null,
    });

  async function countPendingOfflineSales(): Promise<number> {
    if (!('indexedDB' in globalThis) || typeof indexedDB.databases !== 'function') return 0;
    let count = 0;
    for (const descriptor of await indexedDB.databases()) {
      if (!descriptor.name) continue;
      const database = await new Promise<IDBDatabase | null>((resolve) => {
        const request = indexedDB.open(descriptor.name!);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      });
      if (!database) continue;
      for (const storeName of database.objectStoreNames) {
        count += await new Promise<number>((resolve) => {
          const transaction = database.transaction(storeName, 'readonly');
          const request = transaction.objectStore(storeName).getAllKeys();
          request.onsuccess = () =>
            resolve(request.result.filter((key) => String(key).startsWith('offline/')).length);
          request.onerror = () => resolve(0);
        });
      }
      database.close();
    }
    return count;
  }

  async function refresh() {
    loading = true;
    error = '';
    try {
      const response = await client().list();
      items = response.items;
      selected = selected
        ? (items.find((item) => item.id === selected?.id) ?? selected)
        : (items[0] ?? null);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'No se pudo cargar el historial.';
    } finally {
      loading = false;
    }
  }

  async function createBackup() {
    busy = true;
    error = '';
    try {
      await client().create({ idempotencyKey: crypto.randomUUID() });
      notice = 'Exportación solicitada. Puedes seguir vendiendo mientras se procesa.';
      await refresh();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'No se pudo solicitar la exportación.';
    } finally {
      busy = false;
    }
  }

  async function mintStepUp() {
    if (!selected || !authenticatedFetch) {
      error = 'Selecciona un respaldo para emitir el token.';
      return;
    }
    error = '';
    try {
      const response = await authenticatedFetch('/api/backups/step-up-token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ backupId: selected.id }),
      });
      const body = (await response.json()) as { token?: string; code?: string };
      if (!response.ok || !body.token) {
        error = body.code ?? 'No se pudo emitir el token de reautenticación.';
        return;
      }
      stepUpToken = body.token;
      notice = 'Token de reautenticación listo (90 s, un solo uso).';
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'No se pudo emitir el token.';
    }
  }

  async function download(backup: BackupSummary) {
    if (!stepUpToken) {
      error = 'Se requiere reautenticación reciente para descargar el respaldo.';
      return;
    }
    busy = true;
    error = '';
    try {
      const stream = await client().download(backup.id);
      const picker = (
        window as Window & {
          showSaveFilePicker?: (options: {
            suggestedName: string;
          }) => Promise<{ createWritable(): Promise<WritableStream<Uint8Array>> }>;
        }
      ).showSaveFilePicker;
      if (!picker) throw new Error('DOWNLOAD_STREAM_SAVER_UNAVAILABLE');
      const handle = await picker({ suggestedName: `kipuspay-${backup.id}.kpbk1` });
      await stream.pipeTo(await handle.createWritable());
      notice = 'Descarga cifrada completada.';
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'No se pudo descargar el respaldo.';
    } finally {
      stepUpToken = '';
      busy = false;
    }
  }

  async function dryRun(backup: BackupSummary) {
    if (!stepUpToken) {
      error = 'Se requiere reautenticación reciente para ejecutar la simulación.';
      return;
    }
    busy = true;
    error = '';
    try {
      await client().dryRun(backup.id, { idempotencyKey: crypto.randomUUID() });
      notice = 'Simulación iniciada. No se aplicaron datos ni se reactivaron accesos.';
      stepUpToken = '';
      await refresh();
    } catch (cause) {
      stepUpToken = '';
      error = cause instanceof Error ? cause.message : 'La simulación fue rechazada.';
    } finally {
      busy = false;
    }
  }

  // F5: la sesión autenticada la provee el app-shell (provideAdminAuthenticatedSessionState,
  // +layout.svelte) de forma asíncrona. El seam estático provideAdminAuthenticatedSession
  // nunca se instancia; aquí se observa el state y se refresca cuando llega la sesión.
  $effect(() => {
    const current = sessionState?.current ?? null;
    authenticatedFetch = current?.authenticatedFetch ?? null;
    if (!enabled) return;
    if (current) {
      void refresh();
    } else {
      error = 'Inicia sesión para ver tus respaldos.';
      loading = false;
    }
  });

  onMount(() => {
    sessionState = readAdminAuthenticatedSessionState();
    role = import.meta.env.PUBLIC_DEV_ROLE === 'owner' ? 'owner' : 'admin';
    online = navigator.onLine;
    const updateNetwork = () => {
      online = navigator.onLine;
      if (online) void refresh();
    };
    window.addEventListener('online', updateNetwork);
    window.addEventListener('offline', updateNetwork);
    void countPendingOfflineSales().then((count) => {
      pendingOfflineSales = count;
    });
    return () => {
      window.removeEventListener('online', updateNetwork);
      window.removeEventListener('offline', updateNetwork);
      stepUpToken = '';
    };
  });

  const warning = $derived(
    backupOfflineWarning({
      pendingIndexedDbMutations: pendingOfflineSales,
      online,
    }),
  );
</script>

<svelte:head><title>Respaldos · Admin · KipusPay</title></svelte:head>

<main class="backup-shell" aria-labelledby="backup-title">
  <header class="masthead">
    <div class="masthead-title">
      <Badge variant="indigo">
        <Icon name="download" size={14} />
        <span>Admin · Operaciones de datos</span>
      </Badge>
      <h1 id="backup-title">Respaldos cifrados verificables</h1>
      <p class="scope">
        Incluye únicamente datos sincronizados del servidor y evidencia R2 referenciada. No incluye datos locales ni secretos.
      </p>
    </div>
    <Badge variant={online ? 'online' : 'offline'} role="status">
      <Icon name={online ? 'wifi' : 'wifi-off'} size={16} />
      <span>{online ? 'En línea · exportaciones habilitadas' : 'Sin conexión · historial en caché'}</span>
    </Badge>
  </header>

  {#if !enabled}
    <StatusMessage tone="danger" role="alert">
      <Icon name="alert" size={18} />
      <span>La función de respaldos está desactivada para este negocio.</span>
    </StatusMessage>
  {:else}
    {#if warning.visible}
      <div class="queue-warning ledger-card">
        <div class="warning-head">
          <Icon name="alert" size={20} class="icon-amber" />
          <h2>Cobertura requerida antes de exportar</h2>
        </div>
        <p>
          <strong>{pendingOfflineSales} ventas offline pendientes</strong> en este navegador no están incluidas. Sincronízalas antes de crear el respaldo si deseas incorporarlas.
        </p>
        <p class="hint">La venta, el cobro y el cierre Z permanecen disponibles.</p>
      </div>
    {/if}

    <div class="toolbar ledger-card">
      <div class="action-buttons">
        <Button
          variant="primary"
          disabled={!online || busy}
          onclick={createBackup}
          icon="download"
        >
          Crear exportación
        </Button>
        <Button
          variant="secondary"
          disabled={!online || busy}
          onclick={refresh}
          icon="refresh"
        >
          Actualizar historial
        </Button>
      </div>

      {#if role === 'owner'}
        <div class="reauth-field">
          <label for="step-up">
            <Icon name="key" size={14} />
            <span>Token de reautenticación recente</span>
          </label>
          <input
            id="step-up"
            type="password"
            autocomplete="off"
            bind:value={stepUpToken}
            placeholder="Solo en memoria para descargar"
          />
          <Button
            variant="secondary"
            data-testid="mint-step-up"
            disabled={!online || busy || !selected}
            onclick={() => void mintStepUp()}
          >
            Emitir token
          </Button>
        </div>
      {/if}
    </div>

    <p class="status-msg live" aria-live="polite">
      {loading ? 'Cargando historial…' : notice || `${items.length} respaldos disponibles.`}
    </p>
    {#if error}
      <StatusMessage tone="danger" role="alert">{error}</StatusMessage>
    {/if}

    <div class="operations-grid">
      <section class="history-card ledger-card" aria-labelledby="history-title">
        <div class="card-head">
          <Icon name="clock" size={18} class="icon-accent" />
          <h2 id="history-title">Historial y progreso ({items.length})</h2>
        </div>
        {#if loading}
          <Skeleton lines={3} />
        {:else if items.length === 0}
          <EmptyState icon="database" title="Sin exportaciones" description="No hay exportaciones registradas.">
            <Button
              variant="primary"
              data-testid="backups-empty-create"
              disabled={!online || busy}
              onclick={createBackup}
            >
              Crear exportación
            </Button>
          </EmptyState>
        {:else}
          <ul class="backup-list">
            {#each items as backup (backup.id)}
              <li>
                <button
                  type="button"
                  class:selected={selected?.id === backup.id}
                  onclick={() => (selected = backup)}
                  aria-label={`Ver respaldo ${backup.id}, estado ${backup.status}`}
                  class="backup-item-btn"
                >
                  <div class="backup-item-head">
                    <Badge variant={backup.status === 'READY' ? 'success' : 'muted'}>
                      {backup.status}
                    </Badge>
                    <code>{backup.id}</code>
                  </div>
                  <time class="backup-time">{backup.created_at ?? 'Fecha pendiente'}</time>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <section class="detail-card ledger-card" aria-labelledby="detail-title">
        <div class="card-head">
          <Icon name="shield" size={18} class="icon-accent" />
          <h2 id="detail-title">Detalle y recuperación</h2>
        </div>
        {#if selected}
          <dl class="spec-dl">
            <div><dt>Estado</dt><dd><strong>{selected.status}</strong></dd></div>
            <div><dt>Formato</dt><dd><code>{selected.format_version ?? 'KPBK1'}</code></dd></div>
            <div><dt>Versión de datos</dt><dd><code>{selected.schema_version ?? 'Pendiente'}</code></dd></div>
            <div><dt>Índice</dt><dd><code>{selected.registry_version ?? 'Pendiente'}</code></dd></div>
            <div><dt>Clave de cifrado</dt><dd><code>{selected.kek_version ?? 'Protegida'}</code></dd></div>
            <div><dt>Tamaño cifrado</dt><dd><strong>{selected.plaintext_size_bytes ?? 'Pendiente'} bytes</strong></dd></div>
            <div><dt>Firma de integridad</dt><dd><code class="hash-code">{selected.global_hash ?? 'Pendiente'}</code></dd></div>
          </dl>
          <p class="evidence-text">
            <Icon name="shield" size={14} />
            <span>Cobertura: datos de negocio sincronizados. Exclusiones: sesiones, tokens, secretos y ventas offline pendientes.</span>
          </p>
          {#if role === 'owner'}
            <div class="detail-actions">
              <Button
                variant="primary"
                disabled={!online || busy || selected.status !== 'READY' || !stepUpToken}
                onclick={() => download(selected!)}
                icon="download"
              >
                Descargar respaldo
              </Button>
              <Button
                variant="secondary"
                disabled={!online || busy || selected.status !== 'READY' || !stepUpToken}
                onclick={() => dryRun(selected!)}
                icon="refresh"
              >
                Ejecutar simulación
              </Button>
            </div>
          {/if}
          <p class="recovery-hint">
            La simulación verifica integridad del payload cifrado; no altera datos en producción ni reactiva tokens o secretos.
          </p>
        {:else}
          <EmptyState icon="shield" title="Sin selección" description="Selecciona un respaldo del historial para revisar su detalle de integridad." />
        {/if}
      </section>
    </div>
  {/if}
</main>

<style>
  .backup-shell {
    max-width: 1280px;
    margin: 0 auto;
    padding: 1.5rem 1rem 5rem;
  }

  .masthead {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1.5rem;
    margin-bottom: 1.5rem;
  }

  h1 {
    margin: 0.2rem 0;
    font-size: clamp(1.75rem, 4vw, 2.5rem);
    font-family: var(--font-heading, sans-serif);
    font-weight: 800;
    color: var(--text-main);
  }

  .scope {
    color: var(--text-muted);
    font-size: 0.9rem;
    margin: 0;
  }

  .queue-warning {
    border-left: 4px solid var(--amber-gold);
    margin-bottom: 1.25rem;
  }

  .warning-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .warning-head h2 {
    margin: 0;
    font-size: 1.1rem;
    color: var(--text-main);
  }

  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.5rem;
    margin-bottom: 1.25rem;
    flex-wrap: wrap;
  }

  .action-buttons {
    display: flex;
    gap: 0.75rem;
  }

  .reauth-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .reauth-field label {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
  }

  .reauth-field input {
    padding: var(--inset-field);
    font-size: 0.85rem;
  }

  .operations-grid {
    display: grid;
    grid-template-columns: 1fr 1.35fr;
    gap: 1.25rem;
  }

  .card-head {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    margin-bottom: 1rem;
    padding-bottom: 0.65rem;
    border-bottom: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
  }

  .card-head h2 {
    margin: 0;
    font-size: 1.05rem;
    font-family: var(--font-heading, sans-serif);
    color: var(--text-main);
  }

  .backup-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-height: 26rem;
    overflow-y: auto;
  }

  .backup-item-btn {
    width: 100%;
    text-align: left;
    padding: 0.75rem;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
    border-radius: var(--radius-sm, 8px);
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    transition: all 0.15s ease;
  }

  .backup-item-btn.selected {
    background: rgba(217, 154, 61, 0.12);
    border-color: var(--accent-primary);
  }

  .backup-item-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .backup-time {
    font-size: 0.78rem;
    color: var(--text-muted);
  }

  .spec-dl {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    margin-bottom: 1rem;
  }

  .spec-dl div {
    display: grid;
    grid-template-columns: 10rem 1fr;
    gap: 0.5rem;
    align-items: center;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
    font-size: 0.88rem;
  }

  dt {
    color: var(--text-muted);
    font-size: 0.78rem;
    text-transform: uppercase;
    font-weight: 600;
  }

  dd {
    margin: 0;
    color: var(--text-main);
  }

  .hash-code {
    font-family: var(--font-mono, monospace);
    font-size: 0.78rem;
    word-break: break-all;
    color: var(--accent-primary);
  }

  .evidence-text,
  .recovery-hint {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    font-size: 0.82rem;
    color: var(--text-muted);
    line-height: 1.4;
    margin-bottom: 1rem;
  }

  .detail-actions {
    display: flex;
    gap: 0.75rem;
    margin-bottom: 0.85rem;
    flex-wrap: wrap;
  }

  button,
  input {
    min-height: 44px;
    min-width: 44px;
  }

  @media (max-width: 800px) {
    .operations-grid {
      grid-template-columns: 1fr;
    }
    .masthead {
      flex-direction: column;
      align-items: flex-start;
    }
  }

  @media (max-width: 375px) {
    .backup-shell {
      padding-inline: 0.5rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      scroll-behavior: auto !important;
      transition: none !important;
      animation: none !important;
    }
  }
</style>
