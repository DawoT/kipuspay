<script lang="ts">
  import { createWebHidScale } from '$lib/scale/webhid';
  import { evaluateScaleHeartbeat } from '$lib/pos-checkout/scale-client';
  import type { ScaleReading } from '$lib/scale/types';
  import { scaleStateLabel } from '$lib/ui/cashier-copy';
  import Icon from '$lib/ui/Icon.svelte';
  import { addOrBumpLine, type CartLine } from '$lib/pos-checkout/cart';

  let { onAddLine }: { onAddLine: (line: CartLine) => void } = $props();

  interface WebHidInputReportEvent extends Event {
    readonly reportId: number;
    readonly data: DataView;
  }
  interface PosHidDevice {
    vendorId: number;
    productId: number;
    productName?: string;
    open(): Promise<void>;
    close(): Promise<void>;
    addEventListener(type: 'inputreport', listener: (event: WebHidInputReportEvent) => void): void;
  }
  interface PosNavigator extends Navigator {
    hid: { requestDevice(options: { filters: readonly unknown[] }): Promise<PosHidDevice[]> };
  }

  type ScaleState =
    | 'CONNECTING'
    | 'STABLE'
    | 'UNSTABLE'
    | 'STALE'
    | 'DISCONNECTED'
    | 'MANUAL_REQUIRED';

  let scaleState = $state<ScaleState>('DISCONNECTED');
  let scaleWeightMicrounits = $state<number | null>(null);
  let scaleError = $state('');
  let scaleReading: ScaleReading | null = $state(null);
  let connectedScale: { scale: ReturnType<typeof createWebHidScale>; close(): Promise<void> } | null =
    $state(null);
  let manualWeightGrams = $state('');
  let weightAuthorizationToken = $state('');
  const manualThresholdMicrounits = 250_000;

  function connectScale() {
    scaleState = 'CONNECTING';
    scaleWeightMicrounits = null;
    if (typeof navigator === 'undefined' || !('hid' in navigator)) {
      scaleState = 'MANUAL_REQUIRED';
      scaleError = 'WebHID no está disponible en este navegador.';
      return;
    }
    void connectHidScale();
  }

  async function connectHidScale() {
    try {
      const nav = navigator as PosNavigator;
      const [device] = await nav.hid.requestDevice({ filters: [] });
      if (!device) {
        scaleState = 'MANUAL_REQUIRED';
        scaleError = 'No se seleccionó ninguna balanza.';
        return;
      }
      await device.open();
      const scale = createWebHidScale({
        profile: {
          deviceId: device.productName || device.vendorId.toString(16),
          vendorId: device.vendorId,
          productId: device.productId,
          reportId: 0,
          maxFrameBytes: 64,
        },
        transport: {
          vendorId: device.vendorId,
          productId: device.productId,
          close: () => device.close(),
        },
      });
      connectedScale = { scale, close: () => device.close() };
      device.addEventListener('inputreport', (event: WebHidInputReportEvent) => {
        try {
          const frame = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength);
          scaleReading = scale.parseReport(event.reportId, frame, Date.now());
          scaleWeightMicrounits = scaleReading.weightMicrounits;
          scaleState = 'STABLE';
          scaleError = '';
        } catch {
          scaleState = 'UNSTABLE';
        }
      });
    } catch {
      scaleState = 'MANUAL_REQUIRED';
      scaleError = 'No se pudo conectar la balanza WebHID.';
    }
  }

  async function disconnectScale() {
    await connectedScale?.close();
    connectedScale = null;
    scaleReading = null;
    scaleWeightMicrounits = null;
    scaleState = 'MANUAL_REQUIRED';
  }

  function captureDeviceWeight() {
    if (!scaleReading) return;
    const heartbeat = evaluateScaleHeartbeat({
      connected: connectedScale !== null,
      reading: scaleReading,
      nowEpochMs: Date.now(),
    });
    if (heartbeat.status !== 'READY' || heartbeat.reading.weightMicrounits <= 0) {
      scaleState = 'MANUAL_REQUIRED';
      scaleError =
        heartbeat.status === 'READY'
          ? 'La lectura del dispositivo no es cobrable.'
          : 'El dispositivo se desconectó o dejó de reportar.';
      return;
    }
    const measurementId = crypto.randomUUID();
    const saleItemId = crypto.randomUUID();
    const { weightMicrounits, protocol, deviceId, sequence, observedAtEpochMs } = heartbeat.reading;
    const nextWeigh: CartLine = {
      productId: 'weigh',
      name: 'Manzana por peso',
      unitPriceCents: 100,
      quantity: 1,
      saleItemId,
      weightMeasurement: {
        measurementId,
        weightMicrounits,
        measurementSource: 'DEVICE',
        scaleProtocol: protocol,
        scaleDeviceId: deviceId,
        heartbeatSequence: sequence,
        observedAt: new Date(observedAtEpochMs).toISOString(),
      },
    };
    onAddLine(nextWeigh);
    scaleWeightMicrounits = null;
    scaleReading = null;
    scaleState = 'UNSTABLE';
  }

  function captureManualWeight() {
    const parsedGrams = parseInt(manualWeightGrams.trim(), 10);
    if (isNaN(parsedGrams) || parsedGrams <= 0) {
      scaleState = 'MANUAL_REQUIRED';
      return;
    }
    const weightMicrounits = parsedGrams * 1_000;
    if (weightMicrounits <= 0) {
      scaleState = 'MANUAL_REQUIRED';
      return;
    }
    if (weightMicrounits > manualThresholdMicrounits && !weightAuthorizationToken.trim()) {
      scaleState = 'MANUAL_REQUIRED';
      return;
    }
    const nextManual: CartLine = {
      productId: 'weigh',
      name: 'Manzana por peso',
      unitPriceCents: 100,
      quantity: 1,
      saleItemId: crypto.randomUUID(),
      weightMeasurement: {
        measurementId: crypto.randomUUID(),
        weightMicrounits,
        measurementSource: 'MANUAL',
        observedAt: new Date().toISOString(),
        ...(weightAuthorizationToken.trim()
          ? { authorizationToken: weightAuthorizationToken.trim() }
          : {}),
      },
    };
    onAddLine(nextManual);
    manualWeightGrams = '';
    weightAuthorizationToken = '';
  }
</script>

<section
  class="ledger-card scale-panel"
  class:manual={scaleState === 'MANUAL_REQUIRED'}
  aria-labelledby="scale-title"
  data-testid="scale-checkout"
>
  <div class="card-header">
    <div>
      <span class="instrument-eyebrow">Instrumento Balanza</span>
      <h2 id="scale-title">Balanza por peso</h2>
    </div>
    <div class="scale-state-badge" data-testid="scale-state">
      <span class="pulse-dot"></span>
      <span>{scaleStateLabel(scaleState)}</span>
    </div>
  </div>

  <div class="weight-display-box">
    <span class="display-label">PESO NETO</span>
    <div class="display-value tabular-nums">
      <strong>{scaleWeightMicrounits ? Math.round(scaleWeightMicrounits / 1_000) : '—'}</strong>
      <span class="unit">g</span>
    </div>
  </div>

  <div class="scale-actions-row">
    <button type="button" class="secondary" onclick={connectScale}>
      <Icon name="wifi" size={16} />
      {scaleState === 'CONNECTING' ? 'Conectando…' : 'Conectar balanza'}
    </button>
    <button type="button" class="primary" onclick={captureDeviceWeight} disabled={scaleState !== 'STABLE'}>
      <Icon name="scale" size={16} />
      Capturar pesada
    </button>
    <button type="button" class="secondary" onclick={disconnectScale}>
      <Icon name="edit" size={16} />
      Peso manual
    </button>
  </div>

  {#if scaleState === 'MANUAL_REQUIRED'}
    <div class="manual-entry-box">
      <p role="alert" class="manual-alert">
        {scaleError || 'La lectura del dispositivo no es cobrable. Ingresa un peso manual válido.'}
      </p>
      <div class="manual-fields">
        <div>
          <label for="manual-weight">Peso manual (gramos)</label>
          <input
            id="manual-weight"
            inputmode="numeric"
            pattern="[0-9]*"
            bind:value={manualWeightGrams}
            placeholder="Ej. 350"
          />
        </div>
        <div>
          <label for="weight-auth">PIN Autorización (>250g)</label>
          <input
            id="weight-auth"
            type="password"
            autocomplete="off"
            bind:value={weightAuthorizationToken}
            placeholder="PIN Supervisor"
          />
        </div>
      </div>
      <button type="button" class="primary" onclick={captureManualWeight}>Confirmar peso manual</button>
    </div>
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
  .scale-state-badge {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--emerald-green);
    text-transform: uppercase;
  }
  .weight-display-box {
    background: var(--bg-primary);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 1rem;
    margin: 0.75rem 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .display-label {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--text-muted);
  }
  .display-value {
    font-family: var(--font-mono);
    font-size: 2.5rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
    color: var(--emerald-green);
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
  }
  .display-value .unit {
    font-size: 1rem;
    color: var(--text-muted);
  }
  .scale-actions-row {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .manual-entry-box {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-subtle);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .manual-alert {
    font-size: 0.8125rem;
    color: var(--rose-red);
    font-weight: 600;
  }
  .manual-fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }
</style>
