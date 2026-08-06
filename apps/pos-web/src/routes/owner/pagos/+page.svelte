<script lang="ts">
  import { onMount } from 'svelte';
  import {
    isOwnerModeEnabled,
    isPaymentsCardAcquirerEnabled,
    isPaymentsQrWalletsEnabled,
  } from '$lib/features';

  const ownerOn = isOwnerModeEnabled();
  const payOn = isPaymentsQrWalletsEnabled() || isPaymentsCardAcquirerEnabled();

  let status = $state('');
  let rows = $state<
    {
      id: string;
      sale_id: string;
      acquirer: string;
      status: string;
      amount_cents: number;
      acquirer_ref: string | null;
    }[]
  >([]);

  async function load() {
    status = 'cargando';
    const apiBase =
      (import.meta.env.PUBLIC_API_BASE as string | undefined)?.replace(/\/$/, '') ||
      'https://api.kipuspay.local';
    const auth = (import.meta.env.PUBLIC_DEV_AUTH as string | undefined) ?? 'Bearer demo';
    try {
      const res = await fetch(`${apiBase}/api/owner/payments/uncaptured`, {
        headers: { authorization: auth },
      });
      const json = (await res.json()) as { uncaptured?: typeof rows; error?: string };
      if (!res.ok) {
        status = json.error ?? 'error';
        rows = [];
        return;
      }
      rows = json.uncaptured ?? [];
      status = `${rows.length} no conciliado(s) por API`;
    } catch {
      status = 'red offline';
      rows = [];
    }
  }

  onMount(() => {
    if (ownerOn && payOn) void load();
  });
</script>

<section class="owner-pay" data-testid="owner-payments-uncaptured">
  <h1>Pagos no conciliados por API</h1>
  <p class="lede">
    MANUAL_ELECTRONIC_CAPTURE y PENDING (Sprint 22 · captura offline edge 2B).
  </p>

  {#if !ownerOn || !payOn}
    <p data-testid="owner-pay-off">Activa Owner Mode y flags de pagos.</p>
  {:else}
    <button type="button" data-testid="owner-pay-refresh" onclick={load}>Actualizar</button>
    <p data-testid="owner-pay-status">{status}</p>
    <ul data-testid="owner-pay-list">
      {#each rows as r}
        <li>
          {r.id} · {r.acquirer} · {r.status} · {r.amount_cents} céntimos · venta {r.sale_id}
        </li>
      {:else}
        <li>Sin pendientes</li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .owner-pay {
    max-width: 40rem;
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem;
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
  }
  .lede {
    color: #445;
    margin-bottom: 1.25rem;
  }
  ul {
    padding-left: 1.1rem;
  }
  button {
    padding: 0.45rem 0.85rem;
  }
</style>
