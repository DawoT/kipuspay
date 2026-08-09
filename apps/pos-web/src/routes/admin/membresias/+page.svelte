<script lang="ts">
  import { tick } from 'svelte';
  import { readAdminAuthenticatedSessionState } from '$lib/admin/authenticated-session';
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

<svelte:head><title>Membresías · KipusPay</title></svelte:head>

<main class="memberships">
  <header class="hero">
    <div>
      <p class="eyebrow">Administración · calendario Lima</p>
      <h1>Membresías</h1>
      <p class="lede">Genera una venta y una deuda por período. Cada período emite su NV o CPE.</p>
    </div>
    <output class:offline={!online} aria-live="polite">
      {online ? 'En línea · estado del servidor' : 'Sin conexión · acciones deshabilitadas'}
    </output>
  </header>

  <section class="explanation" aria-label="Cómo funcionan las membresías">
    <p><strong>Sin autocobro:</strong> no guardamos tarjeta ni mandato de pago.</p>
    <p><strong>Precio fijo:</strong> conserva el importe que el servidor resolvió al crear la versión.</p>
    <p><strong>Precio vigente:</strong> CURRENT puede cambiar con el catálogo en cada ejecución.</p>
    <p>El servidor calcula el importe, impuestos, documento y deuda.</p>
    <p>La mora de esta membresía no bloquea la caja ni el checkout ordinario.</p>
    <p>El Período de gracia solo regula futuras ejecuciones; después puede pausarse según la política.</p>
  </section>

  {#if !enabled}
    <p role="alert" class="alert">Membresías está desactivado para este entorno.</p>
  {:else if !session}
    <p role="alert" class="alert">No hay una sesión autenticada válida. Acceso cerrado.</p>
  {:else if !roleAllowed}
    <p role="alert" class="alert">Solo Owner o Admin pueden administrar membresías.</p>
  {:else}
    {#if alert}<p role="alert" class="alert">{alert}</p>{/if}
    <div class="toolbar">
      <label for="branch">Sucursal explícita</label>
      <input id="branch" bind:value={branchId} autocomplete="off" />
      <button type="button" onclick={refresh} disabled={!online || loading || !branchId.trim()}>
        {loading ? 'Cargando…' : 'Actualizar calendario'}
      </button>
    </div>

    <div class="workspace">
      <section aria-labelledby="calendar-title">
        <h2 id="calendar-title">Calendario de próxima ejecución</h2>
        <div class="plan-list">
          {#each plans as plan (plan.id)}
            <button class="plan" class:selected={selected?.id === plan.id} type="button" onclick={() => openPlan(plan)}>
              <span><strong>{plan.customer_id}</strong><small>{plan.document_type} · {plan.pricing_policy}</small></span>
              <span><b>{plan.status}</b><small>Próxima ejecución: {date(plan.next_run_at)}</small></span>
              <span><small>Gracia: {plan.grace_days} días</small><small>CxC: {money(plan.balance_due_cents)}</small></span>
            </button>
          {:else}
            <p>No hay membresías para esta sucursal.</p>
          {/each}
        </div>
      </section>

      <section aria-labelledby="detail-title">
        <h2 id="detail-title">Detalle y control</h2>
        {#if selected}
          <dl>
            <div><dt>Estado</dt><dd>{selected.status}</dd></div>
            <div><dt>Próxima ejecución</dt><dd>{date(selected.next_run_at)}</dd></div>
            <div><dt>Documento</dt><dd>{selected.document_type}</dd></div>
            <div><dt>Política</dt><dd>{selected.pricing_policy}</dd></div>
            <div><dt>Período de gracia</dt><dd>{selected.grace_days} días</dd></div>
            <div><dt>Cuentas por cobrar</dt><dd>{money(selected.balance_due_cents)}</dd></div>
          </dl>
          <div class="status-note">
            {#if selected.retry_count > 0}
              <strong>Reintento pendiente</strong>
              <span>{date(selected.next_retry_at)} · estado seguro {selected.last_error_code ?? 'PENDIENTE'}</span>
            {:else}
              <strong>Sin reintento pendiente</strong>
              <span>La próxima ejecución conserva su calendario civil.</span>
            {/if}
          </div>
          <div class="actions">
            <button type="button" onclick={previewNextRun} disabled={!online}>Vista previa de próxima ejecución</button>
            <button type="button" onclick={editSelected}>Editar siguiente versión</button>
            <button type="button" onclick={pauseOrResume} disabled={!online}>
              {selected.status === 'PAUSED' ? 'Reanudar membresía' : 'Pausar membresía'}
            </button>
            <button type="button" onclick={cancelAtEnd} disabled={!online}>Cancelar al final del período</button>
            <button class="danger" type="button" onclick={previewImmediateCancellation} disabled={!online}>
              Cancelar ahora y calcular crédito
            </button>
          </div>
          {#if nextPreview}
            <div class="status-note" role="status">
              <strong>{String(nextPreview.pricingPolicy)} · Precio del servidor</strong>
              <span>{date(nextPreview.periodStart)} → {date(nextPreview.periodEnd)}</span>
            </div>
          {/if}
          <h3>Historial y reintentos</h3>
          <div class="history">
            {#each occurrences as occurrence}
              <article>
                <strong>{String(occurrence.document_type ?? 'Documento')}</strong>
                <span>{date(occurrence.period_start)} → {date(occurrence.period_end)}</span>
                <span>Precio aplicado: {money(occurrence.total_amount_cents)}</span>
                <span>Deuda: {money(occurrence.balance_due_cents)} · {String(occurrence.receivable_status ?? '')}</span>
              </article>
            {:else}
              <p>Todavía no hay ocurrencias emitidas.</p>
            {/each}
          </div>
        {:else}
          <p>Selecciona una membresía para ver estado, gracia, CxC, items e historial.</p>
        {/if}
      </section>

      <aside aria-labelledby="create-title">
        <h2 id="create-title">Crear membresía</h2>
        <label for="customer">Cliente</label><input id="customer" bind:value={customerId} />
        <label for="product">Producto o servicio</label><input id="product" bind:value={productId} />
        <label for="uom">Unidad</label><input id="uom" bind:value={productUomId} />
        <label for="quantity">Cantidad en microunidades</label>
        <input id="quantity" type="number" min="1" bind:value={quantityMicrounits} />
        <label for="document">Tipo de documento</label>
        <select id="document" bind:value={documentType}>
          <option value="NV">Nota de venta</option><option value="03">Boleta</option><option value="01">Factura</option>
        </select>
        <label for="pricing">Semántica de precio</label>
        <select id="pricing" bind:value={pricingPolicy}>
          <option value="FIXED">Precio fijo (FIXED)</option><option value="CURRENT">Precio vigente (CURRENT)</option>
        </select>
        <label for="frequency">Frecuencia</label>
        <select id="frequency" bind:value={frequency}>
          <option value="DAILY">Diaria</option><option value="WEEKLY">Semanal</option><option value="MONTHLY">Mensual</option>
        </select>
        <label for="grace">Días de gracia</label><input id="grace" type="number" min="0" bind:value={graceDays} />
        <button class="primary" type="button" onclick={createPlan} disabled={!online || !branchId || !customerId || !productId || !productUomId}>
          {editing ? 'Guardar nueva versión' : 'Crear con precio del servidor'}
        </button>
      </aside>
    </div>
  {/if}

  {#if preview}
    <div
      class="confirm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      tabindex="-1"
      bind:this={previewPanel}
      onkeydown={(event) => event.key === 'Escape' && closePreview()}
    >
      <h2 id="confirm-title">Confirmar cancelación inmediata</h2>
      <p>Crédito proporcional: <strong>{money(preview.creditAmountCents)}</strong></p>
      <p>
        Resultado:
        <strong>{preview.adjustmentDocumentType === '07' ? 'Nota de crédito' : 'NV_RETURN'}</strong>.
        La venta original no se modifica.
      </p>
      <div class="actions">
        <button type="button" onclick={closePreview}>Volver sin cancelar</button>
        <button class="danger" type="button" onclick={confirmImmediateCancellation}>Confirmar cancelación</button>
      </div>
    </div>
  {/if}

  <p class="announcer" role="status" aria-live="polite" aria-atomic="true">{message}</p>
</main>

<style>
  .memberships { max-width: 1320px; margin: 0 auto; color: var(--text-main); }
  .hero, .toolbar, .actions { display: flex; align-items: center; justify-content: space-between; gap: .8rem; flex-wrap: wrap; }
  .hero { padding-bottom: 1rem; border-bottom: 3px solid var(--accent-primary); }
  .eyebrow { color: var(--accent-primary); font: 750 .75rem/1.2 ui-monospace, monospace; letter-spacing: .1em; text-transform: uppercase; }
  h1 { margin: .2rem 0; font-size: clamp(2.2rem, 7vw, 4.4rem); line-height: .95; }
  h2 { margin-top: 0; }
  .lede, small { color: var(--text-muted); }
  output, .alert, .announcer, .status-note { padding: .75rem; border: 1px solid var(--border-subtle); border-left: 5px solid var(--accent-primary); }
  output.offline, .alert { border-left-color: #e4572e; }
  .explanation { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; margin: 1rem 0; background: var(--border-subtle); border: 1px solid var(--border-subtle); }
  .explanation p { margin: 0; padding: .8rem; background: var(--surface-card); }
  .toolbar { margin: 1rem 0; justify-content: flex-start; }
  .workspace { display: grid; grid-template-columns: .85fr 1.25fr .8fr; gap: 1px; background: var(--border-subtle); border: 1px solid var(--border-subtle); }
  .workspace > * { min-width: 0; padding: 1rem; background: var(--surface-card); }
  label { display: block; margin-top: .65rem; font-weight: 700; }
  input, select, button { min-height: 44px; box-sizing: border-box; max-width: 100%; border: 1px solid var(--border-strong, #64748b); border-radius: var(--radius-sm); padding: .55rem .7rem; color: inherit; background: var(--surface-card); font: inherit; }
  input, select { width: 100%; }
  button { cursor: pointer; font-weight: 750; }
  button:disabled { opacity: .55; cursor: not-allowed; }
  button:focus-visible, input:focus-visible, select:focus-visible, [tabindex]:focus-visible { outline: 3px solid #ff9f43; outline-offset: 2px; }
  .primary { margin-top: 1rem; width: 100%; background: var(--accent-primary); color: white; }
  .danger { border-color: #ef6a5b; color: #ffb4aa; }
  .plan-list, .history { display: grid; gap: .6rem; }
  .plan { width: 100%; display: grid; gap: .4rem; text-align: left; }
  .plan span, .history article { display: grid; gap: .15rem; }
  .plan.selected { box-shadow: inset 4px 0 var(--accent-primary); }
  dl { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; }
  dl div { padding: .6rem; background: color-mix(in srgb, var(--accent-primary) 8%, transparent); }
  dt { color: var(--text-muted); font-size: .75rem; } dd { margin: .2rem 0 0; font-weight: 800; }
  .status-note, .history article { margin: .7rem 0; }
  .confirm { position: fixed; inset: 50% auto auto 50%; transform: translate(-50%, -50%); z-index: 200; width: min(34rem, calc(100vw - 2rem)); padding: 1.25rem; background: var(--surface-card); border: 2px solid #ef6a5b; box-shadow: 0 1.5rem 5rem #000a; }
  .announcer { margin-top: 1rem; }
  @media (max-width: 900px) { .workspace { grid-template-columns: 1fr 1fr; } aside { grid-column: 1 / -1; } .explanation { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 600px) { .workspace, .explanation { grid-template-columns: minmax(0, 1fr); } aside { grid-column: auto; } .hero { align-items: flex-start; flex-direction: column; } .actions button { width: 100%; } }
  @media (max-width: 375px) { .memberships { width: 100%; } dl { grid-template-columns: 1fr; } }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; } }
</style>
