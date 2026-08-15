<script lang="ts">
  import { onMount } from 'svelte';
  import { formatCents } from '$lib/cents';
  import { isOwnerModeEnabled } from '$lib/features';
  import Icon from '$lib/ui/Icon.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
  import { stockKindLabel } from '$lib/ui/ops-copy';
  import { resolveApiAuth, resolveApiBase } from '$lib/auth/api-client';

  const enabled = isOwnerModeEnabled();

  let stockAlerts = $state<{ product_id: string; product_name: string; status: string; daysCovered: number | null }[]>([]);
  let uncaptured = $state<{ id: string; amount_cents: number; acquirer: string; status: string }[]>([]);
  let overdueLayaways = $state<{ id: string; balanceCents: number; dueDate: string | null; status: string }[]>([]);
  let loading = $state(true);
  let errorMsg = $state('');

  onMount(async () => {
    const apiBase = resolveApiBase();
    const authorization = resolveApiAuth().authorization ?? '';
    const base = apiBase;
    const [stock, uncap, lay] = await Promise.allSettled([
      fetch(`${base}/api/owner/stock-alerts?branchId=&expiryWarnDays=30`, {
        headers: { authorization },
      }),
      fetch(`${base}/api/owner/payments/uncaptured`, { headers: { authorization } }),
      fetch(`${base}/api/owner/layaways/overdue`, { headers: { authorization } }),
    ]);
    loading = false;
    if (stock.status === 'fulfilled' && stock.value.ok) {
      const json = (await stock.value.json()) as { alerts?: typeof stockAlerts };
      stockAlerts = json.alerts ?? [];
    }
    if (uncap.status === 'fulfilled' && uncap.value.ok) {
      const json = (await uncap.value.json()) as { uncaptured?: typeof uncaptured };
      uncaptured = json.uncaptured ?? [];
    }
    if (lay.status === 'fulfilled' && lay.value.ok) {
      const json = (await lay.value.json()) as { items?: typeof overdueLayaways };
      overdueLayaways = json.items ?? [];
    }
    if (stock.status === 'rejected' && uncap.status === 'rejected' && lay.status === 'rejected') {
      errorMsg = 'Sin conexión con el servidor.';
    }
  });

  const totalOpen = $derived(
    stockAlerts.length + uncaptured.length + overdueLayaways.length,
  );
</script>

<svelte:head><title>Alertas · KipusPay</title></svelte:head>

{#if enabled}
  <div class="page-shell" data-testid="owner-alertas">
    <div class="page-masthead">
      <div>
        <p class="page-eyebrow"><Icon name="alert" size={12} /> Alertas</p>
        <h1 class="page-title">Alertas</h1>
        <p class="page-lede">Lo que necesita tu atención hoy: quiebres de stock, pagos sin conciliar y apartados vencidos.</p>
      </div>
    </div>

    {#if errorMsg}
      <StatusMessage tone="danger" data-testid="alertas-error">{errorMsg}</StatusMessage>
    {/if}

    {#if loading}
      <Skeleton lines={4} />
    {:else if totalOpen === 0}
      <div class="empty-state" data-testid="alertas-empty">
        <Icon name="check" size={22} />
        <span>Sin alertas abiertas. Todo al día.</span>
      </div>
    {:else}
      <div class="alertas-grid">
        <section class="ledger-card section-pad" data-testid="alertas-stock">
          <div class="card-header">
            <h2>Quiebre de stock</h2>
            <Icon name="box" size={16} />
          </div>
          {#if stockAlerts.length === 0}
            <p class="muted-line">Sin alertas de stock.</p>
          {:else}
            <ul class="alert-list">
              {#each stockAlerts as item}
                <li>
                  <span class="alert-name">{item.product_name || item.product_id}</span>
                  <span class="alert-status">{stockKindLabel(item.status)}</span>
                </li>
              {/each}
            </ul>
          {/if}
        </section>

        <section class="ledger-card section-pad" data-testid="alertas-uncaptured">
          <div class="card-header">
            <h2>Pagos sin conciliar</h2>
            <Icon name="credit-card" size={16} />
          </div>
          {#if uncaptured.length === 0}
            <p class="muted-line">Ningún pago pendiente de conciliar.</p>
          {:else}
            <ul class="alert-list">
              {#each uncaptured as item}
                <li>
                  <span class="alert-name">{item.acquirer}</span>
                  <span class="alert-status tabular-nums">S/ {formatCents(item.amount_cents)}</span>
                </li>
              {/each}
            </ul>
          {/if}
        </section>

        <section class="ledger-card section-pad" data-testid="alertas-layaways">
          <div class="card-header">
            <h2>Apartados vencidos</h2>
            <Icon name="clock" size={16} />
          </div>
          {#if overdueLayaways.length === 0}
            <p class="muted-line">Sin apartados vencidos.</p>
          {:else}
            <ul class="alert-list">
              {#each overdueLayaways as item}
                <li>
                  <span class="alert-name">{item.id.slice(0, 8)}</span>
                  <span class="alert-status tabular-nums">S/ {formatCents(item.balanceCents)}</span>
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      </div>
    {/if}
  </div>
{/if}

<style>
  .alertas-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1.25rem;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
  }

  .card-header h2 {
    font-size: 1.0625rem;
    font-weight: 700;
  }

  .alert-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .alert-list li {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.5rem 0.75rem;
    background: rgba(255, 255, 255, 0.03);
    border-radius: var(--radius-md);
  }

  .alert-name {
    font-size: 0.875rem;
    font-weight: 600;
  }

  .alert-status {
    color: var(--amber-warning);
    font-size: 0.8125rem;
  }

  .muted-line {
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 2rem;
    color: var(--text-muted);
  }
</style>
