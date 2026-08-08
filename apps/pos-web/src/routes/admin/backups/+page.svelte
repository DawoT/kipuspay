<script lang="ts">
  import { onMount } from 'svelte';
  import {
    backupOfflineWarning,
    createDataBackupClient,
    isDataBackupEnabled,
    type BackupSummary,
  } from '$lib/data-backup-client';
  import { readAdminAuthenticatedSession } from '$lib/admin/authenticated-session';

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

<section class="workbench" aria-labelledby="backup-title">
  <header>
    <div>
      <p class="eyebrow">Admin · Operaciones de datos</p>
      <h1 id="backup-title">Respaldos verificables</h1>
      <p class="scope">
        Incluye únicamente datos sincronizados del servidor y evidencia R2 referenciada. No incluye
        datos locales ni secretos.
      </p>
    </div>
    <span class:offline={!online} class="network">
      {online ? 'En línea · operaciones habilitadas' : 'Sin conexión · historial solamente'}
    </span>
  </header>

  {#if !enabled}
    <p role="alert" class="alert">La función de respaldos está desactivada para este negocio.</p>
  {:else}
    <section class="queue-warning" class:visible={warning.visible} aria-labelledby="queue-title">
      <h2 id="queue-title">Cobertura antes de exportar</h2>
      <p>
        <strong>{pendingOfflineSales} ventas offline pendientes</strong> en este navegador no están
        incluidas. Sincronízalas antes de crear el respaldo si deseas incorporarlas.
      </p>
      <p>La venta, el cobro y el cierre Z permanecen disponibles.</p>
    </section>

    <div class="toolbar" aria-label="Acciones de respaldo">
      <button type="button" disabled={!online || busy} onclick={createBackup}>
        Crear exportación
      </button>
      <button type="button" disabled={!online || busy} onclick={refresh}>Actualizar historial</button>
      {#if role === 'owner'}
        <label class="reauth">
          Token de reautenticación reciente
          <input
            type="password"
            autocomplete="off"
            bind:value={stepUpToken}
            placeholder="Solo en memoria"
          />
        </label>
      {/if}
    </div>

    <p class="live" aria-live="polite">
      {loading ? 'Cargando historial…' : notice || `${items.length} respaldos disponibles.`}
    </p>
    {#if error}<p role="alert" class="alert">{error}</p>{/if}

    <div class="operations">
      <section class="history" aria-labelledby="history-title">
        <h2 id="history-title">Historial y progreso</h2>
        {#if items.length === 0 && !loading}
          <p>No hay exportaciones registradas.</p>
        {:else}
          <ul>
            {#each items as backup (backup.id)}
              <li>
                <button
                  type="button"
                  class:selected={selected?.id === backup.id}
                  onclick={() => (selected = backup)}
                  aria-label={`Ver respaldo ${backup.id}, estado ${backup.status}`}
                >
                  <span class="status-text">{backup.status}</span>
                  <code>{backup.id}</code>
                  <time>{backup.created_at ?? 'Fecha pendiente'}</time>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <section class="detail" aria-labelledby="detail-title">
        <h2 id="detail-title">Detalle y recuperación</h2>
        {#if selected}
          <dl>
            <div><dt>Estado</dt><dd>{selected.status}</dd></div>
            <div><dt>Formato</dt><dd>{selected.format_version ?? 'KPBK1'}</dd></div>
            <div><dt>Schema</dt><dd>{selected.schema_version ?? 'Pendiente'}</dd></div>
            <div><dt>Registry</dt><dd>{selected.registry_version ?? 'Pendiente'}</dd></div>
            <div><dt>Versión de clave</dt><dd>{selected.kek_version ?? 'Protegida'}</dd></div>
            <div><dt>Tamaño</dt><dd>{selected.plaintext_size_bytes ?? 'Pendiente'} bytes</dd></div>
            <div><dt>Hash global</dt><dd class="hash">{selected.global_hash ?? 'Pendiente'}</dd></div>
          </dl>
          <p class="evidence">
            Cobertura: datos BUSINESS sincronizados. Exclusiones: sesiones, tokens, secretos, datos
            derivados y ventas offline pendientes. Objetos: solo evidencia referenciada.
          </p>
          <div class="detail-actions">
            <button
              type="button"
              disabled={!online || busy || selected.status !== 'READY'}
              onclick={() => download(selected!)}
            >
              Descargar KPBK1
            </button>
            {#if role === 'owner'}
              <button
                type="button"
                disabled={!online || busy || selected.status !== 'READY' || !stepUpToken}
                onclick={() => dryRun(selected!)}
              >
                Ejecutar simulación
              </button>
            {/if}
          </div>
          <p class="recovery">
            La simulación verifica integridad y compatibilidad; no restaura, no bloquea producción y
            no revive sesiones, tokens ni secretos.
          </p>
        {:else}
          <p>Selecciona un respaldo para revisar su evidencia.</p>
        {/if}
      </section>
    </div>
  {/if}
</section>

<style>
  .workbench {
    max-width: 72rem;
    padding: 1rem;
    overflow-wrap: anywhere;
  }
  header,
  .toolbar,
  .detail-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
    justify-content: space-between;
  }
  .eyebrow,
  .status-text,
  dt {
    font: 700 0.75rem/1.3 ui-monospace, monospace;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .scope,
  .evidence,
  .recovery {
    color: #aab5c2;
  }
  .network,
  .queue-warning,
  .alert,
  .live {
    border: 1px solid #526172;
    padding: 0.75rem;
  }
  .network.offline,
  .alert {
    border-color: #d96a3c;
  }
  .queue-warning {
    border-left: 4px solid #d99a3d;
  }
  button,
  input {
    min-height: 44px;
    min-width: 44px;
    padding: 0.65rem 0.9rem;
    font: inherit;
  }
  button:focus-visible,
  input:focus-visible {
    outline: 3px solid #d99a3d;
    outline-offset: 2px;
  }
  button:disabled {
    opacity: 0.55;
  }
  .reauth {
    display: grid;
    gap: 0.25rem;
    font-weight: 700;
  }
  .reauth input {
    border: 1px solid #718096;
    background: #0f141b;
    color: inherit;
  }
  .operations {
    display: grid;
    grid-template-columns: minmax(16rem, 0.8fr) minmax(0, 1.4fr);
    gap: 1rem;
  }
  .history,
  .detail {
    border: 1px solid #526172;
    padding: 0.85rem;
    min-width: 0;
  }
  ul {
    list-style: none;
    padding: 0;
  }
  li button {
    width: 100%;
    display: grid;
    gap: 0.25rem;
    text-align: left;
    border: 0;
    border-bottom: 1px solid #526172;
    background: transparent;
  }
  li button.selected {
    border-left: 4px solid #d99a3d;
    background: #171e27;
  }
  dl div {
    display: grid;
    grid-template-columns: 9rem minmax(0, 1fr);
    gap: 0.5rem;
    border-bottom: 1px solid #354151;
    padding: 0.45rem 0;
  }
  dd {
    margin: 0;
  }
  .hash,
  code {
    font-family: ui-monospace, monospace;
    word-break: break-all;
  }
  @media (max-width: 700px) {
    .operations {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 375px) {
    .workbench {
      padding: 0.6rem;
      max-width: 100%;
      overflow-x: hidden;
    }
    header,
    .toolbar,
    .detail-actions {
      align-items: stretch;
      flex-direction: column;
    }
    dl div {
      grid-template-columns: 1fr;
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
