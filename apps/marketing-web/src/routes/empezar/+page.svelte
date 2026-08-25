<script lang="ts">
  import type { FormalizationMode } from '$lib/onboarding/draft';
  import {
    createOnboardingDraft,
    type OnboardingVertical,
    writeOnboardingDraft,
  } from '$lib/onboarding/draft';
  import { buildOnboardingRedirect, resolveOnboardingApiBase, resolvePosOrigin } from '$lib/onboarding/handshake';
  import { ogImageFor } from '$lib/seo';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';

  type Step = 0 | 1 | 2 | 3;

  interface OnboardingCredentials {
    readonly badge: string;
    readonly pin: string;
    readonly token: string;
    readonly tenantId: string;
  }

  let step = $state<Step>(0);
  let tradeName = $state('');
  let ruc = $state('');
  let rucError = $state('');
  let verticalType = $state<OnboardingVertical>('retail');
  let formalizationMode = $state<FormalizationMode>('INTERNAL_CONTROL');
  let error = $state('');
  let busy = $state(false);
  let refCode = $state('');
  let credentials = $state<OnboardingCredentials | null>(null);
  let copyLabel = $state('Copiar credenciales');
  let copyDone = $state(false);

  onMount(() => {
    refCode = $page.url.searchParams.get('ref') ?? '';
  });

  const verticals: { id: OnboardingVertical; label: string }[] = [
    { id: 'restaurantes', label: 'Restaurantes y cafeterías' },
    { id: 'farmacias', label: 'Farmacias y boticas' },
    { id: 'retail', label: 'Retail y minimarkets' },
    { id: 'servicios', label: 'Servicios y talleres' },
    { id: 'cadenas', label: 'Cadenas y multi-local' },
  ];

  const stages: { id: FormalizationMode; label: string; body: string }[] = [
    {
      id: 'INTERNAL_CONTROL',
      label: 'Solo control interno',
      body: 'Nota de venta con leyenda legal. No es comprobante SUNAT. No es “contingencia”.',
    },
    {
      id: 'FORMALIZING',
      label: 'Estoy activando facturación',
      body: 'KipusPay emite tus boletas por ti. Las activas cuando estés listo.',
    },
    {
      id: 'ELECTRONIC_ISSUER',
      label: 'Ya emito boletas y facturas',
      body: 'Caja en modo emisor electrónico. KipusPay envía a SUNAT por ti.',
    },
  ];

  function next() {
    error = '';
    if (step === 0 && !tradeName.trim()) {
      error = 'Cuéntanos el nombre de tu negocio.';
      return;
    }
    if (step === 0) {
      rucError = validateRuc(ruc);
      if (rucError) return;
    }
    if (step < 3) step = (step + 1) as Step;
  }

  /** Valida formato de RUC peruano: 11 dígitos, empieza en 10 o 20. */
  function validateRuc(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return ''; // campo opcional
    if (!/^\d{11}$/.test(trimmed)) return 'El RUC debe tener 11 dígitos.';
    if (!trimmed.startsWith('10') && !trimmed.startsWith('20')) {
      return 'El RUC debe empezar con 10 (persona natural) o 20 (empresa).';
    }
    return '';
  }

  function handleRucInput() {
    rucError = validateRuc(ruc);
  }

  async function copyCredentials() {
    if (!credentials) return;
    const text = `Identificador: ${credentials.badge}\nPIN: ${credentials.pin}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return; // sin acceso al portapapeles (SSR, tests)
    }
    copyDone = true;
    copyLabel = '¡Copiado! ✓';
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const delay = prefersReduced ? 0 : 2000;
    setTimeout(() => {
      copyDone = false;
      copyLabel = 'Copiar credenciales';
    }, delay);
  }

  function back() {
    error = '';
    if (step > 0) step = (step - 1) as Step;
  }

  async function finish() {
    error = '';
    busy = true;
    try {
      const apiBase = resolveOnboardingApiBase();
      const res = await fetch(`${apiBase}/v1/onboarding/bootstrap`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tradeName,
          ruc: ruc.trim() || null,
          verticalType,
          formalizationMode,
          ...(refCode ? { ref: refCode } : {}),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
        error =
          data?.code === 'TENANT_ALREADY_EXISTS'
            ? 'Ya existe una cuenta con estos datos. Usa el botón "Ingresar" del menú.'
            : (data?.error ?? 'No pudimos crear tu cuenta. Reintenta en un momento.');
        return;
      }
      const body = (await res.json()) as {
        tenantId?: string;
        ownerBadge?: string;
        ownerPin?: string;
        onboardingToken?: string;
      };
      if (!body.tenantId || !body.ownerBadge || !body.ownerPin || !body.onboardingToken) {
        error = 'La respuesta de tu cuenta vino incompleta. Reintenta en un momento.';
        return;
      }
      if (refCode) {
        await fetch(`${apiBase}/v1/referrals/capture`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ referredTenantId: body.tenantId, ref: refCode }),
        }).catch(() => undefined);
      }
      const draft = createOnboardingDraft({
        tradeName,
        ruc: ruc.trim() || null,
        verticalType,
        formalizationMode,
        tenantId: body.tenantId,
      });
      writeOnboardingDraft(localStorage, draft);
      credentials = {
        badge: body.ownerBadge,
        pin: body.ownerPin,
        token: body.onboardingToken,
        tenantId: body.tenantId,
      };
    } catch {
      error = 'No pudimos crear tu cuenta ahora. Reintenta en un momento.';
    } finally {
      busy = false;
    }
  }

  function goToPos() {
    if (!credentials) return;
    const posOrigin = resolvePosOrigin();
    window.location.assign(
      buildOnboardingRedirect({
        posOrigin,
        tenantId: credentials.tenantId,
        token: credentials.token,
        mode: formalizationMode,
        vertical: verticalType,
        name: tradeName,
      }),
    );
  }
</script>

<svelte:head>
  <title>Empezar · KipusPay</title>
  <meta
    name="description"
    content="Onboarding en cuatro pantallas: negocio, rubro, etapa y primera venta."
  />
  <meta property="og:image" content={ogImageFor()} />
  <link rel="canonical" href="https://kipuspay.com/empezar" />
</svelte:head>

<section class="section section-paper" data-testid="onboarding-page">
  <div class="section-inner onboarding">
    <div class="step-progress-bar" aria-hidden="true">
      {#each [0, 1, 2, 3] as s}
        <div class="step-knot" class:active={step >= s} class:current={step === s}>
          <span>{s + 1}</span>
        </div>
      {/each}
    </div>

    <p class="eyebrow">
      <span class="knot-dot" aria-hidden="true"></span>
      Onboarding · paso {step + 1} de 4
    </p>
    <h1>Tu primera venta en menos de 5 minutos.</h1>

    {#if step === 0}
      <h2>Tu negocio</h2>
      <p class="section-lead">Con RUC autocompletamos después; sin RUC entras en control interno.</p>
      <label class="onb-field">
        Nombre comercial
        <input
          bind:value={tradeName}
          autocomplete="organization"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'onb-error-msg' : undefined}
        />
      </label>
      <label class="onb-field">
        RUC (opcional)
        <input
          bind:value={ruc}
          inputmode="numeric"
          maxlength="11"
          data-testid="ruc-input"
          aria-invalid={Boolean(rucError)}
          aria-describedby={rucError ? 'ruc-error-msg' : undefined}
          oninput={handleRucInput}
        />
      </label>
      {#if rucError}
        <p id="ruc-error-msg" class="onb-error" role="alert">{rucError}</p>
      {/if}
    {:else if step === 1}
      <h2>Tu rubro</h2>
      <div class="onb-cards">
        {#each verticals as v (v.id)}
          <button
            type="button"
            class:selected={verticalType === v.id}
            onclick={() => (verticalType = v.id)}
          >
            {v.label}
          </button>
        {/each}
      </div>
    {:else if step === 2}
      <h2>Etapa de formalización</h2>
      <div class="onb-cards">
        {#each stages as s (s.id)}
          <button
            type="button"
            class:selected={formalizationMode === s.id}
            onclick={() => (formalizationMode = s.id)}
          >
            <strong>{s.label}</strong>
            <span>{s.body}</span>
          </button>
        {/each}
      </div>
    {:else}
      <h2>Primera venta guiada</h2>
      {#if credentials}
        <p class="section-lead">
          Tu cuenta está lista. Estos son tus datos de acceso — los ves una sola vez:
        </p>
        <div class="credentials-panel" data-testid="onboarding-credentials">
          <div class="credential-row">
            <span class="credential-label">Identificador</span>
            <code class="credential-value">{credentials.badge}</code>
          </div>
          <div class="credential-row">
            <span class="credential-label">PIN</span>
            <code class="credential-value">{credentials.pin}</code>
          </div>
        </div>
        <button
          type="button"
          class="btn btn-copy"
          class:copy-done={copyDone}
          data-testid="copy-credentials-btn"
          aria-label="Copiar identificador y PIN al portapapeles"
          onclick={copyCredentials}
        >
          {copyLabel}
        </button>
        <p class="section-lead">Guárdalos (captura o apunta). Te llevamos a la caja para tu primera venta.</p>
      {:else}
        <p class="section-lead">
          Te llevamos a la caja. Según tu etapa emitirás nota de venta o boleta/factura electrónica.
          KipusPay se encarga del envío a SUNAT. No usamos la palabra “contingencia”.
        </p>
      {/if}
    {/if}

    {#if error}
      <p id="onb-error-msg" class="onb-error" role="alert">{error}</p>
    {/if}

    <div class="cta-row">
      {#if step > 0}
        <button type="button" class="btn btn-ghost" onclick={back}>Atrás</button>
      {/if}
      {#if step < 3}
        <button type="button" class="btn" onclick={next}>Continuar</button>
      {:else if credentials}
        <button type="button" class="btn" onclick={goToPos} data-testid="onboarding-go-pos">
          Ir a cobrar
        </button>
      {:else}
        <button type="button" class="btn" onclick={finish} disabled={busy}>
          {busy ? 'Creando…' : 'Crear mi cuenta'}
        </button>
      {/if}
    </div>
  </div>
</section>

<style>
  .step-progress-bar {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 2rem;
  }
  .step-knot {
    width: 2.2rem;
    height: 2.2rem;
    border: 2px solid var(--line-ink);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-mono);
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--muted-ink);
    background: transparent;
    transition: all 0.2s ease;
  }
  .step-knot.active {
    border-color: var(--amber);
    color: var(--ink);
    background: var(--paper-dim);
  }
  .step-knot.current {
    background: var(--amber);
    color: var(--ink);
    border-color: var(--amber);
  }

  .credentials-panel {
    display: grid;
    gap: 0.75rem;
    margin: 1.5rem 0;
    padding: var(--inset-card);
    border: 1px solid var(--amber);
    background: var(--ink-2);
    color: var(--paper);
  }

  .credential-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .credential-label {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
  }

  .credential-value {
    font-family: var(--font-mono);
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--amber-bright);
  }

  .btn-copy {
    margin-top: 0.5rem;
    margin-bottom: 1rem;
    min-height: 44px;
    min-width: 44px;
    padding: 0.6rem 1.25rem;
    background: transparent;
    border: 1.5px solid var(--amber);
    color: var(--amber-bright);
    font-family: var(--font-mono);
    font-size: 0.9rem;
    cursor: pointer;
    transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
  }
  .btn-copy:hover {
    background: var(--amber);
    color: var(--ink);
  }
  .btn-copy.copy-done {
    background: var(--sello);
    border-color: var(--sello-bright);
    color: var(--paper);
  }
  @media (prefers-reduced-motion: reduce) {
    .btn-copy {
      transition: none;
    }
  }
</style>
