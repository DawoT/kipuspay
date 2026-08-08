<script lang="ts">
  import { onMount } from 'svelte';
  import { formatCents } from '$lib/cents';
  import {
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

  const enabled = isOwnerModeEnabled();
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
    void loadOverdueInstallments();
    void loadCommissionsReport();
    const onOnline = () => void refresh(true);
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  });
</script>

{#if enabled}
  <section class="hoy" data-testid="owner-hoy">
    <h1>Hoy</h1>
    <p class="lede">Resumen accionable del día — sin scroll infinito.</p>
    {#if banner}
      <p class="stale" data-testid="stale-banner">{banner}</p>
    {/if}
    <p class="metric" data-testid="hoy-net">
      Ventas netas
      <strong>S/ {formatCents(snap?.netSalesCents ?? 0)}</strong>
    </p>
    <p class="metric" data-testid="hoy-docs">
      Comprobantes <strong>{snap?.docCount ?? 0}</strong>
    </p>
    <p class="meta" data-testid="hoy-source">
      {fromCache ? 'Desde cache local' : 'Actualizado al conectar'} · no en vivo
    </p>
    {#if layawayOn && overdueLayaways.length > 0}
      <aside class="overdue" data-testid="owner-layaway-overdue">
        <h2>Apartados vencidos</h2>
        <ul>
          {#each overdueLayaways as item (item.id)}
            <li>
              {item.id} · saldo S/ {formatCents(item.balanceCents)} · vence {item.dueDate ?? '—'}
            </li>
          {/each}
        </ul>
      </aside>
    {/if}
    {#if storeCreditOn && storeCreditReport}
      <aside class="overdue" data-testid="owner-store-credit">
        <h2>Crédito de tienda</h2>
        <p>Emitidos S/ {formatCents(storeCreditReport.issuedCents)}</p>
        <p>Canjeados S/ {formatCents(storeCreditReport.redeemedCents)}</p>
        <p>Expirados S/ {formatCents(storeCreditReport.expiredCents)}</p>
        <p>Saldo abierto S/ {formatCents(storeCreditReport.openBalanceCents)}</p>
      </aside>
    {/if}
    {#if quotesOn && expiredQuotes.length > 0}
      <aside class="overdue" data-testid="owner-quotes-expired">
        <h2>Cotizaciones vencidas</h2>
        <ul>
          {#each expiredQuotes as item (item.id)}
            <li>
              {item.id} · S/ {formatCents(item.snapshotTotalCents)} · vence {item.validUntil ?? '—'}
            </li>
          {/each}
        </ul>
      </aside>
    {/if}
    {#if installmentsOn && overdueInstallments.length > 0}
      <aside class="overdue" data-testid="owner-installments-overdue">
        <h2>Cuotas vencidas</h2>
        <p class="lede">El atraso no corta la caja.</p>
        <ul>
          {#each overdueInstallments as item (item.id)}
            <li>
              {item.saleId} · cuota {item.installmentNumber} · S/
              {formatCents(item.amountCents)} · vence {item.dueDate}
            </li>
          {/each}
        </ul>
      </aside>
    {/if}
    {#if commissionsOn && commissionsReport}
      <aside class="overdue" data-testid="owner-commissions">
        <h2>Comisiones pendientes</h2>
        <p>Devengado S/ {formatCents(commissionsReport.pendingAccrualCents)}</p>
        <p>Payouts OPEN S/ {formatCents(commissionsReport.openPayoutCents)}</p>
        <p>Pagado S/ {formatCents(commissionsReport.paidPayoutCents)}</p>
        <p class="lede">CSV: reporte commissions-pending (Crece).</p>
      </aside>
    {/if}
  </section>

  {#if fiscalEa}
    <section class="fiscal" data-testid="owner-fiscal-backlog">
      <h2>Fiscal — represados / cuarentena</h2>
      <p class="lede">CPE no aceptados. Anular (E-A) exige confirmación y motivo Catálogo 09.</p>
      {#if eaMsg}
        <p class="ea-msg" data-testid="ea-msg">{eaMsg}</p>
      {/if}
      <ul>
        {#each backlog as item (item.saleId)}
          <li data-testid="backlog-item">
            <span>{item.saleId} · {item.sunatStatus} · S/ {formatCents(item.totalCents)}</span>
            {#if canOfferAnularEa(item.sunatStatus)}
              <button
                type="button"
                data-testid="anular-ea"
                onclick={() => {
                  pendingAnular = item;
                }}>Anular</button
              >
            {/if}
          </li>
        {/each}
      </ul>
      {#if pendingAnular}
        <div class="confirm" data-testid="ea-confirm">
          <p>
            Confirmar NC anulación sin CDR para <strong>{pendingAnular.saleId}</strong>
          </p>
          <label>
            Motivo Cat. 09
            <input data-testid="ea-motive" bind:value={motiveCode} />
          </label>
          <button type="button" data-testid="ea-confirm-btn" onclick={() => void confirmAnular()}
            >Confirmar anulación</button
          >
          <button type="button" onclick={() => (pendingAnular = null)}>Cancelar</button>
        </div>
      {/if}
    </section>
  {/if}
{/if}

<style>
  .hoy,
  .fiscal {
    flex: 1;
    padding: 1rem 1.25rem 5rem;
  }
  h1,
  h2 {
    margin: 0 0 0.35rem;
    font-size: 1.35rem;
  }
  .lede {
    margin: 0 0 1.25rem;
    color: var(--owner-muted, #8b9aab);
    font-size: 0.95rem;
  }
  .stale {
    margin: 0 0 1rem;
    padding: 0.65rem 0.75rem;
    background: #2a2418;
    color: #e6c07b;
    font-size: 0.85rem;
  }
  .metric {
    margin: 0 0 0.85rem;
    padding: 1rem;
    background: var(--owner-surface, #1a222c);
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .metric strong {
    font-size: 1.35rem;
    color: var(--owner-accent, #3d9a6a);
  }
  .meta {
    margin-top: 1.25rem;
    color: var(--owner-muted, #8b9aab);
    font-size: 0.8rem;
  }
  .fiscal ul {
    list-style: none;
    padding: 0;
    margin: 0 0 1rem;
  }
  .fiscal li {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem 0;
    border-bottom: 1px solid #2a3340;
  }
  .confirm {
    padding: 1rem;
    background: var(--owner-surface, #1a222c);
  }
  .ea-msg {
    color: var(--owner-accent, #3d9a6a);
  }
  .overdue {
    margin: 1.25rem 0 0;
    padding: 1rem;
    background: #2a2418;
    color: #e6c07b;
  }
  .overdue ul {
    list-style: none;
    padding: 0;
    margin: 0.5rem 0 0;
  }
  .overdue li {
    padding: 0.35rem 0;
    border-bottom: 1px solid #3a3328;
  }
</style>
