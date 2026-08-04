<script lang="ts">
  import { isOwnerModeEnabled } from '$lib/features';

  const enabled = isOwnerModeEnabled();
</script>

{#if enabled}
  <section class="yo" data-testid="owner-yo">
    <h1>Yo</h1>
    <p class="lede">Plan, suscripción y atajos — config profunda en Admin.</p>
    <p class="plan" data-testid="plan-label">Plan: Crece (lectura)</p>
    <a
      class="cta"
      data-testid="activar-facturacion"
      href="/admin/configuracion?focus=facturacion"
    >
      Activar facturación electrónica
    </a>
  </section>
{/if}

<style>
  .yo {
    padding: 1rem 1.25rem 5rem;
  }
  h1 {
    margin: 0 0 0.35rem;
  }
  .lede {
    color: var(--owner-muted, #8b9aab);
  }
  .plan {
    margin: 1.25rem 0;
    padding: 1rem;
    background: var(--owner-surface, #1a222c);
  }
  .cta {
    display: inline-block;
    margin-top: 0.5rem;
    padding: 0.85rem 1rem;
    background: var(--owner-accent, #3d9a6a);
    color: #06140c;
    text-decoration: none;
    font-weight: 600;
  }
</style>
