<script lang="ts">
  import { onMount } from 'svelte';
  import { formatCents } from '$lib/cents';
  import { isPurchasingReturnsEnabled, isPurchasingThreeWayEnabled } from '$lib/features';

  const threeWayOn = isPurchasingThreeWayEnabled();
  const returnsOn = isPurchasingReturnsEnabled();
  let openPos = $state<
    { id: string; status: string; totalAmountCents: number; supplierId: string }[]
  >([]);
  let uninvoiced = $state<{ receiptId: string; purchaseOrderId: string }[]>([]);
  let overrides = $state<{ invoiceNumber: string; totalCents: number }[]>([]);
  let openReturns = $state<{ id: string; totalCents: number; reason: string }[]>([]);
  let message = $state('');

  const apiBase = () =>
    (import.meta.env.PUBLIC_API_BASE as string | undefined)?.replace(/\/$/, '') ||
    'https://api.kipuspay.local';
  const auth = () => (import.meta.env.PUBLIC_DEV_AUTH as string | undefined) ?? 'Bearer demo';

  onMount(() => {
    if (threeWayOn || returnsOn) void refresh();
  });

  async function refresh() {
    message = '';
    if (threeWayOn) {
      const res = await fetch(`${apiBase()}/api/owner/purchasing/three-way`, {
        headers: { authorization: auth() },
      });
      const json = (await res.json()) as {
        openPurchaseOrders?: typeof openPos;
        uninvoicedReceipts?: typeof uninvoiced;
        priceDiffOverrides?: typeof overrides;
        error?: string;
      };
      if (!res.ok) {
        message = json.error ?? `Error ${res.status}`;
        return;
      }
      openPos = json.openPurchaseOrders ?? [];
      uninvoiced = json.uninvoicedReceipts ?? [];
      overrides = json.priceDiffOverrides ?? [];
    }
    if (returnsOn) {
      const ret = await fetch(`${apiBase()}/api/owner/purchasing/returns`, {
        headers: { authorization: auth() },
      });
      const retJson = (await ret.json()) as { openReturns?: typeof openReturns; error?: string };
      if (!ret.ok) {
        message = retJson.error ?? `Error ${ret.status}`;
        return;
      }
      openReturns = retJson.openReturns ?? [];
    }
  }
</script>

<section data-testid="owner-three-way">
  <h1>Compras 3-way</h1>
  {#if !threeWayOn && !returnsOn}
    <p data-testid="owner-three-way-off">PUBLIC_FEATURE_PURCHASING_THREE_WAY desactivado.</p>
  {:else}
    <button type="button" data-testid="owner-three-way-refresh" onclick={refresh}>
      Actualizar
    </button>
    {#if message}
      <p>{message}</p>
    {/if}
    <h2>OC abiertas</h2>
    <ul data-testid="owner-open-pos">
      {#each openPos as po}
        <li>{po.id} · {po.status} · {formatCents(po.totalAmountCents)}</li>
      {:else}
        <li>Sin OC abiertas</li>
      {/each}
    </ul>
    <h2>Recepciones sin facturar</h2>
    <ul data-testid="owner-uninvoiced">
      {#each uninvoiced as r}
        <li>{r.receiptId} → OC {r.purchaseOrderId}</li>
      {:else}
        <li>Ninguna</li>
      {/each}
    </ul>
    {#if returnsOn}
      <h2>Devoluciones OPEN</h2>
      <ul data-testid="owner-open-returns">
        {#each openReturns as r}
          <li>{r.id} · {formatCents(r.totalCents)} · {r.reason}</li>
        {:else}
          <li>Ninguna</li>
        {/each}
      </ul>
    {/if}
    <h2>Overrides de precio</h2>
    <ul data-testid="owner-price-diffs">
      {#each overrides as o}
        <li>{o.invoiceNumber} · {formatCents(o.totalCents)}</li>
      {:else}
        <li>Ninguno</li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  section {
    max-width: 40rem;
    margin: 1.5rem auto;
    padding: 1rem;
    font-family: ui-sans-serif, system-ui, sans-serif;
  }
</style>
