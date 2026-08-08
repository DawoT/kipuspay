<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { advanceFormalization, enabledDocumentTypesFor } from '@kipuspay/domain-fiscal-pe';
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

  onMount(() => {
    session = readTenantSession(sessionStorage);
    focus = $page.url.searchParams.get('focus') ?? '';
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
    padding: 0.7rem 1rem;
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
</style>
