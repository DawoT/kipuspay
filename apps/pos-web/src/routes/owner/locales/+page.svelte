<script lang="ts">
  import { isOwnerModeEnabled } from '$lib/features';

  const enabled = isOwnerModeEnabled();
</script>

{#if enabled}
  <section class="locales" data-testid="owner-locales">
    <h1>Locales</h1>
    <p class="lede" data-testid="locales-frozen">
      Ranking por sucursal no está en vivo. Claims GTM-03 / GTM-11 congelados hasta Sprint 9.
    </p>
  </section>
{/if}

<style>
  .locales {
    padding: 1rem 1.25rem 5rem;
  }
  .lede {
    color: var(--owner-muted, #8b9aab);
  }
</style>
