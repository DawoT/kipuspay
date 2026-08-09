<script lang="ts">
  import { onMount } from 'svelte';
  import { isMobilePosEnabled, isMobilePushEnabled } from '$lib/features';
  import { readAdminAuthenticatedSessionState } from '$lib/admin/authenticated-session';
  import {
    configureMobilePushApi,
    listBrowserPushDevices,
    queueBrowserPushTest,
    registerBrowserPush,
    rotateBrowserPush,
    unregisterBrowserPush,
    updateBrowserPushPrivacy,
    type PushPurpose,
  } from '$lib/mobile/mobile-push-client';

  interface InstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  }

  const mobilePosOn = isMobilePosEnabled();
  const mobilePushOn = isMobilePushEnabled();
  const sessionState = readAdminAuthenticatedSessionState();
  let installPrompt = $state<InstallPromptEvent | null>(null);
  let status = $state('Comprobando este dispositivo…');
  let permission = $state<NotificationPermission>('default');
  let online = $state(true);
  let consentId = $state('');
  let subscriptionId = $state('');
  let amountsMode = $state(false);
  let deviceCount = $state(0);

  const terminal = $derived(sessionState?.current?.terminal ?? null);
  const canRegister = $derived(Boolean(terminal?.verified && mobilePushOn));
  const purpose: PushPurpose = $derived(
    ['owner', 'admin'].includes(sessionState?.current?.role?.toLowerCase() ?? '')
      ? 'OWNER_ALERTS'
      : 'OPERATIONAL_MOBILE',
  );

  onMount(() => {
    if (sessionState?.current?.authenticatedFetch) {
      configureMobilePushApi(sessionState.current.authenticatedFetch);
    }
    consentId = localStorage.getItem('kipuspay.push.consent') ?? '';
    subscriptionId = localStorage.getItem('kipuspay.push.subscription') ?? '';
    permission = typeof Notification === 'undefined' ? 'denied' : Notification.permission;
    online = navigator.onLine;
    status = terminal?.verified
      ? 'Terminal móvil vinculada a la sesión existente.'
      : 'Vincula esta instalación como terminal POS para activar notificaciones.';
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
      status = amountsMode ? 'Montos habilitados por política y opt-in.' : 'Privacidad REDACTED activa.';
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
  <meta
    name="description"
    content="Instalación y notificaciones del terminal móvil KipusPay"
  />
</svelte:head>

{#if !mobilePosOn && !mobilePushOn}
  <section class="mobile-card" aria-labelledby="mobile-disabled-title">
    <p class="eyebrow">Capability desactivada</p>
    <h1 id="mobile-disabled-title">Dispositivo móvil no habilitado</h1>
    <p>La caja principal sigue funcionando normalmente.</p>
    <a class="action secondary" href="/">Volver al POS</a>
  </section>
{:else}
  <div class="mobile-shell">
    <header>
      <p class="eyebrow">Terminal server-bound</p>
      <h1>Configura este dispositivo</h1>
      <p>
        Usa el mismo checkout, permisos, sesión, impresión y cola offline del POS. No se crea un rol
        móvil separado.
      </p>
    </header>

    <section class="mobile-card" aria-labelledby="device-title">
      <h2 id="device-title">1. Dispositivo</h2>
      <dl>
        <div><dt>Estado</dt><dd>{terminal?.verified ? 'Vinculado' : 'Pendiente'}</dd></div>
        <div><dt>Terminal</dt><dd>{terminal?.terminalId ?? 'Sin terminal activa'}</dd></div>
        <div><dt>Red</dt><dd>{online ? 'Conectado' : 'Offline · cola preservada'}</dd></div>
      </dl>
      {#if mobilePosOn}
        <button type="button" class="primary" onclick={installApp}>Instalar KipusPay</button>
      {/if}
    </section>

    {#if mobilePushOn}
      <section class="mobile-card" aria-labelledby="privacy-title">
        <h2 id="privacy-title">2. Privacidad y notificaciones</h2>
        <p>
          En la pantalla bloqueada se muestran categorías generales. Por defecto no se muestran
          montos, clientes, documentos ni datos fiscales.
        </p>
        <label class="privacy-choice">
          <input
            type="checkbox"
            bind:checked={amountsMode}
            disabled={!consentId || purpose !== 'OWNER_ALERTS'}
            onchange={updatePrivacy}
          />
          Mostrar montos (requiere política del tenant y opt-in del owner)
        </label>
        <button type="button" class="primary" disabled={!canRegister} onclick={requestNotifications}>
          Activar notificaciones
        </button>
        <p class="hint">Permiso del navegador: {permission}</p>
        <div class="actions">
          <button type="button" class="secondary" disabled={!subscriptionId} onclick={rotateRegistration}>
            Rotar registro
          </button>
          <button type="button" class="secondary" disabled={!subscriptionId} onclick={unsubscribe}>
            Revocar dispositivo
          </button>
          <button type="button" class="secondary" onclick={refreshDevices}>
            Dispositivos ({deviceCount})
          </button>
        </div>
      </section>

      <section class="mobile-card" aria-labelledby="test-title">
        <h2 id="test-title">3. Prueba y recuperación</h2>
        <p>
          Si push, FCM o background sync fallan, KipusPay cambia a consulta periódica y avisos dentro
          de la app. Las ventas, CPE, cierre Z y sincronización no se bloquean.
        </p>
        <div class="actions">
          <button type="button" class="secondary" onclick={showLocalTest}>Probar aviso local</button>
          <button type="button" class="secondary" disabled={!subscriptionId} onclick={sendServerTest}>
            Probar push servidor
          </button>
          <a class="action secondary" href="/">Continuar vendiendo</a>
        </div>
      </section>
    {/if}

    <p class="status" role="status" aria-live="polite" aria-atomic="true">{status}</p>
  </div>
{/if}

<style>
  .mobile-shell,
  .mobile-card {
    max-width: 42rem;
    margin-inline: auto;
  }
  .mobile-shell {
    display: grid;
    gap: 1rem;
  }
  header,
  .mobile-card {
    padding: 1.1rem;
    border: 1px solid #475569;
    border-radius: 1rem;
    background: #111827;
  }
  header {
    border-top: 4px solid #818cf8;
  }
  .eyebrow {
    color: #a5b4fc;
    font: 700 0.75rem/1.2 ui-monospace, monospace;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  h1,
  h2,
  p {
    margin-block: 0 0.75rem;
  }
  dl {
    display: grid;
    gap: 0.5rem;
    margin-block: 0 1rem;
  }
  dl div {
    display: grid;
    grid-template-columns: 7rem 1fr;
    gap: 0.5rem;
  }
  dt {
    color: #cbd5e1;
    font-weight: 700;
  }
  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  button,
  .action {
    min-height: 48px;
    padding: 0.75rem 1rem;
  }
  .privacy-choice {
    min-height: 48px;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-block: 0.75rem;
    color: #f8fafc;
  }
  .privacy-choice input {
    width: 1.25rem;
    height: 1.25rem;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }
  .action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #64748b;
    border-radius: 0.75rem;
    color: #f8fafc;
    text-decoration: none;
  }
  .hint {
    color: #cbd5e1;
  }
  .status {
    min-height: 48px;
    padding: 0.8rem 1rem;
    border-left: 4px solid #34d399;
    background: #111827;
  }
  :global(:focus-visible) {
    outline: 3px solid #fbbf24;
    outline-offset: 3px;
  }
  @media (max-width: 375px) {
    .mobile-shell {
      gap: 0.75rem;
    }
    header,
    .mobile-card {
      padding: 0.9rem;
    }
    .actions,
    .actions > * {
      width: 100%;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      scroll-behavior: auto !important;
      transition: none !important;
      animation: none !important;
    }
  }
</style>
