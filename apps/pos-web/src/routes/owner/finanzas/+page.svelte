<script lang="ts">
  import { onMount } from 'svelte';
  import { formatCents } from '$lib/cents';
  import { isLedgerArApEnabled, isOwnerModeEnabled } from '$lib/features';
  import Icon from '$lib/ui/Icon.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
  import { fetchAccountsPayable, fetchAccountsReceivable, payAccountsPayable, payAccountsReceivable } from '$lib/ledger/ledger-finance';
  import { cashSessionContext } from '$lib/admin/cash-session';
  import { resolveApiAuth, resolveApiBase } from '$lib/auth/api-client';
  import Button from '$lib/ui/Button.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';

  const enabled = isOwnerModeEnabled();
  const ledger = isLedgerArApEnabled();

  let ar = $state<
    { id: string; customerId: string; saleId: string; originalAmountCents: number; balanceDueCents: number; status: string; dueDate: string }[]
  >([]);
  let ap = $state<
    { id: string; supplierId: string; purchaseOrderId: string | null; originalAmountCents: number; balanceDueCents: number; status: string; dueDate: string }[]
  >([]);
  let loading = $state(true);
  let errorMsg = $state('');
  let payMsg = $state('');

  async function payAr(item: (typeof ar)[number]) {
    payMsg = '';
    const res = await payAccountsReceivable({
      apiBase: resolveApiBase(),
      authorization: resolveApiAuth().authorization ?? '',
      accountsReceivableId: item.id,
      amountCents: item.balanceDueCents,
      cashRegisterSessionId: cashSessionContext(localStorage).sessionId,
    });
    if (!res.ok) {
      payMsg = res.message;
      return;
    }
    ar = ar.map((row) =>
      row.id === item.id ? { ...row, balanceDueCents: res.nextBalanceCents, status: res.nextBalanceCents === 0 ? 'PAID' : row.status } : row,
    );
  }

  async function payAp(item: (typeof ap)[number]) {
    payMsg = '';
    const res = await payAccountsPayable({
      apiBase: resolveApiBase(),
      authorization: resolveApiAuth().authorization ?? '',
      accountsPayableId: item.id,
      amountCents: item.balanceDueCents,
      cashRegisterSessionId: cashSessionContext(localStorage).sessionId,
    });
    if (!res.ok) {
      payMsg = res.message;
      return;
    }
    ap = ap.map((row) =>
      row.id === item.id ? { ...row, balanceDueCents: res.nextBalanceCents, status: res.nextBalanceCents === 0 ? 'PAID' : row.status } : row,
    );
  }

  onMount(async () => {
    if (!ledger) return;
    const apiBase = resolveApiBase();
    const authorization = resolveApiAuth().authorization ?? '';
    const [arRes, apRes] = await Promise.all([
      fetchAccountsReceivable({ apiBase, authorization }),
      fetchAccountsPayable({ apiBase, authorization }),
    ]);
    loading = false;
    if (arRes.ok) ar = arRes.items;
    if (apRes.ok) ap = apRes.items;
    if (!arRes.ok && !apRes.ok) {
      errorMsg = arRes.message;
    }
  });

  const arTotal = $derived(ar.reduce((acc, item) => acc + item.balanceDueCents, 0));
  const apTotal = $derived(ap.reduce((acc, item) => acc + item.balanceDueCents, 0));
</script>

<svelte:head><title>Finanzas · KipusPay</title></svelte:head>

{#if enabled}
  <div class="page-shell" data-testid="owner-finanzas">
    <div class="page-masthead">
      <div>
        <p class="page-eyebrow"><Icon name="trending-up" size={12} /> Finanzas</p>
        <h1 class="page-title">Finanzas</h1>
        <p class="page-lede">Cuentas por cobrar y por pagar. El diario contable sigue en solo lectura.</p>
      </div>
    </div>

    {#if !ledger}
      <div class="feature-off-banner" data-testid="ledger-gated">
        <Icon name="info" size={18} />
        <span>El resumen financiero no está activo para este negocio.</span>
      </div>
    {:else}
      {#if errorMsg}
        <StatusMessage tone="danger" data-testid="finanzas-error">{errorMsg}</StatusMessage>
      {/if}

      {#if payMsg}
        <StatusMessage tone="danger" data-testid="finanzas-pay-error">{payMsg}</StatusMessage>
      {/if}

      <div class="finanzas-grid">
        <div class="ledger-card fin-card">
          <div class="card-header">
            <h2>Cuentas por cobrar</h2>
            <Icon name="trending-up" size={16} class="icon-emerald" />
          </div>
          {#if loading}
            <Skeleton lines={3} />
          {:else if ar.length === 0}
            <EmptyState title="Sin cuentas por cobrar" description="Cuando haya saldos abiertos, aparecen aquí.">
              <Button variant="secondary" href="/" data-testid="fin-empty-ar">Ir a cobrar</Button>
            </EmptyState>
          {:else}
            <div class="fin-total tabular-nums">S/ {formatCents(arTotal)}</div>
            <ul class="fin-list">
              {#each ar as item}
                <li data-testid="ar-item">
                  <span class="fin-label">Venta {item.saleId.slice(0, 8)}</span>
                  <span class="fin-due tabular-nums">S/ {formatCents(item.balanceDueCents)}</span>
                  {#if item.balanceDueCents > 0}
                    <Button variant="secondary" size="sm" data-testid="ar-pay" onclick={() => void payAr(item)}>
                      Abonar
                    </Button>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
        </div>

        <div class="ledger-card fin-card">
          <div class="card-header">
            <h2>Cuentas por pagar</h2>
            <Icon name="trending-down" size={16} class="icon-rose" />
          </div>
          {#if loading}
            <Skeleton lines={3} />
          {:else if ap.length === 0}
            <EmptyState title="Sin cuentas por pagar" description="Las facturas de proveedor pendientes se listan aquí.">
              <Button variant="secondary" href="/admin/factura-proveedor" data-testid="fin-empty-ap">Ver facturas</Button>
            </EmptyState>
          {:else}
            <div class="fin-total tabular-nums">S/ {formatCents(apTotal)}</div>
            <ul class="fin-list">
              {#each ap as item}
                <li data-testid="ap-item">
                  <span class="fin-label">Proveedor {item.supplierId.slice(0, 8)}</span>
                  <span class="fin-due tabular-nums">S/ {formatCents(item.balanceDueCents)}</span>
                  {#if item.balanceDueCents > 0}
                    <Button variant="secondary" size="sm" data-testid="ap-pay" onclick={() => void payAp(item)}>
                      Pagar
                    </Button>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .finanzas-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 1.25rem;
  }

  .fin-card {
    padding: 1.25rem;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .card-header h2 {
    font-size: 1.125rem;
    font-weight: 700;
  }

  .fin-total {
    font-size: 1.75rem;
    font-weight: 800;
    margin-bottom: 0.75rem;
  }

  .fin-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .fin-list li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0.75rem;
    background: rgba(255, 255, 255, 0.03);
    border-radius: var(--radius-md);
  }

  .fin-label {
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .fin-due {
    font-weight: 700;
  }
</style>
