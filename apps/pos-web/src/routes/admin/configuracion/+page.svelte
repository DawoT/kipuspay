<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { advanceFormalization, enabledDocumentTypesFor } from '@kipuspay/domain-fiscal-pe';
  import { faqFor, type FaqItem } from '@kipuspay/domain-onboarding';
  import { causeLabel, nextStepFor, type DiagnosticReport } from '@kipuspay/domain-hardware';
  import {
    isHardwareDiagnosticsEnabled,
    isInventoryScaleEnabled,
    isOnboardingTourEnabled,
  } from '$lib/features';
  import { runAllDiagnostics, runPrintTest } from '$lib/hardware/diagnostics';
  import { reportDiagnostics } from '$lib/hardware/diagnostics-client';
  import { probePrinterNetwork, probePrinterUsb, probeScale, probeVitrina } from '$lib/hardware/diagnostics';
  import {
    defaultTenantSession,
    readTenantSession,
    writeTenantSession,
    type FormalizationMode,
    type PosTenantSession,
  } from '$lib/tenant/session';
  import { capabilitiesFromFlags } from '$lib/onboarding/capabilities';
  import { fetchSetupProgress, recordGrowthEvent } from '$lib/onboarding/tour-client';
  import SetupChecklist from '$lib/ui/SetupChecklist.svelte';
  import { createPrinterTransport } from '$lib/print/printer-transport';
  import { CHECKLIST_DISMISSED_KEY } from '@kipuspay/domain-onboarding';
  import Icon from '$lib/ui/Icon.svelte';

  let session = $state<PosTenantSession>(defaultTenantSession());
  let focus = $state('');
  let confirmOpen = $state(false);
  let pendingMode = $state<FormalizationMode | null>(null);
  let error = $state('');
  let notice = $state('');
  const scaleOn = isInventoryScaleEnabled();
  // Sprint 53 — Troubleshooter de hardware (regla 37b, ADR-0033).
  const hardwareOn = isHardwareDiagnosticsEnabled();
  let hwReports = $state<Record<string, DiagnosticReport>>({});
  let hwBusyTarget = $state('');
  let hwPrintReport = $state<DiagnosticReport | null>(null);
  let hwPrintBusy = $state(false);
  let hwLogNotice = $state('');

  async function runHardwareProbe(
    kind: 'printer_usb' | 'printer_network' | 'scale' | 'vitrina',
  ) {
    if (hwBusyTarget) return;
    hwBusyTarget = kind;
    hwLogNotice = '';
    const probes = {
      printer_usb: () => probePrinterUsb(),
      printer_network: () => probePrinterNetwork({}),
      scale: () => probeScale(),
      vitrina: () => probeVitrina(),
    };
    const report = await probes[kind]();
    hwReports[kind] = report;
    const saved = await reportDiagnostics([report]);
    if (!saved.ok) hwLogNotice = 'No pudimos guardar el registro del diagnóstico.';
    hwBusyTarget = '';
  }

  async function runHardwarePrintTest() {
    if (hwPrintBusy) return;
    hwPrintBusy = true;
    hwLogNotice = '';
    const report = await runPrintTest();
    hwPrintReport = report;
    await reportDiagnostics([report]);
    hwPrintBusy = false;
  }
  let scaleThreshold = $state('250000');
  let scaleProtocol = $state<'WEBHID' | 'WEB_SERIAL' | 'WEBUSB'>('WEBHID');
  let scaleFingerprint = $state('');
  let scaleProfileId = $state('');
  let scaleVendorId = $state('');
  let scaleProductId = $state('');
  let scaleDeviceId = $state('');
  let scaleStatus = $state('');
  let terminalId = $state('');

  // Sprint 52 — Setup Checklist "segundo día" (regla 37a, GTM §6.2).
  const onboardingOn = isOnboardingTourEnabled();
  const capabilities = capabilitiesFromFlags({
    kds: false,
    fefo: false,
    scale: scaleOn,
    promotions: false,
    variants: false,
    quickAdd: false,
    shiftHandoff: false,
    teamInvite: false,
    hardwareDiagnostics: hardwareOn,
  });
  let serverState = $state<{ logo: boolean; invoicing: boolean; team: boolean; catalog: boolean } | null>(null);
  let printerReady = $state(false);
  let checklistDismissed = $state(false);
  let faqOpen = $state(false);
  let faqItems = $state<readonly FaqItem[]>([]);
  let priorSnapshot = $state('');

  onMount(() => {
    session = readTenantSession(sessionStorage);
    focus = $page.url.searchParams.get('focus') ?? '';
    terminalId = localStorage.getItem('kipuspay:pos-terminal-id') ?? '';
    if (onboardingOn) {
      void loadChecklist();
      void createPrinterTransport()
        .preflight()
        .then((adapters) => {
          printerReady = adapters.length > 0;
        });
    }
  });

  async function loadChecklist() {
    const res = await fetchSetupProgress();
    if (!res.ok) return;
    serverState = res.server;
    const snapshot = localStorage.getItem('kipuspay:setup-checkpoint') ?? '';
    const doneIds = Object.entries(res.server)
      .filter(([, done]) => done)
      .map(([id]) => id);
    if (snapshot !== JSON.stringify(doneIds)) {
      const known = new Set(snapshot ? (JSON.parse(snapshot) as string[]) : []);
      for (const id of doneIds) {
        if (!known.has(id)) {
          void recordGrowthEvent('setup_checklist_step_completed', { step: id });
        }
      }
      localStorage.setItem('kipuspay:setup-checkpoint', JSON.stringify(doneIds));
    }
    checklistDismissed = localStorage.getItem(CHECKLIST_DISMISSED_KEY) === '1';
    faqItems = faqFor({ capabilities });
  }

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
      notice = `Etapa actualizada a ${next}. Las NV históricas no se convierten. Comprobantes habilitados: ${enabledDocumentTypesFor(next).join(', ')}.`;
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

<svelte:head><title>Configuración · KipusPay</title></svelte:head>

<main class="config-shell" data-testid="admin-config">
  <header class="masthead">
    <div class="badge-tag">
      <Icon name="settings" size={14} />
      <span>Admin · Gobernanza & Parámetros</span>
    </div>
    <h1>Configuración del negocio</h1>
    <p class="lede">
      Configuración profunda del negocio (GTM §3.3.1). El cobro de ventas nunca se bloquea desde aquí.
    </p>
  </header>

  {#if error}
    <div class="alert-box alert-error" role="alert">
      <Icon name="alert" size={18} />
      <span>{error}</span>
    </div>
  {/if}
  {#if notice}
    <div class="alert-box alert-success" role="status">
      <Icon name="check" size={18} />
      <span>{notice}</span>
    </div>
  {/if}

  <div class="config-grid">
    <section id="negocio" class="glass-card">
      <div class="card-head">
        <Icon name="building" size={20} class="icon-accent" />
        <h2>Datos del negocio</h2>
      </div>
      <div class="info-rows">
        <div class="info-row">
          <span class="info-label">Nombre Comercial</span>
          <strong data-testid="admin-trade-name" class="info-value">{session.tradeName}</strong>
        </div>
        <div class="info-row">
          <span class="info-label">ID de Tenant (Multitenancy DAT-12)</span>
          <code data-testid="admin-tenant-id" class="info-code">{session.tenantId}</code>
        </div>
      </div>
    </section>

    <section id="facturacion" class="glass-card" class:focus={focus === 'facturacion'}>
      <div class="card-head">
        <Icon name="file-text" size={20} class="icon-accent" />
        <h2>Etapa de formalización</h2>
      </div>
      <p class="mode-badge" data-testid="admin-mode">
        <Icon name="shield" size={14} />
        <span>Actual: {session.formalizationMode}</span>
      </p>
      <p class="hint">
        Avance confirmado, sin convertir notas de venta históricas. Emisión electrónica vía KipusPay por defecto.
      </p>
      <div class="actions">
        <button
          type="button"
          class="btn-secondary"
          data-testid="advance-formalizing"
          disabled={session.formalizationMode !== 'INTERNAL_CONTROL'}
          onclick={() => requestAdvance('FORMALIZING')}
        >
          <Icon name="arrow-right" size={16} />
          <span>Activar facturación (FORMALIZING)</span>
        </button>
        <button
          type="button"
          class="btn-secondary"
          data-testid="advance-issuer"
          disabled={session.formalizationMode !== 'FORMALIZING'}
          onclick={() => requestAdvance('ELECTRONIC_ISSUER')}
        >
          <Icon name="check" size={16} />
          <span>Marcar emisor electrónico</span>
        </button>
      </div>
    </section>

    <section id="marca" class="glass-card">
      <div class="card-head">
        <Icon name="tag" size={20} class="icon-accent" />
        <h2>Marca en el punto de venta</h2>
      </div>
      <p class="hint">
        Pie “Emitido con KipusPay” + QR en boletas/NV y Vitrina (GTM §7.2). Default activado; puedes optar por no mostrarlo.
      </p>
      <div class="status-toggle-row">
        <p data-testid="brand-qr-state" class="state-pill" class:active={session.brandQrEnabled}>
          <Icon name={session.brandQrEnabled ? 'check' : 'x'} size={14} />
          <span>{session.brandQrEnabled ? 'Activado' : 'Desactivado'}</span>
        </p>
        <button type="button" class="btn-primary-sm" data-testid="toggle-brand-qr" onclick={toggleBrandQr}>
          {session.brandQrEnabled ? 'Desactivar marca' : 'Activar marca'}
        </button>
      </div>
    </section>

    <section id="fiscal-status" class="glass-card">
      <div class="card-head">
        <Icon name="shield" size={20} class="icon-accent" />
        <h2>Estado fiscal y SUNAT</h2>
      </div>
      <p data-testid="fiscal-status" class="hint">
        Envíos y RC pendientes: se muestran cuando el worker-fiscal está enlazado al tenant. Hoy: sin cola local (soft-launch).
      </p>
    </section>

    <section id="respaldos" class="glass-card">
      <div class="card-head">
        <Icon name="download" size={20} class="icon-accent" />
        <h2>Respaldo y recuperación</h2>
      </div>
      <p class="hint">
        Exportaciones cifradas del servidor, cobertura verificable y simulación de recuperación.
      </p>
      <a href="/admin/backups" class="link-btn">
        <span>Abrir centro de respaldos</span>
        <Icon name="arrow-right" size={16} />
      </a>
    </section>

    <section id="series" class="glass-card">
      <div class="card-head">
        <Icon name="barcode" size={20} class="icon-accent" />
        <h2>Identidad serial</h2>
      </div>
      <p class="hint">Configura productos en Catálogo y administra leases/disposiciones por serie.</p>
      <a href="/admin/series" class="link-btn">
        <span>Abrir búsqueda y gestión de series</span>
        <Icon name="arrow-right" size={16} />
      </a>
    </section>
  </div>

  {#if scaleOn}
    <section id="balanza" class="glass-card scale-card" aria-labelledby="scale-config-title">      <div class="card-head">
        <Icon name="scale" size={22} class="icon-amber" />
        <div>
          <p class="instrument-label">Hardware · Balanza</p>
          <h2 id="scale-config-title">Política y dispositivo</h2>
        </div>
      </div>
      <div class="scale-grid">
        <div class="field">
          <label for="scale-threshold">Umbral manual (microunidades)</label>
          <input id="scale-threshold" bind:value={scaleThreshold} inputmode="numeric" pattern="[0-9]*" />
        </div>
        <button type="button" class="btn-secondary" onclick={saveScalePolicy}>
          <Icon name="check" size={16} />
          <span>Guardar umbral</span>
        </button>

        <div class="field">
          <label for="scale-protocol">Protocolo de balanza</label>
          <select id="scale-protocol" bind:value={scaleProtocol}>
            <option value="WEBHID">WebHID (Recomendado)</option>
            <option value="WEB_SERIAL">Web Serial</option>
            <option value="WEBUSB">WebUSB</option>
          </select>
        </div>

        <div class="field">
          <label for="scale-fp">Huella allowlisted</label>
          <input id="scale-fp" bind:value={scaleFingerprint} autocomplete="off" placeholder="Fingerprint SHA256" />
        </div>

        <div class="field">
          <label for="scale-profile">Perfil de balanza</label>
          <input id="scale-profile" bind:value={scaleProfileId} autocomplete="off" placeholder="id-perfil" />
        </div>

        <div class="field">
          <label for="scale-vendor">Vendor ID (HEX/DEC)</label>
          <input id="scale-vendor" bind:value={scaleVendorId} inputmode="numeric" placeholder="1155" />
        </div>

        <div class="field">
          <label for="scale-product">Product ID (HEX/DEC)</label>
          <input id="scale-product" bind:value={scaleProductId} inputmode="numeric" placeholder="22352" />
        </div>

        <button
          type="button"
          class="btn-primary-sm"
          onclick={registerScale}
          disabled={!terminalId || !scaleFingerprint || !scaleProfileId || !scaleVendorId || !scaleProductId}
        >
          <Icon name="plus" size={16} />
          <span>Registrar dispositivo</span>
        </button>

        <div class="field">
          <label for="scale-device-id">ID de dispositivo registrado</label>
          <input id="scale-device-id" bind:value={scaleDeviceId} autocomplete="off" placeholder="dev_xxx" />
        </div>

        <div class="device-actions">
          <button
            type="button"
            class="btn-secondary"
            onclick={() =>
              scaleRequest('/api/inventory/scale/diagnostics', 'POST', {
                deviceId: scaleDeviceId,
              })}
            disabled={!scaleDeviceId}
          >
            <Icon name="refresh" size={16} />
            <span>Ejecutar diagnóstico</span>
          </button>
          <button
            type="button"
            class="btn-danger"
            onclick={() =>
              scaleRequest('/api/inventory/scale/devices/disable', 'POST', {
                deviceId: scaleDeviceId,
              })}
            disabled={!scaleDeviceId}
          >
            <Icon name="trash" size={16} />
            <span>Deshabilitar</span>
          </button>
        </div>
      </div>
      <p class="terminal-hint">
        <Icon name="shield" size={14} />
        <span>Terminal propietario: {terminalId || 'No registrado en este navegador'}</span>
      </p>
      {#if scaleStatus}
        <div role="status" aria-live="polite" class="diagnostic">
          <code>{scaleStatus}</code>
        </div>
      {/if}
    </section>
  {/if}

  {#if hardwareOn}
    <section id="hardware" class="glass-card" aria-labelledby="hardware-config-title">
      <div class="card-head">
        <Icon name="refresh" size={22} class="icon-amber" />
        <div>
          <p class="instrument-label">Hardware · Diagnóstico</p>
          <h2 id="hardware-config-title">Impresora, balanza y vitrina</h2>
        </div>
      </div>
      <p class="terminal-hint">
        <Icon name="shield" size={14} />
        <span>Prueba cada equipo y sigue el paso sugerido si algo falla.</span>
      </p>
      <div class="device-actions">
        <button
          type="button"
          class="btn-secondary"
          onclick={() => runHardwareProbe('printer_usb')}
          disabled={hwBusyTarget !== ''}
          data-testid="hw-probe-usb"
        >
          <Icon name="refresh" size={16} />
          <span>{hwBusyTarget === 'printer_usb' ? 'Probando…' : 'Probar impresora USB'}</span>
        </button>
        <button
          type="button"
          class="btn-secondary"
          onclick={() => runHardwareProbe('printer_network')}
          disabled={hwBusyTarget !== ''}
          data-testid="hw-probe-network"
        >
          <Icon name="refresh" size={16} />
          <span>
            {hwBusyTarget === 'printer_network' ? 'Buscando…' : 'Buscar impresoras en mi red'}
          </span>
        </button>
        <button
          type="button"
          class="btn-secondary"
          onclick={() => runHardwareProbe('scale')}
          disabled={hwBusyTarget !== ''}
          data-testid="hw-probe-scale"
        >
          <Icon name="refresh" size={16} />
          <span>{hwBusyTarget === 'scale' ? 'Probando…' : 'Probar balanza'}</span>
        </button>
        <button
          type="button"
          class="btn-secondary"
          onclick={() => runHardwareProbe('vitrina')}
          disabled={hwBusyTarget !== ''}
          data-testid="hw-probe-vitrina"
        >
          <Icon name="refresh" size={16} />
          <span>{hwBusyTarget === 'vitrina' ? 'Probando…' : 'Probar vitrina'}</span>
        </button>
      </div>

      <div class="device-actions">
        <button
          type="button"
          class="btn-primary-sm"
          onclick={runHardwarePrintTest}
          disabled={hwPrintBusy}
          data-testid="hw-print-test"
        >
          <Icon name="barcode" size={16} />
          <span>{hwPrintBusy ? 'Imprimiendo…' : 'Imprimir prueba'}</span>
        </button>
      </div>

      {#each ['printer_usb', 'printer_network', 'scale', 'vitrina'] as kind}
        {@const report = hwReports[kind]}
        {#if report}
          <div
            class="diagnostic"
            class:diag-ok={report.ok}
            class:diag-bad={!report.ok}
            role="status"
            aria-live="polite"
            data-testid="hw-report-{kind}"
          >
            <p class="diag-status">
              {report.ok ? '✓ Todo funciona correctamente.' : '✗ ' + causeLabel(report.causeCode)}
            </p>
            {#if report.nextStepId}
              <p class="diag-next">Siguiente paso: {report.nextStepId}</p>
            {/if}
            {#if report.paperWidthMm}
              <p class="diag-next">Ancho de papel detectado: {report.paperWidthMm} mm.</p>
            {/if}
          </div>
        {/if}
      {/each}

      {#if hwPrintReport}
        <div
          class="diagnostic"
          class:diag-ok={hwPrintReport.ok}
          class:diag-bad={!hwPrintReport.ok}
          role="status"
          aria-live="polite"
          data-testid="hw-report-print"
        >
          <p class="diag-status">
            {#if hwPrintReport.ok}
              ✓ Impresión de prueba completada en {hwPrintReport.durationMs} ms.
            {:else}
              ✗ {causeLabel(hwPrintReport.causeCode)}
            {/if}
          </p>
          {#if hwPrintReport.nextStepId}
            <p class="diag-next">Siguiente paso: {hwPrintReport.nextStepId}</p>
          {/if}
        </div>
      {/if}

      {#if hwLogNotice}
        <div class="alert-box alert-error" role="alert">
          <span>{hwLogNotice}</span>
        </div>
      {/if}
    </section>
  {/if}
</main>

{#if confirmOpen && pendingMode}
  <div class="modal-backdrop">
    <div class="modal glass-card" role="dialog" aria-modal="true" data-testid="stage-confirm">
      <div class="modal-head">
        <Icon name="alert" size={24} class="icon-amber" />
        <h3>Confirmar avance de formalización</h3>
      </div>
      <p>
        ¿Confirmas avanzar a <strong>{pendingMode}</strong>? Las notas de venta ya emitidas siguen siendo de control interno y no se reescriben.
      </p>
      <div class="modal-actions">
        <button type="button" class="btn-primary-sm" data-testid="confirm-stage" onclick={confirmAdvance}>
          Confirmar
        </button>
        <button type="button" class="btn-secondary" data-testid="cancel-stage" onclick={cancelAdvance}>
          Cancelar
        </button>
      </div>
    </div>
  </div>
{/if}

{#if onboardingOn && serverState && !checklistDismissed}
  <section class="glass-card checklist-wrap" aria-labelledby="setup-checklist">
    <SetupChecklist server={serverState} {printerReady} />
    <div class="checklist-aux">
      <button
        type="button"
        class="btn-secondary btn-sm"
        data-testid="setup-hide"
        onclick={() => {
          checklistDismissed = true;
          localStorage.setItem(CHECKLIST_DISMISSED_KEY, '1');
        }}
      >
        Ocultar esta lista
      </button>
      <button
        type="button"
        class="btn-secondary btn-sm"
        data-testid="faq-toggle"
        onclick={() => (faqOpen = !faqOpen)}
      >
        Preguntas frecuentes
      </button>
    </div>
    {#if faqOpen}
      <details class="faq-box" data-testid="faq-panel" open>
        {#each faqItems as item}
          <div class="faq-item">
            <p class="faq-q"><strong>{item.question}</strong></p>
            <p class="faq-a">{item.answer}</p>
          </div>
        {/each}
        {#if faqItems.length === 0}
          <p class="faq-empty">Aún no hay preguntas para tus funciones activas.</p>
        {/if}
      </details>
    {/if}
  </section>
{/if}

<style>
  .config-shell {
    max-width: 1280px;
    margin: 0 auto;
    padding: 1.5rem 1rem 5rem;
  }

  .masthead {
    margin-bottom: 1.75rem;
  }

  .badge-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.25rem 0.65rem;
    background: rgba(217, 154, 61, 0.12);
    border: 1px solid rgba(217, 154, 61, 0.3);
    border-radius: var(--radius-full, 9999px);
    color: var(--accent-primary);
    font: 600 0.72rem/1.2 var(--font-mono, monospace);
    letter-spacing: 0.05em;
    text-transform: uppercase;
    margin-bottom: 0.5rem;
  }

  h1 {
    margin: 0.2rem 0;
    font-size: clamp(1.75rem, 4vw, 2.5rem);
    font-family: var(--font-heading, sans-serif);
    font-weight: 800;
    color: var(--text-main, #f8fafc);
  }

  .lede {
    color: var(--text-muted, #94a3b8);
    font-size: 0.92rem;
    margin: 0;
  }

  .alert-box {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0.85rem 1.1rem;
    border-radius: var(--radius-md, 12px);
    font-size: 0.88rem;
    font-weight: 600;
    margin-bottom: 1.25rem;
  }

  .alert-error {
    background: rgba(244, 63, 94, 0.1);
    border: 1px solid var(--rose-red, #f43f5e);
    color: var(--rose-red, #f43f5e);
  }

  .alert-success {
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid var(--emerald-green, #10b981);
    color: var(--emerald-green, #10b981);
  }

  .glass-card {
    background: var(--bg-glass-card);
    border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
    border-radius: var(--radius-md, 12px);
    padding: 1.35rem;
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
  }

  .config-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
    gap: 1.25rem;
  }

  .card-head {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    margin-bottom: 0.85rem;
  }

  .card-head h2 {
    margin: 0;
    font-size: 1.1rem;
    font-family: var(--font-heading, sans-serif);
    font-weight: 700;
    color: var(--text-main, #f8fafc);
  }

  :global(.icon-accent) {
    color: var(--accent-primary);
  }

  :global(.icon-amber) {
    color: var(--amber-gold, #f59e0b);
  }

  .info-rows {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .info-row {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .info-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted, #94a3b8);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .info-value {
    font-size: 1rem;
    color: var(--text-main, #f8fafc);
  }

  .info-code {
    font-family: var(--font-mono, monospace);
    font-size: 0.88rem;
    color: var(--accent-primary);
    background: rgba(217, 154, 61, 0.1);
    padding: 0.25rem 0.5rem;
    border-radius: var(--radius-sm, 8px);
    word-break: break-all;
  }

  .mode-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem 0.65rem;
    background: rgba(245, 158, 11, 0.12);
    border: 1px solid rgba(245, 158, 11, 0.3);
    border-radius: var(--radius-sm, 8px);
    color: var(--amber-gold, #f59e0b);
    font: 700 0.82rem/1 var(--font-mono, monospace);
    margin-bottom: 0.65rem;
  }

  .hint {
    font-size: 0.86rem;
    color: var(--text-muted, #94a3b8);
    line-height: 1.45;
    margin-bottom: 0.85rem;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .status-toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .state-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.6rem;
    border-radius: var(--radius-full, 9999px);
    font-size: 0.78rem;
    font-weight: 700;
    margin: 0;
    background: rgba(244, 63, 94, 0.12);
    color: var(--rose-red, #f43f5e);
    border: 1px solid rgba(244, 63, 94, 0.3);
  }

  .state-pill.active {
    background: rgba(16, 185, 129, 0.12);
    color: var(--emerald-green, #10b981);
    border-color: rgba(16, 185, 129, 0.3);
  }

  .btn-primary-sm,
  .btn-secondary,
  .btn-danger,
  .link-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    padding: 0.6rem 1rem;
    border-radius: var(--radius-sm, 8px);
    font: 600 0.86rem/1.2 var(--font-sans, sans-serif);
    cursor: pointer;
    text-decoration: none;
    transition: all 0.15s ease;
  }

  .btn-primary-sm {
    background: var(--accent-gradient, var(--accent-primary));
    color: #ffffff;
    border: none;
  }

  .btn-primary-sm:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .btn-secondary {
    background: var(--bg-button-sec, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
    color: var(--text-main, #f8fafc);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--bg-glass-hover);
    border-color: var(--border-strong);
  }

  .btn-danger {
    background: rgba(244, 63, 94, 0.12);
    border: 1px solid var(--rose-red, #f43f5e);
    color: var(--rose-red, #f43f5e);
  }

  .btn-danger:hover:not(:disabled) {
    background: rgba(244, 63, 94, 0.2);
  }

  .link-btn {
    background: rgba(217, 154, 61, 0.1);
    border: 1px solid rgba(217, 154, 61, 0.2);
    color: var(--accent-primary);
  }

  .link-btn:hover {
    background: rgba(217, 154, 61, 0.15);
  }

  button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .scale-card {
    margin-top: 1.5rem;
  }

  .instrument-label {
    font: 700 0.72rem/1.2 var(--font-mono, monospace);
    color: var(--amber-gold, #f59e0b);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin: 0;
  }

  .scale-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 1rem;
    align-items: end;
    margin-bottom: 1rem;
  }

  .field label {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--text-muted, #94a3b8);
    margin-bottom: 0.3rem;
  }

  .device-actions {
    display: flex;
    gap: 0.5rem;
  }

  .terminal-hint {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.8rem;
    color: var(--text-muted, #94a3b8);
    margin: 0;
  }

  .diagnostic {
    margin-top: 0.75rem;
    padding: 0.75rem;
    background: var(--bg-glass);
    border-radius: var(--radius-sm, 8px);
    font-family: var(--font-mono, monospace);
    font-size: 0.82rem;
    color: var(--emerald-green, #10b981);
    overflow-x: auto;
  }

  .diagnostic.diag-bad {
    color: #f87171;
  }

  .diag-status {
    margin: 0;
    font-weight: 600;
  }

  .diag-next {
    margin: 0.35rem 0 0;
    opacity: 0.85;
  }

  /* Modal Backdrop */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    z-index: 200;
  }

  .modal {
    max-width: 440px;
    width: 100%;
  }

  .modal-head {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    margin-bottom: 0.85rem;
  }

  .modal-head h3 {
    margin: 0;
    font-size: 1.15rem;
    color: var(--text-main, #f8fafc);
  }

  .modal-actions {
    display: flex;
    gap: 0.65rem;
    justify-content: flex-end;
    margin-top: 1.25rem;
  }

  @media (max-width: 600px) {
    .config-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
