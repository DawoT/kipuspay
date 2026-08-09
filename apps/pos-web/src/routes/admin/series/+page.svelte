<script lang="ts">
  import { isInventorySerialsEnabled } from '$lib/features';
  import Icon from '$lib/ui/Icon.svelte';

  const serialsOn = isInventorySerialsEnabled();
  let serialNumber = $state('');
  let terminalId = $state('');
  let disposition = $state('RETURN_TO_STOCK');
  let items = $state<Array<Record<string, unknown>>>([]);
  let selectedSerialId = $state('');
  let leaseToken = $state('');
  let message = $state('');

  const apiBase = () =>
    (import.meta.env.PUBLIC_API_BASE as string | undefined)?.replace(/\/$/, '') ||
    'https://api.kipuspay.local';
  const auth = () => (import.meta.env.PUBLIC_DEV_AUTH as string | undefined) ?? 'Bearer demo';

  function headers(): Record<string, string> {
    return {
      'content-type': 'application/json',
      authorization: auth(),
      'x-terminal-id': terminalId.trim(),
    };
  }

  async function search() {
    message = '';
    const query = new URLSearchParams({ serialNumber: serialNumber.trim() });
    const response = await fetch(`${apiBase()}/api/inventory/serials?${query}`, {
      headers: { authorization: auth() },
    });
    const body = (await response.json()) as {
      items?: Array<Record<string, unknown>>;
      error?: string;
      action?: string;
    };
    items = response.ok ? (body.items ?? []) : [];
    message = response.ok
      ? `${items.length} serie(s) encontrada(s).`
      : [body.error, body.action].filter(Boolean).join(' ');
  }

  async function acquireLease() {
    const response = await fetch(`${apiBase()}/api/inventory/serials/leases`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        serialId: selectedSerialId,
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    const body = (await response.json()) as {
      leaseToken?: string;
      error?: string;
      action?: string;
    };
    leaseToken = response.ok ? (body.leaseToken ?? '') : '';
    message = response.ok
      ? 'Lease exclusivo adquirido para este terminal.'
      : [body.error, body.action].filter(Boolean).join(' ');
  }

  async function dispose() {
    const response = await fetch(`${apiBase()}/api/inventory/serials/disposition`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ serialId: selectedSerialId, disposition }),
    });
    const body = (await response.json()) as { status?: string; error?: string; action?: string };
    message = response.ok
      ? `Disposición confirmada por servidor: ${body.status ?? disposition}.`
      : [body.error, body.action].filter(Boolean).join(' ');
    if (response.ok) await search();
  }

  function scannerKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void search();
  }
</script>

<svelte:head><title>Series · KipusPay</title></svelte:head>

<main class="serial-shell" data-testid="admin-serials">
  <header class="masthead">
    <div class="badge-tag">
      <Icon name="barcode" size={14} />
      <span>Inventario · Identidad Física</span>
    </div>
    <h1>Buscar, reservar y disponer series</h1>
    <p class="lede">Escanea con lector de código de barras o teclado y Enter. El servidor decide estado, tenant y transición.</p>
  </header>

  {#if !serialsOn}
    <div class="alert-box alert-off">
      <Icon name="alert" size={18} />
      <span>PUBLIC_FEATURE_INVENTORY_SERIALS desactivado.</span>
    </div>
  {:else}
    <div class="workbench glass-card">
      <form onsubmit={(event) => { event.preventDefault(); void search(); }} class="scan-form">
        <div class="field search-field">
          <label for="serial-scan">
            <Icon name="barcode" size={14} />
            <span>Número de Serie / IMEI</span>
          </label>
          <div class="input-with-icon">
            <Icon name="search" size={18} class="input-icon" />
            <input
              id="serial-scan"
              bind:value={serialNumber}
              onkeydown={scannerKeydown}
              placeholder="Escanea o escribe el número de serie..."
              autocomplete="off"
            />
          </div>
        </div>

        <div class="field">
          <label for="terminal-id">
            <Icon name="shield" size={14} />
            <span>ID de Terminal Pos</span>
          </label>
          <input id="terminal-id" bind:value={terminalId} placeholder="pos-term-01" />
        </div>

        <button type="submit" class="btn-primary">
          <Icon name="search" size={16} />
          <span>Buscar Serie</span>
        </button>
      </form>

      {#if message}
        <div class="message-banner">
          <Icon name="check" size={16} />
          <span>{message}</span>
        </div>
      {/if}

      {#if items.length > 0}
        <div class="results-grid">
          <div class="field">
            <label for="serial-select">Selecciona una serie</label>
            <select id="serial-select" bind:value={selectedSerialId}>
              <option value="">-- Elige serie --</option>
              {#each items as item}
                <option value={String(item.id ?? item.serialId)}>
                  {String(item.serialNumber ?? item.id)} ({String(item.status ?? 'UNKNOWN')})
                </option>
              {/each}
            </select>
          </div>

          {#if selectedSerialId}
            <div class="lease-actions">
              <button type="button" class="btn-secondary" onclick={() => void acquireLease()}>
                <Icon name="lock" size={16} />
                <span>Adquirir Lease Exclusivo</span>
              </button>

              <div class="disposition-group">
                <select bind:value={disposition}>
                  <option value="RETURN_TO_STOCK">Devolver a stock</option>
                  <option value="SCRAPPED">Dar de baja (Scrap)</option>
                  <option value="RMA_SUPPLIER">RMA a proveedor</option>
                </select>
                <button type="button" class="btn-primary-sm" onclick={() => void dispose()}>
                  <span>Confirmar Disposición</span>
                </button>
              </div>
            </div>
          {/if}

          {#if leaseToken}
            <div class="lease-token-box">
              <Icon name="key" size={16} />
              <span>Lease activo: <code>{leaseToken}</code></span>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</main>

<style>
  .serial-shell {
    max-width: 1280px;
    margin: 0 auto;
    padding: 1.5rem 1rem 5rem;
  }

  .masthead {
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

  .lede {
    color: var(--text-muted, #94a3b8);
    font-size: 0.92rem;
    margin: 0;
  }

  .glass-card {
    background: var(--bg-glass-card, rgba(30, 41, 59, 0.65));
    border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
    border-radius: var(--radius-md, 12px);
    padding: 1.5rem;
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
  }

  .scan-form {
    display: grid;
    grid-template-columns: 1.5fr 1fr auto;
    gap: 1rem;
    align-items: end;
    margin-bottom: 1.25rem;
  }

  .field label {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-muted, #94a3b8);
    margin-bottom: 0.35rem;
    text-transform: uppercase;
  }

  .input-with-icon {
    position: relative;
  }

  .input-with-icon :global(.input-icon) {
    position: absolute;
    left: 0.8rem;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-muted, #94a3b8);
  }

  .input-with-icon input {
    padding-left: 2.5rem;
  }

  .btn-primary,
  .btn-primary-sm,
  .btn-secondary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    padding: 0.65rem 1.25rem;
    border-radius: var(--radius-sm, 8px);
    font-weight: 700;
    cursor: pointer;
    border: none;
  }

  .btn-primary {
    background: var(--accent-gradient, #6366f1);
    color: #ffffff;
  }

  .btn-primary-sm {
    background: var(--accent-primary, #6366f1);
    color: #ffffff;
  }

  .btn-secondary {
    background: var(--bg-button-sec, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
    color: var(--text-main, #f8fafc);
  }

  .message-banner {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid var(--emerald-green, #10b981);
    color: var(--emerald-green, #10b981);
    border-radius: var(--radius-sm, 8px);
    font-size: 0.88rem;
    margin-bottom: 1rem;
  }

  .results-grid {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
  }

  .disposition-group {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .lease-token-box {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background: rgba(99, 102, 241, 0.1);
    border: 1px solid rgba(99, 102, 241, 0.3);
    border-radius: var(--radius-sm, 8px);
    font-size: 0.85rem;
    color: var(--accent-primary, #6366f1);
  }

  .alert-box {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 1rem;
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid var(--amber-gold, #f59e0b);
    color: var(--amber-gold, #f59e0b);
    border-radius: var(--radius-md, 12px);
    font-weight: 600;
  }

  @media (max-width: 768px) {
    .scan-form {
      grid-template-columns: 1fr;
    }
  }
</style>
