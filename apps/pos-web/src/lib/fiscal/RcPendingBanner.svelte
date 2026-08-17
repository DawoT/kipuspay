<script lang="ts">
  import { onMount } from 'svelte';
  import { apiFetch } from '$lib/auth/api-client';

  interface RcBannerState {
    loading: boolean;
    pending: number;
    summaryDate: string;
    error: boolean;
  }

  let state: RcBannerState = { loading: true, pending: 0, summaryDate: '', error: false };

  async function refresh(): Promise<void> {
    state = { ...state, loading: true };
    try {
      const res = await apiFetch('/api/owner/rc-pending-banner');
      if (res.status === 404) {
        // FEATURE_FISCAL_RC off — sin banner (feature no activa).
        state = { loading: false, pending: 0, summaryDate: '', error: false };
        return;
      }
      if (!res.ok) {
        state = { ...state, loading: false, error: true };
        return;
      }
      const body = (await res.json()) as { pendingRcTickets: number; summaryDate: string };
      state = {
        loading: false,
        pending: body.pendingRcTickets,
        summaryDate: body.summaryDate,
        error: false,
      };
    } catch {
      state = { ...state, loading: false, error: true };
    }
  }

  onMount(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(timer);
  });
</script>

{#if !state.loading && !state.error && state.pending > 0}
  <div
    class="rc-pending-banner"
    role="status"
    aria-label="Boletas del día sin resumen diario"
  >
    <span class="dot" aria-hidden="true"></span>
    <p>
      <strong>{state.pending} boleta{state.pending === 1 ? '' : 's'}</strong> del día
      {state.summaryDate} aún sin Resumen Diario (RC).
      El cierre de caja (Z) no reemplaza el RC.
    </p>
  </div>
{/if}

<style>
  .rc-pending-banner {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.75rem 1rem;
    border-radius: 0.75rem;
    background: color-mix(in srgb, var(--amber-gold) 18%, var(--paper, #f3efe6));
    border: 1px solid var(--amber-gold);
    color: var(--ink);
    margin-bottom: 1rem;
  }
  .rc-pending-banner p {
    margin: 0;
    font-size: 0.9rem;
  }
  .dot {
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    background: var(--amber-gold);
    flex-shrink: 0;
  }
</style>
