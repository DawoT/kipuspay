<script lang="ts">
  import type { FormalizationMode } from '$lib/onboarding/draft';
  import {
    createOnboardingDraft,
    type OnboardingVertical,
    writeOnboardingDraft,
  } from '$lib/onboarding/draft';
  import { ogImageFor } from '$lib/seo';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';

  type Step = 0 | 1 | 2 | 3;

  let step = $state<Step>(0);
  let tradeName = $state('');
  let ruc = $state('');
  let verticalType = $state<OnboardingVertical>('retail');
  let formalizationMode = $state<FormalizationMode>('INTERNAL_CONTROL');
  let error = $state('');
  let busy = $state(false);
  let refCode = $state('');

  onMount(() => {
    refCode = $page.url.searchParams.get('ref') ?? '';
  });

  const verticals: { id: OnboardingVertical; label: string }[] = [
    { id: 'restaurantes', label: 'Restaurantes y cafeterias' },
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
      label: 'Estoy activando facturacion',
      body: 'KipusPay emite tus boletas por ti. Las activas cuando estes listo.',
    },
    {
      id: 'ELECTRONIC_ISSUER',
      label: 'Ya emito boletas y facturas',
      body: 'Caja en modo emisor electronico. KipusPay envia a SUNAT por ti.',
    },
  ];

  function next() {
    error = '';
    if (step === 0 && !tradeName.trim()) {
      error = 'Cuéntanos el nombre de tu negocio.';
      return;
    }
    if (step < 3) step = (step + 1) as Step;
  }

  function back() {
    error = '';
    if (step > 0) step = (step - 1) as Step;
  }

  async function finish() {
    error = '';
    busy = true;
    try {
      const res = await fetch('/v1/onboarding/bootstrap', {
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
      let tenantId = `local_${Date.now().toString(36)}`;
      if (res.ok) {
        const body = (await res.json()) as { tenantId?: string };
        if (body.tenantId) tenantId = body.tenantId;
      }
      if (refCode) {
        await fetch('/v1/referrals/capture', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ referredTenantId: tenantId, ref: refCode }),
        }).catch(() => undefined);
      }
      const draft = createOnboardingDraft({
        tradeName,
        ruc: ruc.trim() || null,
        verticalType,
        formalizationMode,
        tenantId,
      });
      writeOnboardingDraft(localStorage, draft);
      const posOrigin = (import.meta.env.PUBLIC_POS_ORIGIN as string | undefined) ?? '';
      const qs = new URLSearchParams({
        onboarding: '1',
        tenant: tenantId,
        mode: formalizationMode,
        vertical: verticalType,
        name: tradeName,
      });
      window.location.assign(`${posOrigin}/?${qs.toString()}`);
    } catch {
      error = 'No pudimos crear tu cuenta ahora. Reintenta en un momento.';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head>
  <title>Empezar · KipusPay</title>
  <meta
    name="description"
    content="Onboarding en cuatro pantallas: negocio, rubro, etapa y primera venta."
  />
  <meta property="og:image" content={ogImageFor()} />
  <link rel="canonical" href="https://kipuspay.pe/empezar" />
</svelte:head>

<section class="section section-paper" data-testid="onboarding-page">
  <div class="section-inner onboarding">
    <p class="eyebrow">
      <span class="knot-dot" aria-hidden="true"></span>
      Onboarding · paso {step + 1} de 4
    </p>
    <h1>Tu primera venta en menos de 5 minutos.</h1>

    {#if step === 0}
      <h2>Tu negocio</h2>
      <p class="section-lead">Con RUC autocompletamos despues; sin RUC entras en control interno.</p>
      <label class="onb-field">
        Nombre comercial
        <input bind:value={tradeName} autocomplete="organization" />
      </label>
      <label class="onb-field">
        RUC (opcional)
        <input bind:value={ruc} inputmode="numeric" maxlength="11" />
      </label>
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
      <h2>Etapa de formalizacion</h2>
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
      <p class="section-lead">
        Te llevamos a la caja. Segun tu etapa emitiras nota de venta o boleta/factura electronica.
        KipusPay se encarga del envio a SUNAT. No usamos la palabra “contingencia”.
      </p>
    {/if}

    {#if error}
      <p class="onb-error" role="alert">{error}</p>
    {/if}

    <div class="cta-row">
      {#if step > 0}
        <button type="button" class="btn btn-ghost" onclick={back}>Atras</button>
      {/if}
      {#if step < 3}
        <button type="button" class="btn" onclick={next}>Continuar</button>
      {:else}
        <button type="button" class="btn" onclick={finish} disabled={busy}>
          {busy ? 'Creando…' : 'Ir a cobrar'}
        </button>
      {/if}
    </div>
  </div>
</section>
