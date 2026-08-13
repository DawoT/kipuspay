<script lang="ts">
  import { isStockTransfersEnabled } from '$lib/features';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
import { resolveApiAuth, resolveApiBase } from '$lib/auth/api-client';

  const xferOn = isStockTransfersEnabled();
  let fromBranchId = $state('b-origen');
  let toBranchId = $state('b-destino');
  let productId = $state('p1');
  let qtySent = $state(5);
  let transferId = $state('');
  let lineId = $state('');
  let qtyReceived = $state(5);
  let qtyShrink = $state(0);
  let shrinkReason = $state('');
  let message = $state('');
  let messageOk = $state(false);

  const apiBase = () => resolveApiBase(localStorage);
  const auth = () => resolveApiAuth(localStorage).authorization ?? '';

  async function createTransfer() {
    message = '';
    const res = await fetch(`${apiBase()}/api/inventory/transfers`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth() },
      body: JSON.stringify({ fromBranchId, toBranchId, lines: [{ productId, qtySent }] }),
    });
    const json = (await res.json()) as { id?: string; error?: string };
    messageOk = res.ok;
    if (res.ok && json.id) transferId = json.id;
    message = res.ok ? `Transferencia ${json.id} · DRAFT` : (json.error ?? 'error');
  }

  async function ship() {
    message = '';
    const res = await fetch(`${apiBase()}/api/inventory/transfers/ship`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth() },
      body: JSON.stringify({ transferId }),
    });
    const json = (await res.json()) as { status?: string; error?: string };
    messageOk = res.ok;
    message = res.ok ? `Enviada · ${json.status}` : (json.error ?? 'error');
  }

  async function receive() {
    message = '';
    const res = await fetch(`${apiBase()}/api/inventory/transfers/receive`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth() },
      body: JSON.stringify({
        transferId,
        lines: [{ lineId, qtyReceived, qtyShrink, shrinkReason: shrinkReason || null }],
      }),
    });
    const json = (await res.json()) as { status?: string; error?: string };
    messageOk = res.ok;
    message = res.ok ? `Recibida · ${json.status}` : (json.error ?? 'error');
  }

  async function cancelTransfer() {
    message = '';
    const res = await fetch(`${apiBase()}/api/inventory/transfers/cancel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth() },
      body: JSON.stringify({ transferId }),
    });
    const json = (await res.json()) as { status?: string; error?: string };
    messageOk = res.ok;
    message = res.ok ? `Cancelada · ${json.status}` : (json.error ?? 'error');
  }
</script>

<svelte:head><title>Transferencias entre sucursales · KipusPay</title></svelte:head>

<div class="page-shell" data-testid="admin-transferencias">
  <div class="page-masthead">
    <div>
      <p class="page-eyebrow"><Icon name="truck" size={12} /> Inventario · Transferencias</p>
      <h1 class="page-title">Transferencias entre sucursales</h1>
      <p class="page-lede">Crear, enviar, recibir o cancelar transferencias. Conservación total origen + destino + merma.</p>
    </div>
  </div>

  {#if message}
    <StatusMessage tone={messageOk ? 'info' : 'danger'} aria-live="polite">
      <Icon name={messageOk ? 'check' : 'alert'} size={16} />
      <span>{message}</span>
    </StatusMessage>
  {/if}

  {#if !xferOn}
    <div class="feature-off-banner" data-testid="admin-xfer-off">
      <Icon name="info" size={18} />
      <span>Las transferencias no están activas para este negocio.</span>
    </div>
  {:else}
    <div class="xfer-layout">
      <!-- Nueva transferencia -->
      <section class="glass-card section-pad">
        <div class="card-header">
          <h2>Nueva transferencia</h2>
          <span class="section-tag">DRAFT</span>
        </div>
        <div class="field-group">
          <label for="xfer-from">Sucursal origen</label>
          <input id="xfer-from" bind:value={fromBranchId} data-testid="xfer-from" />
        </div>
        <div class="field-group">
          <label for="xfer-to">Sucursal destino</label>
          <input id="xfer-to" bind:value={toBranchId} data-testid="xfer-to" />
        </div>
        <div class="field-group">
          <label for="xfer-product">Producto</label>
          <input id="xfer-product" bind:value={productId} data-testid="xfer-product" />
        </div>
        <div class="field-group">
          <label for="xfer-qty-sent">Cantidad enviada</label>
          <input id="xfer-qty-sent" type="number" bind:value={qtySent} data-testid="xfer-qty-sent" />
        </div>
        <Button variant="primary" icon="truck" onclick={createTransfer}>
          Crear transferencia
        </Button>
      </section>

      <!-- Gestionar existente -->
      <section class="glass-card section-pad">
        <div class="card-header">
          <h2>Gestionar</h2>
          <span class="section-tag">ID de transferencia</span>
        </div>
        <div class="field-group">
          <label for="xfer-id">Transfer ID</label>
          <input id="xfer-id" bind:value={transferId} data-testid="xfer-id" placeholder="ID creado arriba" />
        </div>
        <div class="btn-row">
          <Button variant="primary" icon="arrow-right" onclick={ship} disabled={!transferId}>
          Enviar
        </Button>
          <Button variant="danger" icon="x" onclick={cancelTransfer} disabled={!transferId}>
          Cancelar
        </Button>
        </div>

        <div class="separator"></div>

        <div class="card-header">
          <h3>Recepción</h3>
          <span class="section-tag">Línea</span>
        </div>
        <div class="field-group">
          <label for="xfer-line-id">Line ID</label>
          <input id="xfer-line-id" bind:value={lineId} data-testid="xfer-line-id" />
        </div>
        <div class="two-col">
          <div class="field-group">
            <label for="xfer-qty-recv">Qty recibida</label>
            <input id="xfer-qty-recv" type="number" bind:value={qtyReceived} data-testid="xfer-qty-recv" />
          </div>
          <div class="field-group">
            <label for="xfer-qty-shrink">Merma</label>
            <input id="xfer-qty-shrink" type="number" bind:value={qtyShrink} data-testid="xfer-qty-shrink" />
          </div>
        </div>
        <div class="field-group">
          <label for="xfer-shrink-reason">Motivo merma</label>
          <input id="xfer-shrink-reason" bind:value={shrinkReason} data-testid="xfer-shrink-reason" placeholder="Opcional" />
        </div>
        <Button variant="success" icon="check" onclick={receive} disabled={!transferId || !lineId}>
          Confirmar recepción
        </Button>
      </section>
    </div>
  {/if}
</div>

<style>
  .xfer-layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.25rem;
    align-items: start;
  }





  .separator {
    border-top: 1px solid var(--border-subtle);
    margin: 0.875rem 0;
  }





  @media (max-width: 600px) {
    .xfer-layout {
      grid-template-columns: 1fr;
    }
  }
</style>
