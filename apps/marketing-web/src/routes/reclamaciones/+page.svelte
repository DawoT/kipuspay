<script lang="ts">
  import { OFFICIAL_CHANNELS, PROVIDER_INFO, RECLAMATIONS_PAGE } from '$lib/content/legal';
  import { reveal } from '$lib/components/reveal';
  import QuipuSectionMark from '$lib/brand/QuipuSectionMark.svelte';
  import { ogImageFor } from '$lib/seo';
  import { resolveOnboardingApiBase } from '$lib/onboarding/handshake';

  let claimantName = $state('');
  let documentType = $state('DNI');
  let documentNumber = $state('');
  let email = $state('');
  let phone = $state('');
  let address = $state('');
  let department = $state('');
  let province = $state('');
  let district = $state('');
  let contractedGood = $state('servicio');
  let claimedAmount = $state('');
  let claimKind = $state('reclamo');
  let detail = $state('');
  let consumerRequest = $state('');
  let busy = $state(false);
  let error = $state('');
  let caseNumber = $state('');

  async function submitClaim() {
    error = '';
    caseNumber = '';
    busy = true;
    try {
      const base = resolveOnboardingApiBase();
      const combinedDetail = consumerRequest.trim()
        ? `${detail.trim()}\n\nPedido concreto: ${consumerRequest.trim()}`
        : detail.trim();

      const res = await fetch(`${base}/v1/reclamaciones`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          claimantName,
          documentType,
          documentNumber,
          email,
          phone,
          address,
          department,
          province,
          district,
          contractedGood,
          claimedAmount,
          claimKind,
          detail: combinedDetail,
          consumerRequest,
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
      address = '';
      department = '';
      province = '';
      district = '';
      contractedGood = 'servicio';
      claimedAmount = '';
      detail = '';
      consumerRequest = '';
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
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{RECLAMATIONS_PAGE.title} · KipusPay" />
  <meta name="twitter:description" content={RECLAMATIONS_PAGE.lede} />
  <meta name="twitter:image" content={ogImageFor()} />
  <link rel="canonical" href="https://kipuspay.com/reclamaciones" />
</svelte:head>

<section class="hero hero-compact">
  <div class="hero-inner">
    <div class="hero-copy">
      <p class="eyebrow">
        <span class="knot-dot" aria-hidden="true"></span>
        Consumidor
      </p>
      <p class="brand-mark">KipusPay</p>
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
      <p class="form-lede">
        Conforme a la Ley N° 29571 y D.S. N° 011-2011-PCM. Al enviar recibes un número de caso como
        acuse.
      </p>

      <div class="provider-card" data-testid="provider-info">
        <h3>Identificación del proveedor</h3>
        <div class="provider-details">
          <p><strong>Razón social:</strong> {PROVIDER_INFO.razonSocial}</p>
          <p><strong>RUC:</strong> {PROVIDER_INFO.ruc}</p>
          <p><strong>Domicilio fiscal:</strong> {PROVIDER_INFO.domicilioFiscal}</p>
        </div>
      </div>

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
        <fieldset class="form-section full">
          <legend>1. Identificación del consumidor reclamante</legend>
          <div class="fields-grid">
            <div class="field">
              <label for="rec-name">Nombre o razón social</label>
              <input id="rec-name" bind:value={claimantName} required data-testid="rec-name" />
            </div>
            <div class="field">
              <label for="rec-doc-type">Tipo de documento</label>
              <select id="rec-doc-type" bind:value={documentType} data-testid="rec-doc-type">
                <option value="DNI">DNI</option>
                <option value="CE">Carné de extranjería</option>
                <option value="RUC">RUC</option>
                <option value="PAS">Pasaporte</option>
              </select>
            </div>
            <div class="field">
              <label for="rec-doc">Número de documento</label>
              <input id="rec-doc" bind:value={documentNumber} required data-testid="rec-doc" />
            </div>
            <div class="field">
              <label for="rec-email">Correo electrónico</label>
              <input
                id="rec-email"
                type="email"
                bind:value={email}
                required
                data-testid="rec-email"
              />
            </div>
            <div class="field">
              <label for="rec-phone">Teléfono (opcional)</label>
              <input id="rec-phone" type="tel" bind:value={phone} data-testid="rec-phone" />
            </div>
          </div>
        </fieldset>

        <fieldset class="form-section full">
          <legend>2. Domicilio del consumidor</legend>
          <div class="fields-grid">
            <div class="field full">
              <label for="rec-address">Dirección</label>
              <input
                id="rec-address"
                bind:value={address}
                placeholder="Av. / Jr. / Calle, número y dpto."
                data-testid="rec-address"
              />
            </div>
            <div class="field">
              <label for="rec-department">Departamento</label>
              <input
                id="rec-department"
                bind:value={department}
                placeholder="Ej. Lima"
                data-testid="rec-department"
              />
            </div>
            <div class="field">
              <label for="rec-province">Provincia</label>
              <input
                id="rec-province"
                bind:value={province}
                placeholder="Ej. Lima"
                data-testid="rec-province"
              />
            </div>
            <div class="field">
              <label for="rec-district">Distrito</label>
              <input
                id="rec-district"
                bind:value={district}
                placeholder="Ej. Jesús María"
                data-testid="rec-district"
              />
            </div>
          </div>
        </fieldset>

        <fieldset class="form-section full">
          <legend>3. Identificación del bien contratado</legend>
          <div class="fields-grid">
            <div class="field">
              <label for="rec-good">Bien contratado</label>
              <select id="rec-good" bind:value={contractedGood} data-testid="rec-good">
                <option value="servicio">Servicio (suscripción SaaS / soporte)</option>
                <option value="producto">Producto</option>
              </select>
            </div>
            <div class="field">
              <label for="rec-amount">Monto reclamado (S/)</label>
              <input
                id="rec-amount"
                bind:value={claimedAmount}
                placeholder="0.00"
                data-testid="rec-amount"
              />
            </div>
          </div>
        </fieldset>

        <fieldset class="form-section full">
          <legend>4. Detalle de la reclamación y pedido</legend>
          <div class="fields-grid">
            <div class="field full">
              <label for="rec-kind">Tipo de reclamación</label>
              <select id="rec-kind" bind:value={claimKind} data-testid="rec-kind">
                <option value="reclamo"
                  >Reclamo (disconformidad relacionada a los productos o servicios)</option
                >
                <option value="queja"
                  >Queja (malestar o descontento respecto a la atención al público)</option
                >
              </select>
            </div>
            <div class="field full">
              <label for="rec-detail">Detalle de la reclamación</label>
              <textarea
                id="rec-detail"
                bind:value={detail}
                required
                rows="4"
                placeholder="Describe los hechos que motivan tu reclamo o queja..."
                data-testid="rec-detail"
              ></textarea>
            </div>
            <div class="field full">
              <label for="rec-request">Pedido concreto del consumidor</label>
              <textarea
                id="rec-request"
                bind:value={consumerRequest}
                rows="3"
                placeholder="Indica la solución o acción esperada..."
                data-testid="rec-request"
              ></textarea>
            </div>
          </div>
        </fieldset>

        <button
          id="rec-submit"
          class="btn"
          type="submit"
          disabled={busy}
          data-testid="rec-submit"
        >
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
    color: var(--muted-ink);
    line-height: 1.6;
  }

  .provider-card {
    margin: 1.25rem 0 1.75rem;
    padding: 1rem 1.25rem;
    background: #fff;
    border: 1px solid var(--line-ink);
    border-radius: 0.5rem;
    max-width: 44rem;
  }

  .provider-card h3 {
    font-size: 0.95rem;
    font-weight: 700;
    margin: 0 0 0.5rem;
    color: var(--ink);
  }

  .provider-details {
    display: grid;
    gap: 0.35rem;
    font-size: 0.875rem;
    color: var(--muted-ink);
  }

  .provider-details p {
    margin: 0;
  }

  .claim-form {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    margin-top: 1.25rem;
    max-width: 44rem;
  }

  .form-section {
    border: 1px solid var(--line-ink);
    border-radius: 0.5rem;
    padding: 1rem 1.25rem 1.25rem;
    background: #fff;
    margin: 0;
  }

  .form-section legend {
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--ink);
    padding: 0 0.5rem;
  }

  .fields-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
    margin-top: 0.5rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .field label {
    font-size: 0.825rem;
    font-weight: 600;
    color: var(--ink);
  }

  .field.full,
  .form-section.full {
    grid-column: 1 / -1;
  }

  .claim-form input,
  .claim-form select,
  .claim-form textarea {
    font: inherit;
    font-weight: 400;
    font-size: 0.9rem;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--line-ink);
    border-radius: 0.375rem;
    background: #fff;
    color: var(--ink);
  }

  .claim-form input:focus,
  .claim-form select:focus,
  .claim-form textarea:focus {
    outline: 2px solid var(--amber);
    outline-offset: -1px;
  }

  .ack {
    background: rgba(16, 185, 129, 0.12);
    border: 1px solid rgba(16, 185, 129, 0.3);
    padding: 0.75rem 1rem;
    border-radius: 0.75rem;
    color: var(--ink);
  }

  .form-error {
    color: #b91c1c;
    font-weight: 600;
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
    border-bottom: 1px solid var(--line-ink);
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
    color: #8c5a14;
    padding-top: 0.25rem;
  }

  .flow-steps h2 {
    font-size: 1.125rem;
    font-weight: 700;
    margin-bottom: 0.35rem;
  }

  .flow-steps p {
    color: var(--muted-ink);
    line-height: 1.6;
    max-width: 40rem;
  }

  .channel-note {
    margin-top: 2.5rem;
    padding-top: 1.25rem;
    border-top: 1px solid var(--line-ink);
    font-size: 0.875rem;
  }

  @media (max-width: 719px) {
    .fields-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
