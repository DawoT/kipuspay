<script lang="ts">
  import { onMount } from 'svelte';
  import { formatCents } from '$lib/cents';
  import {
    isCashBlindZEnabled,
    isClientOffloadingEnabled,
    isHardwarePrintFallbackEnabled,
  } from '$lib/features';
  import {
    PEN_DENOMS,
    submitBlindClose,
    sumLocalCount,
    type DenominationLine,
  } from '$lib/cash/blind-close';
  import {
    defaultTenantSession,
    readTenantSession,
    type PosTenantSession,
  } from '$lib/tenant/session';
  import { createBrowserPrintIdb, PrintOutboxStore } from '$lib/print/print-outbox-store';
  import { createPrinterTransport } from '$lib/print/printer-transport';

  const blindOn = isCashBlindZEnabled();
  const printOn = isHardwarePrintFallbackEnabled() || isClientOffloadingEnabled();

  let session = $state<PosTenantSession>(defaultTenantSession());
  let sessionId = $state('s-demo');
  let qtyByDenom = $state<Record<number, number>>(
    Object.fromEntries(PEN_DENOMS.map((d) => [d, 0])),
  );
  let reason = $state('');
  let status = $state('');
  let resultMsg = $state('');
  let revealedExpected = $state<number | null>(null);
  let revealedDiff = $state<number | null>(null);
  let outboxPending = $state(0);
  let preflightAdapters = $state<string[]>([]);

  const countLines = $derived(
    PEN_DENOMS.filter((d) => (qtyByDenom[d] ?? 0) > 0).map(
      (d): DenominationLine => ({
        denominationCents: d,
        quantity: qtyByDenom[d] ?? 0,
      }),
    ),
  );
  const countedLocal = $derived(sumLocalCount(countLines));

  /** Adaptador de browser IndexedDB (persistencia real entre F5/pestañas). */
  const printIdb = createBrowserPrintIdb();
  const printOutbox = new PrintOutboxStore(printIdb);

  onMount(() => {
    session = readTenantSession(sessionStorage);
    void refreshOutbox();
    if (printOn) {
      void createPrinterTransport().preflight().then((a) => {
        preflightAdapters = [...a];
      });
    }
  });

  async function refreshOutbox() {
    outboxPending = await printOutbox.pendingCount();
  }

  async function onConfirmClose() {
    status = 'enviando';
    resultMsg = '';
    revealedExpected = null;
    revealedDiff = null;
    await refreshOutbox();
    if (outboxPending > 0) {
      status = 'bloqueado';
      resultMsg = `Print outbox pendiente (${outboxPending}). Reimprime o resuelve tickets antes del cierre Z.`;
      return;
    }
    const apiBase = (import.meta.env.PUBLIC_API_BASE as string | undefined) ?? '';
    const auth = (import.meta.env.PUBLIC_DEV_AUTH as string | undefined) ?? 'Bearer demo';
    const res = await submitBlindClose(apiBase || 'https://api.kipuspay.local', auth, {
      sessionId,
      countLines,
      differenceReason: reason.trim() || null,
      differenceThresholdCents: 0,
      outboxPendingCount: outboxPending,
    });
    if (!res.ok) {
      status = 'error';
      resultMsg =
        res.code === 'PRINT_OUTBOX_BLOCK'
          ? `Bloqueado por print outbox (${res.pendingCount ?? '?'})`
          : res.message;
      return;
    }
    status = 'cerrado';
    revealedExpected = res.expectedTotalCents ?? null;
    revealedDiff = res.differenceAmountCents ?? null;
    resultMsg = res.message;
  }
</script>

<section class="caja-blind" data-testid="caja-blind-z">
  <h1>Cierre Z ciego</h1>
  <p class="lede">
    Contá el efectivo por denominación. El sistema calcula lo esperado solo después de confirmar —
    no se muestra anticipadamente.
  </p>
  <p>
    <a href="/caja/devolucion" data-testid="caja-link-devolucion">Devolución</a>
  </p>

  {#if !blindOn}
    <p class="off" data-testid="caja-feature-off">
      FEATURE_CASH_BLIND_Z desactivado. Activá el flag para cerrar caja en producción.
    </p>
  {:else}
    {#if printOn}
      <p data-testid="caja-print-preflight">
        Pre-flight impresora: {preflightAdapters.length
          ? preflightAdapters.join(' → ')
          : 'detectando…'}
      </p>
      <p data-testid="caja-print-pending">
        Tickets en outbox (PENDING/FAILED): {outboxPending}
      </p>
    {/if}

    <label>
      session_id
      <input bind:value={sessionId} data-testid="caja-session-id" />
    </label>

    <table>
      <thead>
        <tr>
          <th>Denominación</th>
          <th>Cantidad</th>
        </tr>
      </thead>
      <tbody>
        {#each PEN_DENOMS as d}
          <tr>
            <td>{formatCents(d)}</td>
            <td>
              <input
                type="number"
                min="0"
                bind:value={qtyByDenom[d]}
                data-testid={`caja-denom-${d}`}
              />
            </td>
          </tr>
        {/each}
      </tbody>
    </table>

    <p>Conteo local: {formatCents(countedLocal)} (tenant {session.tenantId})</p>

    <label>
      Motivo diferencia (si aplica)
      <input bind:value={reason} data-testid="caja-diff-reason" />
    </label>

    <button type="button" data-testid="caja-confirm-z" onclick={onConfirmClose}>
      Confirmar cierre Z
    </button>

    {#if status}
      <p data-testid="caja-z-status">{status}</p>
    {/if}
    {#if resultMsg}
      <p data-testid="caja-z-msg">{resultMsg}</p>
    {/if}
    {#if revealedExpected !== null}
      <p data-testid="caja-z-expected">Esperado (después): {formatCents(revealedExpected)}</p>
    {/if}
    {#if revealedDiff !== null}
      <p data-testid="caja-z-diff">Diferencia: {formatCents(revealedDiff)}</p>
    {/if}
  {/if}
</section>

<style>
  .caja-blind {
    max-width: 36rem;
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem;
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
  }
  .lede {
    color: #445;
  }
  .off {
    color: #664d03;
    background: #fff3cd;
    padding: 0.75rem;
  }
  label {
    display: block;
    margin: 0.75rem 0;
  }
  input {
    display: block;
    width: 100%;
    margin-top: 0.25rem;
    padding: 0.35rem 0.5rem;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 1rem 0;
  }
  th,
  td {
    text-align: left;
    padding: 0.35rem 0.25rem;
    border-bottom: 1px solid #dde;
  }
  button {
    margin-top: 0.75rem;
    padding: 0.45rem 0.85rem;
  }
</style>
