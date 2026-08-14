<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { advanceFormalization, enabledDocumentTypesFor } from '@kipuspay/domain-fiscal-pe';
  import { faqFor, type FaqItem } from '@kipuspay/domain-onboarding';
  import { causeLabel, nextStepFor, type DiagnosticReport } from '@kipuspay/domain-hardware';
  import {
    isCashDrawerEnabled,
    isHardwareDiagnosticsEnabled,
    isInventoryScaleEnabled,
    isOnboardingTourEnabled,
    isSaleTipEnabled,
  } from '$lib/features';
  import { probeDrawer, runAllDiagnostics, runPrintTest } from '$lib/hardware/diagnostics';
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
  import RcPendingBanner from '$lib/fiscal/RcPendingBanner.svelte';
  import { createPrinterTransport } from '$lib/print/printer-transport';
  import { CHECKLIST_DISMISSED_KEY } from '@kipuspay/domain-onboarding';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Badge from '$lib/ui/Badge.svelte';
  import Modal from '$lib/ui/Modal.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
import { resolveApiAuth, resolveApiBase, absolutizeApiUrl, apiFetch } from '$lib/auth/api-client';

  let session = $state<PosTenantSession>(defaultTenantSession());
  // S11-B5: cambio de plan self-serve (PATCH /api/tenant/plan).
  let selectedPlan = $state('arranque');
  let planChanged = $state(false);
  let planSaving = $state(false);
  let planMessage = $state('');
  // S11-E11: cancelación self-serve (POST /api/tenant/cancel).
  let cancelConfirmOpen = $state(false);
  let cancelMessage = $state('');

  function confirmCancelAccount() {
    cancelMessage = '';
    void apiFetch('/api/tenant/cancel', {
      method: 'POST',
      storage: localStorage,
      headers: {
        authorization: resolveApiAuth(localStorage).authorization ?? '',
        ...(resolveApiAuth(localStorage)['x-tenant-id']
          ? { 'x-tenant-id': resolveApiAuth(localStorage)['x-tenant-id']! }
          : {}),
      },
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { canceled?: boolean; message?: string; code?: string } | null;
        if (res.ok && body?.canceled) {
          cancelMessage = body.message ?? 'Cuenta cancelada.';
        } else {
          cancelMessage = `No se pudo cancelar (${body?.code ?? res.status}). Contacta a soporte@kipuspay.com.`;
        }
      })
      .catch(() => {
        cancelMessage = 'Sin conexión con el servidor. Inténtalo de nuevo.';
      });
  }
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

  // P2 — cajón de efectivo: prueba y política.
  const drawerOn = isCashDrawerEnabled();
  const tipPolicyOn = isSaleTipEnabled();
  let hwDrawerBusy = $state(false);
  let drawerReport = $state<DiagnosticReport | null>(null);
  let tipMaxPercent = $state(25);
  let openDrawerOnCash = $state(true);
  let policyMsg = $state('');
  let policyOk = $state(false);

  async function runDrawerProbe() {
    if (hwDrawerBusy) return;
    hwDrawerBusy = true;
    hwLogNotice = '';
    const report = await probeDrawer();
    drawerReport = report;
    await reportDiagnostics([report]);
    hwDrawerBusy = false;
  }

  async function loadCashPolicy() {
    try {
      const res = await apiFetch('/api/cash/policy', { storage: localStorage });
      if (!res.ok) return;
      const data = (await res.json()) as { tipMaxPercent?: number; openDrawerOnCash?: boolean };
      if (typeof data.tipMaxPercent === 'number') tipMaxPercent = data.tipMaxPercent;
      if (typeof data.openDrawerOnCash === 'boolean') openDrawerOnCash = data.openDrawerOnCash;
    } catch {
      // política opcional: la caja no depende de ella.
    }
  }

  async function saveCashPolicy() {
    policyMsg = '';
    policyOk = false;
    try {
      const res = await apiFetch('/api/cash/policy', {
        method: 'PATCH',
        storage: localStorage,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tipMaxPercent, openDrawerOnCash }),
      });
      const data = (await res.json()) as { error?: string; code?: string };
      if (!res.ok) {
        policyMsg = data.error ?? data.code ?? 'No se pudo guardar la política.';
        return;
      }
      policyOk = true;
      policyMsg = 'Política de propina y cajón guardada.';
    } catch {
      policyMsg = 'Sin conexión con el servidor.';
    }
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
    if (drawerOn || tipPolicyOn) {
      void loadCashPolicy();
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

  function savePlan() {
    if (!planChanged || planSaving) return;
    planSaving = true;
    planMessage = '';
    void apiFetch('/api/tenant/plan', {
      method: 'PATCH',
      storage: localStorage,
      headers: {
        authorization: resolveApiAuth(localStorage).authorization ?? '',
        'content-type': 'application/json',
        ...(resolveApiAuth(localStorage)['x-tenant-id']
          ? { 'x-tenant-id': resolveApiAuth(localStorage)['x-tenant-id']! }
          : {}),
      },
      body: JSON.stringify({ planId: selectedPlan }),
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { planId?: string; code?: string } | null;
        if (res.ok && body?.planId) {
          planMessage = `Plan actualizado a ${body.planId}. La caja sigue operando igual.`;
          planChanged = false;
        } else {
          planMessage = `No se pudo cambiar el plan (${body?.code ?? res.status}). ${
            body?.code === 'ENTERPRISE_SALES_ASSISTED'
              ? 'Enterprise se contrata con el equipo comercial.'
              : 'Contacta a soporte@kipuspay.com.'
          }`;
        }
      })
      .catch(() => {
        planMessage = 'Sin conexión con el servidor. Inténtalo de nuevo.';
      })
      .finally(() => {
        planSaving = false;
      });
  }

  async function openBillingPortal() {
    planMessage = '';
    try {
      const res = await apiFetch('/api/tenant/billing-portal', {
        method: 'POST',
        storage: localStorage,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          returnUrl: 'https://app.kipuspay.com/admin/configuracion',
        }),
      });
      const body = (await res.json()) as { url?: string; code?: string };
      if (res.ok && body.url) {
        window.location.assign(body.url);
        return;
      }
      planMessage = `Portal de facturación no disponible (${body.code ?? res.status}).`;
    } catch {
      planMessage = 'Sin conexión con el servidor. Inténtalo de nuevo.';
    }
  }

  async function startCheckout() {
    planMessage = '';
    try {
      const res = await apiFetch('/api/tenant/checkout-session', {
        method: 'POST',
        storage: localStorage,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          planId: selectedPlan,
          successUrl: 'https://app.kipuspay.com/admin/configuracion?checkout=success',
          cancelUrl: 'https://app.kipuspay.com/admin/configuracion?checkout=cancel',
        }),
      });
      const body = (await res.json()) as { url?: string; code?: string };
      if (res.ok && body.url) {
        window.location.assign(body.url);
        return;
      }
      planMessage =
        body.code === 'ENTERPRISE_SALES_ASSISTED'
          ? 'Enterprise se contrata con el equipo comercial.'
          : `Pago del plan no disponible (${body.code ?? res.status}).`;
    } catch {
      planMessage = 'Sin conexión con el servidor. Inténtalo de nuevo.';
    }
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
      // S11-H2: persiste el upgrade en el servidor (PATCH /api/tenant/formalization).
      void apiFetch('/api/tenant/formalization', {
        method: 'PATCH',
        storage: localStorage,
        headers: {
          authorization: resolveApiAuth(localStorage).authorization ?? '',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: session.formalizationMode,
          to: next,
          confirmed: true,
        }),
      })
        .then(async (res) => {
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as { code?: string } | null;
            console.warn(
              JSON.stringify({
                event: 'formalization_persist_failed',
                status: res.status,
                code: body?.code ?? 'UNKNOWN',
              }),
            );
          }
        })
        .catch(() => {
          console.warn(
            JSON.stringify({ event: 'formalization_persist_network_error' }),
          );
        });
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
      const response = await fetch(absolutizeApiUrl(path, localStorage), {
        method,
        headers: {
          authorization: resolveApiAuth(localStorage).authorization ?? '',
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

  async function downloadExport(path: string, filename: string) {
    try {
      const res = await apiFetch(path, { storage: localStorage });
      if (!res.ok) return;
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(href);
    } catch {
      // el usuario puede reintentar; la caja no se bloquea.
    }
  }
</script>

<svelte:head><title>Configuración · KipusPay</title></svelte:head>

<main class="config-shell" data-testid="admin-config">
  <header class="masthead">
    <Badge variant="indigo">
      <Icon name="settings" size={14} />
      <span>Admin · Gobernanza & Parámetros</span>
    </Badge>
    <h1>Configuración del negocio</h1>
    <p class="lede">
      Configuración del negocio. El cobro de ventas nunca se bloquea desde aquí.
    </p>
  </header>

  {#if error}
    <StatusMessage tone="danger" role="alert">
      <Icon name="alert" size={18} />
      <span>{error}</span>
    </StatusMessage>
  {/if}
  {#if notice}
    <StatusMessage tone="info" role="status">
      <Icon name="check" size={18} />
      <span>{notice}</span>
    </StatusMessage>
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
          <span class="info-label">Identificador del negocio</span>
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
        <Button
          variant="secondary"
          data-testid="advance-formalizing"
          disabled={session.formalizationMode !== 'INTERNAL_CONTROL'}
          onclick={() => requestAdvance('FORMALIZING')}
          icon="arrow-right"
        >
          Activar facturación (FORMALIZING)
        </Button>
        <Button
          variant="secondary"
          data-testid="advance-issuer"
          disabled={session.formalizationMode !== 'FORMALIZING'}
          onclick={() => requestAdvance('ELECTRONIC_ISSUER')}
          icon="check"
        >
          Marcar emisor electrónico
        </Button>
      </div>
    </section>

    <section id="suscripcion" class="glass-card">
      <div class="card-head">
        <Icon name="credit-card" size={20} class="icon-accent" />
        <h2>Suscripción y plan</h2>
      </div>
      <p class="hint">
        Cambia de plan cuando tu negocio pida más. La caja nunca se detiene por cupo ni por
        atraso de pago.
      </p>
      <div class="plan-row">
        <select
          data-testid="plan-select"
          bind:value={selectedPlan}
          onchange={() => {
            planChanged = true;
            planMessage = '';
          }}
          aria-label="Plan de suscripción"
        >
          <option value="arranque">Arranque — S/ 49/mes</option>
          <option value="crece">Crece — S/ 129/mes</option>
          <option value="cadena">Cadena — S/ 349/mes + S/ 39 por sucursal</option>
        </select>
        <Button
          variant="primary"
          data-testid="save-plan"
          disabled={!planChanged || planSaving}
          onclick={savePlan}
        >
          Guardar plan
        </Button>
        <Button variant="secondary" data-testid="billing-portal" onclick={() => void openBillingPortal()}>
          Gestionar facturación
        </Button>
        <Button variant="secondary" data-testid="billing-checkout" onclick={() => void startCheckout()}>
          Pagar plan
        </Button>
      </div>
      {#if planMessage}
        <p class="hint" data-testid="plan-message">{planMessage}</p>
      {/if}
      <div class="cancel-row">
        <Button
          variant="secondary"
          data-testid="cancel-account"
          onclick={() => {
            cancelConfirmOpen = true;
          }}
          icon="trash"
        >
          Cancelar cuenta
        </Button>
        <span class="hint">
          Sin penalidad. Exporta tu catálogo en CSV
          (<button type="button" class="linkish" data-testid="export-catalog" onclick={() => void downloadExport('/api/catalog/export', 'catalogo.csv')}>descargar</button>)
          y tus ventas
          (<button type="button" class="linkish" data-testid="export-sales" onclick={() => void downloadExport('/api/sales/export', 'ventas.csv')}>descargar ventas</button>)
          antes de cancelar.
        </span>
      </div>
    </section>

    {#if cancelConfirmOpen}
      <div class="cancel-overlay" role="alertdialog" aria-label="Confirmar cancelación">
        <div class="glass-card">
          <h3>¿Cancelar tu cuenta?</h3>
          <p class="hint">
            La caja sigue operando hasta que lo decidas. No se borran tus datos: podrás exportar
            catálogo y ventas. Esta acción marca la suscripción como cancelada.
          </p>
          <div class="actions">
            <Button variant="secondary" data-testid="cancel-dismiss" onclick={() => (cancelConfirmOpen = false)}>
              Volver
            </Button>
            <Button variant="danger" data-testid="cancel-confirm" onclick={confirmCancelAccount}>
              Sí, cancelar cuenta
            </Button>
          </div>
          {#if cancelMessage}
            <p class="hint" data-testid="cancel-message">{cancelMessage}</p>
          {/if}
        </div>
      </div>
    {/if}

    <section id="marca" class="glass-card">
      <div class="card-head">
        <Icon name="tag" size={20} class="icon-accent" />
        <h2>Marca en el punto de venta</h2>
      </div>
      <p class="hint">
        Pie “Emitido con KipusPay” + QR en boletas, notas de venta y vitrina. Activado por defecto; puedes desactivarlo.
      </p>
      <div class="status-toggle-row">
        <p data-testid="brand-qr-state" class="state-pill" class:active={session.brandQrEnabled}>
          <Icon name={session.brandQrEnabled ? 'check' : 'x'} size={14} />
          <span>{session.brandQrEnabled ? 'Activado' : 'Desactivado'}</span>
        </p>
        <Button
          variant="primary"
          size="sm"
          data-testid="toggle-brand-qr"
          onclick={toggleBrandQr}
        >
          {session.brandQrEnabled ? 'Desactivar marca' : 'Activar marca'}
        </Button>
      </div>
    </section>

    <section id="fiscal-status" class="glass-card">
      <div class="card-head">
        <Icon name="shield" size={20} class="icon-accent" />
        <h2>Estado fiscal y SUNAT</h2>
      </div>
      <!-- S11-H1: estado real de boletas del día sin RC (banner Dueño) -->
      <RcPendingBanner />
      <p data-testid="fiscal-status" class="hint">
        El Resumen Diario (RC) se genera cada día a las 08:00 Lima para las boletas
        del día anterior. El cierre de caja (Z) no reemplaza el RC.
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
      <Button variant="secondary" href="/admin/backups">
        Abrir centro de respaldos
        <Icon name="arrow-right" size={16} />
      </Button>
    </section>

    <section id="series" class="glass-card">
      <div class="card-head">
        <Icon name="barcode" size={20} class="icon-accent" />
        <h2>Identidad serial</h2>
      </div>
      <p class="hint">Configura productos en Catálogo y administra leases/disposiciones por serie.</p>
      <Button variant="secondary" href="/admin/series">
        Abrir búsqueda y gestión de series
        <Icon name="arrow-right" size={16} />
      </Button>
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
          <label for="scale-threshold">Umbral de peso manual</label>
          <input id="scale-threshold" bind:value={scaleThreshold} inputmode="numeric" pattern="[0-9]*" />
        </div>
        <Button variant="secondary" onclick={saveScalePolicy} icon="check">
          Guardar umbral
        </Button>

        <div class="field">
          <label for="scale-protocol">Protocolo de balanza</label>
          <select id="scale-protocol" bind:value={scaleProtocol}>
            <option value="WEBHID">Conexión directa (Recomendada)</option>
            <option value="WEB_SERIAL">Conexión por puerto</option>
            <option value="WEBUSB">Conexión USB</option>
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

        <Button
          variant="primary"
          size="sm"
          onclick={registerScale}
          disabled={!terminalId || !scaleFingerprint || !scaleProfileId || !scaleVendorId || !scaleProductId}
          icon="plus"
        >
          Registrar dispositivo
        </Button>

        <div class="field">
          <label for="scale-device-id">ID de dispositivo registrado</label>
          <input id="scale-device-id" bind:value={scaleDeviceId} autocomplete="off" placeholder="dev_xxx" />
        </div>

        <div class="device-actions">
          <Button
            variant="secondary"
            onclick={() =>
              scaleRequest('/api/inventory/scale/diagnostics', 'POST', {
                deviceId: scaleDeviceId,
              })}
            disabled={!scaleDeviceId}
            icon="refresh"
          >
            Ejecutar diagnóstico
          </Button>
          <Button
            variant="danger"
            onclick={() =>
              scaleRequest('/api/inventory/scale/devices/disable', 'POST', {
                deviceId: scaleDeviceId,
              })}
            disabled={!scaleDeviceId}
            icon="trash"
          >
            Deshabilitar
          </Button>
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
        <Button
          variant="secondary"
          onclick={() => runHardwareProbe('printer_usb')}
          disabled={hwBusyTarget !== ''}
          data-testid="hw-probe-usb"
          busy={hwBusyTarget === 'printer_usb'}
        >
          {hwBusyTarget === 'printer_usb' ? 'Probando…' : 'Probar impresora USB'}
        </Button>
        <Button
          variant="secondary"
          onclick={() => runHardwareProbe('printer_network')}
          disabled={hwBusyTarget !== ''}
          data-testid="hw-probe-network"
          busy={hwBusyTarget === 'printer_network'}
        >
          {hwBusyTarget === 'printer_network' ? 'Buscando…' : 'Buscar impresoras en mi red'}
        </Button>
        <Button
          variant="secondary"
          onclick={() => runHardwareProbe('scale')}
          disabled={hwBusyTarget !== ''}
          data-testid="hw-probe-scale"
          busy={hwBusyTarget === 'scale'}
        >
          {hwBusyTarget === 'scale' ? 'Probando…' : 'Probar balanza'}
        </Button>
        <Button
          variant="secondary"
          onclick={() => runHardwareProbe('vitrina')}
          disabled={hwBusyTarget !== ''}
          data-testid="hw-probe-vitrina"
          busy={hwBusyTarget === 'vitrina'}
        >
          {hwBusyTarget === 'vitrina' ? 'Probando…' : 'Probar vitrina'}
        </Button>
      </div>

      <div class="device-actions">
        <Button
          variant="primary"
          size="sm"
          onclick={runHardwarePrintTest}
          disabled={hwPrintBusy}
          data-testid="hw-print-test"
          busy={hwPrintBusy}
        >
          {hwPrintBusy ? 'Imprimiendo…' : 'Imprimir prueba'}
        </Button>
        {#if drawerOn}
          <Button
            variant="secondary"
            size="sm"
            onclick={runDrawerProbe}
            disabled={hwDrawerBusy}
            data-testid="hw-drawer-test"
            busy={hwDrawerBusy}
          >
            {hwDrawerBusy ? 'Abriendo…' : 'Probar cajón de efectivo'}
          </Button>
        {/if}
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
        <StatusMessage tone="danger" role="alert">
          {hwLogNotice}
        </StatusMessage>
      {/if}

      {#if drawerReport}
        <div
          class="diagnostic"
          class:diag-ok={drawerReport.ok}
          class:diag-bad={!drawerReport.ok}
          role="status"
          aria-live="polite"
          data-testid="hw-report-drawer"
        >
          <p class="diag-status">
            {#if drawerReport.ok}
              ✓ Cajón abierto.
            {:else}
              ✗ {causeLabel(drawerReport.causeCode)}
            {/if}
          </p>
          {#if drawerReport.nextStepId}
            <p class="diag-next">Siguiente paso: {drawerReport.nextStepId}</p>
          {/if}
        </div>
      {/if}

      {#if drawerOn || tipPolicyOn}
        <div class="policy-box" data-testid="cash-policy">
          <h3>Política de caja (P2)</h3>
          <div class="field-group">
            <label for="tip-max-percent">Tope de propina (% del subtotal)</label>
            <input
              id="tip-max-percent"
              type="number"
              min="1"
              max="100"
              bind:value={tipMaxPercent}
              data-testid="tip-max-percent"
            />
          </div>
          <label class="checkbox-row">
            <input
              type="checkbox"
              bind:checked={openDrawerOnCash}
              data-testid="open-drawer-on-cash"
            />
            Abrir cajón tras cobros en efectivo y wallets (yape/plin/QR)
          </label>
          <Button variant="primary" size="sm" onclick={saveCashPolicy} data-testid="save-cash-policy">
            Guardar política
          </Button>
          {#if policyMsg}
            <p class="policy-msg" class:policy-ok={policyOk} data-testid="cash-policy-msg">{policyMsg}</p>
          {/if}
        </div>
      {/if}
    </section>
  {/if}
</main>

<Modal
  open={confirmOpen && pendingMode !== null}
  title="Confirmar avance de formalización"
  confirmText="Confirmar"
  cancelText="Cancelar"
  confirmTestid="confirm-stage"
  cancelTestid="cancel-stage"
  data-testid="stage-confirm"
  onConfirm={confirmAdvance}
  onCancel={cancelAdvance}
>
  {#if pendingMode}
    <p>
      ¿Confirmas avanzar a <strong>{pendingMode}</strong>? Las notas de venta ya emitidas siguen siendo de control interno y no se reescriben.
    </p>
  {/if}
</Modal>

{#if onboardingOn && serverState && !checklistDismissed}
  <section class="glass-card checklist-wrap" aria-labelledby="setup-checklist">
    <SetupChecklist server={serverState} {printerReady} />
    <div class="checklist-aux">
      <Button
        variant="secondary"
        size="sm"
        data-testid="setup-hide"
        onclick={() => {
          checklistDismissed = true;
          localStorage.setItem(CHECKLIST_DISMISSED_KEY, '1');
        }}
      >
        Ocultar esta lista
      </Button>
      <Button
        variant="secondary"
        size="sm"
        data-testid="faq-toggle"
        onclick={() => (faqOpen = !faqOpen)}
      >
        Preguntas frecuentes
      </Button>
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

  .hint .linkish {
    background: none;
    border: 0;
    padding: 0;
    color: inherit;
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
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

  @media (max-width: 600px) {
    .config-grid {
      grid-template-columns: 1fr;
    }
  }

  .plan-row,
  .cancel-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-top: 0.5rem;
  }
  .cancel-row {
    margin-top: 1rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--border-subtle, rgba(128, 128, 128, 0.25));
  }
  .cancel-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: grid;
    place-items: center;
    z-index: 70;
    padding: 1rem;
  }
</style>
