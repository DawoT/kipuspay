<script lang="ts">
  import { isLedgerChartOfAccountsEnabled } from '$lib/features';
  import Icon from '$lib/ui/Icon.svelte';

  const journalOn = isLedgerChartOfAccountsEnabled();
  let fromDate = $state('2026-08-01');
  let toDate = $state('2026-08-07');
  let branchId = $state('b1');
  let rows = $state<Record<string, unknown>[]>([]);
  let message = $state('');
  let mutateMsg = $state('');

  const apiBase = () =>
    (import.meta.env.PUBLIC_API_BASE as string | undefined)?.replace(/\/$/, '') ||
    'https://api.kipuspay.local';
  const auth = () => (import.meta.env.PUBLIC_DEV_AUTH as string | undefined) ?? 'Bearer demo';

  async function loadJournal() {
    message = '';
    const qs = new URLSearchParams({ fromDate, toDate, branchId });
    const res = await fetch(`${apiBase()}/api/ledger/journal?${qs.toString()}`, {
      headers: { authorization: auth() },
    });
    const json = (await res.json()) as { items?: Record<string, unknown>[]; error?: string };
    if (!res.ok) {
      message = json.error ?? `Error ${res.status}`;
      rows = [];
      return;
    }
    rows = json.items ?? [];
  }

  async function tryMutate() {
    mutateMsg = '';
    const res = await fetch(`${apiBase()}/api/ledger/journal`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth() },
      body: '{}',
    });
    const json = (await res.json()) as { code?: string; error?: string };
    mutateMsg = json.code ?? json.error ?? String(res.status);
  }
</script>

<svelte:head><title>Diario · KipusPay</title></svelte:head>

<main class="journal-shell" data-testid="admin-diario">
  <header class="masthead">
    <div class="badge-tag">
      <Icon name="file-text" size={14} />
      <span>Contabilidad · Auditoría Ledger</span>
    </div>
    <h1>Diario contable</h1>
    <p class="lede">Solo lectura. Los asientos nacen con la venta, el cobro, el apartado y el arqueo.</p>
  </header>

  {#if !journalOn}
    <div class="alert-box alert-off" data-testid="admin-diario-off">
      <Icon name="alert" size={18} />
      <span>PUBLIC_FEATURE_LEDGER_CHART_OF_ACCOUNTS desactivado.</span>
    </div>
  {:else}
    <div class="journal-workbench glass-card">
      <div class="filter-grid">
        <div class="field">
          <label for="from-date">
            <Icon name="clock" size={14} />
            <span>Desde</span>
          </label>
          <input id="from-date" bind:value={fromDate} data-testid="journal-from" type="date" />
        </div>

        <div class="field">
          <label for="to-date">
            <Icon name="clock" size={14} />
            <span>Hasta</span>
          </label>
          <input id="to-date" bind:value={toDate} data-testid="journal-to" type="date" />
        </div>

        <div class="field">
          <label for="branch-id">
            <Icon name="building" size={14} />
            <span>Sucursal</span>
          </label>
          <input id="branch-id" bind:value={branchId} data-testid="journal-branch" placeholder="b1" />
        </div>
      </div>

      <div class="actions">
        <button type="button" class="btn-primary" data-testid="journal-load" onclick={() => void loadJournal()}>
          <Icon name="search" size={16} />
          <span>Leer Asientos</span>
        </button>
        <button type="button" class="btn-secondary" data-testid="journal-mutate" onclick={() => void tryMutate()}>
          <Icon name="lock" size={16} />
          <span>Intentar mutar (Prueba de inmutabilidad)</span>
        </button>
      </div>

      {#if message}
        <div class="message-banner" data-testid="journal-msg">
          <Icon name="alert" size={16} />
          <span>{message}</span>
        </div>
      {/if}
      {#if mutateMsg}
        <div class="message-banner mutate-banner" data-testid="journal-mutate-msg">
          <Icon name="shield" size={16} />
          <span>Respuesta de inmutabilidad: {mutateMsg}</span>
        </div>
      {/if}

      <div class="table-container">
        <div class="table-head">
          <span>Registros en memoria: <strong>{rows.length}</strong></span>
        </div>
        <pre class="json-viewer" data-testid="journal-rows">{JSON.stringify(rows, null, 2)}</pre>
      </div>
    </div>
  {/if}
</main>

<style>
  .journal-shell {
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
    background: rgba(217, 154, 61, 0.12);
    border: 1px solid rgba(217, 154, 61, 0.3);
    border-radius: var(--radius-full, 9999px);
    color: var(--accent-primary);
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

  .filter-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
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

  .actions {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-bottom: 1.25rem;
  }

  .btn-primary {
    background: var(--accent-gradient, var(--accent-primary));
    color: #ffffff;
    border: none;
    padding: 0.65rem 1.25rem;
    border-radius: var(--radius-sm, 8px);
    font-weight: 700;
    cursor: pointer;
  }

  .btn-secondary {
    background: var(--bg-button-sec, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
    color: var(--text-main, #f8fafc);
    padding: 0.65rem 1.25rem;
    border-radius: var(--radius-sm, 8px);
    font-weight: 600;
    cursor: pointer;
  }

  .message-banner {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid var(--amber-gold, #f59e0b);
    color: var(--amber-gold, #f59e0b);
    border-radius: var(--radius-sm, 8px);
    font-size: 0.88rem;
    margin-bottom: 1rem;
  }

  .mutate-banner {
    background: rgba(217, 154, 61, 0.1);
    border-color: var(--accent-primary);
    color: var(--accent-primary);
  }

  .table-container {
    background: var(--bg-input);
    border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
    border-radius: var(--radius-sm, 8px);
    overflow: hidden;
  }

  .table-head {
    padding: 0.65rem 1rem;
    background: var(--bg-glass);
    border-bottom: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
    font-size: 0.82rem;
    color: var(--text-muted, #94a3b8);
  }

  .json-viewer {
    padding: 1rem;
    margin: 0;
    font-family: var(--font-mono, monospace);
    font-size: 0.85rem;
    color: var(--text-main, #f8fafc);
    overflow-x: auto;
    max-height: 24rem;
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
</style>
