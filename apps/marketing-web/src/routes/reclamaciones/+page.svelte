<script lang="ts">
  import { OFFICIAL_CHANNELS, RECLAMATIONS_PAGE } from '$lib/content/legal';
  import { reveal } from '$lib/components/reveal';
  import QuipuSectionMark from '$lib/brand/QuipuSectionMark.svelte';
  import { ogImageFor } from '$lib/seo';
  import { resolveOnboardingApiBase } from '$lib/onboarding/handshake';

  let claimantName = $state('');
  let documentType = $state('DNI');
  let documentNumber = $state('');
  let email = $state('');
  let phone = $state('');
  let claimKind = $state('reclamo');
  let detail = $state('');
  let busy = $state(false);
  let error = $state('');
  let caseNumber = $state('');

  async function submitClaim() {
    error = '';
    caseNumber = '';
    busy = true;
    try {
      const base = resolveOnboardingApiBase();
      const res = await fetch(`${base}/v1/reclamaciones`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          claimantName,
          documentType,
          documentNumber,
          email,
          phone,
          claimKind,
          detail,
        }),
      });
      const body = (await res.json()) as { caseNumber?: string; error?: string; code?: string };
      if (!res.ok || !body.caseNumber) {
        error = body.error ?? body.code ?? 'No se pudo registrar el reclamo.';
        return;
      }
      caseNumber = body.caseNumber;
      claimantName = '';
      documentNumber = '';
      email = '';
      phone = '';
      detail = '';
    } catch {
      error = 'No se pudo contactar el libro de reclamaciones. Inténtalo de nuevo.';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head>
  <title>{RECLAMATIONS_PAGE.title} · KipusPay</title>
  <meta name="description" content={RECLAMATIONS_PAGE.lede} />
  <meta property="og:title" content="{RECLAMATIONS_PAGE.title} · KipusPay" />
  <meta property="og:description" content={RECLAMATIONS_PAGE.lede} />
  <meta property="og:image" content={ogImageFor()} />
  <link rel="canonical" href="https://kipuspay.com/reclamaciones" />
</svelte:head>

<section class="hero hero-compact">
  <div class="hero-inner">
    <div class="hero-copy">
      <p class="eyebrow">
        <span class="knot-dot" aria-hidden="true"></span>
        Consumidor
      </p>
      <h1>{RECLAMATIONS_PAGE.headline}</h1>
      <p class="hero-sub">{RECLAMATIONS_PAGE.lede}</p>
      <div class="hero-actions">
        <a class="btn" href="#formulario">Registrar reclamo</a>
        <a class="btn btn-ghost" href="#proceso">Ver proceso</a>
      </div>
    </div>
  </div>
</section>

<section class="section section-paper" id="formulario" data-testid="reclamaciones-form">
  <div class="section-frame">
    <div class="section-gutter" aria-hidden="true" use:reveal>
      <QuipuSectionMark state="entry" tone="paper" />
    </div>
    <div class="section-body">
      <h2>Formulario del libro</h2>
      <p class="form-lede">Al enviar recibes un número de caso. Guárdalo: es tu acuse.</p>
      {#if caseNumber}
        <p class="ack" data-testid="reclamacion-ack" role="status">
          Reclamo registrado. Número de caso: <strong>{caseNumber}</strong>
        </p>
      {/if}
      {#if error}
        <p class="form-error" data-testid="reclamacion-error">{error}</p>
      {/if}
      <form
        class="claim-form"
        onsubmit={(event) => {
          event.preventDefault();
          void submitClaim();
        }}
      >
        <label>
          Nombre o razón social
          <input bind:value={claimantName} required data-testid="rec-name" />
        </label>
        <label>
          Tipo de documento
          <select bind:value={documentType} data-testid="rec-doc-type">
            <option value="DNI">DNI</option>
            <option value="CE">Carné de extranjería</option>
            <option value="RUC">RUC</option>
            <option value="PAS">Pasaporte</option>
          </select>
        </label>
        <label>
          Número de documento
          <input bind:value={documentNumber} required data-testid="rec-doc" />
        </label>
        <label>
          Correo
          <input type="email" bind:value={email} required data-testid="rec-email" />
        </label>
        <label>
          Teléfono (opcional)
          <input bind:value={phone} data-testid="rec-phone" />
        </label>
        <label>
          Tipo
          <select bind:value={claimKind} data-testid="rec-kind">
            <option value="reclamo">Reclamo</option>
            <option value="queja">Queja</option>
          </select>
        </label>
        <label class="full">
          Detalle
          <textarea bind:value={detail} required rows="5" data-testid="rec-detail"></textarea>
        </label>
        <button class="btn" type="submit" disabled={busy} data-testid="rec-submit">
          {busy ? 'Enviando…' : 'Registrar reclamo'}
        </button>
      </form>
    </div>
  </div>
</section>

<section class="section section-paper" id="proceso" data-testid="reclamaciones-page">
  <div class="section-frame">
    <div class="section-gutter" aria-hidden="true" use:reveal>
      <QuipuSectionMark state="entry" tone="paper" />
    </div>
    <div class="section-body">
      <ol class="flow-steps">
        {#each RECLAMATIONS_PAGE.steps as step, i (step.title)}
          <li use:reveal data-reveal-delay={i % 3}>
            <span class="step-num">{String(i + 1).padStart(2, '0')}</span>
            <div>
              <h2>{step.title}</h2>
              <p>{step.body}</p>
            </div>
          </li>
        {/each}
      </ol>
      <p class="channel-note">
        Canal oficial de reclamos: {OFFICIAL_CHANNELS.contacto}. Para soporte usa{' '}
        {OFFICIAL_CHANNELS.soporte}.
      </p>
    </div>
  </div>
</section>

<style>
  .form-lede,
  .channel-note {
    color: var(--muted);
    line-height: 1.6;
  }

  .claim-form {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
    margin-top: 1.25rem;
    max-width: 40rem;
  }

  .claim-form label {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.875rem;
    font-weight: 600;
  }

  .claim-form .full,
  .claim-form button {
    grid-column: 1 / -1;
  }

  .claim-form input,
  .claim-form select,
  .claim-form textarea {
    font: inherit;
    font-weight: 400;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
    background: #fff;
  }

  .ack {
    background: rgba(16, 185, 129, 0.12);
    border: 1px solid rgba(16, 185, 129, 0.3);
    padding: 0.75rem 1rem;
    border-radius: 0.75rem;
  }

  .form-error {
    color: #b91c1c;
  }

  .flow-steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0;
  }

  .flow-steps li {
    display: flex;
    gap: 1.25rem;
    padding: 1.1rem 0;
    border-bottom: 1px solid var(--line);
  }

  .flow-steps li:first-child {
    padding-top: 0;
  }

  .flow-steps li:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .step-num {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    color: var(--amber-bright);
    padding-top: 0.25rem;
  }

  .flow-steps h2 {
    font-size: 1.125rem;
    font-weight: 700;
    margin-bottom: 0.35rem;
  }

  .flow-steps p {
    color: var(--muted);
    line-height: 1.6;
    max-width: 40rem;
  }

  .channel-note {
    margin-top: 2.5rem;
    padding-top: 1.25rem;
    border-top: 1px solid var(--line);
    font-size: 0.875rem;
  }

  @media (max-width: 640px) {
    .claim-form {
      grid-template-columns: 1fr;
    }
  }
</style>
