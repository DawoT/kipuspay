<script lang="ts">
  import { onMount } from 'svelte';
  import { isOwnerModeEnabled, isInventoryOpsEnabled } from '$lib/features';

  const ownerOn = isOwnerModeEnabled();
  const invOn = isInventoryOpsEnabled();

  let branchId = $state('b-demo');
  let status = $state('');
  let alerts = $state<
    { kind: string; productId: string; detail: string; suggestReorderQty?: number }[]
  >([]);

  async function loadAlerts() {
    status = 'cargando';
    const apiBase = (import.meta.env.PUBLIC_API_BASE as string | undefined) ?? '';
    const auth = (import.meta.env.PUBLIC_DEV_AUTH as string | undefined) ?? 'Bearer demo';
    const url = new URL(`${apiBase.replace(/\/$/, '') || 'https://api.kipuspay.local'}/api/owner/stock-alerts`);
    url.searchParams.set('branchId', branchId);
    url.searchParams.set('expiryWarnDays', '30');
    try {
      const res = await fetch(url, { headers: { authorization: auth } });
      const json = (await res.json()) as {
        alerts?: typeof alerts;
        error?: string;
      };
      if (!res.ok) {
        status = json.error ?? 'error';
        alerts = [];
        return;
      }
      alerts = json.alerts ?? [];
      status = `${alerts.length} alerta(s)`;
    } catch {
      status = 'red offline — reintento en staging';
      alerts = [];
    }
  }

  onMount(() => {
    if (ownerOn && invOn) void loadAlerts();
  });
</script>

<section class="owner-stock" data-testid="owner-stock-alerts">
  <h1>Alertas de stock</h1>
  <p class="lede">
    Quiebre, punto de reposición y lotes por vencer (Sprint 18 · GTM farmacia tras Quality Gate).
  </p>

  {#if !ownerOn || !invOn}
    <p data-testid="owner-stock-off">Activa FEATURE_OWNER_MODE e inventario para ver alertas.</p>
  {:else}
    <label>
      Sucursal
      <input data-testid="owner-stock-branch" bind:value={branchId} />
    </label>
    <button type="button" data-testid="owner-stock-refresh" onclick={loadAlerts}>Actualizar</button>
    <p data-testid="owner-stock-status">{status}</p>
    <ul data-testid="owner-stock-list">
      {#each alerts as a}
        <li>
          <strong>{a.kind}</strong> · {a.productId} · {a.detail}
          {#if a.suggestReorderQty}
            · sugerencia OC: {a.suggestReorderQty}
          {/if}
        </li>
      {:else}
        <li>Sin alertas</li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .owner-stock {
    max-width: 40rem;
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem;
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
  }
  h1 {
    font-family: 'Fraunces', Georgia, serif;
    margin: 0 0 0.5rem;
  }
  .lede {
    color: #3d4450;
  }
  button {
    margin-top: 0.75rem;
    padding: 0.55rem 1rem;
    background: #1a2332;
    color: #f8f6f1;
    border: 0;
    cursor: pointer;
  }
  ul {
    margin-top: 1rem;
    padding-left: 1.1rem;
  }
</style>
