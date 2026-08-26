<script lang="ts">
  import { tenantBranchId, cashSessionContext } from '$lib/admin/cash-session';
  import { onMount } from 'svelte';
  import { formatCents } from '$lib/cents';
  import { isSalesQuotesEnabled } from '$lib/features';
  import {
    defaultTenantSession,
    readTenantSession,
    type PosTenantSession,
  } from '$lib/tenant/session';
  import { salesErrorCopy } from '$lib/ui/ops-copy';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import CardHeader from '$lib/ui/CardHeader.svelte';
  import Field from '$lib/ui/Field.svelte';
  import Input from '$lib/ui/Input.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
  import Badge from '$lib/ui/Badge.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import { apiFetch } from '$lib/auth/api-client';
  import {
    filterHistoryByPlate,
    formatPlateDisplay,
    historyCacheKey,
    isValidPlate,
    normalizePlate,
    parseHistoryPayload,
    sortHistoryByDate,
    summarizeHistory,
  } from '$lib/quotes/quote-history';
  import {
    buildOneTapConvertPayload,
    humanQuoteError,
    isOneTapAllowed,
    validateOneTapRequest,
  } from '$lib/quotes/quote-one-tap';

  const quotesOn = isSalesQuotesEnabled();
  let session = $state<PosTenantSession>(defaultTenantSession());
  let productId = $state('p1');
  let enteredMicrounits = $state(1_000_000);
  let validUntil = $state('2026-08-20');
  let quoteId = $state('');
  let series = $state('NV01');
  let reason = $state('');
  let message = $state('');
  let messageOk = $state(false);

  // Premium taller — historial por placa
  let plateInput = $state('');
  let plateHistory = $state<{ id: string; plate: string; dateIso: string; concept: string; totalCents: number }[]>([]);
  let plateMsg = $state('');
  let plateLoading = $state(false);
  let plateSummary = $derived(summarizeHistory(plateHistory));

  // Premium one-tap
  let oneTapBusy = $state(false);
  let oneTapMsg = $state('');
  let oneTapOk = $state(false);
  let oneTapMs = $state<number | null>(null);

  onMount(() => {
    session = readTenantSession(sessionStorage);
  });

  async function createQuote() {
    message = '';
    const res = await apiFetch('/api/sales/quotes', {
      method: 'POST',
      storage: localStorage,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        branchId: tenantBranchId(localStorage),
        validUntilIso: validUntil,
        items: [{ productId, enteredQuantityMicrounits: enteredMicrounits }],
      }),
    });
    const json = (await res.json()) as {
      quoteId?: string;
      snapshotTotalCents?: number;
      emitsFiscalDocument?: boolean;
      reservesStock?: boolean;
      error?: string;
    };
    messageOk = res.ok;
    if (!res.ok) {
      message = salesErrorCopy(json.error);
      return;
    }
    quoteId = json.quoteId ?? '';
    message = `Cotización lista · S/ ${formatCents(json.snapshotTotalCents ?? 0)}${json.emitsFiscalDocument ? ' · con comprobante' : ''}${json.reservesStock ? ' · reserva stock' : ''}`;
    // guardar para historial por placa si hay placa
    const norm = normalizePlate(plateInput);
    if (norm && isValidPlate(norm) && json.quoteId) {
      const entry = {
        id: json.quoteId,
        plate: norm,
        dateIso: new Date().toISOString(),
        concept: productId,
        totalCents: json.snapshotTotalCents ?? 0,
      };
      const key = historyCacheKey(session.tenantId || 'local', norm);
      try {
        const raw = localStorage.getItem(key);
        const arr = raw ? (JSON.parse(raw) as typeof plateHistory) : [];
        const merged = sortHistoryByDate([...arr, entry]).slice(0, 12);
        localStorage.setItem(key, JSON.stringify(merged));
        if (normalizePlate(plateInput) === norm) plateHistory = merged;
      } catch {
        // cache best-effort
      }
    }
  }

  async function send() {
    message = '';
    const res = await apiFetch('/api/sales/quotes/send', {
      method: 'POST',
      storage: localStorage,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quoteId }),
    });
    const json = (await res.json()) as { status?: string; error?: string };
    messageOk = res.ok;
    message = res.ok ? `Enviada` : salesErrorCopy(json.error);
  }

  async function approve() {
    message = '';
    const res = await apiFetch('/api/sales/quotes/approve', {
      method: 'POST',
      storage: localStorage,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quoteId }),
    });
    const json = (await res.json()) as { status?: string; error?: string };
    messageOk = res.ok;
    message = res.ok ? `Aprobada (${json.status})` : salesErrorCopy(json.error);
  }

  async function convert() {
    message = '';
    const res = await apiFetch('/api/sales/quotes/convert', {
      method: 'POST',
      storage: localStorage,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        quoteId,
        cashRegisterSessionId: cashSessionContext(localStorage).sessionId,
        series,
        documentType: session.formalizationMode === 'INTERNAL_CONTROL' ? 'NV' : '03',
      }),
    });
    const json = (await res.json()) as { saleId?: string; error?: string };
    messageOk = res.ok;
    message = res.ok ? `Convertida a venta ${json.saleId}` : salesErrorCopy(json.error);
  }

  async function cancel() {
    message = '';
    const res = await apiFetch('/api/sales/quotes/cancel', {
      method: 'POST',
      storage: localStorage,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quoteId, reason }),
    });
    const json = (await res.json()) as { status?: string; error?: string };
    messageOk = res.ok;
    message = res.ok ? `Cancelada (${json.status})` : salesErrorCopy(json.error);
  }

  async function searchPlateHistory() {
    plateMsg = '';
    const norm = normalizePlate(plateInput);
    if (!norm) {
      plateMsg = 'Ingresa la placa del vehículo.';
      plateHistory = [];
      return;
    }
    if (!isValidPlate(norm)) {
      plateMsg = 'Revisa la placa. Usa 6 o 7 letras y números.';
      plateHistory = [];
      return;
    }
    // feedback inmediato <100ms desde cache local
    const t0 = performance.now();
    const key = historyCacheKey(session.tenantId || 'local', norm);
    let cached: typeof plateHistory = [];
    try {
      const raw = localStorage.getItem(key);
      if (raw) cached = parseHistoryPayload({ items: JSON.parse(raw) });
    } catch {
      cached = [];
    }
    plateHistory = sortHistoryByDate(cached);
    plateMsg = cached.length ? `Mostrando ${cached.length} atenciones de ${formatPlateDisplay(norm)}` : '';
    const cacheMs = performance.now() - t0;
    // background refresh (no bloquea)
    plateLoading = true;
    try {
      const res = await apiFetch(`/api/sales/history?plate=${encodeURIComponent(norm)}`, { storage: localStorage });
      if (res.ok) {
        const body = (await res.json()) as unknown;
        const serverItems = parseHistoryPayload(body);
        const merged = sortHistoryByDate([...cached, ...serverItems])
          .filter((v, i, a) => a.findIndex((x) => x.id === v.id) === i)
          .slice(0, 12);
        // solo actualiza si sigue la misma placa
        if (normalizePlate(plateInput) === norm) {
          plateHistory = merged;
          plateMsg = merged.length ? `Historial actualizado — ${merged.length} atenciones` : 'Sin atenciones previas para esta placa.';
          try {
            localStorage.setItem(key, JSON.stringify(merged));
          } catch {}
        }
      } else if (cached.length === 0) {
        plateMsg = 'Sin atenciones previas para esta placa. Se guardará al cobrar.';
      }
    } catch {
      if (cached.length === 0) plateMsg = 'Sin conexión. Mostraremos el historial al reconectar.';
    } finally {
      plateLoading = false;
      void cacheMs;
    }
  }

  async function oneTapCharge() {
    oneTapMsg = '';
    oneTapOk = false;
    const t0 = performance.now();
    const validation = validateOneTapRequest({ quoteId, validUntilIso: validUntil });
    if (!validation.ok) {
      oneTapMsg = validation.message;
      oneTapMs = Math.round(performance.now() - t0);
      return;
    }
    if (!isOneTapAllowed(quotesOn, 'APPROVED')) {
      oneTapMsg = 'Las cotizaciones no están activas para esta tienda.';
      oneTapMs = Math.round(performance.now() - t0);
      return;
    }
    if (!quoteId.trim()) {
      oneTapMsg = 'Primero crea o elige una cotización.';
      oneTapMs = Math.round(performance.now() - t0);
      return;
    }
    oneTapBusy = true;
    // feedback optimista <100ms: el cajero ve "Procesando…" sin spinner bloqueante
    oneTapMsg = 'Procesando cobro…';
    oneTapMs = Math.round(performance.now() - t0);
    const payload = buildOneTapConvertPayload({
      quoteId,
      branchId: tenantBranchId(localStorage) || 'principal',
      cashRegisterSessionId: cashSessionContext(localStorage).sessionId,
      series,
      documentType: session.formalizationMode === 'INTERNAL_CONTROL' ? 'NV' : '03',
      plate: plateInput,
      totalCents: undefined,
    });
    try {
      // intentar aprobar si aún no está aprobada (idempotente)
      await apiFetch('/api/sales/quotes/approve', {
        method: 'POST',
        storage: localStorage,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ quoteId: payload.quoteId }),
      });
      const res = await apiFetch('/api/sales/quotes/convert', {
        method: 'POST',
        storage: localStorage,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          quoteId: payload.quoteId,
          cashRegisterSessionId: payload.cashRegisterSessionId,
          series: payload.series,
          documentType: payload.documentType,
        }),
      });
      const json = (await res.json()) as { saleId?: string; error?: string; code?: string };
      if (!res.ok) {
        oneTapOk = false;
        oneTapMsg = humanQuoteError(json.code || json.error || '');
        // haptic error
        try {
          navigator.vibrate?.(30);
        } catch {}
      } else {
        oneTapOk = true;
        oneTapMsg = `Venta cobrada ${json.saleId ? '· ' + String(json.saleId).slice(0, 8) : ''} · Lista para siguiente cliente`;
        try {
          navigator.vibrate?.(40);
        } catch {}
        // audio beep zero-dep
        try {
          const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.frequency.value = 880;
          o.connect(g);
          g.connect(ctx.destination);
          g.gain.value = 0.06;
          o.start();
          setTimeout(() => {
            o.stop();
            void ctx.close();
          }, 80);
        } catch {}
        // push to plate history
        const norm = normalizePlate(plateInput);
        if (norm && isValidPlate(norm)) {
          const entry = {
            id: json.saleId || payload.quoteId,
            plate: norm,
            dateIso: new Date().toISOString(),
            concept: productId,
            totalCents: 0,
          };
          const key = historyCacheKey(session.tenantId || 'local', norm);
          try {
            const raw = localStorage.getItem(key);
            const arr = raw ? (JSON.parse(raw) as typeof plateHistory) : [];
            const merged = sortHistoryByDate([...arr, entry]).slice(0, 12);
            localStorage.setItem(key, JSON.stringify(merged));
            plateHistory = merged;
          } catch {}
        }
        message = oneTapMsg;
        messageOk = true;
      }
    } catch {
      oneTapOk = false;
      oneTapMsg = 'Sin conexión. La cotización quedó lista para cobrar al reconectar.';
    } finally {
      oneTapBusy = false;
      oneTapMs = Math.round(performance.now() - t0);
    }
  }

  function plateDisplay(value: string): string {
    return formatPlateDisplay(value);
  }
</script>

<svelte:head><title>Cotizaciones · KipusPay</title></svelte:head>

<div class="page-shell" data-testid="caja-cotizacion">
  <div class="page-masthead">
    <div>
      <p class="page-eyebrow"><Icon name="file-text" size={12} /> Ventas · Cotizaciones</p>
      <h1 class="page-title">Cotización</h1>
      <p class="page-lede">Congela el precio del servidor. No reserva stock ni emite comprobante hasta convertir a venta.</p>
    </div>
    {#if quotesOn}
      <Badge variant="success">En servicio</Badge>
    {/if}
  </div>

  {#if message}
    <StatusMessage tone={messageOk ? 'info' : 'danger'} aria-live="polite" data-testid="quote-msg">
      <Icon name={messageOk ? 'check' : 'alert'} size={16} />
      <span>{message}</span>
    </StatusMessage>
  {/if}

  {#if !quotesOn}
    <div class="feature-off-banner" data-testid="caja-quote-off">
      <Icon name="info" size={18} />
      <span>Las cotizaciones no están activas para esta tienda.</span>
    </div>
  {:else}
    <p class="tenant-line" data-testid="caja-quote-tenant">Tienda: {session.tradeName}</p>

    <!-- Premium taller: historial por placa -->
    <section class="ledger-card section-pad plate-panel" data-testid="taller-plate-panel" aria-labelledby="plate-title">
      <div class="card-header">
        <div>
          <span class="instrument-eyebrow">Taller premium</span>
          <h2 id="plate-title">Historial del vehículo</h2>
        </div>
        <Badge variant="indigo">{plateHistory.length} atenciones</Badge>
      </div>
      <p class="panel-hint">Busca por placa para ver servicios anteriores y cobrar más rápido. Los servicios no descuentan inventario hasta cobrar.</p>
      <div class="plate-row">
        <Field label="Placa del vehículo" id="plate-input">
          <Input
            id="plate-input"
            bind:value={plateInput}
            data-testid="plate-input"
            placeholder="ABC-123"
            autocomplete="off"
            maxlength={8}
            onkeydown={(e: KeyboardEvent) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void searchPlateHistory();
              }
            }}
          />
        </Field>
        <Button
          variant="primary"
          data-testid="plate-search"
          onclick={() => void searchPlateHistory()}
          disabled={plateLoading}
          icon="search"
        >
          {plateLoading ? 'Buscando…' : 'Buscar historial'}
        </Button>
      </div>
      {#if plateMsg}
        <StatusMessage tone="info" role="status" data-testid="plate-msg">
          <span>{plateMsg}</span>
          {#if plateSummary.count > 0}
            <span class="summary-tag"> · {plateSummary.count} servicios · S/ {formatCents(plateSummary.totalCents)}</span>
          {/if}
        </StatusMessage>
      {/if}
      {#if plateHistory.length === 0}
        <EmptyState
          icon="truck"
          title="Sin historial aún"
          description="Ingresa la placa y presiona Buscar. Al cobrar, el servicio queda guardado para la próxima visita."
        />
      {:else}
        <ul class="plate-list" data-testid="plate-list">
          {#each sortHistoryByDate(filterHistoryByPlate(plateHistory, plateInput)) as entry (entry.id)}
            <li class="plate-item">
              <div class="plate-item-main">
                <span class="plate-badge">{plateDisplay(entry.plate)}</span>
                <span class="plate-concept">{entry.concept}</span>
                <span class="plate-date">{new Date(entry.dateIso).toLocaleDateString('es-PE')}</span>
              </div>
              <span class="plate-total tabular-nums">S/ {formatCents(entry.totalCents)}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <div class="quote-layout">
      <!-- Crear -->
      <section class="ledger-card section-pad">
        <CardHeader title="Nueva cotización">
          <span class="section-tag">Crear</span>
        </CardHeader>
        <Field label="Producto o servicio" id="q-product">
          <Input id="q-product" bind:value={productId} data-testid="quote-product" placeholder="Ej. Cambio de aceite" />
        </Field>
        <p class="service-hint"><Icon name="info" size={12} /> Los servicios no mueven stock. El precio queda congelado.</p>
        <Field label="Cantidad" id="q-qty">
          <input id="q-qty" type="number" min="1" bind:value={enteredMicrounits} data-testid="quote-qty" />
        </Field>
        <Field label="Válida hasta" id="q-valid">
          <input id="q-valid" type="date" bind:value={validUntil} data-testid="quote-valid" />
        </Field>
        <Button variant="primary" data-testid="quote-create" onclick={() => void createQuote()} icon="plus">
          Crear cotización
        </Button>
      </section>

      <!-- Acciones -->
      <section class="ledger-card section-pad">
        <CardHeader title="Gestionar">
          <span class="section-tag">Acciones</span>
        </CardHeader>
        <Field label="ID cotización" id="q-id">
          <Input id="q-id" bind:value={quoteId} data-testid="quote-id" placeholder="ID creado arriba" />
        </Field>
        <div class="btn-row">
          <Button variant="secondary" data-testid="quote-send" onclick={() => void send()} disabled={!quoteId} icon="arrow-right">
            Enviar
          </Button>
          <Button variant="primary" data-testid="quote-approve" onclick={() => void approve()} disabled={!quoteId} icon="check">
            Aprobar
          </Button>
        </div>

        <div class="separator"></div>

        <Field label="Serie al convertir" id="q-series">
          <Input id="q-series" bind:value={series} data-testid="quote-series" />
        </Field>
        <Button variant="success" data-testid="quote-convert" onclick={() => void convert()} disabled={!quoteId} icon="receipt">
          Convertir a venta
        </Button>

        <div class="separator"></div>

        <Field label="Motivo cancelación" id="q-reason">
          <Input id="q-reason" bind:value={reason} data-testid="quote-reason" placeholder="Opcional" />
        </Field>
        <Button variant="danger" data-testid="quote-cancel" onclick={() => void cancel()} disabled={!quoteId} icon="x">
          Cancelar
        </Button>
      </section>
    </div>

    <!-- Premium one-tap -->
    <section class="ledger-card section-pad one-tap-panel" data-testid="taller-one-tap">
      <div class="card-header">
        <div>
          <span class="instrument-eyebrow">Cobro express</span>
          <h2>Cobrar en 1 toque</h2>
        </div>
        <Badge variant="success">1 toque</Badge>
      </div>
      <p class="panel-hint">Convierte la cotización aprobada en venta y factura al instante. Ideal para mostrador con prisa.</p>
      <div class="one-tap-row">
        <Field label="Cotización a cobrar" id="one-tap-id">
          <Input id="one-tap-id" bind:value={quoteId} data-testid="one-tap-quote-id" placeholder="Pega el código de la cotización" />
        </Field>
        <div class="one-tap-actions">
          <Button
            variant="primary"
            size="xl"
            data-testid="one-tap-convert"
            onclick={() => void oneTapCharge()}
            disabled={oneTapBusy || !quoteId.trim()}
            icon="credit-card"
          >
            {oneTapBusy ? 'Cobrando…' : 'Cobrar → Factura'}
          </Button>
          {#if oneTapMs !== null}
            <span class="feedback-badge" data-testid="one-tap-feedback">{oneTapMs} ms</span>
          {/if}
        </div>
      </div>
      {#if oneTapMsg}
        <StatusMessage tone={oneTapOk ? 'info' : 'danger'} role="status" aria-live="polite" data-testid="one-tap-msg">
          <Icon name={oneTapOk ? 'check' : 'alert'} size={16} />
          <span>{oneTapMsg}</span>
        </StatusMessage>
      {/if}
      {#if plateInput && isValidPlate(plateInput)}
        <p class="plate-link-hint">Se guardará en el historial de {formatPlateDisplay(plateInput)}.</p>
      {/if}
    </section>
  {/if}
</div>

<style>
  .quote-layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.25rem;
    align-items: start;
  }

  .separator {
    border-top: 1px solid var(--border-subtle);
    margin: 0.875rem 0;
  }

  .tenant-line {
    font-size: 0.8125rem;
    color: var(--text-dim);
    font-family: var(--font-mono);
  }

  .plate-panel {
    margin-bottom: 1.25rem;
  }

  .instrument-eyebrow {
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--accent-primary);
  }

  .panel-hint {
    font-size: 0.8125rem;
    color: var(--text-muted);
    line-height: 1.45;
    margin: 0 0 0.875rem;
  }

  .service-hint {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.75rem;
    color: var(--text-muted);
    margin: -0.5rem 0 0.75rem;
  }

  .plate-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.75rem;
    align-items: end;
  }

  .plate-list {
    list-style: none;
    padding: 0;
    margin: 1rem 0 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .plate-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    background: rgba(255, 255, 255, 0.03);
    min-height: 44px;
  }

  .plate-item-main {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    min-width: 0;
  }

  .plate-badge {
    font-family: var(--font-mono);
    font-weight: 700;
    font-size: 0.8125rem;
    background: var(--bg-button-sec);
    border: 1px solid var(--border-subtle);
    padding: 0.25rem 0.5rem;
    border-radius: var(--radius-sm);
  }

  .plate-concept {
    font-weight: 600;
    font-size: 0.875rem;
  }

  .plate-date {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .plate-total {
    font-weight: 700;
    color: var(--emerald-green);
    font-size: 0.875rem;
  }

  .summary-tag {
    font-weight: 600;
    color: var(--text-main);
  }

  .one-tap-panel {
    margin-top: 1.25rem;
    border-left: 3px solid var(--emerald-green);
  }

  .one-tap-row {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.875rem;
  }

  .one-tap-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .feedback-badge {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--emerald-green);
    background: rgba(16, 185, 129, 0.12);
    border: 1px solid rgba(16, 185, 129, 0.25);
    padding: 0.25rem 0.5rem;
    border-radius: 9999px;
  }

  .plate-link-hint {
    margin-top: 0.5rem;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  @media (max-width: 719px) {
    .quote-layout {
      grid-template-columns: 1fr;
    }
    .plate-row {
      grid-template-columns: 1fr;
    }
    .one-tap-actions {
      flex-direction: column;
      align-items: stretch;
    }
  }

  @media (max-width: 899px) {
    .plate-item {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
