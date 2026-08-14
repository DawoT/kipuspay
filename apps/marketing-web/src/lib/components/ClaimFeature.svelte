<script lang="ts">
  import type { FeaturedClaimId } from '$lib/claims/registry';
  import { publicBadge, publicLabel, publicStatus } from '$lib/claims/public';

  const AVAILABLE_LABELS: Record<string, string> = {
    services_core: 'Cobro y facturacion sin inventario',
    owner_ranking: 'Ranking de locales en Modo Dueno',
  };

  let { claimId }: { claimId: FeaturedClaimId } = $props();
  const status = $derived(publicStatus(claimId));
  const available = $derived(status.kind === 'available');
  const label = $derived(publicLabel(status, AVAILABLE_LABELS[claimId] ?? 'KipusPay'));
</script>

<div
  class={`claim-box ${available ? 'available' : 'preparing'}`}
  data-testid="claim-feature"
  data-claim={claimId}
>
  <span class="badge">{publicBadge(status)}</span>
  <h3>{label}</h3>
  {#if available}
    <p>Lista para tu negocio hoy: cobra y ve tu día sin promesas de tiempo real.</p>
  {:else}
    <p>
      Lo vemos en tu demo para que lo pruebes; se activa cuando esté lista para producción.
      Hoy vendemos el dolor y lo que ya cobra en tu mostrador.
    </p>
  {/if}
</div>
