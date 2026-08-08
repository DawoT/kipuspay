<script lang="ts">
  import { isInventorySerialsEnabled } from '$lib/features';

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
  <header>
    <p class="eyebrow">Inventario · Identidad física</p>
    <h1>Buscar, reservar y disponer series</h1>
    <p>Escanea con teclado y Enter. El servidor decide estado, tenant y transición.</p>
  </header>

  {#if !serialsOn}
    <p class="notice">PUBLIC_FEATURE_INVENTORY_SERIALS desactivado.</p>
  {:else}
    <form onsubmit={(event) => { event.preventDefault(); void search(); }}>
      <label for="serial-scan">Número de serie</label>
      <input
        id="serial-scan"
        bind:value={serialNumber}
        onkeydown={scannerKeydown}
        autocomplete="off"
        autocapitalize="characters"
        placeholder="Escanea y presiona Enter"
      />
      <button type="submit">Buscar serie</button>
    </form>

    <label for="terminal-id">Terminal</label>
    <input id="terminal-id" bind:value={terminalId} placeholder="terminal_id registrado" />

    {#if items.length > 0}
      <fieldset>
        <legend>Resultado tenant-scoped</legend>
        {#each items as item}
          <label class="result">
            <input
              type="radio"
              name="serial-result"
              value={String(item.serial_id ?? '')}
              bind:group={selectedSerialId}
            />
            <span>
              <strong>{String(item.serial_number ?? '')}</strong>
              · {String(item.status ?? '')} · producto {String(item.product_id ?? '')}
            </span>
          </label>
        {/each}
      </fieldset>
      <div class="actions">
        <button type="button" disabled={!selectedSerialId || !terminalId.trim()} onclick={acquireLease}>
          Adquirir lease
        </button>
        <label for="disposition">Disposición</label>
        <select id="disposition" bind:value={disposition}>
          <option value="RETURN_TO_STOCK">Volver a disponible</option>
          <option value="DAMAGED">Marcar dañada</option>
          <option value="RETURN_TO_SUPPLIER">Devolver a proveedor</option>
        </select>
        <button type="button" disabled={!selectedSerialId} onclick={dispose}>
          Confirmar disposición
        </button>
      </div>
    {/if}

    {#if leaseToken}
      <p class="lease" aria-live="polite">
        Lease opaco listo. No lo copies entre terminales.
      </p>
    {/if}
    {#if message}<p class="notice" role="status" aria-live="polite">{message}</p>{/if}
  {/if}
</main>

<style>
  :global(body) { background: #f2f0e9; color: #182722; }
  .serial-shell { max-width: 52rem; margin: 0 auto; padding: 2rem 1rem 5rem; }
  header { border-bottom: 4px solid #ce5b38; margin-bottom: 1.5rem; }
  .eyebrow, legend { font: 700 .76rem/1.2 ui-monospace, monospace; letter-spacing: .12em; text-transform: uppercase; }
  h1 { font: 800 clamp(2rem, 6vw, 4rem)/1 system-ui, sans-serif; letter-spacing: -.04em; }
  form { display: grid; grid-template-columns: 1fr auto; gap: .5rem; align-items: end; }
  form label { grid-column: 1 / -1; }
  input, select, button { min-height: 2.75rem; padding: .55rem .7rem; font: inherit; }
  input, select { border: 1px solid #71867e; background: white; }
  button { border: 0; background: #174f42; color: white; font-weight: 750; cursor: pointer; }
  button:disabled { opacity: .5; cursor: not-allowed; }
  input:focus-visible, select:focus-visible, button:focus-visible { outline: 3px solid #ef9b73; outline-offset: 2px; }
  fieldset { margin: 1.5rem 0; border: 1px solid #aab9b3; }
  .result { display: flex; align-items: center; gap: .55rem; padding: .55rem; }
  .result input { min-height: auto; }
  .actions { display: grid; gap: .55rem; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .actions label { align-self: end; }
  .notice, .lease { padding: .8rem; border-left: 5px solid #ce5b38; background: white; }
  @media (max-width: 560px) { form, .actions { grid-template-columns: 1fr; } form label { grid-column: auto; } }
</style>
