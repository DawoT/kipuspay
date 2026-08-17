<script lang="ts">
  import { isLedgerChartOfAccountsEnabled } from '$lib/features';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import { formatCents } from '$lib/cents';
  import { apiFetch } from '$lib/auth/api-client';

  const journalOn = isLedgerChartOfAccountsEnabled();
  let fromDate = $state('2026-08-01');
  let toDate = $state('2026-08-07');
  let branchId = $state('b1');
  let rows = $state<Record<string, unknown>[]>([]);
  let message = $state('');
  let mutateMsg = $state('');

  async function loadJournal() {
    message = '';
    const qs = new URLSearchParams({ fromDate, toDate, branchId });
    const res = await apiFetch(`/api/ledger/journal?${qs.toString()}`, {
      storage: localStorage,
    });
    const json = (await res.json()) as { items?: Record<string, unknown>[]; error?: string };
    if (!res.ok) {
      message = json.error ?? `Error ${res.status}`;
      rows = [];
      return;
    }
    rows = json.items ?? [];
  }

  function journalLine(row: Record<string, unknown>, index: number): string {
    const memo = typeof row.memo === 'string' && row.memo.trim() ? row.memo.trim() : '';
    const account =
      typeof row.account_code === 'string'
        ? row.account_code
        : typeof row.account_id === 'string'
          ? row.account_id
          : '';
    const debit = typeof row.debit_cents === 'number' ? row.debit_cents : null;
    const credit = typeof row.credit_cents === 'number' ? row.credit_cents : null;
    const parts = [`Asiento ${index + 1}`];
    if (account) parts.push(account);
    if (memo) parts.push(memo);
    if (debit != null && debit > 0) parts.push(`cargo ${formatCents(debit)}`);
    if (credit != null && credit > 0) parts.push(`abono ${formatCents(credit)}`);
    return parts.join(' · ');
  }

  async function tryMutate() {
    mutateMsg = '';
    const res = await apiFetch('/api/ledger/journal', {
      method: 'POST',
      storage: localStorage,
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const json = (await res.json()) as { code?: string; error?: string };
    mutateMsg = json.code === 'JOURNAL_IMMUTABLE' || json.code === 'METHOD_NOT_ALLOWED'
      ? 'El diario no se puede modificar'
      : (json.error ?? 'No se pudo comprobar');
  }
</script>

<svelte:head><title>Diario · KipusPay</title></svelte:head>

<div class="page-shell" data-testid="admin-diario">
  <div class="page-masthead">
    <div>
      <p class="page-eyebrow"><Icon name="file-text" size={12} /> Contabilidad · Auditoría</p>
      <h1 class="page-title">Diario contable</h1>
      <p class="page-lede">Solo lectura. Los asientos nacen con la venta, el cobro, el apartado y el arqueo.</p>
    </div>
  </div>

  {#if !journalOn}
    <div class="alert-box alert-off" data-testid="admin-diario-off">
      <Icon name="alert" size={18} />
      <span>El diario contable no está activo para este negocio.</span>
    </div>
  {:else}
    <div class="journal-workbench ledger-card">
      <div class="filter-grid field-group">
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
          <input id="branch-id" bind:value={branchId} data-testid="journal-branch" placeholder="Sucursal" />
        </div>
      </div>

      <div class="actions btn-row">
        <Button variant="primary" data-testid="journal-load" onclick={() =>
          void loadJournal()}>
          <Icon name="search" size={16} />
          Leer Asientos
        </Button>
        <Button variant="secondary" data-testid="journal-mutate" onclick={() =>
          void tryMutate()}>
          <Icon name="lock" size={16} />
          Intentar mutar (Prueba de inmutabilidad)
        </Button>
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

      <div class="table-container" data-testid="journal-rows">
        <div class="table-head">
          <span>Registros: <strong>{rows.length}</strong></span>
        </div>
        {#if rows.length === 0}
          <EmptyState title="Sin asientos" description="Elige un rango y lee el diario." />
        {:else}
          <ul class="item-list">
            {#each rows as row, i}
              <li class="item-row">
                <span>{journalLine(row, i)}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
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
    color: var(--text-muted);
    margin-bottom: 0.35rem;
    text-transform: uppercase;
  }

  .actions {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-bottom: 1.25rem;
  }

  .message-banner {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid var(--amber-gold);
    color: var(--amber-gold);
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
    color: var(--text-muted);
  }

  .item-list {
    list-style: none;
    margin: 0;
    padding: 0.75rem 1rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .item-row {
    font-size: 0.9rem;
    color: var(--text-main);
  }

  .alert-box {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 1rem;
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid var(--amber-gold);
    color: var(--amber-gold);
    border-radius: var(--radius-md, 12px);
    font-weight: 600;
  }
</style>
