<script lang="ts">
  import { onMount } from 'svelte';
  import { formatCents } from '$lib/cents';
  import { isVitrinaEnabled } from '$lib/features';
  import { subscribeVitrina, type VitrinaSnapshot } from '$lib/vitrina/channel';

  const enabled = isVitrinaEnabled();
  let snap = $state<VitrinaSnapshot>({
    totalCents: 0,
    itemCount: 0,
    documentType: '—',
    phase: 'idle',
    message: 'Esperando cobro…',
  });

  onMount(() => {
    if (!enabled) return;
    return subscribeVitrina((s) => {
      snap = s;
    });
  });
</script>

{#if !enabled}
  <p data-testid="vitrina-off">Vitrina desactivada (FEATURE_VITRINA off).</p>
{:else}
  <main data-testid="vitrina">
    <h1>Vitrina</h1>
    <p data-testid="vitrina-phase">{snap.phase}</p>
    <p data-testid="vitrina-total">S/ {formatCents(snap.totalCents)}</p>
    <p data-testid="vitrina-message">{snap.message}</p>
  </main>
{/if}
