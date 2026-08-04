<script lang="ts">
  import { claimBadge, isClaimLive, resolveClaim, type FeaturedClaimId } from '$lib/claims/registry';

  const LIVE_LABELS: Record<string, string> = {
    services_core: 'Cobro y facturacion sin inventario',
    owner_ranking: 'Ranking de locales en Modo Dueno',
  };

  let { claimId }: { claimId: FeaturedClaimId } = $props();
  const status = $derived(resolveClaim(claimId));
  const live = $derived(isClaimLive(status));
  const label = $derived(
    status.kind === 'roadmap' ? status.label : (LIVE_LABELS[claimId] ?? 'Disponible en KipusPay'),
  );
</script>

<div
  class={`claim-box ${live ? 'live' : 'roadmap'}`}
  data-testid="claim-feature"
  data-claim={claimId}
>
  <span class="badge">{claimBadge(status)}</span>
  <h3>{label}</h3>
  {#if status.kind === 'roadmap'}
    <p>
      Esta capacidad se presenta como roadmap hasta el Quality Gate del Sprint {status.unlockSprint}.
      Mientras tanto vendemos el dolor y lo ya listo: cobro, formalizacion y Modo Dueno basico.
    </p>
  {:else}
    <p>Lista para tu negocio hoy: cobra y ve tu dia sin promesas de tiempo real.</p>
  {/if}
</div>
