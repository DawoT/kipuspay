<script lang="ts">
  import { resolveApiAuth, resolveApiBase } from '$lib/auth/api-client';
  import { leaseScannedSerialLine, SerialCheckoutError } from '$lib/pos-checkout/serial-client';
  import type { SellableCatalogItem } from '$lib/catalog/sellable-catalog-client';
  import type { CartLine } from '$lib/pos-checkout/cart';
  import { cashierFacingMessage } from '$lib/ui/cashier-copy';

  let {
    catalogItems = [],
    onAddLine,
  }: {
    catalogItems: SellableCatalogItem[];
    onAddLine: (line: CartLine) => void;
  } = $props();

  let terminalId = $state('');
  let terminalRegistered = $state(false);
  let serialScan = $state('');
  let serialStatus = $state('');
  let serialBusy = $state(false);
  let serialInput = $state<HTMLInputElement>();

  // Hidrata terminal desde localStorage
  $effect(() => {
    if (typeof localStorage === 'undefined') return;
    const stored = localStorage.getItem('kipuspay:pos-terminal-id') ?? '';
    if (stored) {
      terminalId = stored;
      terminalRegistered = true;
    }
  });

  function registerTerminal() {
    const trimmed = terminalId.trim();
    if (!trimmed) return;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('kipuspay:pos-terminal-id', trimmed);
    }
    terminalId = trimmed;
    terminalRegistered = true;
  }

  function terminalChanged() {
    terminalRegistered = false;
  }

  async function addScannedSerial(event?: KeyboardEvent) {
    if (event && event.key !== 'Enter') return;
    event?.preventDefault();
    if (serialBusy) return;
    serialBusy = true;
    serialStatus = 'Buscando serie disponible…';
    try {
      const line = await leaseScannedSerialLine({
        rawSerial: serialScan,
        terminalId: terminalRegistered ? terminalId : '',
        apiBase: resolveApiBase(localStorage),
        authorization: resolveApiAuth(localStorage).authorization ?? '',
        resolveProduct: (productId) => catalogItems.find((item) => item.productId === productId),
      });
      onAddLine(line);
      serialStatus = `Serie ${serialScan.trim()} agregada como una unidad.`;
      serialScan = '';
    } catch (error) {
      serialStatus =
        error instanceof SerialCheckoutError
          ? error.message
          : 'No se pudo reservar la serie. Verifica la conexión e inténtalo de nuevo.';
    } finally {
      serialBusy = false;
      serialInput?.focus();
    }
  }
</script>

<section class="ledger-card serial-panel" aria-labelledby="serial-title" data-testid="main-serial-checkout">
  <div class="card-header">
    <div>
      <span class="instrument-eyebrow">Identidad por unidad</span>
      <h2 id="serial-title">Escanear Número de Serie</h2>
    </div>
    <span class="badge badge-indigo">Stock reservado</span>
  </div>

  <div class="terminal-row">
    <label for="main-terminal-id">Terminal Registrado</label>
    <div class="input-with-button">
      <input
        id="main-terminal-id"
        bind:value={terminalId}
        oninput={terminalChanged}
        autocomplete="off"
        placeholder="ID Terminal"
        data-testid="main-serial-terminal"
      />
      <button type="button" class="secondary" onclick={registerTerminal}>Registrar</button>
    </div>
  </div>

  <div class="scanner-row">
    <label for="main-serial-scan">Escanear Serie</label>
    <div class="input-with-button">
      <input
        id="main-serial-scan"
        bind:this={serialInput}
        bind:value={serialScan}
        onkeydown={addScannedSerial}
        disabled={!terminalRegistered || serialBusy}
        autocomplete="off"
        autocapitalize="characters"
        placeholder="Escanea y presiona Enter"
        data-testid="main-serial-scan"
      />
      <button
        type="button"
        class="primary"
        disabled={!terminalRegistered || !serialScan.trim() || serialBusy}
        onclick={() => addScannedSerial()}
      >
        {serialBusy ? 'Reservando…' : 'Agregar Serie'}
      </button>
    </div>
  </div>

  {#if serialStatus}
    <p
      class="status-feedback"
      class:error={serialStatus.includes('SERIAL_') || serialStatus.startsWith('No se pudo')}
      role="status"
      aria-live="polite"
      data-testid="main-serial-status"
    >
      {cashierFacingMessage(serialStatus)}
    </p>
  {/if}
</section>

<style>
  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }
  .card-header h2 {
    font-size: 1.125rem;
    font-weight: 700;
  }
  .instrument-eyebrow {
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--accent-primary);
  }
  .terminal-row,
  .scanner-row {
    margin-bottom: 0.875rem;
  }
  .input-with-button {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    min-width: 0;
  }
  .input-with-button :global(input),
  .input-with-button :global(.ui-input) {
    min-width: 0;
    flex: 1 1 12rem;
  }
  .status-feedback {
    margin-top: 0.5rem;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--accent-primary);
  }
  .status-feedback.error {
    color: var(--rose-red);
  }
  @media (max-width: 899px) {
    .input-with-button {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>
