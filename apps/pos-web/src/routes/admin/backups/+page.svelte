<script lang="ts">
  import { onMount } from 'svelte';
  import {
    backupOfflineWarning,
    createDataBackupClient,
    isDataBackupEnabled,
    type BackupSummary,
  } from '$lib/data-backup-client';
  import { readAdminAuthenticatedSession } from '$lib/admin/authenticated-session';
  import Icon from '$lib/ui/Icon.svelte';

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

  onMount(() => {
    authenticatedFetch = readAdminAuthenticatedSession()?.authenticatedFetch ?? null;
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
    if (enabled) void refresh();
    else loading = false;
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
      <div class="badge-tag">
        <Icon name="download" size={14} />
        <span>Admin · Operaciones de datos</span>
      </div>
      <h1 id="backup-title">Respaldos cifrados verificables</h1>
      <p class="scope">
        Incluye únicamente datos sincronizados del servidor y evidencia R2 referenciada. No incluye datos locales ni secretos.
      </p>
    </div>
    <div class:offline={!online} class="connection" role="status">
      <Icon name={online ? 'wifi' : 'wifi-off'} size={16} />
      <span>{online ? 'En línea · exportaciones habilitadas' : 'Sin conexión · historial en caché'}</span>
    </div>
  </header>

  {#if !enabled}
    <div class="alert-box alert-off" role="alert">
      <Icon name="alert" size={18} />
      <span>La función de respaldos está desactivada para este negocio.</span>
    </div>
  {:else}
    {#if warning.visible}
      <div class="queue-warning glass-card">
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

    <div class="toolbar glass-card">
      <div class="action-buttons">
        <button type="button" class="btn-primary" disabled={!online || busy} onclick={createBackup}>
          <Icon name="download" size={16} />
          <span>Crear exportación</span>
        </button>
        <button type="button" class="btn-secondary" disabled={!online || busy} onclick={refresh}>
          <Icon name="refresh" size={16} />
          <span>Actualizar historial</span>
        </button>
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
        </div>
      {/if}
    </div>

    <p class="status-msg live" aria-live="polite">
      {loading ? 'Cargando historial…' : notice || `${items.length} respaldos disponibles.`}
    </p>
    {#if error}<p role="alert" class="alert-box alert-error">{error}</p>{/if}

    <div class="operations-grid">
      <section class="history-card glass-card" aria-labelledby="history-title">
        <div class="card-head">
          <Icon name="clock" size={18} class="icon-accent" />
          <h2 id="history-title">Historial y progreso ({items.length})</h2>
        </div>
        {#if items.length === 0 && !loading}
          <p>No hay exportaciones registradas.</p>
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
                    <span class="status-pill" class:ready={backup.status === 'READY'}>
                      {backup.status}
                    </span>
                    <code>{backup.id}</code>
                  </div>
                  <time class="backup-time">{backup.created_at ?? 'Fecha pendiente'}</time>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <section class="detail-card glass-card" aria-labelledby="detail-title">
        <div class="card-head">
          <Icon name="shield" size={18} class="icon-accent" />
          <h2 id="detail-title">Detalle y recuperación</h2>
        </div>
        {#if selected}
          <dl class="spec-dl">
            <div><dt>Estado</dt><dd><strong>{selected.status}</strong></dd></div>
            <div><dt>Formato</dt><dd><code>{selected.format_version ?? 'KPBK1'}</code></dd></div>
            <div><dt>Schema</dt><dd><code>{selected.schema_version ?? 'Pendiente'}</code></dd></div>
            <div><dt>Registry</dt><dd><code>{selected.registry_version ?? 'Pendiente'}</code></dd></div>
            <div><dt>Clave KEK</dt><dd><code>{selected.kek_version ?? 'Protegida'}</code></dd></div>
            <div><dt>Tamaño cifrado</dt><dd><strong>{selected.plaintext_size_bytes ?? 'Pendiente'} bytes</strong></dd></div>
            <div><dt>Hash global SHA-256</dt><dd><code class="hash-code">{selected.global_hash ?? 'Pendiente'}</code></dd></div>
          </dl>
          <p class="evidence-text">
            <Icon name="shield" size={14} />
            <span>Cobertura: datos de negocio sincronizados. Exclusiones: sesiones, tokens, secretos y ventas offline pendientes.</span>
          </p>
          {#if role === 'owner'}
            <div class="detail-actions">
              <button
                type="button"
                class="btn-primary"
                disabled={!online || busy || selected.status !== 'READY' || !stepUpToken}
                onclick={() => download(selected!)}
              >
                <Icon name="download" size={16} />
                <span>Descargar KPBK1</span>
              </button>
              <button
                type="button"
                class="btn-secondary"
                disabled={!online || busy || selected.status !== 'READY' || !stepUpToken}
                onclick={() => dryRun(selected!)}
              >
                <Icon name="refresh" size={16} />
                <span>Ejecutar simulación</span>
              </button>
            </div>
          {/if}
          <p class="recovery-hint">
            La simulación verifica integridad del payload cifrado; no altera datos en producción ni reactiva tokens o secretos.
          </p>
        {:else}
          <p class="empty">Selecciona un respaldo del historial para revisar su detalle de integridad.</p>
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

  .badge-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.25rem 0.65rem;
    background: rgba(99, 102, 241, 0.12);
    border: 1px solid rgba(99, 102, 241, 0.3);
    border-radius: var(--radius-full, 9999px);
    color: var(--accent-primary, #6366f1);
    font: 600 0.72rem/1.2 var(--font-mono, monospace);
    letter-spacing: 0.05em;
    text-transform: uppercase;
    margin-bottom: 0.5rem;
  }

  h1 {
    margin: 0.2rem 0;
    font-size: clamp(1.75rem, 4vw, 2.5rem);
    font-family: var(--font-heading, sans-serif);
    font-weight: 800;
    color: var(--text-main, #f8fafc);
  }

  .scope {
    color: var(--text-muted, #94a3b8);
    font-size: 0.9rem;
    margin: 0;
  }

  .connection {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 0.9rem;
    border: 1px solid var(--emerald-green, #10b981);
    background: rgba(16, 185, 129, 0.1);
    color: var(--emerald-green, #10b981);
    border-radius: var(--radius-md, 12px);
    font-size: 0.82rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .connection.offline {
    color: var(--rose-red, #f43f5e);
    border-color: var(--rose-red, #f43f5e);
    background: rgba(244, 63, 94, 0.1);
  }

  .glass-card {
    background: var(--bg-glass-card, rgba(30, 41, 59, 0.65));
    border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
    border-radius: var(--radius-md, 12px);
    padding: 1.25rem;
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
  }

  .queue-warning {
    border-left: 4px solid var(--amber-gold, #f59e0b);
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
    color: var(--text-main, #f8fafc);
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
    color: var(--text-muted, #94a3b8);
    text-transform: uppercase;
  }

  .reauth-field input {
    padding: 0.45rem 0.75rem;
    font-size: 0.85rem;
  }

  .btn-primary {
    background: var(--accent-gradient, #6366f1);
    color: #ffffff;
    border: none;
    padding: 0.65rem 1.25rem;
    border-radius: var(--radius-sm, 8px);
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .btn-secondary {
    background: var(--bg-button-sec, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
    color: var(--text-main, #f8fafc);
    padding: 0.65rem 1.25rem;
    border-radius: var(--radius-sm, 8px);
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .alert-box {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0.85rem 1.1rem;
    border-radius: var(--radius-md, 12px);
    font-size: 0.88rem;
    font-weight: 600;
    margin-bottom: 1.25rem;
  }

  .alert-error {
    background: rgba(244, 63, 94, 0.1);
    border: 1px solid var(--rose-red, #f43f5e);
    color: var(--rose-red, #f43f5e);
  }

  .alert-success {
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid var(--emerald-green, #10b981);
    color: var(--emerald-green, #10b981);
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
    color: var(--text-main, #f8fafc);
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
    background: rgba(99, 102, 241, 0.15);
    border-color: var(--accent-primary, #6366f1);
  }

  .backup-item-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .status-pill {
    padding: 0.15rem 0.45rem;
    border-radius: 4px;
    font: 700 0.7rem/1 var(--font-mono, monospace);
    background: rgba(245, 158, 11, 0.15);
    color: var(--amber-gold, #f59e0b);
  }

  .status-pill.ready {
    background: rgba(16, 185, 129, 0.15);
    color: var(--emerald-green, #10b981);
  }

  .backup-time {
    font-size: 0.78rem;
    color: var(--text-muted, #94a3b8);
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
    color: var(--text-muted, #94a3b8);
    font-size: 0.78rem;
    text-transform: uppercase;
    font-weight: 600;
  }

  dd {
    margin: 0;
    color: var(--text-main, #f8fafc);
  }

  .hash-code {
    font-family: var(--font-mono, monospace);
    font-size: 0.78rem;
    word-break: break-all;
    color: var(--accent-primary, #6366f1);
  }

  .evidence-text,
  .recovery-hint {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    font-size: 0.82rem;
    color: var(--text-muted, #94a3b8);
    line-height: 1.4;
    margin-bottom: 1rem;
  }

  .detail-actions {
    display: flex;
    gap: 0.75rem;
    margin-bottom: 0.85rem;
    flex-wrap: wrap;
  }

  .empty {
    color: var(--text-muted, #94a3b8);
    font-size: 0.88rem;
    text-align: center;
    padding: 2rem 1rem;
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
