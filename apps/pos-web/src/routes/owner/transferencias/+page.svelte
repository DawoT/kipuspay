<script lang="ts">
  import { onMount } from 'svelte';
  import { isOwnerModeEnabled, isStockTransfersEnabled } from '$lib/features';

  const ownerOn = isOwnerModeEnabled();
  const xferOn = isStockTransfersEnabled();

  let status = $state('');
  let pending = $state<
    {
      id: string;
      from_branch_id: string;
      to_branch_id: string;
      status: string;
      shipped_at: string | null;
    }[]
  >([]);
  let discrepancies = $state<
    {
      transfer_id: string;
      product_id: string;
      qty_sent: number;
      qty_received: number;
      qty_shrink: number;
      shrink_reason: string | null;
    }[]
  >([]);

  async function load() {
    status = 'cargando';
    const apiBase =
      (import.meta.env.PUBLIC_API_BASE as string | undefined)?.replace(/\/$/, '') ||
      'https://api.kipuspay.local';
    const auth = (import.meta.env.PUBLIC_DEV_AUTH as string | undefined) ?? 'Bearer demo';
    try {
      const res = await fetch(`${apiBase}/api/owner/transfers/pending`, {
        headers: { authorization: auth },
      });
      const json = (await res.json()) as {
        pending?: typeof pending;
        discrepancies?: typeof discrepancies;
        error?: string;
      };
      if (!res.ok) {
        status = json.error ?? 'error';
        pending = [];
        discrepancies = [];
        return;
      }
      pending = json.pending ?? [];
      discrepancies = json.discrepancies ?? [];
      status = `${pending.length} en tránsito · ${discrepancies.length} discrepancia(s)`;
    } catch {
      status = 'red offline — reintento en staging';
      pending = [];
      discrepancies = [];
    }
  }

  onMount(() => {
    if (ownerOn && xferOn) void load();
  });
</script>

<section class="owner-xfer" data-testid="owner-transferencias">
  <h1>Transferencias pendientes</h1>
  <p class="lede">
    IN_TRANSIT y mermas en recepción (Sprint 20 · Cadena light).
  </p>

  {#if !ownerOn || !xferOn}
    <p data-testid="owner-xfer-off">
      Activa FEATURE_OWNER_MODE y PUBLIC_FEATURE_STOCK_TRANSFERS.
    </p>
  {:else}
    <button type="button" data-testid="owner-xfer-refresh" onclick={load}>Actualizar</button>
    <p data-testid="owner-xfer-status">{status}</p>

    <h2>En tránsito</h2>
    <ul data-testid="owner-xfer-pending">
      {#each pending as t}
        <li>
          {t.id} · {t.from_branch_id} → {t.to_branch_id}
          {#if t.shipped_at}
            · {t.shipped_at}
          {/if}
        </li>
      {:else}
        <li>Sin transferencias en tránsito</li>
      {/each}
    </ul>

    <h2>Discrepancias (merma)</h2>
    <ul data-testid="owner-xfer-disc">
      {#each discrepancies as d}
        <li>
          {d.transfer_id} · {d.product_id} · enviado {d.qty_sent} / recibido {d.qty_received} /
          merma {d.qty_shrink}
          {#if d.shrink_reason}
            · {d.shrink_reason}
          {/if}
        </li>
      {:else}
        <li>Sin discrepancias recientes</li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .owner-xfer {
    max-width: 40rem;
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem;
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
  }
  .lede {
    color: #445;
    margin-bottom: 1.25rem;
  }
  h2 {
    margin-top: 1.25rem;
    font-size: 1.05rem;
  }
  ul {
    padding-left: 1.1rem;
  }
  button {
    padding: 0.45rem 0.85rem;
  }
</style>
