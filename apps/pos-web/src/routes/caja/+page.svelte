<script lang="ts">
  import { onMount } from 'svelte';
  import { formatCents } from '$lib/cents';
  import { isCashBlindZEnabled } from '$lib/features';
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

  const blindOn = isCashBlindZEnabled();

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

  const countLines = $derived(
    PEN_DENOMS.filter((d) => (qtyByDenom[d] ?? 0) > 0).map(
      (d): DenominationLine => ({
        denominationCents: d,
        quantity: qtyByDenom[d] ?? 0,
      }),
    ),
  );
  const countedLocal = $derived(sumLocalCount(countLines));

  onMount(() => {
    session = readTenantSession(sessionStorage);
  });

  async function onConfirmClose() {
    status = 'enviando';
    resultMsg = '';
    revealedExpected = null;
    revealedDiff = null;
    // Expected nunca se muestra antes del POST (cierre ciego).
    const apiBase = (import.meta.env.PUBLIC_API_BASE as string | undefined) ?? '';
    const auth = (import.meta.env.PUBLIC_DEV_AUTH as string | undefined) ?? 'Bearer demo';
    const res = await submitBlindClose(apiBase || 'https://api.kipuspay.local', auth, {
      sessionId,
      countLines,
      differenceReason: reason.trim() || null,
      differenceThresholdCents: 0,
    });
    if (!res.ok) {
      status = 'error';
      resultMsg = res.message;
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

  {#if !blindOn}
    <p class="off" data-testid="caja-feature-off">
      FEATURE_CASH_BLIND_Z desactivado. Activá el flag para cerrar caja en producción.
    </p>
  {:else}
    <label>
      Sesión de caja
      <input data-testid="caja-session-id" bind:value={sessionId} />
    </label>
    <p class="tenant" data-testid="caja-tenant">{session.tradeName}</p>

    <table class="denoms">
      <thead>
        <tr>
          <th>Denominación</th>
          <th>Cantidad</th>
        </tr>
      </thead>
      <tbody>
        {#each PEN_DENOMS as denom}
          <tr>
            <td>{formatCents(denom)}</td>
            <td>
              <input
                type="number"
                min="0"
                step="1"
                data-testid={`caja-qty-${denom}`}
                value={qtyByDenom[denom] ?? 0}
                oninput={(e) => {
                  const v = Number((e.currentTarget as HTMLInputElement).value);
                  qtyByDenom = { ...qtyByDenom, [denom]: Number.isFinite(v) && v > 0 ? Math.floor(v) : 0 };
                }}
              />
            </td>
          </tr>
        {/each}
      </tbody>
    </table>

    <p data-testid="caja-counted-local">Contado (local): {formatCents(countedLocal)}</p>
    <p class="hint" data-testid="caja-expected-hidden">Esperado: oculto hasta confirmar</p>

    <label>
      Justificación si hay diferencia
      <textarea data-testid="caja-reason" bind:value={reason} rows="2"></textarea>
    </label>

    <button
      type="button"
      data-testid="caja-confirm"
      disabled={countLines.length === 0 || status === 'enviando'}
      onclick={onConfirmClose}
    >
      Confirmar cierre Z
    </button>

    {#if status}
      <p data-testid="caja-status">{status}: {resultMsg}</p>
    {/if}
    {#if revealedExpected !== null}
      <p data-testid="caja-expected-revealed">Esperado: {formatCents(revealedExpected)}</p>
      <p data-testid="caja-diff-revealed">Diferencia: {formatCents(revealedDiff ?? 0)}</p>
    {/if}
  {/if}
</section>

<style>
  .caja-blind {
    max-width: 40rem;
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem;
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
  }
  h1 {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 1.75rem;
    margin: 0 0 0.5rem;
  }
  .lede {
    color: #3d4450;
    margin: 0 0 1.25rem;
  }
  .off {
    padding: 1rem;
    background: #f3f1ec;
  }
  .denoms {
    width: 100%;
    border-collapse: collapse;
    margin: 1rem 0;
  }
  .denoms th,
  .denoms td {
    text-align: left;
    padding: 0.35rem 0.5rem;
    border-bottom: 1px solid #e4e0d8;
  }
  input[type='number'],
  input:not([type]),
  textarea {
    width: 100%;
    max-width: 12rem;
    padding: 0.35rem 0.5rem;
  }
  .hint {
    font-size: 0.9rem;
    color: #6b7280;
  }
  button {
    margin-top: 1rem;
    padding: 0.65rem 1.1rem;
    background: #1a2332;
    color: #f8f6f1;
    border: 0;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
