<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
  import { isLpdpSelfServePublicEnabled } from '$lib/features';

  /**
   * Sprint C3 — LPDP ARCO self-serve del titular (regla 32a / GTM-09).
   * El cliente de la tienda ejercita sus derechos: verifica identidad con
   * datos (tienda + DNI + nombre + teléfono + OTP por correo), lee sus consentimientos,
   * descarga su copia y puede anonimizar sus datos con doble confirmación.
   * Rutas públicas (el token de titular no habilita el panel admin).
   */
  const STEPS = ['verify', 'otp', 'panel'] as const;
  const publicSelfServeEnabled = isLpdpSelfServePublicEnabled();
  let step = $state<(typeof STEPS)[number]>('verify');
  let tenantId = $state('');
  let documentNumber = $state('');
  let name = $state('');
  let phone = $state('');
  let token = $state('');
  let challengeId = $state('');
  let otpCode = $state('');
  let consents = $state<{ purpose: string; granted: boolean }[]>([]);
  let message = $state('');
  let messageOk = $state(false);
  let alert = $state('');
  let busy = $state(false);
  let confirmErase = $state(false);
  let understood = $state(false);
  let requestStatus = $state<'verified' | 'copy-ready' | 'anonymized' | null>(null);

  async function verify() {
    alert = '';
    message = '';
    busy = true;
    try {
      const res = await fetch('/api/lpdp/titular/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantId, documentNumber, name, phone }),
      });
      const body = (await res.json()) as { challengeId?: string; message?: string; error?: string; code?: string };
      if (!res.ok || !body.challengeId) {
        alert = body.code === 'TITULAR_VERIFY_FAILED'
          ? 'Los datos no coinciden con el titular registrado. Verifica DNI, nombre, teléfono y tienda.'
          : body.code === 'RATE_LIMITED'
            ? 'Demasiados intentos. Espera un momento e inténtalo de nuevo.'
            : 'No se pudo verificar tu identidad. Reintenta en unos minutos.';
        return;
      }
      challengeId = body.challengeId;
      otpCode = '';
      message = body.message ?? 'Si los datos coinciden, enviaremos un código al correo asociado.';
      messageOk = true;
      step = 'otp';
    } catch {
      alert = 'No se pudo verificar tu identidad. Reintenta en unos minutos.';
    } finally {
      busy = false;
    }
  }

  async function verifyOtp() {
    alert = '';
    busy = true;
    try {
      const res = await fetch('/api/lpdp/titular/verify-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ challengeId, code: otpCode }),
      });
      const body = (await res.json()) as { token?: string; code?: string };
      if (!res.ok || !body.token) {
        alert = body.code === 'RATE_LIMITED'
          ? 'Demasiados intentos. Espera un momento e inténtalo de nuevo.'
          : 'El código no es válido o venció. Revisa el correo e inténtalo de nuevo.';
        return;
      }
      token = body.token;
      await loadConsents();
      requestStatus = 'verified';
      step = 'panel';
    } catch {
      alert = 'No se pudo verificar tu identidad. Reintenta en unos minutos.';
    } finally {
      busy = false;
    }
  }

  async function loadConsents() {
    const res = await fetch('/api/lpdp/titular/consents', {
      headers: { authorization: `Bearer ${token}` },
    });
    const body = (await res.json()) as { consents?: { purpose: string; granted: boolean }[] };
    if (res.ok) consents = body.consents ?? [];
  }

  async function toggleConsent(purpose: string, granted: boolean) {
    alert = '';
    const res = await fetch('/api/lpdp/titular/consent', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ purpose, granted }),
    });
    if (!res.ok) {
      alert = 'No se pudo actualizar el consentimiento. Reintenta.';
      return;
    }
    await loadConsents();
  }

  async function downloadCopy() {
    alert = '';
    try {
      const res = await fetch('/api/lpdp/titular/export', {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        alert = 'No se pudo generar la copia. Reintenta.';
        return;
      }
      const body = await res.json();
      const blob = new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mis-datos-${documentNumber}.json`;
      a.click();
      URL.revokeObjectURL(url);
      message = 'Copia descargada. Conserva este archivo; es la evidencia de tu solicitud.';
      messageOk = true;
      requestStatus = 'copy-ready';
    } catch {
      alert = 'No se pudo generar la copia. Reintenta.';
    }
  }

  async function erase() {
    if (!understood) return;
    alert = '';
    const res = await fetch('/api/lpdp/titular/erase', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ confirmed: true }),
    });
    if (!res.ok) {
      alert = 'No se pudo anonimizar tus datos. Reintenta.';
      return;
    }
    message = 'Tus datos fueron anonimizados. Los comprobantes fiscales se conservan como exige SUNAT, sin tu nombre.';
    messageOk = true;
    requestStatus = 'anonymized';
    step = 'verify';
    token = '';
    challengeId = '';
    otpCode = '';
    consents = [];
    confirmErase = false;
    understood = false;
  }
</script>

<svelte:head><title>Mis datos · KipusPay</title></svelte:head>

<div class="page-shell" data-testid="lpdp-titular">
  <div class="page-masthead">
    <div>
      <p class="page-eyebrow"><Icon name="shield" size={12} /> Derechos de datos personales</p>
      <h1 class="page-title">Mis datos</h1>
      <p class="page-lede">
        {#if publicSelfServeEnabled}
          Accede a tu copia, revisa tus consentimientos o pide la anonimización de tus datos en esta tienda.
        {:else}
          Para ejercer tus derechos sobre datos personales, escribe a privacidad@kipuspay.com.
        {/if}
      </p>
    </div>
  </div>

  {#if alert}
    <StatusMessage tone="danger" aria-live="polite" data-testid="lpdp-alert">
      <Icon name="alert" size={16} />
      <span>{alert}</span>
    </StatusMessage>
  {/if}
  {#if message}
    <StatusMessage tone={messageOk ? 'info' : 'danger'} aria-live="polite" data-testid="lpdp-msg">
      <Icon name="check" size={16} />
      <span>{message}</span>
    </StatusMessage>
  {/if}

  {#if requestStatus}
    <div class="request-status" role="status" aria-live="polite" data-testid="lpdp-request-status">
      <strong>Estado de tu solicitud:</strong>
      {#if requestStatus === 'verified'}
        Identidad verificada; puedes gestionar tus datos.
      {:else if requestStatus === 'copy-ready'}
        Copia lista para descargar y conservar.
      {:else}
        Anonimización completada.
      {/if}
    </div>
  {/if}

  {#if !publicSelfServeEnabled}
    <div class="ledger-card section-pad" role="status" data-testid="lpdp-unavailable">
      <h2>Autoservicio en validación</h2>
      <p>Esta opción todavía no está disponible. Puedes ejercer tus derechos escribiendo a <a href="mailto:privacidad@kipuspay.com">privacidad@kipuspay.com</a>.</p>
    </div>
  {:else if step === 'verify'}
    <div class="ledger-card section-pad" data-testid="lpdp-verify">
      <h2>Verifica tu identidad</h2>
      <p>
        Ingresa los datos que usaste al comprar. La ley de datos personales del Perú (LPDP) te
        protege: nadie más puede pedir tu copia.
      </p>
      <div class="field-group">
        <label for="lpdp-tenant">Tienda</label>
        <input id="lpdp-tenant" data-testid="lpdp-tenant" bind:value={tenantId} placeholder="ID de la tienda" />
      </div>
      <div class="field-group">
        <label for="lpdp-doc">DNI</label>
        <input id="lpdp-doc" data-testid="lpdp-doc" bind:value={documentNumber} inputmode="numeric" placeholder="Tu número de DNI" />
      </div>
      <div class="field-group">
        <label for="lpdp-name">Nombre completo</label>
        <input id="lpdp-name" data-testid="lpdp-name" bind:value={name} placeholder="Como quedó registrado" />
      </div>
      <div class="field-group">
        <label for="lpdp-phone">Teléfono</label>
        <input id="lpdp-phone" data-testid="lpdp-phone" bind:value={phone} inputmode="tel" placeholder="Tu teléfono registrado" />
      </div>
      <Button variant="primary" size="full" data-testid="lpdp-verify-btn" onclick={verify} disabled={busy}>
        {busy ? 'Verificando…' : 'Verificar identidad'}
      </Button>
    </div>
  {:else if step === 'otp'}
    <div class="ledger-card section-pad" data-testid="lpdp-otp">
      <h2>Revisa tu correo</h2>
      <p>Si los datos coinciden, enviamos un código de seis dígitos al correo asociado. El código vence en cinco minutos.</p>
      <div class="field-group">
        <label for="lpdp-otp-code">Código de verificación</label>
        <input id="lpdp-otp-code" data-testid="lpdp-otp-code" bind:value={otpCode} inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" />
      </div>
      <Button variant="primary" size="full" data-testid="lpdp-otp-btn" onclick={verifyOtp} disabled={busy || !/^\d{6}$/.test(otpCode)}>
        {busy ? 'Validando…' : 'Confirmar código'}
      </Button>
    </div>
  {:else}
    <div class="ledger-card section-pad" data-testid="lpdp-panel">
      <h2>Tus datos en esta tienda</h2>

      <section class="lpdp-block" aria-labelledby="lpdp-copy-title">
        <h3 id="lpdp-copy-title">Copia de tus datos</h3>
        <p>Toda la información que la tienda guarda sobre ti: perfil, consentimientos y compras.</p>
        <Button variant="primary" data-testid="lpdp-export" onclick={downloadCopy} icon="download">
          Descargar mi copia
        </Button>
      </section>

      <section class="lpdp-block" aria-labelledby="lpdp-consents-title">
        <h3 id="lpdp-consents-title">Tus consentimientos</h3>
        {#if consents.length === 0}
          <p>No hay comunicaciones registradas para tu DNI.</p>
        {:else}
          <ul class="consent-list">
            {#each consents as c (c.purpose)}
              <li class="consent-row">
                <span>{c.purpose}</span>
                <button
                  type="button"
                  class="secondary"
                  data-testid="lpdp-consent-toggle"
                  onclick={() => toggleConsent(c.purpose, !c.granted)}
                >
                  {c.granted ? 'Con consentimiento' : 'Sin consentimiento'}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <section class="lpdp-block" aria-labelledby="lpdp-erase-title">
        <h3 id="lpdp-erase-title">Anonimiza tus datos</h3>
        <p>
          Borra tu nombre, correo y teléfono de esta tienda. Los comprobantes fiscales se conservan
          como exige SUNAT (~5 años), pero ya no podrán vincularse a ti.
        </p>
        {#if !confirmErase}
          <Button variant="danger" data-testid="lpdp-erase-start" onclick={() => { confirmErase = true; understood = false; }}>
            Pedir anonimización
          </Button>
        {:else}
          <label class="confirm-check">
            <input type="checkbox" data-testid="lpdp-erase-confirm" bind:checked={understood} />
            Entiendo que la anonimización es irreversible y que los comprobantes fiscales se conservan.
          </label>
          <Button variant="danger" data-testid="lpdp-erase-go" onclick={erase} disabled={!understood}>
            Anonimizar mis datos
          </Button>
        {/if}
      </section>
    </div>
  {/if}
</div>

<style>
  .lpdp-block {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding-top: 1rem;
    margin-top: 1rem;
    border-top: 1px solid var(--border-subtle);
  }

  .request-status {
    margin: 1rem 0;
    padding: 0.75rem 1rem;
    border: 1px solid var(--border-subtle);
    border-radius: 0.5rem;
    color: var(--muted);
    background: var(--surface-subtle);
  }

  .request-status strong {
    color: var(--ink);
  }
  .lpdp-block:first-of-type {
    border-top: none;
    padding-top: 0;
    margin-top: 0.75rem;
  }
  .consent-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.5rem;
  }
  .consent-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .confirm-check {
    display: flex;
    gap: 0.5rem;
    align-items: flex-start;
    margin-bottom: 0.75rem;
    font-size: 0.875rem;
  }
</style>
