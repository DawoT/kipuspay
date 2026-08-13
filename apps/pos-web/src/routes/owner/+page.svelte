<script lang="ts">
  import { onMount } from 'svelte';
  import { formatCents } from '$lib/cents';
  import { CHECKLIST_DISMISSED_KEY } from '@kipuspay/domain-onboarding';
  import { isOnboardingTourEnabled, isDebitNoteEnabled } from '$lib/features';
  import { fetchSetupProgress } from '$lib/onboarding/tour-client';
  import { issueDebitNote } from '$lib/sales/debit-note';
  import SetupChecklist from '$lib/ui/SetupChecklist.svelte';
  import RcPendingBanner from '$lib/fiscal/RcPendingBanner.svelte';
  import { createPrinterTransport } from '$lib/print/printer-transport';
  import {
    isAgenticInsightsEnabled,
    isFiscalCircuitBreakerEnabled,
    isLedgerStoreCreditEnabled,
    isOwnerModeEnabled,
    isSalesCommissionsEnabled,
    isSalesInstallmentsEnabled,
    isSalesLayawayEnabled,
    isSalesQuotesEnabled,
  } from '$lib/features';
  import {
    canOfferAnularEa,
    type FiscalBacklogItem,
    submitAnularEa,
  } from '$lib/fiscal/owner-ea';
  import {
    createMemoryOwnerRollupIdb,
    loadOwnerDayView,
    type OwnerRollupSnapshot,
  } from '$lib/owner-offline-rollup/cache';
  import Icon from '$lib/ui/Icon.svelte';

  const enabled = isOwnerModeEnabled();
  let briefing = $state<{ reportDate: string; briefing: string } | null>(null);
  let briefingBullets: string[] = $derived(
    briefing
      ? ((JSON.parse(briefing.briefing) as { bullets?: string[] }).bullets ?? [])
      : [],
  );
  const fiscalEa = isFiscalCircuitBreakerEnabled();
  const layawayOn = isSalesLayawayEnabled();
  const quotesOn = isSalesQuotesEnabled();
  const storeCreditOn = isLedgerStoreCreditEnabled();
  const installmentsOn = isSalesInstallmentsEnabled();
  const commissionsOn = isSalesCommissionsEnabled();
  let snap = $state<OwnerRollupSnapshot | null>(null);
  let banner = $state<string | null>(null);
  let fromCache = $state(false);
  let backlog = $state<FiscalBacklogItem[]>([]);
  let eaMsg = $state<string | null>(null);
  let pendingAnular = $state<FiscalBacklogItem | null>(null);
  let motiveCode = $state('01');
  let overdueLayaways = $state<
    { id: string; balanceCents: number; dueDate: string | null; status: string }[]
  >([]);
  let expiredQuotes = $state<
    { id: string; snapshotTotalCents: number; validUntil: string | null; status: string }[]
  >([]);
  let storeCreditReport = $state<{
    issuedCents: number;
    redeemedCents: number;
    expiredCents: number;
    openBalanceCents: number;
  } | null>(null);
  let overdueInstallments = $state<
    {
      id: string;
      saleId: string;
      installmentNumber: number;
      amountCents: number;
      dueDate: string;
      status: string;
    }[]
  >([]);
  let commissionsReport = $state<{
    pendingAccrualCents: number;
    openPayoutCents: number;
    paidPayoutCents: number;
  } | null>(null);

  const idb = createMemoryOwnerRollupIdb();

  async function refresh(online: boolean) {
    if (!enabled) return;
    const today = new Date().toISOString().slice(0, 10);
    const view = await loadOwnerDayView(
      {
        idb,
        online,
        nowMs: Date.now(),
        fetchDaySummary: async () => {
          return {
            totals: {
              grossSalesCents: snap?.grossSalesCents ?? 0,
              netSalesCents: snap?.netSalesCents ?? 0,
              docCount: snap?.docCount ?? 0,
            },
            branches: [{ branch_id: 'local' }],
          };
        },
      },
      'tenant',
      'local',
      today,
    );
    snap = view.snapshot;
    banner = view.banner;
    fromCache = view.fromCache;
  }

  async function loadBriefing() {
    if (!isAgenticInsightsEnabled() || typeof fetch === 'undefined') return;
    try {
      const response = await fetch('/api/insights/briefing');
      if (!response.ok) return;
      briefing = (await response.json()) as { reportDate: string; briefing: string };
    } catch {
      briefing = null;
    }
  }

  function loadDemoBacklog() {
    if (!fiscalEa) return;
    backlog = [
      {
        saleId: 'demo-quarantine',
        sunatStatus: 'QUARANTINED',
        documentType: '01',
        totalCents: 15000,
        suggestCreditNoteEa: true,
      },
    ];
  }

  async function confirmAnular() {
    if (!pendingAnular) return;
    const item = pendingAnular;
    pendingAnular = null;
    const res = await submitAnularEa(
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'https://api.kipuspay.local',
      'Bearer local',
      {
        originSaleId: item.saleId,
        confirmed: true,
        motiveCode,
        series: 'FC01',
      },
    ).catch(() => ({
      ok: true,
      status: 200,
      message: 'NC E-A (local demo)',
      creditNoteSaleId: `nc-${item.saleId}`,
    }));
    if (res.ok) {
      backlog = backlog.filter((b) => b.saleId !== item.saleId);
      eaMsg = `Anulado ${item.saleId} → ${res.creditNoteSaleId ?? 'NC'}`;
    } else {
      eaMsg = res.message;
    }
  }

  async function loadOverdueLayaways() {
    if (!layawayOn) return;
    const apiBase =
      (import.meta.env.PUBLIC_API_BASE as string | undefined)?.replace(/\/$/, '') ||
      'https://api.kipuspay.local';
    const auth = (import.meta.env.PUBLIC_DEV_AUTH as string | undefined) ?? 'Bearer demo';
    const res = await fetch(`${apiBase}/api/owner/layaways/overdue`, {
      headers: { authorization: auth },
    }).catch(() => null);
    if (!res?.ok) return;
    const json = (await res.json()) as {
      items?: { id: string; balanceCents: number; dueDate: string | null; status: string }[];
    };
    overdueLayaways = json.items ?? [];
  }

  async function loadStoreCreditReport() {
    if (!storeCreditOn) return;
    const apiBase =
      (import.meta.env.PUBLIC_API_BASE as string | undefined)?.replace(/\/$/, '') ||
      'https://api.kipuspay.local';
    const auth = (import.meta.env.PUBLIC_DEV_AUTH as string | undefined) ?? 'Bearer demo';
    const res = await fetch(`${apiBase}/api/owner/ledger/store-credit`, {
      headers: { authorization: auth },
    }).catch(() => null);
    if (!res?.ok) return;
    const json = (await res.json()) as {
      issuedCents?: number;
      redeemedCents?: number;
      expiredCents?: number;
      openBalanceCents?: number;
    };
    storeCreditReport = {
      issuedCents: json.issuedCents ?? 0,
      redeemedCents: json.redeemedCents ?? 0,
      expiredCents: json.expiredCents ?? 0,
      openBalanceCents: json.openBalanceCents ?? 0,
    };
  }

  async function loadExpiredQuotes() {
    if (!quotesOn) return;
    const apiBase =
      (import.meta.env.PUBLIC_API_BASE as string | undefined)?.replace(/\/$/, '') ||
      'https://api.kipuspay.local';
    const auth = (import.meta.env.PUBLIC_DEV_AUTH as string | undefined) ?? 'Bearer demo';
    const res = await fetch(`${apiBase}/api/owner/quotes/expired`, {
      headers: { authorization: auth },
    }).catch(() => null);
    if (!res?.ok) return;
    const json = (await res.json()) as {
      items?: {
        id: string;
        snapshotTotalCents: number;
        validUntil: string | null;
        status: string;
      }[];
    };
    expiredQuotes = json.items ?? [];
  }

  async function loadOverdueInstallments() {
    if (!installmentsOn) return;
    const apiBase =
      (import.meta.env.PUBLIC_API_BASE as string | undefined)?.replace(/\/$/, '') ||
      'https://api.kipuspay.local';
    const auth = (import.meta.env.PUBLIC_DEV_AUTH as string | undefined) ?? 'Bearer demo';
    const res = await fetch(`${apiBase}/api/owner/installments/overdue`, {
      headers: { authorization: auth },
    }).catch(() => null);
    if (!res?.ok) return;
    const json = (await res.json()) as {
      items?: {
        id: string;
        saleId: string;
        installmentNumber: number;
        amountCents: number;
        dueDate: string;
        status: string;
      }[];
    };
    overdueInstallments = json.items ?? [];
  }

  async function loadCommissionsReport() {
    if (!commissionsOn) return;
    const apiBase =
      (import.meta.env.PUBLIC_API_BASE as string | undefined)?.replace(/\/$/, '') ||
      'https://api.kipuspay.local';
    const auth = (import.meta.env.PUBLIC_DEV_AUTH as string | undefined) ?? 'Bearer demo';
    const res = await fetch(`${apiBase}/api/owner/commissions`, {
      headers: { authorization: auth },
    }).catch(() => null);
    if (!res?.ok) return;
    const json = (await res.json()) as {
      pendingAccrualCents?: number;
      openPayoutCents?: number;
      paidPayoutCents?: number;
    };
    commissionsReport = {
      pendingAccrualCents: json.pendingAccrualCents ?? 0,
      openPayoutCents: json.openPayoutCents ?? 0,
      paidPayoutCents: json.paidPayoutCents ?? 0,
    };
  }

  onMount(() => {
    if (!enabled) return;
    void refresh(typeof navigator !== 'undefined' ? navigator.onLine : true);
    loadDemoBacklog();
    void loadOverdueLayaways();
    void loadExpiredQuotes();
    void loadStoreCreditReport();
    void loadBriefing();
    void loadOverdueInstallments();
    void loadCommissionsReport();
    if (onboardingOn) {
      void loadChecklist();
      void createPrinterTransport()
        .preflight()
        .then((adapters) => {
          printerReady = adapters.length > 0;
        });
    }
    const onOnline = () => void refresh(true);
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  });

  // Sprint 52 — Setup Checklist en el Modo Dueño (regla 37a, GTM §6.2).
  const onboardingOn = isOnboardingTourEnabled();
  let serverState = $state<{ logo: boolean; invoicing: boolean; team: boolean; catalog: boolean } | null>(null);
  let printerReady = $state(false);
  let checklistDismissed = $state(false);

  async function loadChecklist() {
    const res = await fetchSetupProgress();
    if (!res.ok) return;
    serverState = res.server;
    checklistDismissed = localStorage.getItem(CHECKLIST_DISMISSED_KEY) === '1';
  }

  // Backlog v10 P1a — Nota de Débito (ADR-FISCAL-003).
  const debitNoteOn = isDebitNoteEnabled();
  let dnOriginSaleId = $state('');
  let dnSeries = $state('FC01');
  let dnMotiveCode = $state('02');
  let dnAmountCents = $state(100);
  let dnDescription = $state('');
  let dnMsg = $state('');
  let dnIssued = $state(false);

  async function onIssueDebitNote() {
    dnMsg = '';
    dnIssued = false;
    const res = await issueDebitNote({
      originSaleId: dnOriginSaleId,
      series: dnSeries,
      motiveCode: dnMotiveCode,
      amountCents: dnAmountCents,
      description: dnDescription,
    });
    if (!res.ok) {
      dnMsg = res.message;
      return;
    }
    dnIssued = true;
    dnMsg = `ND ${res.series}-${String(res.number).padStart(3, '0')} por S/ ${formatCents(res.amountCents)} (motivo ${res.motiveCode}).`;
  }
</script>

<svelte:head><title>Modo Dueño · Hoy · KipusPay</title></svelte:head>

{#if enabled}
  <div class="page-shell" data-testid="owner-hoy">
    <div class="page-masthead">
      <div>
        <p class="page-eyebrow"><Icon name="bar-chart" size={12} /> Modo Dueño · Resumen Hoy</p>
        <h1 class="page-title">Dashboard principal</h1>
        <p class="page-lede">Resumen accionable del día — métricas consolidadas del negocio.</p>
      </div>
    </div>

    <!-- F5b-5: boletas del día sin RC ≠ cierre Z (banner Dueño) -->
    <RcPendingBanner />

    {#if onboardingOn && serverState && !checklistDismissed}
      <div class="status-alert info" data-testid="owner-checklist">
        <SetupChecklist server={serverState} {printerReady} />        <button
          type="button"
          class="btn-secondary btn-sm"
          data-testid="owner-checklist-hide"
          onclick={() => {
            checklistDismissed = true;
            localStorage.setItem(CHECKLIST_DISMISSED_KEY, '1');
          }}
        >
          Ocultar
        </button>
      </div>
    {/if}

    {#if banner}
      <div class="status-alert warning" data-testid="stale-banner">        <Icon name="clock" size={16} />
        <span>{banner}</span>
      </div>
    {/if}

    <!-- Stat Grid -->
    <div class="stat-grid">
      <div class="stat-card">
        <span class="stat-label">Ventas netas hoy</span>
        <span class="stat-value emerald tabular-nums" data-testid="hoy-net">S/ {formatCents(snap?.netSalesCents ?? 0)}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Comprobantes</span>
        <span class="stat-value tabular-nums" data-testid="hoy-docs">{snap?.docCount ?? 0}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Ventas brutas</span>
        <span class="stat-value tabular-nums">S/ {formatCents(snap?.grossSalesCents ?? 0)}</span>
      </div>
    </div>

    <p class="source-note" data-testid="hoy-source">
      {fromCache ? 'Desde cache local' : 'Actualizado al conectar'} · no en vivo
    </p>

    {#if isAgenticInsightsEnabled() && briefing}
      <section class="glass-card section-pad" data-testid="owner-briefing">
        <div class="card-head">
          <h2>Resumen del servidor</h2>
          <span class="briefing-stale">Datos del {briefing.reportDate}, no en vivo.</span>
        </div>
        <ul class="briefing-bullets">
          {#each briefingBullets as bullet}
            <li>{bullet}</li>
          {/each}
        </ul>
      </section>
    {/if}

    <div class="owner-sections-grid">
      {#if layawayOn && overdueLayaways.length > 0}
        <section class="glass-card section-pad" data-testid="owner-layaway-overdue">
          <div class="card-header">
            <h2>Apartados vencidos</h2>
            <span class="badge badge-warning">{overdueLayaways.length}</span>
          </div>
          <ul class="item-list">
            {#each overdueLayaways as item (item.id)}
              <li class="item-row">
                <span class="item-id">{item.id}</span>
                <span class="item-amount tabular-nums">Saldo: S/ {formatCents(item.balanceCents)}</span>
                <span class="item-meta">Vence: {item.dueDate ?? '—'}</span>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if storeCreditOn && storeCreditReport}
        <section class="glass-card section-pad" data-testid="owner-store-credit">
          <div class="card-header">
            <h2>Crédito de tienda</h2>
            <Icon name="gift" size={16} />
          </div>
          <div class="report-grid">
            <div class="report-item">
              <span class="report-label">Emitidos</span>
              <span class="report-value tabular-nums">S/ {formatCents(storeCreditReport.issuedCents)}</span>
            </div>
            <div class="report-item">
              <span class="report-label">Canjeados</span>
              <span class="report-value tabular-nums">S/ {formatCents(storeCreditReport.redeemedCents)}</span>
            </div>
            <div class="report-item">
              <span class="report-label">Expirados</span>
              <span class="report-value tabular-nums">S/ {formatCents(storeCreditReport.expiredCents)}</span>
            </div>
            <div class="report-item">
              <span class="report-label">Saldo abierto</span>
              <span class="report-value emerald tabular-nums">S/ {formatCents(storeCreditReport.openBalanceCents)}</span>
            </div>
          </div>
        </section>
      {/if}

      {#if quotesOn && expiredQuotes.length > 0}
        <section class="glass-card section-pad" data-testid="owner-quotes-expired">
          <div class="card-header">
            <h2>Cotizaciones vencidas</h2>
            <span class="badge badge-muted">{expiredQuotes.length}</span>
          </div>
          <ul class="item-list">
            {#each expiredQuotes as item (item.id)}
              <li class="item-row">
                <span class="item-id">{item.id}</span>
                <span class="item-amount tabular-nums">S/ {formatCents(item.snapshotTotalCents)}</span>
                <span class="item-meta">Vence: {item.validUntil ?? '—'}</span>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if installmentsOn && overdueInstallments.length > 0}
        <section class="glass-card section-pad" data-testid="owner-installments-overdue">
          <div class="card-header">
            <h2>Cuotas vencidas</h2>
            <span class="badge badge-danger">{overdueInstallments.length}</span>
          </div>
          <p class="section-desc">El atraso no corta la caja.</p>
          <ul class="item-list">
            {#each overdueInstallments as item (item.id)}
              <li class="item-row">
                <span class="item-id">{item.saleId} · Cuota {item.installmentNumber}</span>
                <span class="item-amount tabular-nums">S/ {formatCents(item.amountCents)}</span>
                <span class="item-meta">Vence: {item.dueDate}</span>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if commissionsOn && commissionsReport}
        <section class="glass-card section-pad" data-testid="owner-commissions">
          <div class="card-header">
            <h2>Comisiones pendientes</h2>
            <Icon name="percent" size={16} />
          </div>
          <div class="report-grid">
            <div class="report-item">
              <span class="report-label">Devengado</span>
              <span class="report-value tabular-nums">S/ {formatCents(commissionsReport.pendingAccrualCents)}</span>
            </div>
            <div class="report-item">
              <span class="report-label">Payouts OPEN</span>
              <span class="report-value tabular-nums">S/ {formatCents(commissionsReport.openPayoutCents)}</span>
            </div>
            <div class="report-item">
              <span class="report-label">Pagado</span>
              <span class="report-value emerald tabular-nums">S/ {formatCents(commissionsReport.paidPayoutCents)}</span>
            </div>
          </div>
        </section>
      {/if}

      {#if fiscalEa}
        <section class="glass-card section-pad" data-testid="owner-fiscal-backlog">
          <div class="card-header">
            <h2>Fiscal · represados / cuarentena</h2>
            <span class="badge badge-warning">{backlog.length}</span>
          </div>
          <p class="section-desc">CPE no aceptados. Anular (E-A) exige confirmación y motivo Catálogo 09.</p>

          {#if eaMsg}
            <div class="status-alert info" aria-live="polite" data-testid="ea-msg">
              <Icon name="check" size={16} />
              <span>{eaMsg}</span>
            </div>
          {/if}

          <ul class="item-list">
            {#each backlog as item (item.saleId)}
              <li class="item-row" data-testid="backlog-item">
                <span class="item-id">{item.saleId}</span>
                <span class="badge badge-danger">{item.sunatStatus}</span>
                <span class="item-amount tabular-nums">S/ {formatCents(item.totalCents)}</span>
                {#if canOfferAnularEa(item.sunatStatus)}
                  <button
                    type="button"
                    class="secondary btn-sm"
                    data-testid="anular-ea"
                    onclick={() => { pendingAnular = item; }}
                  >
                    Anular
                  </button>
                {/if}
              </li>
            {/each}
          </ul>

          {#if pendingAnular}
            <div class="confirm-box" data-testid="ea-confirm">
              <p class="confirm-title">
                Confirmar NC anulación sin CDR para <strong>{pendingAnular.saleId}</strong>
              </p>
              <div class="field-group">
                <label for="ea-motive-input">Motivo Cat. 09</label>
                <input id="ea-motive-input" data-testid="ea-motive" bind:value={motiveCode} />
              </div>
              <div class="btn-row">
                <button type="button" class="primary" data-testid="ea-confirm-btn" onclick={() => void confirmAnular()}>
                  Confirmar anulación
                </button>
                <button type="button" class="secondary" onclick={() => (pendingAnular = null)}>
                  Cancelar
                </button>
              </div>
            </div>
          {/if}
        </section>
      {/if}

      {#if debitNoteOn}
        <section class="glass-panel owner-section" data-testid="owner-debit-note">
          <div class="owner-section-head">
            <h2>Nota de débito</h2>
            <span class="badge badge-indigo">Ajuste al alza (cat. 10)</span>
          </div>
          <p class="owner-section-lede">
            Incrementa el valor de un comprobante aceptado (factura/boleta) por interés, aumento de valor o penalidades. No toca stock.
          </p>
          <div class="field-group">
            <label for="dn-origin">Comprobante origen (id)</label>
            <input id="dn-origin" bind:value={dnOriginSaleId} data-testid="dn-origin" placeholder="sale-123" />
          </div>
          <div class="field-group">
            <label for="dn-series">Serie ND</label>
            <input id="dn-series" bind:value={dnSeries} data-testid="dn-series" placeholder="FC01" />
          </div>
          <div class="field-group">
            <label for="dn-motive">Motivo (catálogo 10)</label>
            <select id="dn-motive" bind:value={dnMotiveCode} data-testid="dn-motive">
              <option value="01">01 — Interés por mora</option>
              <option value="02">02 — Aumento de valor</option>
              <option value="03">03 — Penalidades / otros conceptos</option>
              <option value="10">10 — Ajuste de otros conceptos</option>
            </select>
          </div>
          <div class="field-group">
            <label for="dn-amount">Monto (centavos)</label>
            <input id="dn-amount" type="number" min="1" bind:value={dnAmountCents} data-testid="dn-amount" />
          </div>
          <div class="field-group">
            <label for="dn-desc">Descripción (opcional)</label>
            <input id="dn-desc" bind:value={dnDescription} data-testid="dn-desc" placeholder="Ej. Interés por pago fuera de plazo" />
          </div>
          <button type="button" class="primary" data-testid="dn-submit" onclick={onIssueDebitNote}>
            Emitir nota de débito
          </button>
          {#if dnMsg}
            <p class="dn-msg" data-testid="dn-msg" class:dn-msg-ok={dnIssued}>{dnMsg}</p>
          {/if}
        </section>
      {/if}
    </div>
  </div>
 {/if}

<style>
  .source-note {
    font-size: 0.8125rem;
    color: var(--text-dim);
    font-family: var(--font-mono);
    margin-top: -0.5rem;
  }

  .card-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .briefing-stale {
    font-size: 0.75rem;
    color: var(--text-dim);
  }
  .briefing-bullets {
    margin: 0.75rem 0 0;
    padding-left: 1.1rem;
    display: grid;
    gap: 0.4rem;
    font-size: 0.9rem;
  }

  .owner-sections-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1.25rem;
    align-items: start;
  }

  .section-pad { padding: 1.25rem; }

  .section-desc {
    font-size: 0.8125rem;
    color: var(--text-muted);
    margin-bottom: 0.75rem;
  }

  .item-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .item-row {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.5rem 0.625rem;
    background: var(--bg-glass);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    flex-wrap: wrap;
  }

  .item-id {
    font-family: var(--font-mono);
    font-size: 0.8125rem;
    color: var(--text-main);
    font-weight: 600;
    flex: 1;
  }

  .item-amount {
    font-family: var(--font-mono);
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--accent-primary);
  }

  .item-meta {
    font-size: 0.75rem;
    color: var(--text-dim);
    width: 100%;
  }

  .btn-sm {
    padding: 0.25rem 0.625rem;
    font-size: 0.75rem;
  }

  .report-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
  }

  .report-item {
    padding: 0.625rem;
    background: var(--bg-glass);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .report-label {
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-dim);
  }

  .report-value {
    font-family: var(--font-mono);
    font-size: 1rem;
    font-weight: 700;
    color: var(--text-main);
  }

  .report-value.emerald {
    color: var(--emerald-green);
  }

  .confirm-box {
    margin-top: 1rem;
    padding: 1rem;
    background: var(--bg-glass);
    border: 1px solid var(--border-glow);
    border-radius: var(--radius-sm);
  }

  .confirm-title {
    font-size: 0.875rem;
    margin-bottom: 0.75rem;
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    margin-bottom: 0.75rem;
  }

  .btn-row {
    display: flex;
    gap: 0.5rem;
  }

  @media (max-width: 700px) {
    .owner-sections-grid { grid-template-columns: 1fr; }
  }
</style>
