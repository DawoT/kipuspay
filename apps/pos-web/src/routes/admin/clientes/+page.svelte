<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import { readAdminAuthenticatedSessionState } from '$lib/admin/authenticated-session';
  import { isLpdpEnabled } from '$lib/features';
  import {
    createLpdpClient,
    type ConsentDto,
    type CustomerListItemDto,
  } from '$lib/customers/customer-lpdp-client';
  import { resolveApiBase } from '$lib/auth/api-client';

  const enabled = isLpdpEnabled();
  const sessionState = readAdminAuthenticatedSessionState();
  const session = $derived(sessionState?.current ?? null);
  const roleAllowed = $derived(
    ['owner', 'admin', 'supervisor'].includes(session?.role?.toLowerCase() ?? ''),
  );
  const api = $derived(
    session
      ? createLpdpClient({
          authenticatedFetch: session.authenticatedFetch,
          apiBase: resolveApiBase(localStorage),
        })
      : null,
  );

  const PURPOSE_LABELS: Record<string, string> = {
    messaging_whatsapp: 'Mensajes por WhatsApp',
    marketing: 'Promociones y avisos comerciales',
  };

  let customers = $state<CustomerListItemDto[]>([]);
  let selected = $state<CustomerListItemDto | null>(null);
  let consents = $state<ConsentDto[]>([]);
  let loading = $state(false);
  let online = $state(true);
  let message = $state('Carga la lista para ver los clientes de esta cuenta.');
  let alert = $state('');
  let eraseStep = $state<'none' | 'explain' | 'confirm'>('none');
  let understood = $state(false);
  let erasing = $state(false);
  let erasePanel = $state<HTMLElement | null>(null);

  function purposeLabel(purpose: string): string {
    return PURPOSE_LABELS[purpose] ?? purpose;
  }

  async function refresh() {
    if (!api || !enabled || !roleAllowed) return;
    loading = true;
    alert = '';
    try {
      const res = await api.list(200, 0);
      customers = [...res.items];
      message = `${customers.length} clientes en esta cuenta. Los datos personales se muestran solo en la copia de exportación.`;
    } catch {
      alert = 'No se pudo cargar la lista. Revisa tu conexión y vuelve a intentar.';
    } finally {
      loading = false;
    }
  }

  async function openCustomer(customer: CustomerListItemDto) {
    if (!api) return;
    selected = customer;
    consents = [];
    alert = '';
    try {
      const res = await api.consents(customer.id);
      consents = [...res.consents];
      message = `Cliente ${customer.documentNumber} — consentimientos y acciones de datos.`;
    } catch (err) {
      if (err instanceof Error && err.message === 'CUSTOMER_ERASED') {
        message = 'Este cliente fue anonimizado: solo se conserva su documento fiscal.';
      } else {
        alert = 'No se pudo cargar sus consentimientos.';
      }
    }
  }

  async function toggleConsent(purpose: string, currentlyGranted: boolean) {
    if (!api || !selected) return;
    try {
      await api.setConsent(selected.id, purpose, !currentlyGranted);
      const res = await api.consents(selected.id);
      consents = [...res.consents];
      message = currentlyGranted
        ? `Se retiró el consentimiento para ${purposeLabel(purpose)}.`
        : `Se registró el consentimiento para ${purposeLabel(purpose)}.`;
    } catch {
      alert = 'No se pudo actualizar el consentimiento.';
    }
  }

  async function downloadExport() {
    if (!api || !selected) return;
    try {
      const payload = await api.exportCustomer(selected.id);
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `datos-cliente-${selected.documentNumber}.json`;
      link.click();
      URL.revokeObjectURL(url);
      message = `Copia de datos descargada para el cliente ${selected.documentNumber}.`;
    } catch (err) {
      if (err instanceof Error && err.message === 'CUSTOMER_ERASED') {
        alert = 'Este cliente ya fue anonimizado: no queda nada que exportar.';
      } else {
        alert = 'No se pudo generar la copia de datos.';
      }
    }
  }

  function startErase() {
    eraseStep = 'explain';
    understood = false;
    void erasePanel?.focus();
  }

  async function confirmErase() {
    if (!api || !selected || eraseStep !== 'confirm' || !understood) return;
    erasing = true;
    try {
      const result = await api.erase(selected.id);
      eraseStep = 'none';
      selected = null;
      await refresh();
      message = `Cliente anonimizado: ${result.fiscalSnapshotsAnonymized} comprobantes conservados sin su nombre, ${result.consentsRevoked} consentimientos revocados.`;
    } catch {
      alert = 'No se pudo anonimizar al cliente. Vuelve a intentar.';
    } finally {
      erasing = false;
    }
  }

  function closeErase() {
    eraseStep = 'none';
    message = 'Anonimización cancelada sin cambios.';
  }

  $effect(() => {
    online = typeof navigator === 'undefined' ? true : navigator.onLine;
  });
</script>

<svelte:head><title>Clientes · Admin · KipusPay</title></svelte:head>

<div class="page-shell" data-testid="customers-root">
  <div class="page-masthead">
    <div>
      <p class="page-eyebrow"><Icon name="user" size={12} /> Admin · Datos personales</p>
      <h1 class="page-title">Clientes</h1>
      <p class="page-lede">Consentimientos, copia de datos y anonimización. La ley de datos personales del Perú (LPDP) protege a tus clientes y a ti.</p>
    </div>
    <div class="connection-badge" class:offline={!online} aria-live="polite">
      <Icon name={online ? 'wifi' : 'wifi-off'} size={14} />
      <span>{online ? 'En línea' : 'Sin conexión'}</span>
    </div>
  </div>

  <div class="info-pills">
    <div class="info-pill"><Icon name="lock" size={14} /> <span>Aquí ves solo la identificación. El nombre, correo y teléfono viven en la copia de datos.</span></div>
    <div class="info-pill"><Icon name="shield" size={14} /> <span>Anonimizar borra los datos personales; los comprobantes fiscales se conservan como exige SUNAT (~5 años).</span></div>
  </div>

  {#if !enabled}
    <div class="feature-off-banner" role="alert">Datos personales está desactivado para este entorno.</div>
  {:else if !session}
    <div class="status-alert danger" role="alert">No hay una sesión autenticada válida. Acceso cerrado.</div>
  {:else if !roleAllowed}
    <div class="status-alert danger" role="alert">Solo Owner, Admin o Supervisor pueden administrar datos personales.</div>
  {:else}
    {#if alert}
      <div class="status-alert danger" role="alert">{alert}</div>
    {/if}

    <div class="toolbar-bar">
      <button type="button" class="secondary" data-testid="customers-refresh-btn" onclick={refresh} disabled={!online || loading}>
        <Icon name="refresh" size={14} />
        {loading ? 'Cargando…' : 'Actualizar'}
      </button>
    </div>

    <div class="workspace-grid">
      <section class="glass-card section-pad" aria-labelledby="customers-title">
        <div class="card-header">
          <h2 id="customers-title">Clientes de esta cuenta</h2>
          <span class="badge badge-warning">{customers.length}</span>
        </div>
        <div class="plan-list">
          {#each customers as customer (customer.id)}
            <button
              class="plan-card"
              class:active={selected?.id === customer.id}
              data-testid="customers-row"
              type="button"
              onclick={() => openCustomer(customer)}
            >
              <div class="plan-main">
                <strong class="plan-customer">{customer.documentNumber}</strong>
                {#if customer.piiErased}
                  <span class="badge badge-muted badge-sm">Anonimizado</span>
                {:else}
                  <span class="badge badge-success badge-sm">Activo</span>
                {/if}
              </div>
              <div class="plan-meta">
                <span>{customer.documentTypeCode}</span>
              </div>
            </button>
          {:else}
            {#if loading}
              <div class="section-pad">
                <Skeleton lines={3} />
              </div>
            {:else}
              <div class="empty-state">
                <Icon name="user" size={22} />
                <span>No hay clientes para esta sucursal.</span>
              </div>
            {/if}
          {/each}
        </div>
      </section>

      <section class="glass-card section-pad" aria-labelledby="detail-title">
        <div class="card-header">
          <h2 id="detail-title">Datos del cliente</h2>
          {#if selected}<span class="badge badge-indigo">{selected.documentNumber}</span>{/if}
        </div>
        {#if selected}
          {#if selected.piiErased}
            <div class="status-alert info" role="status">
              <Icon name="shield" size={14} />
              <span>Este cliente fue anonimizado. Solo se conserva el documento fiscal retenido.</span>
            </div>
          {:else}
            <h3 class="history-title">Consentimientos por propósito</h3>
            <div class="consent-list" data-testid="customers-consents">
              {#each consents as consent (consent.purpose)}
                <div class="consent-row">
                  <div class="consent-info">
                    <strong>{purposeLabel(consent.purpose)}</strong>
                    <span class="consent-state">
                      {consent.granted ? 'Con consentimiento' : 'Sin consentimiento'}
                    </span>
                  </div>
                  <button
                    type="button"
                    class="secondary"
                    data-testid="customers-consent-toggle"
                    onclick={() => toggleConsent(consent.purpose, consent.granted)}
                    disabled={!online}
                  >
                    {consent.granted ? 'Retirar' : 'Registrar'}
                  </button>
                </div>
              {:else}
                <p class="no-occurrences">Sin consentimientos registrados todavía.</p>
              {/each}
            </div>

            <div class="action-grid">
              <button type="button" class="secondary" data-testid="customers-export-btn" onclick={downloadExport} disabled={!online}>
                <Icon name="download" size={14} />
                Descargar copia de sus datos
              </button>
              <button class="danger-btn" type="button" data-testid="customers-erase-btn" onclick={startErase} disabled={!online}>
                <Icon name="trash" size={14} />
                Anonimizar sus datos
              </button>
            </div>
            <p class="erase-note">
              La copia de datos (export) es el derecho del titular a llevarse lo que guardamos de él. La anonimización es irreversible y conserva los comprobantes fiscales sin su nombre.
            </p>
          {/if}
        {:else}
          <div class="empty-state">
            <Icon name="user" size={24} />
            <span>Selecciona un cliente para ver sus consentimientos y acciones de datos.</span>
          </div>
        {/if}
      </section>
    </div>
  {/if}

  {#if eraseStep !== 'none' && selected}
    <div
      class="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="erase-title"
      tabindex="-1"
      bind:this={erasePanel}
      onkeydown={(event) => event.key === 'Escape' && closeErase()}
    >
      <div class="glass-card modal-card">
        {#if eraseStep === 'explain'}
          <h2 id="erase-title">Anonimizar los datos de {selected.documentNumber}</h2>
          <p>
            Se borran el nombre, correo, teléfono y dirección de este cliente. Los comprobantes
            fiscales se conservan como exige SUNAT (unos 5 años), pero sin el nombre del cliente.
          </p>
          <p><strong>Esto no se puede deshacer.</strong></p>
          <label class="understand-line">
            <input type="checkbox" bind:checked={understood} data-testid="customers-understand-check" />
            Entiendo que es irreversible y que los comprobantes fiscales se conservan anonimizados.
          </label>
          <div class="modal-actions">
            <button type="button" class="secondary" onclick={closeErase}>Cancelar</button>
            <button
              type="button"
              class="primary"
              data-testid="customers-erase-next-btn"
              onclick={() => (eraseStep = 'confirm')}
              disabled={!understood}
            >
              Continuar
            </button>
          </div>
        {:else}
          <h2 id="erase-title">Confirmación final</h2>
          <p>
            ¿Anonimizar definitivamente los datos personales del cliente {selected.documentNumber}?
            Esta acción no se puede revertir.
          </p>
          <div class="modal-actions">
            <button type="button" class="secondary" onclick={closeErase} disabled={erasing}>Volver</button>
            <button
              class="danger-btn"
              type="button"
              data-testid="customers-erase-confirm-btn"
              onclick={confirmErase}
              disabled={erasing}
            >
              {erasing ? 'Anonimizando…' : 'Sí, anonimizar definitivamente'}
            </button>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">{message}</p>
</div>

<style>
  .consent-list { display: flex; flex-direction: column; gap: 0.5rem; margin: 0.75rem 0 1rem; }
  .consent-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.625rem 0.75rem;
    background: var(--bg-glass);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
  }
  .consent-info { display: grid; gap: 0.15rem; }
  .consent-state { font-size: 0.75rem; color: var(--text-muted); }
  .erase-note { font-size: 0.8125rem; color: var(--text-muted); }
  .understand-line { display: flex; gap: 0.5rem; align-items: flex-start; font-weight: 600; }

  .badge-muted { background: rgba(148, 163, 184, 0.15); color: var(--text-muted); }
  .badge-success { background: rgba(46, 158, 116, 0.15); color: var(--emerald-green); }

  button:focus-visible, input:focus-visible, .plan-card:focus-visible { outline: 3px solid var(--accent-primary); outline-offset: 2px; }
  .plan-card, .consent-row button { min-height: 44px; }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; animation: none !important; }
  }
  @media (max-width: 650px) {
    .consent-row { flex-direction: column; align-items: stretch; }
    .action-grid { grid-template-columns: 1fr; }
  }
</style>
