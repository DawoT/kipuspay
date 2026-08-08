<script lang="ts">
  import { isLedgerChartOfAccountsEnabled } from '$lib/features';

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

<section data-testid="admin-diario">
  <h1>Diario contable</h1>
  <p>Solo lectura. Los asientos nacen con la venta, el cobro, el apartado y el arqueo.</p>

  {#if !journalOn}
    <p data-testid="admin-diario-off">PUBLIC_FEATURE_LEDGER_CHART_OF_ACCOUNTS desactivado.</p>
  {:else}
    <label>
      Desde
      <input bind:value={fromDate} data-testid="journal-from" />
    </label>
    <label>
      Hasta
      <input bind:value={toDate} data-testid="journal-to" />
    </label>
    <label>
      Sucursal
      <input bind:value={branchId} data-testid="journal-branch" />
    </label>
    <button type="button" data-testid="journal-load" onclick={() => void loadJournal()}>Leer</button>
    <button type="button" data-testid="journal-mutate" onclick={() => void tryMutate()}
      >Intentar mutar</button
    >
    {#if message}
      <p data-testid="journal-msg">{message}</p>
    {/if}
    {#if mutateMsg}
      <p data-testid="journal-mutate-msg">{mutateMsg}</p>
    {/if}
    <pre data-testid="journal-rows">{JSON.stringify(rows, null, 2)}</pre>
  {/if}
</section>
