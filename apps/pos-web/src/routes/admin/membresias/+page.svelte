<script lang="ts">
  import { tick } from 'svelte';
  import { readAdminAuthenticatedSessionState } from '$lib/admin/authenticated-session';
  import Icon from '$lib/ui/Icon.svelte';
  import {
    createRecurringSalesApi,
    type RecurringFrequency,
    type RecurringPlanSummary,
    type RecurringPricingPolicy,
  } from '$lib/recurring-sales/recurring-sales-client';
  import { isRecurringSalesEnabled } from '$lib/features';

  const enabled = isRecurringSalesEnabled();
  const sessionState = readAdminAuthenticatedSessionState();
  const session = $derived(sessionState?.current ?? null);
  const roleAllowed = $derived(['owner', 'admin'].includes(session?.role?.toLowerCase() ?? ''));
  const api = $derived(
    session
      ? createRecurringSalesApi({
          authenticatedFetch: session.authenticatedFetch,
          apiBase: (import.meta.env.PUBLIC_API_BASE as string | undefined) ?? '',
        })
      : null,
  );

  let branchId = $state('');
  let plans = $state<RecurringPlanSummary[]>([]);
  let selected = $state<RecurringPlanSummary | null>(null);
  let occurrences = $state<Record<string, unknown>[]>([]);
  let loading = $state(false);
  let online = $state(true);
  let message = $state('Indica una sucursal para cargar sus membresías.');
  let alert = $state('');
  let customerId = $state('');
  let productId = $state('');
  let productUomId = $state('');
  let documentType = $state<'NV' | '03' | '01'>('03');
  let pricingPolicy = $state<RecurringPricingPolicy>('FIXED');
  let frequency = $state<RecurringFrequency>('MONTHLY');
  let quantityMicrounits = $state(1_000_000);
  let graceDays = $state(3);
  let preview = $state<Record<string, unknown> | null>(null);
  let nextPreview = $state<Record<string, unknown> | null>(null);
  let editing = $state(false);
  let previewPanel = $state<HTMLElement | null>(null);

  function money(value: unknown): string {
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(
      typeof value === 'number' ? value / 100 : 0,
    );
  }

  function date(value: unknown): string {
    if (typeof value !== 'string') return 'Sin fecha';
    return new Intl.DateTimeFormat('es-PE', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'America/Lima',
    }).format(new Date(value));
  }

  async function refresh() {
    if (!api || !enabled || !roleAllowed || !branchId.trim()) return;
    loading = true;
    alert = '';
    try {
      plans = [...(await api.list({ branchId }))];
      message = `${plans.length} membresías cargadas desde el servidor.`;
    } catch (error) {
      alert = error instanceof Error && error.message === 'RECURRING_OFFLINE'
        ? 'Sin conexión. No se muestran datos locales porque esta pantalla requiere estado autoritativo.'
        : 'No se pudo cargar la lista. Revisa la sucursal y vuelve a intentar.';
    } finally {
      loading = false;
    }
  }

  async function openPlan(plan: RecurringPlanSummary) {
    if (!api) return;
    selected = plan;
    preview = null;
    try {
      const history = await api.occurrences({ planId: plan.id, branchId: plan.branch_id });
      occurrences = history.occurrences as Record<string, unknown>[];
      message = `Membresía ${plan.id} abierta con su historial de ocurrencias.`;
    } catch {
      occurrences = [];
      alert = 'No se pudo cargar el historial. El detalle permanece cerrado a datos incompletos.';
    }
  }

  async function createPlan() {
    if (!api || !branchId || !customerId || !productId || !productUomId) return;
    alert = '';
    try {
      const draft = {
        branchId,
        customerId,
        documentType,
        pricingPolicy,
        frequency,
        graceDays,
        items: [{ productId, productUomId, quantityMicrounits: Math.trunc(quantityMicrounits) }],
      };
      if (editing && selected) {
        await api.update({ ...draft, planId: selected.id, expectedVersion: selected.version });
      } else {
        await api.create(draft);
      }
      message = `Membresía ${editing ? 'actualizada' : 'creada'} con precio ${pricingPolicy === 'FIXED' ? 'fijo' : 'vigente'} resuelto por el servidor.`;
      editing = false;
      selected = null;
      await refresh();
    } catch {
      alert = 'No se creó la membresía. Verifica cliente, producto, UOM y calendario.';
    }
  }

  async function previewNextRun() {
    if (!api || !selected) return;
    try {
      nextPreview = await api.preview({
        planId: selected.id,
        branchId: selected.branch_id,
      });
      message = 'Vista previa de próxima ejecución calculada con datos del servidor.';
    } catch {
      alert = 'No se pudo calcular la próxima ejecución.';
    }
  }

  function editSelected() {
    if (!selected) return;
    editing = true;
    branchId = selected.branch_id;
    customerId = selected.customer_id;
    documentType = selected.document_type;
    pricingPolicy = selected.pricing_policy;
    frequency = selected.frequency;
    graceDays = selected.grace_days;
    message = 'Editando una nueva versión; la historia anterior permanece inmutable.';
  }

  async function pauseOrResume() {
    if (!api || !selected) return;
    try {
      if (selected.status === 'PAUSED') {
        await api.resume({
          planId: selected.id,
          branchId: selected.branch_id,
          expectedVersion: selected.version,
        });
        message = 'Membresía reanudada. Las próximas ejecuciones vuelven a estar activas.';
      } else {
        await api.pause({
          planId: selected.id,
          branchId: selected.branch_id,
          expectedVersion: selected.version,
        });
        message = 'Membresía pausada. La caja ordinaria continúa disponible.';
      }
      selected = null;
      await refresh();
    } catch {
      alert = 'El estado cambió en el servidor. Actualiza antes de volver a intentar.';
    }
  }

  async function cancelAtEnd() {
    if (!api || !selected) return;
    try {
      await api.cancel({
        planId: selected.id,
        branchId: selected.branch_id,
        expectedVersion: selected.version,
        mode: 'AT_PERIOD_END',
        idempotencyKey: crypto.randomUUID(),
      });
      message = 'Cancelación programada al final del período. No se genera crédito.';
      selected = null;
      await refresh();
    } catch {
      alert = 'No se pudo programar la cancelación. Actualiza el estado.';
    }
  }

  async function previewImmediateCancellation() {
    if (!api || !selected) return;
    try {
      preview = await api.cancelPreview({
        planId: selected.id,
        branchId: selected.branch_id,
        expectedVersion: selected.version,
      });
      await tick();
      previewPanel?.focus();
      message = 'Vista previa calculada por el servidor. Revisa el crédito antes de confirmar.';
    } catch {
      alert = 'No se pudo calcular el crédito. No se realizó ninguna cancelación.';
    }
  }

  async function confirmImmediateCancellation() {
    if (!api || !selected || !preview) return;
    try {
      await api.cancel({
        planId: selected.id,
        branchId: selected.branch_id,
        expectedVersion: selected.version,
        mode: 'IMMEDIATE',
        confirm: true,
        idempotencyKey: crypto.randomUUID(),
      });
      message = 'Membresía cancelada. El servidor emitió el ajuste indicado en la vista previa.';
      preview = null;
      selected = null;
      await refresh();
    } catch {
      alert = 'La confirmación no se aplicó. Actualiza y solicita una nueva vista previa.';
    }
  }

  function closePreview() {
    preview = null;
    message = 'Cancelación inmediata descartada sin cambios.';
  }

  $effect(() => {
    if (!branchId && session?.branchId) branchId = session.branchId;
    online = typeof navigator === 'undefined' ? true : navigator.onLine;
  });
</script>

<svelte:head><title>Membresías · Admin · KipusPay</title></svelte:head>

<div class="page-shell" data-testid="memberships-root">
  <div class="page-masthead">
    <div>
      <p class="page-eyebrow"><Icon name="calendar" size={12} /> Admin · Ventas recurrentes</p>
      <h1 class="page-title">Membresías</h1>
      <p class="page-lede">Genera una venta y una deuda por período. Cada período emite su NV o CPE.</p>
    </div>
    <div class="connection-badge" class:offline={!online} aria-live="polite">
      <Icon name={online ? 'wifi' : 'wifi-off'} size={14} />
      <span>{online ? 'En línea' : 'Sin conexión'}</span>
    </div>
  </div>

  <!-- Info boxes -->
  <div class="info-pills">
    <div class="info-pill"><Icon name="shield" size={14} /> <span>Sin autocobro — sin tarjeta ni mandato de pago</span></div>
    <div class="info-pill"><Icon name="dollar" size={14} /> <span>Precio FIXED: importe fijo al crear versión. CURRENT: sigue el catálogo</span></div>
    <div class="info-pill"><Icon name="info" size={14} /> <span>La mora no bloquea la caja ni el checkout ordinario</span></div>
  </div>

  {#if !enabled}
    <div class="feature-off-banner" role="alert">Membresías está desactivado para este entorno.</div>
  {:else if !session}
    <div class="status-alert danger" role="alert">No hay una sesión autenticada válida. Acceso cerrado.</div>
  {:else if !roleAllowed}
    <div class="status-alert danger" role="alert">Solo Owner o Admin pueden administrar membresías.</div>
  {:else}
    {#if alert}
      <div class="status-alert danger" role="alert">{alert}</div>
    {/if}

    <!-- Toolbar -->
    <div class="toolbar-bar">
      <div class="field-inline">
        <label for="branch">Sucursal</label>
        <input id="branch" data-testid="memberships-branch-input" bind:value={branchId} autocomplete="off" placeholder="ID sucursal" />
      </div>
      <button type="button" class="secondary" data-testid="memberships-refresh-btn" onclick={refresh} disabled={!online || loading || !branchId.trim()}>
        <Icon name="refresh" size={14} />
        {loading ? 'Cargando…' : 'Actualizar'}
      </button>
    </div>

    <div class="workspace-grid">
      <!-- Columna 1: Calendario -->
      <section class="glass-card section-pad" aria-labelledby="calendar-title">
        <div class="card-header">
          <h2 id="calendar-title">Calendario</h2>
          <span class="badge badge-warning">{plans.length}</span>
        </div>
        <div class="plan-list">
          {#each plans as plan (plan.id)}
            <button class="plan-card" class:active={selected?.id === plan.id} data-testid="memberships-plan-card" type="button" onclick={() => openPlan(plan)}>
              <div class="plan-main">
                <strong class="plan-customer">{plan.customer_id}</strong>
                <span class="badge {plan.status === 'ACTIVE' ? 'badge-success' : plan.status === 'PAUSED' ? 'badge-muted' : 'badge-danger'} badge-sm">{plan.status}</span>
              </div>
              <div class="plan-meta">
                <span>{plan.document_type} · {plan.pricing_policy}</span>
                <span class="tabular-nums">{money(plan.balance_due_cents)}</span>
              </div>
              <div class="plan-next">
                <Icon name="clock" size={12} />
                <span>{date(plan.next_run_at)}</span>
              </div>
            </button>
          {:else}
            <div class="empty-state">
              <Icon name="info" size={22} />
              <span>No hay membresías para esta sucursal.</span>
            </div>
          {/each}
        </div>
      </section>

      <!-- Columna 2: Detalle -->
      <section class="glass-card section-pad" aria-labelledby="detail-title">
        <div class="card-header">
          <h2 id="detail-title">Detalle y control</h2>
          {#if selected}<span class="badge badge-indigo">{selected.status}</span>{/if}
        </div>
        {#if selected}
          <dl class="detail-grid">
            <div><dt>Próxima ejecución</dt><dd>{date(selected.next_run_at)}</dd></div>
            <div><dt>Documento</dt><dd>{selected.document_type}</dd></div>
            <div><dt>Política</dt><dd>{selected.pricing_policy}</dd></div>
            <div><dt>Período de gracia</dt><dd>{selected.grace_days} días</dd></div>
            <div><dt>Cuentas por cobrar</dt><dd class="tabular-nums">{money(selected.balance_due_cents)}</dd></div>
          </dl>

          {#if selected.retry_count > 0}
            <div class="status-alert warning">
              <Icon name="alert" size={14} />
              <span>Reintento pendiente · {date(selected.next_retry_at)} · {selected.last_error_code ?? 'PENDIENTE'}</span>
            </div>
          {/if}

          {#if nextPreview}
            <div class="status-alert info" role="status">
              <Icon name="clock" size={14} />
              <span>{String(nextPreview.pricingPolicy)} · {date(nextPreview.periodStart)} → {date(nextPreview.periodEnd)}</span>
            </div>
          {/if}

          <div class="action-grid">
            <button type="button" class="secondary" data-testid="memberships-preview-next-btn" onclick={previewNextRun} disabled={!online}>
              Vista previa siguiente
            </button>
            <button type="button" class="secondary" data-testid="memberships-edit-btn" onclick={editSelected}>
              Editar versión
            </button>
            <button type="button" class="secondary" data-testid="memberships-pause-resume-btn" onclick={pauseOrResume} disabled={!online}>
              {selected.status === 'PAUSED' ? 'Reanudar' : 'Pausar'}
            </button>
            <button type="button" class="secondary" data-testid="memberships-cancel-at-end-btn" onclick={cancelAtEnd} disabled={!online}>
              Cancelar al período
            </button>
            <button class="danger-btn" type="button" data-testid="memberships-cancel-immediate-btn" onclick={previewImmediateCancellation} disabled={!online}>
              Cancelar ahora + crédito
            </button>
          </div>

          <h3 class="history-title">Historial de ocurrencias</h3>
          <div class="history-list">
            {#each occurrences as occurrence}
              <div class="occurrence-row">
                <span class="badge badge-indigo badge-sm">{String(occurrence.document_type ?? 'DOC')}</span>
                <span class="occ-dates">{date(occurrence.period_start)} → {date(occurrence.period_end)}</span>
                <span class="tabular-nums">{money(occurrence.total_amount_cents)}</span>
                <span class="occ-debt tabular-nums">Deuda: {money(occurrence.balance_due_cents)}</span>
              </div>
            {:else}
              <p class="no-occurrences">Todavía no hay ocurrencias emitidas.</p>
            {/each}
          </div>
        {:else}
          <div class="empty-state">
            <Icon name="list" size={24} />
            <span>Selecciona una membresía para ver estado, gracia, CxC e historial.</span>
          </div>
        {/if}
      </section>

      <!-- Columna 3: Crear -->
      <aside class="glass-card section-pad" aria-labelledby="create-title">
        <div class="card-header">
          <h2 id="create-title">{editing ? 'Editar versión' : 'Crear membresía'}</h2>
          <Icon name="plus" size={16} />
        </div>
        <div class="field-group">
          <label for="customer">Cliente</label>
          <input id="customer" data-testid="memberships-customer-input" bind:value={customerId} />
        </div>
        <div class="field-group">
          <label for="product">Producto o servicio</label>
          <input id="product" data-testid="memberships-product-input" bind:value={productId} />
        </div>
        <div class="field-group">
          <label for="uom">Unidad de medida</label>
          <input id="uom" data-testid="memberships-uom-input" bind:value={productUomId} />
        </div>
        <div class="field-group">
          <label for="quantity">Cantidad (microunidades)</label>
          <input id="quantity" data-testid="memberships-quantity-input" type="number" min="1" bind:value={quantityMicrounits} />
        </div>
        <div class="field-group">
          <label for="document">Tipo de documento</label>
          <select id="document" data-testid="memberships-document-select" bind:value={documentType}>
            <option value="NV">Nota de venta</option>
            <option value="03">Boleta</option>
            <option value="01">Factura</option>
          </select>
        </div>
        <div class="field-group">
          <label for="pricing">Política de precio</label>
          <select id="pricing" data-testid="memberships-pricing-select" bind:value={pricingPolicy}>
            <option value="FIXED">Precio fijo (FIXED)</option>
            <option value="CURRENT">Precio vigente (CURRENT)</option>
          </select>
        </div>
        <div class="field-group">
          <label for="frequency">Frecuencia</label>
          <select id="frequency" data-testid="memberships-frequency-select" bind:value={frequency}>
            <option value="DAILY">Diaria</option>
            <option value="WEEKLY">Semanal</option>
            <option value="MONTHLY">Mensual</option>
            <option value="ANNUALLY">Anual</option>
          </select>
        </div>
        <div class="field-group">
          <label for="grace">Días de gracia</label>
          <input id="grace" data-testid="memberships-grace-input" type="number" min="0" bind:value={graceDays} />
        </div>
        <button class="primary" type="button" data-testid="memberships-create-btn" onclick={createPlan}
          disabled={!online || !branchId || !customerId || !productId || !productUomId}>
          <Icon name="plus" size={14} />
          {editing ? 'Guardar nueva versión' : 'Crear con precio del servidor'}
        </button>
      </aside>
    </div>
  {/if}

  <!-- Modal cancelación inmediata -->
  {#if preview}
    <div
      class="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      tabindex="-1"
      bind:this={previewPanel}
      onkeydown={(event) => event.key === 'Escape' && closePreview()}
    >
      <div class="glass-card modal-card">
        <h2 id="confirm-title">Confirmar cancelación inmediata</h2>
        <p>Crédito proporcional: <strong class="tabular-nums">{money(preview.creditAmountCents)}</strong></p>
        <p>
          Resultado: <strong>{preview.adjustmentDocumentType === '07' ? 'Nota de crédito' : 'NV_RETURN'}</strong>.
          La venta original no se modifica.
        </p>
        <div class="modal-actions">
          <button type="button" class="secondary" data-testid="memberships-modal-close-btn" onclick={closePreview}>Volver sin cancelar</button>
          <button class="danger-btn" type="button" data-testid="memberships-modal-confirm-btn" onclick={confirmImmediateCancellation}>Confirmar cancelación</button>
        </div>
      </div>
    </div>
  {/if}

  <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">{message}</p>
</div>

<style>
  .connection-badge {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    border-radius: var(--radius-full);
    font-size: 0.8125rem;
    font-weight: 600;
    background: rgba(46, 158, 116, 0.12);
    border: 1px solid rgba(46, 158, 116, 0.3);
    color: var(--emerald-green);
  }
  .connection-badge.offline {
    background: rgba(217, 106, 60, 0.12);
    border-color: rgba(217, 106, 60, 0.3);
    color: var(--rose-red);
  }

  .info-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .info-pill {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.8125rem;
    color: var(--text-muted);
    padding: 0.375rem 0.75rem;
    background: var(--bg-glass);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-full);
  }

  .toolbar-bar {
    display: flex;
    align-items: flex-end;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .field-inline {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex: 1;
    min-width: 12rem;
  }

  .workspace-grid {
    display: grid;
    grid-template-columns: 0.85fr 1.25fr 0.8fr;
    gap: 1.25rem;
    align-items: start;
  }

  .section-pad { padding: 1.25rem; }

  .plan-list { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.75rem; }

  .plan-card {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.75rem;
    background: var(--bg-glass);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    text-align: left;
    cursor: pointer;
    transition: all var(--transition-fast);
    width: 100%;
    font: inherit;
    color: inherit;
  }
  .plan-card:hover { border-color: var(--accent-primary); background: var(--bg-glass-hover); }
  .plan-card.active { border-color: var(--accent-primary); background: rgba(217, 154, 61, 0.08); box-shadow: inset 3px 0 var(--accent-primary); }

  .plan-main { display: flex; justify-content: space-between; align-items: center; }
  .plan-customer { font-weight: 700; font-size: 0.875rem; color: var(--text-main); }
  .plan-meta { display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-muted); }
  .plan-next { display: flex; align-items: center; gap: 0.25rem; font-size: 0.75rem; color: var(--text-dim); }

  .badge-sm { font-size: 0.625rem; padding: 0.1rem 0.375rem; }

  .detail-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }
  .detail-grid div {
    padding: 0.5rem;
    background: var(--bg-glass);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
  }
  .detail-grid dt { font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-dim); margin-bottom: 0.2rem; }
  .detail-grid dd { margin: 0; font-weight: 700; font-size: 0.9375rem; }

  .action-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
    margin: 1rem 0;
  }

  .danger-btn {
    padding: 0.5rem 1rem;
    border: 1px solid var(--rose-red);
    color: var(--rose-red);
    background: rgba(217, 106, 60, 0.08);
    border-radius: var(--radius-sm);
    font-weight: 700;
    cursor: pointer;
    font: inherit;
    min-height: 38px;
    transition: all var(--transition-fast);
    width: 100%;
  }
  .danger-btn:hover { background: rgba(217, 106, 60, 0.15); }

  .history-title { font-size: 0.9375rem; font-weight: 700; margin: 1rem 0 0.5rem; color: var(--text-main); }

  .history-list { display: flex; flex-direction: column; gap: 0.375rem; }

  .occurrence-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    padding: 0.5rem 0.625rem;
    background: var(--bg-glass);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    font-size: 0.8125rem;
  }
  .occ-dates { flex: 1; color: var(--text-muted); }
  .occ-debt { color: var(--text-dim); }
  .no-occurrences { color: var(--text-muted); font-size: 0.875rem; }

  .field-group { display: flex; flex-direction: column; gap: 0.375rem; margin-bottom: 0.75rem; }
  .field-group label { font-weight: 700; font-size: 0.8125rem; color: var(--text-muted); }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 2rem 1rem;
    color: var(--text-dim);
    font-size: 0.875rem;
    text-align: center;
  }

  .modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    backdrop-filter: blur(4px);
  }
  .modal-card {
    width: min(34rem, calc(100vw - 2rem));
    padding: 1.5rem;
    border: 1px solid var(--rose-red);
  }
  .modal-actions { display: flex; gap: 0.75rem; margin-top: 1.25rem; }

  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; }

  @media (max-width: 1000px) { .workspace-grid { grid-template-columns: 1fr 1fr; } aside { grid-column: 1 / -1; } }
  @media (max-width: 650px) { .workspace-grid { grid-template-columns: 1fr; } .detail-grid { grid-template-columns: 1fr; } .action-grid { grid-template-columns: 1fr; } }
</style>
