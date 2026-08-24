<script lang="ts">
  import { onMount } from 'svelte';
  import { isMobilePosEnabled, isMobilePushEnabled } from '$lib/features';
  import { readAdminAuthenticatedSessionState } from '$lib/admin/authenticated-session';
  import {
    configureMobilePushApi,
    listBrowserPushDevices,
    queueBrowserPushTest,
    registerBrowserPush,
    registerFcmTokenPush,
    rotateBrowserPush,
    unregisterBrowserPush,
    updateBrowserPushPrivacy,
    type PushPurpose,
  } from '$lib/mobile/mobile-push-client';
  import { loadFcmRegistrationAdapter } from '$lib/mobile/mobile-push-pwa';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';

  interface InstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  }

  const mobilePosOn = isMobilePosEnabled();
  const mobilePushOn = isMobilePushEnabled();
  const sessionState = readAdminAuthenticatedSessionState();
  let installPrompt = $state<InstallPromptEvent | null>(null);
  let status = $state('');
  let permission = $state<NotificationPermission>('default');
  let online = $state(true);
  let consentId = $state('');
  let subscriptionId = $state('');
  let amountsMode = $state(false);
  let deviceCount = $state(0);

  const terminal = $derived(sessionState?.current?.terminal ?? null);
  // ADR-0035: la puerta del dueño es capability+consent (servidor), no terminal.
  const ownerRole = $derived(['owner', 'admin'].includes(sessionState?.current?.role?.toLowerCase() ?? ''));
  const canRegister = $derived(Boolean(mobilePushOn && (terminal?.verified || ownerRole)));
  const purpose: PushPurpose = $derived(ownerRole ? 'OWNER_ALERTS' : 'OPERATIONAL_MOBILE');
  // Mensaje de arranque reactivo: la sesión hidrata async (GET /api/auth/session)
  // y el texto debe seguir a terminal/ownerRole cuando lleguen.
  const bootstrapStatus = $derived(
    terminal?.verified
      ? 'Terminal móvil vinculada a la sesión existente.'
      : ownerRole
        ? 'Activa las alertas de tu negocio en este dispositivo.'
        : 'Vincula esta instalación como terminal POS para activar notificaciones.',
  );

  // La sesión hidrata async (GET /api/auth/session): el fetcher autenticado
  // se conecta en cuanto current aparece; un configure en onMount llega tarde
  // y deja las llamadas push sin Authorization (401).
  $effect(() => {
    const authenticatedFetch = sessionState?.current?.authenticatedFetch;
    if (authenticatedFetch) configureMobilePushApi(authenticatedFetch);
  });

  /** C8: bootstrap FCM real inyectado por el host (WebView/Android nativo). */
  function hostFcmBootstrap(): (() => Promise<{ readonly token: string }>) | null {
    if (typeof window === 'undefined') return null;
    const host = (window as Window & {
      __KIPUS_FCM_TOKEN__?: () => Promise<{ readonly token: string }>;
    }).__KIPUS_FCM_TOKEN__;
    return typeof host === 'function' ? host : null;
  }

  onMount(() => {
    consentId = localStorage.getItem('kipuspay.push.consent') ?? '';
    subscriptionId = localStorage.getItem('kipuspay.push.subscription') ?? '';
    permission = typeof Notification === 'undefined' ? 'denied' : Notification.permission;
    online = navigator.onLine;
    const captureInstall = (event: Event) => {
      event.preventDefault();
      installPrompt = event as InstallPromptEvent;
    };
    const refreshNetwork = () => {
      online = navigator.onLine;
      if (!online) status = 'Sin conexión: ventas y cola offline siguen disponibles.';
    };
    window.addEventListener('beforeinstallprompt', captureInstall);
    window.addEventListener('online', refreshNetwork);
    window.addEventListener('offline', refreshNetwork);
    return () => {
      window.removeEventListener('beforeinstallprompt', captureInstall);
      window.removeEventListener('online', refreshNetwork);
      window.removeEventListener('offline', refreshNetwork);
    };
  });

  async function requestNotifications() {
    if (!canRegister || typeof Notification === 'undefined') {
      status = 'Notificaciones no disponibles. Se usarán avisos dentro del POS.';
      return;
    }
    try {
      // C8: si el host inyecta un token FCM real, registra FCM_HTTP_V1; si el
      // módulo no carga o el token falta, degrada fail-closed a Web Push.
      const bootstrap = hostFcmBootstrap();
      if (bootstrap) {
        const adapter = await loadFcmRegistrationAdapter(bootstrap);
        if (adapter.registered) {
          const registered = await registerFcmTokenPush(
            purpose,
            amountsMode ? 'AMOUNTS' : 'REDACTED',
            adapter.token,
          );
          consentId = registered.consentId;
          subscriptionId = registered.subscriptionId;
          localStorage.setItem('kipuspay.push.consent', consentId);
          localStorage.setItem('kipuspay.push.subscription', subscriptionId);
          permission = 'granted';
          status = 'Dispositivo registrado en el canal FCM con consentimiento vigente.';
          return;
        }
      }
      const registered = await registerBrowserPush(purpose, amountsMode ? 'AMOUNTS' : 'REDACTED');
      permission = Notification.permission;
      consentId = registered.consentId;
      subscriptionId = registered.subscriptionId;
      localStorage.setItem('kipuspay.push.consent', consentId);
      localStorage.setItem('kipuspay.push.subscription', subscriptionId);
      status = 'Dispositivo registrado con consentimiento vigente.';
    } catch {
      status = 'No se pudo solicitar permiso. Se usarán avisos dentro del POS.';
    }
  }

  async function rotateRegistration() {
    try {
      await rotateBrowserPush(subscriptionId);
      status = 'Registro del proveedor rotado y validado.';
    } catch {
      status = 'No se pudo rotar el registro. Se mantiene el canal actual.';
    }
  }

  async function unsubscribe() {
    try {
      await unregisterBrowserPush(purpose, subscriptionId, consentId);
      consentId = '';
      subscriptionId = '';
      localStorage.removeItem('kipuspay.push.consent');
      localStorage.removeItem('kipuspay.push.subscription');
      status = 'Consentimiento y dispositivo revocados.';
    } catch {
      status = 'No se pudo completar la revocación.';
    }
  }

  async function updatePrivacy() {
    try {
      await updateBrowserPushPrivacy(
        purpose,
        consentId,
        amountsMode ? 'AMOUNTS' : 'REDACTED',
      );
      status = amountsMode ? 'Montos visibles con tu permiso.' : 'Avisos sin montos (privacidad).';
    } catch {
      amountsMode = false;
      status = 'La política del tenant no permite mostrar montos.';
    }
  }

  async function refreshDevices() {
    try {
      deviceCount = (await listBrowserPushDevices()).length;
      status = `${deviceCount} dispositivo(s) registrados.`;
    } catch {
      status = 'No se pudo consultar dispositivos.';
    }
  }

  async function sendServerTest() {
    try {
      await queueBrowserPushTest(purpose);
      status = 'Prueba encolada. La aceptación del proveedor no implica visualización.';
    } catch {
      status = 'No se pudo encolar la prueba.';
    }
  }

  async function installApp() {
    if (!installPrompt) {
      status = 'Usa “Instalar app” del navegador. La caja continúa disponible.';
      return;
    }
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      status =
        choice.outcome === 'accepted'
          ? 'Instalación aceptada.'
          : 'Instalación omitida. Puedes seguir usando la caja en el navegador.';
      installPrompt = null;
    } catch {
      status = 'No se pudo instalar. Puedes seguir usando la caja en el navegador.';
    }
  }

  async function showLocalTest() {
    if (permission !== 'granted' || !('serviceWorker' in navigator)) {
      status = 'Activa el permiso para ejecutar una prueba local.';
      return;
    }
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification('Prueba local de KipusPay', {
        body: 'Sin montos ni datos de clientes.',
        icon: '/icons/kipuspay-pos-192.svg?v=2',
        data: { route: '/login' },
      });
      status = 'Prueba local mostrada. Esto no confirma entrega del proveedor.';
    } catch {
      status = 'Prueba no disponible. Se usarán avisos dentro del POS.';
    }
  }
</script>

<svelte:head>
  <title>Dispositivo móvil · KipusPay</title>
  <meta name="description" content="Instalación y notificaciones del terminal móvil KipusPay" />
</svelte:head>

<div class="page-shell">
  <div class="page-masthead">
    <div>
      <p class="page-eyebrow"><Icon name="smartphone" size={12} /> Dispositivo del terminal</p>
      <h1 class="page-title">Configura este dispositivo</h1>
      <p class="page-lede">Usa el mismo checkout, permisos, sesión e impresión del POS.</p>
    </div>
  </div>

  {#if !mobilePosOn && !mobilePushOn}
    <div class="feature-off-banner" aria-labelledby="mobile-disabled-title">
      <Icon name="info" size={18} />
      <div>
        <strong id="mobile-disabled-title">Dispositivo móvil no habilitado</strong>
        <p>La caja principal sigue funcionando normalmente.</p>
      </div>
    </div>
  {:else}
    {#if status || bootstrapStatus}
      <StatusMessage tone="info" role="status" aria-live="polite">
        <Icon name="check" size={16} />
        <span>{status || bootstrapStatus}</span>
      </StatusMessage>
    {/if}

    <div class="mobile-grid">
      <section class="ledger-card section-pad" aria-labelledby="device-title">
        <div class="card-header">
          <h2 id="device-title">1. Dispositivo</h2>
          <span class="badge {terminal?.verified ? 'badge-success' : 'badge-warning'}">
            {terminal?.verified ? 'Vinculado' : 'Pendiente'}
          </span>
        </div>
        <div class="info-list">
          <div class="info-row">
            <span class="info-label">Terminal</span>
            <span class="info-val">{terminal?.terminalId ?? 'Sin terminal activa'}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Red</span>
            <span class="info-val">{online ? 'Conectado' : 'Offline · cola preservada'}</span>
          </div>
        </div>
        {#if mobilePosOn}
          <Button variant="primary" size="lg" style="width:100%" onclick={installApp} icon="download">
            Instalar KipusPay
          </Button>
        {/if}
      </section>

      {#if mobilePushOn}
        <section class="ledger-card section-pad" aria-labelledby="privacy-title">
          <div class="card-header">
            <h2 id="privacy-title">2. Notificaciones</h2>
            <Icon name="shield" size={16} />
          </div>
          <p class="section-desc">
            En la pantalla bloqueada no se muestran por defecto montos ni datos fiscales de clientes.
          </p>
          <label class="checkbox-row">
            <input
              type="checkbox"
              bind:checked={amountsMode}
              disabled={!consentId || purpose !== 'OWNER_ALERTS'}
              onchange={updatePrivacy}
            />
            <span>Mostrar montos (requiere opt-in del owner)</span>
          </label>
          <Button variant="primary" size="lg" style="width:100%" disabled={!canRegister} onclick={requestNotifications}>
            Activar notificaciones
          </Button>
          <p class="hint-text">Permiso del navegador: {permission}</p>

          <div class="btn-row">
            <Button variant="secondary" size="lg" disabled={!subscriptionId} onclick={rotateRegistration}>
              Rotar registro
            </Button>
            <Button variant="secondary" size="lg" disabled={!subscriptionId} onclick={unsubscribe}>
              Revocar
            </Button>
            <Button variant="secondary" size="lg" onclick={refreshDevices}>
              Dispositivos ({deviceCount})
            </Button>
          </div>
        </section>

        <section class="ledger-card section-pad full-col" aria-labelledby="test-title">
          <div class="card-header">
            <h2 id="test-title">3. Prueba y recuperación</h2>
            <Icon name="refresh" size={16} />
          </div>
          <p class="section-desc">
            Si push o sync fallan, KipusPay conmuta a avisos en app. Las ventas y la caja no se bloquean.
          </p>
          <div class="btn-row">
            <Button variant="secondary" size="lg" onclick={showLocalTest}>Probar aviso local</Button>
            <Button variant="secondary" size="lg" disabled={!subscriptionId} onclick={sendServerTest}>
              Probar push servidor
            </Button>
            <a class="link-action" href="/">Continuar vendiendo</a>
          </div>
        </section>
      {/if}
    </div>
  {/if}
</div>

<style>
  .mobile-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.25rem;
    align-items: start;
  }

  .full-col {
    grid-column: 1 / -1;
  }

  .section-desc { font-size: 0.875rem; color: var(--text-muted); margin-bottom: 0.875rem; }

  .info-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    padding: 0.5rem;
    background: var(--bg-glass);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    font-size: 0.875rem;
  }

  .info-label { color: var(--text-dim); }
  .info-val { font-family: var(--font-mono); color: var(--text-main); font-weight: 600; }

  .checkbox-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.875rem;
    cursor: pointer;
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  .checkbox-row input { width: auto; accent-color: var(--accent-primary); }


  .hint-text { font-size: 0.75rem; color: var(--text-dim); margin: 0.5rem 0 0.875rem; }

  .btn-row .link-action { min-height: 48px; }

  .link-action {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--bg-button-sec);
    border: 1px solid var(--border-subtle);
    min-height: 48px;
    border-radius: var(--radius-md);
    color: var(--accent-primary);
    font-size: 0.875rem;
    font-weight: 600;
    text-decoration: none;
    transition: all var(--transition-fast);
    min-height: 44px;
    white-space: nowrap;
  }

  .link-action:hover {
    background: var(--bg-glass-hover);
    border-color: var(--accent-primary);
  }

  @media (max-width: 719px) {
    .mobile-grid { grid-template-columns: 1fr; }
    .full-col { grid-column: auto; }
  }
</style>
