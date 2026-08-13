<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import { isClientOffloadingEnabled, isHardwarePrintFallbackEnabled } from '$lib/features';

  const printOn = isHardwarePrintFallbackEnabled() || isClientOffloadingEnabled();
</script>

<svelte:head><title>Ayuda · KipusPay</title></svelte:head>

<div class="page-shell" data-testid="ayuda-page">
  <div class="page-masthead">
    <div>
      <p class="page-eyebrow"><Icon name="info" size={12} /> Soporte en caja</p>
      <h1 class="page-title">Ayuda</h1>
      <p class="page-lede">Lo esencial para que la caja siga funcionando.</p>
    </div>
  </div>

  <div class="help-grid">
    <section class="glass-card section-pad">
      <h2 class="help-title">El internet se cortó</h2>
      <p>La caja sigue vendiendo sin conexión: el cobro se guarda en este dispositivo y se sincroniza solo cuando vuelve la señal. Revisa el indicador "Sin conexión" arriba a la derecha.</p>
    </section>

    {#if printOn}
      <section class="glass-card section-pad">
        <h2 class="help-title">La impresora no imprime</h2>
        <p>La impresora se conecta en este orden: cable USB, red local (Wi-Fi), Bluetooth y luego el diálogo de impresión del sistema. Si el ticket no sale, aparece en "Impresiones pendientes" en el cierre de caja para reimprimirlo.</p>
      </section>
    {/if}

    <section class="glass-card section-pad">
      <h2 class="help-title">Cambio de turno</h2>
      <p>Para cambiar de operador sin cerrar la caja usa el PIN de transferencia en Caja → Cambio de turno. El turno queda auditado y la sesión sigue abierta.</p>
    </section>

    <section class="glass-card section-pad">
      <h2 class="help-title">El cliente quiere una copia</h2>
      <p>Reimprime el ticket desde Caja → Reimpresión. La copia sale marcada con el sello COPIA y queda registrada.</p>
    </section>

    <section class="glass-card section-pad">
      <h2 class="help-title">Necesito más ayuda</h2>
      <p>Contacta a tu proveedor. Ten a mano el nombre de la tienda y el ID de la caja.</p>
    </section>
  </div>
</div>

<style>
  .help-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1.25rem;
  }

  .help-title {
    font-size: 1.125rem;
    font-weight: 700;
    margin-bottom: 0.5rem;
  }

  .help-grid p {
    color: var(--text-muted);
    line-height: 1.55;
    font-size: 0.9375rem;
  }
</style>
