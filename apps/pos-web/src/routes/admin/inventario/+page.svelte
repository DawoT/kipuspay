<script lang="ts">
  import { isGreEnabled, isInventoryOpsEnabled } from '$lib/features';
  import { issueRemissionGuide } from '$lib/inventory/remission-guide';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
import { resolveApiAuth, resolveApiBase } from '$lib/auth/api-client';

  const invOn = isInventoryOpsEnabled();
  const greOn = isGreEnabled();
  let branchId = $state('b-demo');
  let productId = $state('p1');
  let countedQty = $state(0);
  let systemQty = $state(0);
  let lossQty = $state(1);
  let evidenceKey = $state('r2/merma/demo.jpg');
  let reason = $state('');
  let message = $state('');
  let messageOk = $state(false);

  // P1b — GRE (ADR-FISCAL-004).
  let greSeries = $state('T001');
  let greMotive = $state('01');
  let greMode = $state('01');
  let grePlate = $state('');
  let greCarrierDoc = $state('1');
  let greCarrierNumber = $state('');
  let greCarrierName = $state('');
  let greOriginUbigeo = $state('150101');
  let greOriginAddress = $state('');
  let greDestUbigeo = $state('150101');
  let greDestAddress = $state('');
  let greStartedAt = $state(new Date().toISOString().slice(0, 16));
  let greQtyMicrounits = $state(1_000_000);
  let greMsg = $state('');
  let greIssued = $state(false);

  async function onIssueGre() {
    greMsg = '';
    greIssued = false;
    const res = await issueRemissionGuide({
      branchId,
      series: greSeries,
      transferReasonCode: greMotive,
      transportModeCode: greMode,
      vehiclePlate: grePlate,
      carrierDocumentType: greCarrierDoc,
      carrierDocumentNumber: greCarrierNumber,
      carrierName: greCarrierName,
      originUbigeo: greOriginUbigeo,
      originAddress: greOriginAddress,
      destinationUbigeo: greDestUbigeo,
      destinationAddress: greDestAddress,
      transferStartedAt: new Date(greStartedAt).toISOString(),
      items: [{ productId, quantityMicrounits: greQtyMicrounits, uomCode: 'NIU' }],
    });
    if (!res.ok) {
      greMsg = res.message;
      return;
    }
    greIssued = true;
    greMsg = `GRE ${res.series}-${String(res.number).padStart(3, '0')} emitida (motivo ${res.transferReasonCode}, ${res.sunatStatus}).`;
  }

  const apiBase = () => resolveApiBase(localStorage);
  const auth = () => resolveApiAuth(localStorage).authorization ?? '';

  async function startCount() {
    message = '';
    const res = await fetch(`${apiBase()}/api/inventory/counts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth() },
      body: JSON.stringify({ branchId, differenceThresholdCents: 1000 }),
    });
    const json = (await res.json()) as { id?: string; error?: string };
    messageOk = res.ok;
    message = res.ok ? `Conteo ${json.id} abierto · estado COUNTING` : (json.error ?? 'error');
  }

  async function createLoss() {
    message = '';
    const res = await fetch(`${apiBase()}/api/inventory/losses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: auth() },
      body: JSON.stringify({
        branchId,
        productId,
        quantity: lossQty,
        category: 'DAMAGED',
        evidenceR2Key: evidenceKey,
        reason,
      }),
    });
    const json = (await res.json()) as { id?: string; error?: string };
    messageOk = res.ok;
    message = res.ok ? `Merma ${json.id} registrada · estado PENDING` : (json.error ?? 'error');
  }
</script>

<svelte:head><title>Inventario · Conteo & Merma · KipusPay</title></svelte:head>

<div class="page-shell" data-testid="admin-inventario">
  <div class="page-masthead">
    <div>
      <p class="page-eyebrow"><Icon name="box" size={12} /> Inventario · Conteo & Merma</p>
      <h1 class="page-title">Control de inventario</h1>
      <p class="page-lede">Hoja ciega de conteo físico y registro de mermas con evidencia.</p>
    </div>
    <a class="link-action" href="/admin/series">
      <Icon name="barcode" size={14} />
      Buscar serie
    </a>
  </div>

  {#if message}
    <StatusMessage tone={messageOk ? 'info' : 'danger'} aria-live="polite">
      <Icon name={messageOk ? 'check' : 'alert'} size={16} />
      <span>{message}</span>
    </StatusMessage>
  {/if}

  {#if !invOn}
    <div class="feature-off-banner" data-testid="admin-inv-off">
      <Icon name="info" size={18} />
      <span>El inventario no está activo para este negocio.</span>
    </div>
  {:else}
    <div class="inv-grid">
      <!-- Contexto -->
      <section class="glass-card section-pad">
        <div class="card-header">
          <h2>Contexto</h2>
          <span class="section-tag">Sucursal & Producto</span>
        </div>
        <div class="field-group">
          <label for="branch-input">Sucursal</label>
          <input id="branch-input" bind:value={branchId} data-testid="admin-inv-branch" />
        </div>
        <div class="field-group">
          <label for="product-input">Producto</label>
          <input id="product-input" bind:value={productId} data-testid="admin-inv-product" />
        </div>
      </section>

      <!-- Conteo físico -->
      <section class="glass-card section-pad">
        <div class="card-header">
          <h2>Conteo físico</h2>
          <span class="badge badge-warning">Hoja ciega</span>
        </div>
        <p class="hint-text">El sistema no muestra stock esperado en hoja ciega hasta el review.</p>
        <div class="field-group">
          <label for="counted-input">Contado</label>
          <input type="number" id="counted-input" bind:value={countedQty} data-testid="admin-inv-counted" />
        </div>
        <div class="field-group">
          <label for="system-input">Sistema (solo review)</label>
          <input type="number" id="system-input" bind:value={systemQty} data-testid="admin-inv-system" />
        </div>
        <Button variant="primary" data-testid="admin-inv-count-start" onclick={startCount}>
          <Icon name="clipboard-check" size={14} />
          Abrir conteo ciego
        </Button>
      </section>

      <!-- Merma -->
      <section class="glass-card section-pad">
        <div class="card-header">
          <h2>Registro de merma</h2>
          <span class="badge badge-danger">DAMAGED</span>
        </div>
        <div class="field-group">
          <label for="loss-qty-input">Cantidad</label>
          <input type="number" id="loss-qty-input" bind:value={lossQty} data-testid="admin-inv-loss-qty" />
        </div>
        <div class="field-group">
          <label for="evidence-input">Evidencia R2 Key</label>
          <input id="evidence-input" bind:value={evidenceKey} data-testid="admin-inv-evidence" placeholder="r2/merma/foto.jpg" />
        </div>
        <div class="field-group">
          <label for="reason-input">Motivo</label>
          <textarea id="reason-input" bind:value={reason} data-testid="admin-inv-reason" rows="3" placeholder="Describe la causa de la merma…"></textarea>
        </div>
        <Button variant="danger" data-testid="admin-inv-loss-create" onclick={createLoss}>
          <Icon name="alert" size={14} />
          Registrar merma
        </Button>
      </section>
    </div>
  {/if}

  {#if greOn}
    <section class="glass-card section-pad gre-card" data-testid="gre-panel">
      <div class="card-header">
        <h2>Guía de Remisión Electrónica</h2>
        <span class="section-tag">Traslado · serie T (P1b)</span>
      </div>
      <p class="gre-lede">
        Declara un traslado de mercadería (motivo catálogo 18) antes de iniciarlo. No toca stock ni saldos.
      </p>
      <div class="gre-grid">
        <div class="field-group">
          <label for="gre-series">Serie</label>
          <input id="gre-series" bind:value={greSeries} data-testid="gre-series" />
        </div>
        <div class="field-group">
          <label for="gre-motive">Motivo</label>
          <select id="gre-motive" bind:value={greMotive} data-testid="gre-motive">
            <option value="01">01 — Venta</option>
            <option value="02">02 — Compra</option>
            <option value="04">04 — Entrega a terceros</option>
            <option value="08">08 — Importación</option>
            <option value="13">13 — Devolución</option>
            <option value="14">14 — Exportación</option>
            <option value="16">16 — Transformación</option>
          </select>
        </div>
        <div class="field-group">
          <label for="gre-mode">Modalidad transporte</label>
          <select id="gre-mode" bind:value={greMode} data-testid="gre-mode">
            <option value="01">01 — Público</option>
            <option value="02">02 — Privado</option>
          </select>
        </div>
        <div class="field-group">
          <label for="gre-plate">Placa del vehículo</label>
          <input id="gre-plate" bind:value={grePlate} data-testid="gre-plate" placeholder="ABC-123" />
        </div>
        <div class="field-group">
          <label for="gre-carrier-doc">Transportista (tipo doc)</label>
          <select id="gre-carrier-doc" bind:value={greCarrierDoc} data-testid="gre-carrier-doc">
            <option value="1">DNI</option>
            <option value="6">RUC</option>
          </select>
        </div>
        <div class="field-group">
          <label for="gre-carrier-number">N.º documento transportista</label>
          <input id="gre-carrier-number" bind:value={greCarrierNumber} data-testid="gre-carrier-number" />
        </div>
        <div class="field-group">
          <label for="gre-carrier-name">Nombre transportista</label>
          <input id="gre-carrier-name" bind:value={greCarrierName} data-testid="gre-carrier-name" />
        </div>
        <div class="field-group">
          <label for="gre-origin">Origen (dirección)</label>
          <input id="gre-origin" bind:value={greOriginAddress} data-testid="gre-origin-address" placeholder="Av. Lima 100" />
        </div>
        <div class="field-group">
          <label for="gre-dest">Destino (dirección)</label>
          <input id="gre-dest" bind:value={greDestAddress} data-testid="gre-dest-address" placeholder="Jr. Callao 200" />
        </div>
        <div class="field-group">
          <label for="gre-started">Inicio de traslado</label>
          <input id="gre-started" type="datetime-local" bind:value={greStartedAt} data-testid="gre-started" />
        </div>
        <div class="field-group">
          <label for="gre-qty">Cantidad del ítem {productId}</label>
          <input id="gre-qty" type="number" min="1" bind:value={greQtyMicrounits} data-testid="gre-qty" />
        </div>
      </div>
      <button type="button" class="primary" data-testid="gre-submit" onclick={onIssueGre}>
        Emitir guía de remisión
      </button>
      {#if greMsg}
        <p class="gre-msg" data-testid="gre-msg" class:gre-msg-ok={greIssued}>{greMsg}</p>
      {/if}
    </section>
  {/if}
</div>

<style>
  .inv-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 1.25rem;
    align-items: start;
  }



  .hint-text {
    font-size: 0.8125rem;
    color: var(--text-dim);
    margin-bottom: 0.875rem;
    line-height: 1.4;
  }





  .link-action {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--bg-button-sec);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    color: var(--accent-primary);
    font-size: 0.875rem;
    font-weight: 600;
    text-decoration: none;
    transition: all var(--transition-fast);
    min-height: 38px;
    white-space: nowrap;
  }

  .link-action:hover {
    background: var(--bg-glass-hover);
    border-color: var(--accent-primary);
  }

  @media (max-width: 900px) {
    .inv-grid {
      grid-template-columns: 1fr 1fr;
    }
  }

  @media (max-width: 600px) {
    .inv-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
