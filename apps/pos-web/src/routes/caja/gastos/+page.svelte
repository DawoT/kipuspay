<script lang="ts">
  import { tenantBranchId, cashSessionContext } from '$lib/admin/cash-session';
  import { apiFetch } from '$lib/auth/api-client';
  import { formatCents } from '$lib/cents';
  import { isCashExpensesEnabled } from '$lib/features';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Field from '$lib/ui/Field.svelte';
  import Input from '$lib/ui/Input.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';

  const expensesOn = isCashExpensesEnabled();
  let category = $state<'SUPPLIES' | 'TRANSPORT' | 'OTHER'>('OTHER');
  let amountCents = $state(0);
  let description = $state('');
  let message = $state('');
  let messageOk = $state(false);

  async function createExpense() {
    message = '';
    const res = await apiFetch('/api/cash/expenses', {
      method: 'POST',
      storage: localStorage,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        branchId: tenantBranchId(localStorage),
        cashRegisterSessionId: cashSessionContext(localStorage).sessionId,
        category,
        amountCents,
        description,
      }),
    });
    const json = (await res.json()) as { id?: string; error?: string; code?: string };
    messageOk = res.ok;
    message = res.ok
      ? `Gasto ${json.id} · ${formatCents(amountCents)}`
      : (json.error ?? json.code ?? `Error ${res.status}`);
  }
</script>

<svelte:head><title>Gastos de caja · KipusPay</title></svelte:head>

<div class="page-shell" data-testid="caja-gastos">
  <div class="page-masthead">
    <div>
      <p class="page-eyebrow"><Icon name="dollar" size={12} /> Caja · Gastos</p>
      <h1 class="page-title">Gastos de caja</h1>
      <p class="page-lede">Registra salidas de efectivo de la sesión abierta.</p>
    </div>
  </div>

  {#if message}
    <StatusMessage tone={messageOk ? 'info' : 'danger'} aria-live="polite" data-testid="caja-gastos-msg">
      <Icon name={messageOk ? 'check' : 'alert'} size={16} />
      <span>{message}</span>
    </StatusMessage>
  {/if}

  {#if !expensesOn}
    <div class="feature-off-banner" data-testid="caja-gastos-off">
      <Icon name="info" size={18} />
      <span>Los gastos de caja no están activos para esta tienda.</span>
    </div>
  {:else}
    <div class="glass-card" style="padding:1.25rem;max-width:28rem">
      <Field label="Categoría" id="gasto-cat">
        <select id="gasto-cat" bind:value={category} data-testid="caja-gastos-cat">
          <option value="SUPPLIES">Insumos</option>
          <option value="TRANSPORT">Transporte</option>
          <option value="OTHER">Otro</option>
        </select>
      </Field>
      <Field label="Monto" id="gasto-cents">
        <Input id="gasto-cents" type="number" bind:value={amountCents} data-testid="caja-gastos-cents" />
      </Field>
      <Field label="Descripción" id="gasto-desc">
        <Input id="gasto-desc" bind:value={description} data-testid="caja-gastos-desc" />
      </Field>
      <Button variant="primary" icon="plus" data-testid="caja-gastos-save" onclick={() => void createExpense()}>
        Registrar gasto
      </Button>
    </div>
  {/if}
</div>
