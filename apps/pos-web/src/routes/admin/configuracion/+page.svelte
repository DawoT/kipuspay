<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { advanceFormalization, enabledDocumentTypesFor } from '@kipuspay/domain-fiscal-pe';
  import { isInventoryScaleEnabled } from '$lib/features';
  import {
    defaultTenantSession,
    readTenantSession,
    writeTenantSession,
    type FormalizationMode,
    type PosTenantSession,
  } from '$lib/tenant/session';

  let session = $state<PosTenantSession>(defaultTenantSession());
  let focus = $state('');
  let confirmOpen = $state(false);
  let pendingMode = $state<FormalizationMode | null>(null);
  let error = $state('');
  let notice = $state('');
  const scaleOn = isInventoryScaleEnabled();
  let scaleThreshold = $state('250000');
  let scaleProtocol = $state<'WEBHID' | 'WEB_SERIAL' | 'WEBUSB'>('WEBHID');
  let scaleFingerprint = $state('');
  let scaleProfileId = $state('');
  let scaleVendorId = $state('');
  let scaleProductId = $state('');
  let scaleDeviceId = $state('');
  let scaleStatus = $state('');
  let terminalId = $state('');

  onMount(() => {
    session = readTenantSession(sessionStorage);
    focus = $page.url.searchParams.get('focus') ?? '';
    terminalId = localStorage.getItem('kipuspay:pos-terminal-id') ?? '';
  });

  function requestAdvance(to: FormalizationMode) {
    error = '';
    notice = '';
    pendingMode = to;
    confirmOpen = true;
  }

  function cancelAdvance() {
    confirmOpen = false;
    pendingMode = null;
  }

  function confirmAdvance() {
    if (!pendingMode) return;
    try {
      const next = advanceFormalization(session.formalizationMode, pendingMode);
      session = {
        ...session,
        formalizationMode: next,
      };
      writeTenantSession(sessionStorage, session);
      notice = `Etapa actualizada a ${next}. Las NV históricas no se convierten. Docs: ${enabledDocumentTypesFor(next).join(', ')}.`;
      confirmOpen = false;
      pendingMode = null;
    } catch (err) {
      error = err instanceof Error ? err.message : 'No se pudo cambiar la etapa';
      confirmOpen = false;
    }
  }

  function toggleBrandQr() {
    session = { ...session, brandQrEnabled: !session.brandQrEnabled };
    writeTenantSession(sessionStorage, session);
    notice = session.brandQrEnabled
      ? 'Pie de marca KipusPay activado en comprobantes y Vitrina.'
      : 'Pie de marca KipusPay desactivado (opt-out).';
  }

  async function scaleRequest(path: string, method: string, body?: Record<string, unknown>) {
    scaleStatus = 'Procesando…';
    try {
      const response = await fetch(path, {
        method,
        headers: {
          authorization: (import.meta.env.PUBLIC_DEV_AUTH as string | undefined) ?? 'Bearer demo',
          'content-type': 'application/json',
          'x-terminal-id': terminalId,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const result = (await response.json()) as Record<string, unknown>;
      scaleStatus = response.ok ? JSON.stringify(result) : String(result.code ?? 'Operación rechazada');
    } catch {
      scaleStatus = 'No se pudo contactar al servicio de balanzas.';
    }
  }

  function saveScalePolicy() {
    void scaleRequest('/api/inventory/scale/policy', 'PUT', {
      manualWeightThresholdMicrounits: Number(scaleThreshold),
    });
  }

  function registerScale() {
    void scaleRequest('/api/inventory/scale/devices', 'POST', {
      protocol: scaleProtocol,
      deviceFingerprint: scaleFingerprint,
      profile: {
        profileId: scaleProfileId,
        vendorId: Number(scaleVendorId),
        productId: Number(scaleProductId),
        reportId: 1,
        endpoint: 1,
        baudRate: 9600,
      },
    });
  }
</script>

<section class="admin-config" data-testid="admin-config">
  <h1>Admin · Configuración</h1>
  <p class="lede">
    Configuración profunda del negocio (GTM §3.3.1). El cobro nunca se bloquea desde aquí.
  </p>

  <section id="negocio">
    <h2>Datos del negocio</h2>
    <p data-testid="admin-trade-name">{session.tradeName}</p>
    <p data-testid="admin-tenant-id">{session.tenantId}</p>
  </section>

  <section id="facturacion" class:focus={focus === 'facturacion'}>
    <h2>Etapa de formalización</h2>
    <p data-testid="admin-mode">Actual: {session.formalizationMode}</p>
    <p class="hint">
      Avance confirmado, sin convertir notas de venta históricas. Emisión electrónica vía KipusPay
      por defecto.
    </p>
    <div class="actions">
      <button
        type="button"
        data-testid="advance-formalizing"
        disabled={session.formalizationMode !== 'INTERNAL_CONTROL'}
        onclick={() => requestAdvance('FORMALIZING')}
      >
        Activar facturación (FORMALIZING)
      </button>
      <button
        type="button"
        data-testid="advance-issuer"
        disabled={session.formalizationMode !== 'FORMALIZING'}
        onclick={() => requestAdvance('ELECTRONIC_ISSUER')}
      >
        Marcar emisor electrónico
      </button>
    </div>
  </section>

  <section id="marca">
    <h2>Marca en el punto de venta</h2>
    <p class="hint">
      Pie “Emitido con KipusPay” + QR en boletas/NV y Vitrina (GTM §7.2). Default activado; puedes
      optar por no mostrarlo.
    </p>
    <p data-testid="brand-qr-state">
      {session.brandQrEnabled ? 'Activado' : 'Desactivado'}
    </p>
    <button type="button" data-testid="toggle-brand-qr" onclick={toggleBrandQr}>
      {session.brandQrEnabled ? 'Desactivar marca' : 'Activar marca'}
    </button>
  </section>

  <section id="fiscal-status">
    <h2>Estado fiscal</h2>
    <p data-testid="fiscal-status">
      Envíos y RC pendientes: se muestran cuando el worker-fiscal está enlazado al tenant. Hoy: sin
      cola local (soft-launch).
    </p>
  </section>

  <section id="series">
    <h2>Identidad serial</h2>
    <p class="hint">Configura productos en Catálogo y administra leases/disposiciones por serie.</p>
    <a href="/admin/series">Abrir búsqueda y gestión de series</a>
  </section>

  {#if scaleOn}
    <section id="balanza" class="scale-config" aria-labelledby="scale-config-title">
      <p class="instrument-label">Hardware · Balanza</p>
      <h2 id="scale-config-title">Política y dispositivo</h2>
      <div class="scale-grid">
        <label>
          Umbral manual (microunidades)
          <input bind:value={scaleThreshold} inputmode="numeric" pattern="[0-9]*" />
        </label>
        <button type="button" onclick={saveScalePolicy}>Guardar umbral</button>
        <label>
          Protocolo
          <select bind:value={scaleProtocol}>
            <option value="WEBHID">WebHID</option>
            <option value="WEB_SERIAL">Web Serial</option>
            <option value="WEBUSB">WebUSB</option>
          </select>
        </label>
        <label>
          Huella allowlisted
          <input bind:value={scaleFingerprint} autocomplete="off" />
        </label>
        <label>
          Perfil
          <input bind:value={scaleProfileId} autocomplete="off" />
        </label>
        <label>
          Vendor ID
          <input bind:value={scaleVendorId} inputmode="numeric" />
        </label>
        <label>
          Product ID
          <input bind:value={scaleProductId} inputmode="numeric" />
        </label>
        <button
          type="button"
          onclick={registerScale}
          disabled={!terminalId ||
            !scaleFingerprint ||
            !scaleProfileId ||
            !scaleVendorId ||
            !scaleProductId}
        >
          Registrar dispositivo
        </button>
        <label>
          ID de dispositivo
          <input bind:value={scaleDeviceId} autocomplete="off" />
        </label>
        <button
          type="button"
          onclick={() =>
            scaleRequest('/api/inventory/scale/diagnostics', 'POST', {
              deviceId: scaleDeviceId,
            })}
          disabled={!scaleDeviceId}
        >
          Ejecutar diagnóstico
        </button>
        <button
          type="button"
          class="danger"
          onclick={() =>
            scaleRequest('/api/inventory/scale/devices/disable', 'POST', {
              deviceId: scaleDeviceId,
            })}
          disabled={!scaleDeviceId}
        >
          Deshabilitar
        </button>
      </div>
      <p class="hint">Terminal propietario: {terminalId || 'No registrado en este navegador'}</p>
      {#if scaleStatus}
        <p role="status" aria-live="polite" class="diagnostic">{scaleStatus}</p>
      {/if}
    </section>
  {/if}

  {#if error}
    <p class="err" role="alert">{error}</p>
  {/if}
  {#if notice}
    <p class="ok" role="status">{notice}</p>
  {/if}
</section>

{#if confirmOpen && pendingMode}
  <div class="modal" role="dialog" aria-modal="true" data-testid="stage-confirm">
    <p>
      ¿Confirmas avanzar a <strong>{pendingMode}</strong>? Las NV ya emitidas siguen siendo control
      interno; no se reescriben.
    </p>
    <button type="button" class="primary" data-testid="confirm-stage" onclick={confirmAdvance}>
      Confirmar
    </button>
    <button type="button" data-testid="cancel-stage" onclick={cancelAdvance}>Cancelar</button>
  </div>
{/if}

<style>
  .admin-config {
    padding: 1.25rem;
    max-width: 40rem;
  }
  .lede,
  .hint {
    color: #8b9aab;
  }
  .focus {
    outline: 2px solid #d99a3d;
    outline-offset: 6px;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    margin-top: 0.8rem;
  }
  button {
    min-height: 44px;
    padding: 0.7rem 1rem;
  }
  .scale-config {
    margin-top: 1.5rem;
    padding: 1rem;
    border: 1px solid #526172;
    border-top: 4px solid #d99a3d;
    background: #171e27;
  }
  .instrument-label {
    margin: 0;
    color: #d99a3d;
    font: 700 0.72rem/1.2 ui-monospace, monospace;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .scale-config h2 {
    margin-top: 0.25rem;
  }
  .scale-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.65rem;
    align-items: end;
  }
  .scale-grid label {
    display: grid;
    gap: 0.3rem;
    font-weight: 700;
  }
  .scale-grid input,
  .scale-grid select {
    min-height: 44px;
    padding: 0.55rem;
    border: 1px solid #718096;
    background: #0f141b;
    color: inherit;
    font: inherit;
  }
  .scale-grid .danger {
    border: 1px solid #c55b52;
    background: transparent;
    color: #ff9e95;
  }
  .diagnostic {
    padding: 0.65rem;
    background: #0f141b;
    font-family: ui-monospace, monospace;
    overflow-wrap: anywhere;
  }
  .modal {
    position: fixed;
    inset: auto 1rem 1rem;
    background: #141a22;
    border: 1px solid #d99a3d;
    padding: 1rem;
  }
  .primary {
    background: #d99a3d;
    color: #14161c;
    font-weight: 700;
  }
  .err {
    color: #d96a3c;
  }
  .ok {
    color: #3d9a6a;
  }
  @media (max-width: 560px) {
    .scale-grid {
      grid-template-columns: 1fr;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .scale-config * {
      transition: none;
    }
  }
</style>
