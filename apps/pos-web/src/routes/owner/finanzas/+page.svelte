<script lang="ts">
  import { isLedgerArApEnabled, isOwnerModeEnabled } from '$lib/features';

  const enabled = isOwnerModeEnabled();
  const ledger = isLedgerArApEnabled();
</script>

{#if enabled}
  <section class="finanzas" data-testid="owner-finanzas">
    <h1>Finanzas</h1>
    <p class="lede">CxC, CxP y egresos consolidados (lectura).</p>
    {#if ledger}
      <ul>
        <li>Cuentas por cobrar</li>
        <li>Cuentas por pagar</li>
        <li>Egresos de caja</li>
      </ul>
    {:else}
      <p data-testid="ledger-gated">Ledger desactivado (FEATURE_LEDGER_AR_AP off).</p>
    {/if}
  </section>
{/if}

<style>
  .finanzas {
    padding: 1rem 1.25rem 5rem;
  }
  h1 {
    margin: 0 0 0.35rem;
  }
  .lede {
    color: var(--owner-muted, #8b9aab);
  }
  ul {
    padding-left: 1.1rem;
    line-height: 1.8;
  }
</style>
