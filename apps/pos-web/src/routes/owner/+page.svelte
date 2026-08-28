<script lang="ts">
  import { onMount } from 'svelte';
  import { formatCents } from '$lib/cents';
  import { CHECKLIST_DISMISSED_KEY } from '@kipuspay/domain-onboarding';
  import { isOnboardingTourEnabled, isDebitNoteEnabled, isWithholdingsEnabled } from '$lib/features';
  import { fetchSetupProgress } from '$lib/onboarding/tour-client';
  import { issueDebitNote } from '$lib/sales/debit-note';
  import { issuePerception, issueRetention } from '$lib/fiscal/withholdings';
  import SetupChecklist from '$lib/ui/SetupChecklist.svelte';
  import RcPendingBanner from '$lib/fiscal/RcPendingBanner.svelte';
  import { createPrinterTransport } from '$lib/print/printer-transport';
  import {
    isAgenticInsightsEnabled,
    isFiscalCircuitBreakerEnabled,
    isOwnerModeEnabled,
    isLedgerStoreCreditEnabled,
    isSalesCommissionsEnabled,
    isSalesInstallmentsEnabled,
    isSalesLayawayEnabled,
    isSalesQuotesEnabled,
  } from '$lib/features';
  import { capabilitiesFetchedAt, getStaleBanner, STALE_THRESHOLD_MS } from '$lib/tenant/capabilitiesStore';
  import {
    canOfferAnularEa,
    type AnularEaResult,
    type FiscalBacklogItem,
    submitAnularEa,
  } from '$lib/fiscal/owner-ea';
  import { sunatStatusLabel } from '$lib/fiscal/sunat-status-label';
  import {
    createMemoryOwnerRollupIdb,
    loadOwnerDayView,
    type OwnerRollupSnapshot,
  } from '$lib/owner-offline-rollup/cache';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
 import { apiFetch, resolveApiAuth, resolveApiBase } from '$lib/auth/api-client';

  let enabled = $derived(isOwnerModeEnabled());
  let capabilitiesStaleBanner = $derived.by(() => {
    const fetchedAt = $capabilitiesFetchedAt;
    if (fetchedAt === null) return null;
    const age = Date.now() - fetchedAt;
    if (age <= STALE_THRESHOLD_MS) return null;
    return getStaleBanner();
  });
  let briefing = $state<{ reportDate: string; briefing: string } | null>(null);
  let briefingBullets: string[] = $derived.by(() => {
    if (!briefing) return [];
    try {
      return ((JSON.parse(briefing.briefing) as { bullets?: string[] }).bullets ?? []);
    } catch {
      return [];
    }
  });
  const fiscalEa = isFiscalCircuitBreakerEnabled();
  const layawayOn = isSalesLayawayEnabled();
  const quotesOn = isSalesQuotesEnabled();
  const storeCreditOn = isLedgerStoreCreditEnabled();
  const installmentsOn = isSalesInstallmentsEnabled();
  const commissionsOn = isSalesCommissionsEnabled();
  const BRIEFING_PLAN_GATE_KEY = 'kipuspay_briefing_plan_gate';
  let snap = $state<OwnerRollupSnapshot | null>(null);
  let banner = $state<string | null>(null);
  let fromCache = $state(false);
  let refreshTs = $state<string | null>(null);
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
        fetchDaySummary: async (reportDate: string) => {
          // F13: el resumen del día se lee del rollup server (daily_financial_rollups),
          // no de un valor fijo. El servidor es autoritativo; 'no en vivo' lo aclara.
          try {
            const response = await apiFetch(
              `/api/owner/day-summary?date=${encodeURIComponent(reportDate)}`,
              { storage: localStorage },
            );
            if (!response.ok) {
              return {
                totals: { grossSalesCents: 0, netSalesCents: 0, docCount: 0 },
                branches: [],
              };
            }
            const body = (await response.json()) as {
              totals?: { grossSalesCents?: number; netSalesCents?: number; docCount?: number };
              branches?: ReadonlyArray<{ branch_id: string }>;
            };
            return {
              totals: {
                grossSalesCents: body.totals?.grossSalesCents ?? 0,
                netSalesCents: body.totals?.netSalesCents ?? 0,
                docCount: body.totals?.docCount ?? 0,
              },
              branches: body.branches ?? [],
            };
          } catch {
            return {
              totals: { grossSalesCents: 0, netSalesCents: 0, docCount: 0 },
              branches: [],
            };
          }
        },
      },
      'tenant',
      'local',
      today,
    );
    snap = view.snapshot;
    banner = view.banner;
    fromCache = view.fromCache;
    const now = new Date();
    refreshTs = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  async function loadBriefing() {
    if (!isAgenticInsightsEnabled() || typeof fetch === 'undefined') return;
    try {
      if (localStorage.getItem(BRIEFING_PLAN_GATE_KEY) === 'deny') return;
      const response = await apiFetch('/api/insights/briefing', { storage: localStorage });
      if (response.status === 403) {
        try {
          const body = (await response.json()) as { code?: string };
          if (body.code === 'PLAN_REQUIRES_CADENA') {
            localStorage.setItem(BRIEFING_PLAN_GATE_KEY, 'deny');
          }
        } catch {
          // Cuerpo no legible: no gatear; el widget permanece oculto.
        }
        return;
      }
      if (!response.ok) return;
      briefing = (await response.json()) as { reportDate: string; briefing: string };
    } catch {
      briefing = null;
    }
  }

  async function loadBacklog() {
    if (!fiscalEa) return;
    try {
      const response = await apiFetch('/api/fiscal/owner-backlog', { storage: localStorage });
      if (!response.ok) return;
      const json = (await response.json()) as { items?: FiscalBacklogItem[] };
      backlog = json.items ?? [];
    } catch {
      backlog = [];
    }
  }

  async function confirmAnular() {
    if (!pendingAnular) return;
    const item = pendingAnular;
    pendingAnular = null;
    let res: AnularEaResult;
    try {
      res = await submitAnularEa(
        resolveApiBase(localStorage),
        resolveApiAuth(localStorage).authorization ?? '',
        {
          originSaleId: item.saleId,
          confirmed: true,
          motiveCode,
          series: 'FC01',
        },
      );
    } catch (err) {
      eaMsg = err instanceof Error ? err.message : 'No se pudo anular. Reintenta.';
      return;
    }
    if (res.ok) {
      backlog = backlog.filter((b) => b.saleId !== item.saleId);
      eaMsg = `Anulado ${item.saleId} → ${res.creditNoteSaleId ?? 'NC'}`;
    } else {
      eaMsg = res.message;
    }
  }

  async function loadOverdueLayaways() {
    if (!layawayOn) return;
    const res = await apiFetch('/api/owner/layaways/overdue', { storage: localStorage }).catch(() => null);
    if (!res?.ok) return;
    const json = (await res.json()) as {
      items?: { id: string; balanceCents: number; dueDate: string | null; status: string }[];
    };
    overdueLayaways = json.items ?? [];
  }

  async function loadStoreCreditReport() {
    if (!storeCreditOn) return;
    const res = await apiFetch('/api/owner/ledger/store-credit', { storage: localStorage }).catch(() => null);
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
    const res = await apiFetch('/api/owner/quotes/expired', { storage: localStorage }).catch(() => null);
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
    const res = await apiFetch('/api/owner/installments/overdue', { storage: localStorage }).catch(() => null);
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
    const res = await apiFetch('/api/owner/commissions', { storage: localStorage }).catch(() => null);
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
    void loadBacklog();
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

  // Backlog v10 P1c — Percepciones/Retenciones (ADR-FISCAL-005).
  const withholdingsOn = isWithholdingsEnabled();
  let whBranchId = $state('');
  let whSaleId = $state('');
  let whInvoiceId = $state('');
  let whSeriesP = $state('P001');
  let whSeriesR = $state('R001');
  let whCategory = $state('goods');
  let whBase = $state(10_000);
  let whMsg = $state('');
  let whIssued = $state(false);

  async function onIssuePerception() {
    whMsg = '';
    whIssued = false;
    const res = await issuePerception({
      branchId: whBranchId,
      originSaleId: whSaleId,
      series: whSeriesP,
      category: whCategory,
      baseAmountCents: whBase,
    });
    if (!res.ok) {
      whMsg = res.message;
      return;
    }
    whIssued = true;
    whMsg = `Percepción ${res.series}-${String(res.number).padStart(3, '0')}: S/ ${formatCents(res.amountCents)} (${res.ratePercentage / 100}%).`;
  }

  async function onIssueRetention() {
    whMsg = '';
    whIssued = false;
    const res = await issueRetention({
      branchId: whBranchId,
      originSupplierInvoiceId: whInvoiceId,
      series: whSeriesR,
      category: whCategory,
      baseAmountCents: whBase,
    });
    if (!res.ok) {
      whMsg = res.message;
      return;
    }
    whIssued = true;
    whMsg = `Retención ${res.series}-${String(res.number).padStart(3, '0')}: S/ ${formatCents(res.amountCents)} (${res.ratePercentage / 100}%).`;
  }

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

  // Resumen vacío premium — estado útil cuando no hay ventas ni alertas
  const hasAlertsData = $derived(
    backlog.length + overdueLayaways.length + expiredQuotes.length + overdueInstallments.length > 0,
  );
  const hasReports = $derived(
    !!storeCreditReport || !!commissionsReport || briefingBullets.length > 0,
  );
  const showEmptyDay = $derived(
    snap !== null &&
      (snap?.docCount ?? 0) === 0 &&
      (snap?.grossSalesCents ?? 0) === 0 &&
      !hasAlertsData &&
      !hasReports,
  );
</script>

<svelte:head><title>Modo Dueño · Hoy · KipusPay</title></svelte:head>

{#if enabled}
  <div class="page-shell" data-testid="owner-hoy">
    {#if snap === null}
      <Skeleton lines={4} data-testid="owner-hoy-skeleton" />
    {:else}
      <div class="stat-grid" data-testid="owner-hoy-fold">
      <!-- Ventas netas hoy con delta % visual -->
      <div class="stat-card">
        <span class="stat-label">Ventas netas hoy</span>
        <span class="stat-value emerald tabular-nums" data-testid="hoy-net">S/ {formatCents(snap?.netSalesCents ?? 0)}</span>
        {#if (snap as (OwnerRollupSnapshot & { trendPct?: number }) | null)?.trendPct !== undefined}
          {@const trendPct = (snap as (OwnerRollupSnapshot & { trendPct?: number }))!.trendPct!}
          <span
            class="stat-delta"
            class:stat-delta-pos={trendPct >= 0}
            class:stat-delta-neg={trendPct < 0}
            aria-label={trendPct >= 0 ? `Sube ${trendPct}% vs ayer` : `Baja ${Math.abs(trendPct)}% vs ayer`}
          >
            {trendPct >= 0 ? '↑' : '↓'} {trendPct >= 0 ? '+' : ''}{trendPct}%
          </span>
        {/if}
      </div>

      <!-- Ticket promedio calculado -->
      <div class="stat-card" data-testid="hoy-ticket-avg">
        <span class="stat-label">Ticket promedio</span>
        <span class="stat-value tabular-nums">
          {#if (snap?.docCount ?? 0) > 0}
            S/ {formatCents(Math.floor((snap?.netSalesCents ?? 0) / (snap?.docCount ?? 1)))}
          {:else}
            —
          {/if}
        </span>
      </div>

      <div class="stat-card">
        <span class="stat-label">Comprobantes</span>
        <span class="stat-value tabular-nums" data-testid="hoy-docs">{snap?.docCount ?? 0}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Ventas brutas</span>
        <span class="stat-value tabular-nums">S/ {formatCents(snap?.grossSalesCents ?? 0)}</span>
      </div>
      <a class="stat-card" href="/owner/alertas" data-testid="hoy-alertas">
        <span class="stat-label">Alertas</span>
        <span class="stat-value tabular-nums">{backlog.length + overdueLayaways.length + expiredQuotes.length}</span>
      </a>
    </div>

    <p class="source-note" data-testid="hoy-source">
      {fromCache ? 'Guardado en este dispositivo' : 'Actualizado al conectar'}
      {#if refreshTs}
        · <time datetime={refreshTs} data-testid="hoy-refresh-ts">{refreshTs}</time>
      {/if}
      · no en vivo
    </p>
    {/if}

    <!-- Sprint 66 — Acceso rápido a secciones clave del Modo Dueño -->
    <nav class="owner-quick-nav" aria-label="Accesos rápidos Modo Dueño">
      <a href="/owner/finanzas" class="quick-nav-item" data-testid="owner-quick-finanzas">Finanzas</a>
      <a href="/owner/locales" class="quick-nav-item" data-testid="owner-quick-locales">Locales</a>
      <a href="/owner/stock" class="quick-nav-item" data-testid="owner-quick-stock">Stock</a>
      <a href="/owner/yo" class="quick-nav-item" data-testid="owner-quick-yo">Mi perfil</a>
    </nav>

    <div class="page-masthead">
      <div>
        <h1 class="page-title">Resumen del día</h1>
        <p class="page-lede">Lo que importa hoy, a una mano del dueño.</p>
      </div>
    </div>

    {#if showEmptyDay}
      <section class="ledger-card empty-day section-pad" data-testid="owner-empty-day">
        <div class="empty-day-hero" aria-hidden="true">
          <Icon name="store" size={36} />
        </div>
        <h2 class="empty-day-title">Aún sin movimiento hoy</h2>
        <p class="empty-day-desc">Cuando haya ventas, aquí verás el resumen por sucursal, alertas y el cierre. Mientras tanto, revisa tus finanzas o abre la caja para comenzar.</p>
        <div class="btn-row empty-day-actions">
          <Button variant="secondary" href="/owner/finanzas" data-testid="empty-cta-finanzas">Ver Finanzas</Button>
          <Button variant="primary" href="/" data-testid="empty-cta-caja">Ir a la caja</Button>
        </div>
        <p class="empty-day-note">Datos del servidor · se actualizan al conectar · no en vivo</p>
      </section>
    {/if}

    <!-- F5b-5: boletas del día sin RC ≠ cierre Z (banner Dueño) -->
    <RcPendingBanner />

    {#if onboardingOn && serverState && !checklistDismissed}
      <StatusMessage tone="info" data-testid="owner-checklist">
        <SetupChecklist server={serverState} {printerReady} compact />
        <button
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
      </StatusMessage>
    {/if}

    {#if banner}
      <StatusMessage tone="warning" data-testid="stale-banner">
        <Icon name="clock" size={16} />
        <span>{banner}</span>
      </StatusMessage>
    {/if}

    {#if capabilitiesStaleBanner}
      <StatusMessage tone="warning" data-testid="capabilities-stale-banner">
        <Icon name="clock" size={16} />
        <span>{capabilitiesStaleBanner}</span>
      </StatusMessage>
    {/if}

    {#if isAgenticInsightsEnabled() && briefing}
      <section class="ledger-card section-pad" data-testid="owner-briefing">
        <div class="card-head">
          <h2>Notas del negocio</h2>
          <span class="briefing-stale">Datos del {briefing.reportDate}, no en vivo.</span>
        </div>
        <ul class="briefing-bullets">
          {#each briefingBullets as bullet, i (i)}
            <li>{bullet}</li>
          {/each}
        </ul>
      </section>
    {/if}
    {#if isAgenticInsightsEnabled() && briefing === null}
      <StatusMessage tone="danger" data-testid="briefing-error">No se pudo cargar el resumen del negocio.</StatusMessage>
    {/if}

    <div class="owner-sections-grid">
      {#if layawayOn && overdueLayaways.length > 0}
        <section class="ledger-card section-pad" data-testid="owner-layaway-overdue">
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
        <section class="ledger-card section-pad" data-testid="owner-store-credit">
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
        <section class="ledger-card section-pad" data-testid="owner-quotes-expired">
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
        <section class="ledger-card section-pad" data-testid="owner-installments-overdue">
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
        <section class="ledger-card section-pad" data-testid="owner-commissions">
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
              <span class="report-label">Por pagar</span>
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
        <section class="ledger-card section-pad" data-testid="owner-fiscal-backlog">
          <div class="card-header">
            <h2>Comprobantes pendientes</h2>
            <span class="badge badge-warning">{backlog.length}</span>
          </div>
          <p class="section-desc">Comprobantes aún no aceptados. Anular exige confirmación y un motivo válido.</p>

          {#if eaMsg}
            <StatusMessage tone="info" aria-live="polite" data-testid="ea-msg">
              <Icon name="check" size={16} />
              <span>{eaMsg}</span>
            </StatusMessage>
          {/if}

          <ul class="item-list">
            {#each backlog as item (item.saleId)}
              <li class="item-row" data-testid="backlog-item">
                <span class="item-id">{item.saleId}</span>
                <span class="badge badge-danger" data-testid="backlog-status">{sunatStatusLabel(item.sunatStatus)}</span>
                <span class="item-amount tabular-nums">S/ {formatCents(item.totalCents)}</span>
                {#if canOfferAnularEa(item.sunatStatus)}
                  <Button
                    variant="secondary"
                    size="sm"
                    data-testid="anular-ea"
                    onclick={() => { pendingAnular = item; }}
                  >
                    Anular
                  </Button>
                {/if}
              </li>
            {/each}
          </ul>

          {#if pendingAnular}
            <div class="confirm-box" data-testid="ea-confirm">
              <p class="confirm-title">
                Confirmar anulación de <strong>{pendingAnular.saleId}</strong>
              </p>
              <div class="field-group">
                <label for="ea-motive-input">Motivo de anulación</label>
                <input id="ea-motive-input" data-testid="ea-motive" bind:value={motiveCode} />
              </div>
              <div class="btn-row">
                <Button variant="primary" data-testid="ea-confirm-btn" onclick={() => void confirmAnular()}>
                  Confirmar anulación
                </Button>
                <Button variant="secondary" onclick={() => (pendingAnular = null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          {/if}
        </section>
      {/if}

      {#if debitNoteOn}
        <section class="ledger-card owner-section section-pad" data-testid="owner-debit-note">
          <div class="owner-section-head">
            <h2>Nota de débito</h2>
            <span class="badge badge-indigo">Ajuste al alza</span>
          </div>
          <p class="owner-section-lede">
            Incrementa el valor de un comprobante aceptado (factura/boleta) por interés, aumento de valor o penalidades. No toca stock.
          </p>
          <div class="field-group">
            <label for="dn-origin">Comprobante origen</label>
            <input id="dn-origin" bind:value={dnOriginSaleId} data-testid="dn-origin" placeholder="ID del comprobante" />
          </div>
          <div class="field-group">
            <label for="dn-series">Serie</label>
            <input id="dn-series" bind:value={dnSeries} data-testid="dn-series" placeholder="FC01" />
          </div>
          <div class="field-group">
            <label for="dn-motive">Motivo</label>
            <select id="dn-motive" bind:value={dnMotiveCode} data-testid="dn-motive">
              <option value="01">Interés por mora</option>
              <option value="02">Aumento de valor</option>
              <option value="03">Penalidades / otros conceptos</option>
              <option value="10">Ajuste de otros conceptos</option>
            </select>
          </div>
          <div class="field-group">
            <label for="dn-amount">Monto</label>
            <input id="dn-amount" type="number" min="1" bind:value={dnAmountCents} data-testid="dn-amount" />
          </div>
          <div class="field-group">
            <label for="dn-desc">Descripción (opcional)</label>
            <input id="dn-desc" bind:value={dnDescription} data-testid="dn-desc" placeholder="Ej. Interés por pago fuera de plazo" />
          </div>
          <Button variant="primary" data-testid="dn-submit" onclick={onIssueDebitNote}>
            Emitir nota de débito
          </Button>
          {#if dnMsg}
            <p class="dn-msg" data-testid="dn-msg" class:dn-msg-ok={dnIssued}>{dnMsg}</p>
          {/if}
        </section>
      {/if}

      {#if withholdingsOn}
        <section class="ledger-card owner-section section-pad" data-testid="owner-withholdings">
          <div class="owner-section-head">
            <h2>Percepciones y retenciones</h2>
            <span class="badge badge-indigo">Pagos adelantados</span>
          </div>
          <p class="owner-section-lede">
            Percepción al cobrar a un cliente agente; retención al pagar a un proveedor sujeto. Los montos los calcula KipusPay.
          </p>
          <div class="field-group">
            <label for="wh-branch">Sucursal</label>
            <input id="wh-branch" bind:value={whBranchId} data-testid="wh-branch" />
          </div>
          <div class="field-group">
            <label for="wh-category">Categoría (tasa)</label>
            <select id="wh-category" bind:value={whCategory} data-testid="wh-category">
              <option value="goods">Bienes (percep. 2% / ret. 3%)</option>
              <option value="services">Servicios (ret. 6%)</option>
              <option value="commissions">Comisiones (ret. 12%)</option>
              <option value="other">Resto (percep. 0.5%)</option>
            </select>
          </div>
          <div class="field-group">
            <label for="wh-base">Base</label>
            <input id="wh-base" type="number" min="1" bind:value={whBase} data-testid="wh-base" />
          </div>
          <div class="field-group">
            <label for="wh-sale">Venta origen (percepción)</label>
            <input id="wh-sale" bind:value={whSaleId} data-testid="wh-sale" placeholder="ID de la venta" />
            <Button variant="primary" data-testid="wh-perception-submit" onclick={onIssuePerception}>
              Emitir percepción
            </Button>
          </div>
          <div class="field-group">
            <label for="wh-invoice">Factura proveedor (retención)</label>
            <input id="wh-invoice" bind:value={whInvoiceId} data-testid="wh-invoice" placeholder="ID de la factura" />
            <Button variant="primary" data-testid="wh-retention-submit" onclick={onIssueRetention}>
              Emitir retención
            </Button>
          </div>
          {#if whMsg}
            <p class="wh-msg" data-testid="wh-msg" class:wh-msg-ok={whIssued}>{whMsg}</p>
          {/if}
        </section>
      {/if}
    </div>
  </div>
 {/if}

<style>
  /* Sprint 66 — shadow token local */
  :global(:root) {
    --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.35);
  }

  .stat-grid a.stat-card {
    text-decoration: none;
    color: inherit;
  }

  /* Sprint 66 — grid override para 5 tarjetas fluidas */
  .stat-grid {
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  }

  /* Sprint 66 — hover con micro-sombra */
  .stat-card {
    min-height: 44px;
    transition: box-shadow 0.18s ease, border-color 0.18s ease;
  }

  @media (prefers-reduced-motion: reduce) {
    .stat-card {
      transition: none;
    }
  }

  .stat-card:hover {
    box-shadow: var(--shadow-sm);
    border-color: var(--border-strong);
  }

  /* Sprint 66 — delta badge */
  .stat-delta {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.01em;
    padding: 0.15rem 0.4rem;
    border-radius: var(--radius-sm, 4px);
    width: fit-content;
  }

  .stat-delta-pos {
    color: var(--emerald-green);
    background: rgba(61, 187, 134, 0.12);
  }

  .stat-delta-neg {
    color: var(--rose-red);
    background: rgba(232, 122, 94, 0.12);
  }

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

  .owner-section {
    display: grid;
    gap: var(--space-3);
  }

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
    font-size: 0.75rem;
    letter-spacing: 0.02em;
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



  .btn-row {
    display: flex;
    gap: 0.5rem;
  }

  @media (max-width: 719px) {
    .owner-sections-grid {
      grid-template-columns: 1fr;
    }
  }

  /* Sprint 66 — quick-nav */
  .owner-quick-nav {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem;
    margin: 1rem 0;
  }

  .quick-nav-item {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0.75rem 1rem;
    background: var(--bg-glass);
    border: 1px solid var(--owner-border, var(--border-subtle));
    border-radius: var(--radius-md);
    color: var(--owner-fg, var(--text-main));
    text-decoration: none;
    font-size: 0.9rem;
    font-weight: 600;
    text-align: center;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  @media (prefers-reduced-motion: reduce) {
    .quick-nav-item {
      transition: none;
    }
  }

  .quick-nav-item:hover {
    border-color: var(--owner-accent, var(--accent-primary));
    box-shadow: 0 0 0 1px var(--owner-accent, var(--accent-primary));
  }

  @media (min-width: 719px) {
    .owner-quick-nav {
      grid-template-columns: repeat(4, 1fr);
    }
  }

  /* Empty-day premium placeholder — ilustrado + CTA accionable (WCAG AA, 44px) */
  .empty-day {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 0.75rem;
    padding: 2rem 1.5rem;
  }

  .empty-day-hero {
    width: 72px;
    height: 72px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(217, 154, 61, 0.1);
    border: 1px solid rgba(217, 154, 61, 0.22);
    border-radius: var(--radius-md);
    color: var(--accent-primary);
  }

  .empty-day-title {
    font-family: var(--font-heading);
    font-size: 1.125rem;
    font-weight: 800;
    color: var(--text-main);
    margin: 0;
  }

  .empty-day-desc {
    font-size: 0.875rem;
    color: var(--text-muted);
    line-height: 1.5;
    max-width: 42ch;
    margin: 0;
  }

  .empty-day-actions {
    margin-top: 0.5rem;
    justify-content: center;
  }

  .empty-day-note {
    font-family: var(--font-mono);
    font-size: 0.6875rem;
    color: var(--text-dim);
    margin-top: 0.25rem;
  }
</style>
