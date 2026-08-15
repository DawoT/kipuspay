<script lang="ts">
  import { PRICING_DISCLAIMERS, PRICING_PLANS, planCta, pricingFeatureAvailability, pricingFeatureText } from '$lib/content/pricing';
  import { PLAN_MATRIX, planMatrixAvailability, planMatrixIncluded, planOrder, type PlanMatrixRow } from '$lib/content/plan-matrix';
  import { recommendPlan, type PickerCapability } from '$lib/content/plan-picker';
  import { reveal } from '$lib/components/reveal';
  import QuipuSectionMark from '$lib/brand/QuipuSectionMark.svelte';
  import { ogImageFor } from '$lib/seo';
  import { formatCents } from '$lib/brand/money';
  import type { PlanId } from '$lib/content/pricing';

  let isAnnual = $state(false);

  const productLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'KipusPay POS y Facturación Electrónica',
    description: 'Punto de venta y facturación electrónica para comercios del Perú.',
    offers: PRICING_PLANS.filter((plan) => plan.monthlyCents !== null).map((plan) => ({
      '@type': 'Offer',
      name: plan.name,
      priceCurrency: 'PEN',
      price: formatCents(plan.monthlyCents ?? 0),
      description: plan.audience,
      url: 'https://kipuspay.com/precios',
    })),
  });

  const PLAN_NAMES: Record<PlanId, string> = {
    arranque: 'Arranque',
    crece: 'Crece',
    cadena: 'Cadena',
    enterprise: 'Enterprise',
  };

  // Picker: 3 preguntas → recomendación pura (plan-picker.ts).
  let pickerLocales = $state(1);
  let pickerCajas = $state(1);
  let pickerCaps = $state<PickerCapability[]>([]);

  const LOCALES_OPTIONS = [
    { value: 1, label: 'Uno' },
    { value: 2, label: '2 a 3' },
    { value: 4, label: '4 o más' },
  ] as const;

  const CAJAS_OPTIONS = [
    { value: 1, label: 'Una' },
    { value: 2, label: '2 o más' },
  ] as const;

  const CAP_OPTIONS: readonly { id: PickerCapability; label: string }[] = [
    { id: 'modo-dueno', label: 'Ver todo desde el celular' },
    { id: 'comandas', label: 'Comandas de cocina' },
    { id: 'multi-local', label: 'Control entre varios locales' },
    { id: 'api', label: 'API e integraciones' },
    { id: 'sla', label: 'Soporte dedicado con contrato' },
  ];

  function toggleCap(cap: PickerCapability) {
    pickerCaps = pickerCaps.includes(cap)
      ? pickerCaps.filter((c) => c !== cap)
      : [...pickerCaps, cap];
  }

  const recommendation = $derived(
    recommendPlan({ locales: pickerLocales, cajas: pickerCajas, capacidades: pickerCaps }),
  );

  // Matriz móvil: una columna de plan a la vez.
  let matrixTab = $state<PlanId>('crece');

  const matrixRows: readonly PlanMatrixRow[] = PLAN_MATRIX;
  const plans = planOrder();
</script>

<svelte:head>
  <title>Precios · KipusPay</title>
  <meta
    name="description"
    content="Planes Arranque, Crece, Cadena y Enterprise. El cobro nunca se apaga por volumen."
  />
  <meta property="og:title" content="Precios · KipusPay" />
  <meta property="og:description" content="Cuatro planes. Cupo transparente. Sin apagar la caja." />
  <meta property="og:image" content={ogImageFor()} />
  <link rel="canonical" href="https://kipuspay.com/precios" />
  <script type="application/ld+json">{@html productLd}</script>
</svelte:head>

<section class="hero hero-compact">
  <div class="hero-inner">
    <div class="hero-copy">
      <p class="eyebrow">
        <span class="knot-dot" aria-hidden="true"></span>
        Pricing
      </p>
      <p class="brand-mark">KipusPay</p>
      <h1>Planes claros. El cobro no se apaga.</h1>
      <p class="hero-sub">
        Empieza en Arranque, sube cuando tu negocio pida una capacidad nueva — nunca porque se te
        acabaron los comprobantes.
      </p>
      <div class="hero-actions">
        <a class="btn" href="/empezar">Empieza gratis</a>
        <a class="btn btn-ghost" href="#planes">Ver planes</a>
      </div>
    </div>
  </div>
</section>

<section class="section section-paper" id="planes" data-testid="pricing-page">
  <div class="section-frame">
    <div class="section-gutter" aria-hidden="true" use:reveal>
      <QuipuSectionMark state="entry" tone="paper" />
    </div>
    <div class="section-body">
      <div class="sec-head" use:reveal>
        <p class="eyebrow">
          <span class="knot-dot" aria-hidden="true"></span>
          Planes
        </p>
        <h2>Cuatro planes. Sin letra chica de “sin límite”.</h2>
        <p class="section-lead">
          Arranque incluye 1,000 comprobantes/mes; el adicional se factura fuera del cobro. Nunca hay
          interrupción en la caja.
        </p>
      </div>

      <div class="pricing-toggle-wrap" use:reveal>
        <button
          type="button"
          class="pricing-toggle-btn"
          class:active={!isAnnual}
          onclick={() => (isAnnual = false)}
        >
          Mensual
        </button>
        <button
          type="button"
          class="pricing-toggle-btn"
          class:active={isAnnual}
          onclick={() => (isAnnual = true)}
        >
          Anual
          <span class="discount-badge">2 meses gratis (ahorra 20%)</span>
        </button>
      </div>

      <div class="pricing-grid">
        {#each PRICING_PLANS as plan, i (plan.id)}
          <article
            class="pricing-card"
            class:highlight={plan.id === 'crece'}
            data-plan={plan.id}
            id={`plan-${plan.id}`}
            use:reveal
            data-reveal-delay={i % 3}
          >
            <p class="pricing-name">
              {plan.name}
              {#if plan.badge}
                <span class="pricing-badge">{plan.badge}</span>
              {/if}
            </p>
            <p class="pricing-price">
              {isAnnual ? plan.annualLabel : plan.monthlyLabel}
            </p>
            {#if isAnnual && plan.id !== 'enterprise'}
              <p class="pricing-annual-sub">Facturación anual diferida</p>
            {/if}
            <p class="pricing-audience">{plan.audience}</p>
            <ul>
              {#each plan.features as feature (pricingFeatureText(feature))}
                <li class="pricing-feature">
                  {pricingFeatureText(feature)}
                  {#if pricingFeatureAvailability(feature) === 'preparing'}
                    <span class="preparing-badge">En preparación</span>
                  {/if}
                </li>
              {/each}
            </ul>
            <ul class="pricing-limits">
              {#each plan.limits as limit (limit)}
                <li>{limit}</li>
              {/each}
            </ul>
            {#if plan.upgradeGates.length > 0}
              <p class="pricing-gates">
                Subes de plan cuando pides: {plan.upgradeGates.join(' · ')}.
              </p>
            {/if}
            <a
              class="btn"
              class:btn-ghost={plan.id === 'enterprise'}
              href={planCta(plan.id).href}
              data-testid={`plan-cta-${plan.id}`}
            >
              {planCta(plan.id).label}
            </a>
          </article>
        {/each}
      </div>
      <p class="pricing-note" use:reveal>{PRICING_DISCLAIMERS.cupo}</p>
      <p class="pricing-note" use:reveal>{PRICING_DISCLAIMERS.gracia}</p>
    </div>
  </div>
</section>

<section class="section" id="picker" data-testid="plan-picker">
  <div class="section-frame">
    <div class="section-gutter" aria-hidden="true" use:reveal>
      <QuipuSectionMark state="entry" tone="ink" />
    </div>
    <div class="section-body">
      <div class="sec-head" use:reveal>
        <p class="eyebrow">
          <span class="knot-dot" aria-hidden="true"></span>
          ¿No sabes cuál elegir?
        </p>
        <h2>Dinos tres cosas y te lo decimos.</h2>
      </div>

      <div class="picker-layout">
        <div class="picker-questions">
          <fieldset class="picker-group">
            <legend>¿Cuántos locales tienes?</legend>
            <div class="picker-options">
              {#each LOCALES_OPTIONS as option}
                <label class:active={pickerLocales === option.value}>
                  <input
                    type="radio"
                    name="picker-locales"
                    value={option.value}
                    bind:group={pickerLocales}
                  />
                  {option.label}
                </label>
              {/each}
            </div>
          </fieldset>

          <fieldset class="picker-group">
            <legend>¿Cuántas cajas o terminales usas?</legend>
            <div class="picker-options">
              {#each CAJAS_OPTIONS as option}
                <label class:active={pickerCajas === option.value}>
                  <input
                    type="radio"
                    name="picker-cajas"
                    value={option.value}
                    bind:group={pickerCajas}
                  />
                  {option.label}
                </label>
              {/each}
            </div>
          </fieldset>

          <fieldset class="picker-group">
            <legend>¿Qué necesita tu operación?</legend>
            <div class="picker-checks">
              {#each CAP_OPTIONS as cap}
                <label class:active={pickerCaps.includes(cap.id)}>
                  <input
                    type="checkbox"
                    checked={pickerCaps.includes(cap.id)}
                    onchange={() => toggleCap(cap.id)}
                  />
                  {cap.label}
                </label>
              {/each}
            </div>
          </fieldset>
        </div>

        <aside class="picker-result" data-testid="picker-result">
          <p class="eyebrow">
            <span class="knot-dot" aria-hidden="true"></span>
            Tu plan
          </p>
          <p class="picker-plan-name">{PLAN_NAMES[recommendation]}</p>
          <p class="picker-plan-hint">
            {recommendation === 'arranque' && 'Empiezas simple: una caja, un local, todo lo esencial.'}
            {recommendation === 'crece' && 'Tu negocio ya pide más: otra caja, otro local o la gestión desde el celular.'}
            {recommendation === 'cadena' && 'Operas a escala: varios locales, cocina o integraciones.'}
            {recommendation === 'enterprise' && 'Necesitas garantías dedicadas: habla con nosotros y lo cerramos a medida.'}
          </p>
          <a class="btn" href={`#plan-${recommendation}`}>Ver el plan {PLAN_NAMES[recommendation]}</a>
        </aside>
      </div>
    </div>
  </div>
</section>

<section class="section section-paper" id="matriz" data-testid="plan-matrix">
  <div class="section-frame">
    <div class="section-gutter" aria-hidden="true" use:reveal>
      <QuipuSectionMark state="synced" tone="paper" />
    </div>
    <div class="section-body">
      <div class="sec-head" use:reveal>
        <p class="eyebrow">
          <span class="knot-dot" aria-hidden="true"></span>
          La especificación
        </p>
        <h2>Compara los planes, área por área.</h2>
      </div>

      <div class="plan-matrix-desktop" use:reveal>
        <table class="plan-matrix">
          <thead>
            <tr>
              <th scope="col">Área</th>
              {#each plans as plan}
                <th scope="col" class:matrix-col-highlight={plan === 'crece'}>{PLAN_NAMES[plan]}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each matrixRows as row}
              <tr>
                <th scope="row">
                  <span class="matrix-area">{row.area}</span>
                  <span class="matrix-summary">{row.summary}</span>
                </th>
                {#each plans as plan}
                  <td class:included={planMatrixIncluded(row.minPlan, plan)}>
                    {#if planMatrixIncluded(row.minPlan, plan)}
                      {#if planMatrixAvailability(row) === 'preparing'}
                        <span class="matrix-preparing" aria-label="En preparación">En preparación</span>
                      {:else}
                        <span class="matrix-check" aria-label="Incluido">✓</span>
                      {/if}
                    {:else}
                      <span class="matrix-empty" aria-hidden="true">—</span>
                    {/if}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <div class="plan-matrix-mobile" use:reveal>
        <div class="matrix-tabs" role="tablist" aria-label="Elegir plan">
          {#each plans as plan}
            <button
              type="button"
              role="tab"
              aria-selected={matrixTab === plan}
              class:active={matrixTab === plan}
              onclick={() => (matrixTab = plan)}
            >
              {PLAN_NAMES[plan]}
            </button>
          {/each}
        </div>
        <ul class="matrix-mobile-list">
          {#each matrixRows as row}
            <li class:included={planMatrixIncluded(row.minPlan, matrixTab)}>
              <span class="matrix-check">
                {#if !planMatrixIncluded(row.minPlan, matrixTab)}
                  —
                {:else if planMatrixAvailability(row) === 'preparing'}
                  En preparación
                {:else}
                  ✓
                {/if}
              </span>
              <div>
                <strong>{row.area}</strong>
                <p>{row.summary}</p>
              </div>
            </li>
          {/each}
        </ul>
        <a class="btn" href={planCta(matrixTab).href}>{planCta(matrixTab).label}</a>
      </div>
    </div>
  </div>
</section>

<style>
  .pricing-toggle-wrap {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem;
    background: var(--ink-2);
    border: 1px solid var(--line);
    margin-bottom: 2.5rem;
  }
  .pricing-toggle-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 1.1rem;
    font-family: var(--font-mono);
    font-size: 0.88rem;
    border: none;
    background: transparent;
    color: rgba(243, 239, 230, 0.7);
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .pricing-toggle-btn.active {
    background: var(--paper);
    color: var(--ink);
    font-weight: 700;
  }
  .discount-badge {
    padding: 0.2rem 0.45rem;
    background: var(--sello-bright);
    color: var(--paper);
    font-size: 0.72rem;
    font-weight: 700;
  }
  .pricing-card.highlight {
    border-left-color: var(--amber);
    box-shadow: none;
  }
  .pricing-badge {
    display: inline-block;
    margin-left: 0.5rem;
    padding: 0.2rem 0.5rem;
    background: var(--amber);
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    vertical-align: middle;
  }
  .pricing-annual-sub {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--sello-bright);
    margin: -0.5rem 0 1rem;
  }

  /* Picker premium */
  .picker-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 2rem;
    margin-top: 2rem;
  }
  @media (max-width: 800px) {
    .picker-layout {
      grid-template-columns: 1fr;
    }
  }
  .picker-group {
    border: none;
    padding: 0;
    margin: 0 0 1.5rem;
  }
  .picker-group legend {
    font-weight: 700;
    margin-bottom: 0.7rem;
  }
  .picker-options,
  .picker-checks {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem;
  }
  .picker-options label,
  .picker-checks label {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.5rem 0.9rem;
    border: 1px solid var(--line);
    background: var(--ink-2);
    color: rgba(243, 239, 230, 0.85);
    cursor: pointer;
    font-size: 0.92rem;
    transition: all 0.18s ease;
  }
  .picker-options label:hover,
  .picker-checks label:hover {
    border-color: var(--amber);
  }
  .picker-options label.active,
  .picker-checks label.active {
    background: var(--paper);
    color: var(--ink);
    font-weight: 700;
  }
  .picker-result {
    border: 1px solid var(--amber);
    padding: 1.5rem;
    background: var(--ink-2);
    color: var(--paper);
    align-self: start;
  }
  .picker-plan-name {
    font-family: var(--font-display);
    font-size: 2.2rem;
    font-weight: 700;
    margin: 0.4rem 0 0.6rem;
  }
  .picker-plan-hint {
    color: rgba(243, 239, 230, 0.78);
    line-height: 1.55;
    margin-bottom: 1.2rem;
  }

  /* Matriz */
  .plan-matrix-desktop {
    margin-top: 2rem;
    overflow-x: auto;
    border: 1px solid var(--line);
  }
  .plan-matrix {
    width: 100%;
    border-collapse: collapse;
    color: var(--ink);
    min-width: 640px;
  }
  .plan-matrix th,
  .plan-matrix td {
    padding: 0.85rem 1rem;
    border-bottom: 1px solid var(--line);
    text-align: center;
    vertical-align: middle;
  }
  .plan-matrix thead th {
    font-family: var(--font-mono);
    font-size: 0.82rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .plan-matrix thead th.matrix-col-highlight {
    color: var(--amber-bright);
  }
  .plan-matrix tbody th {
    text-align: left;
    min-width: 280px;
  }
  .plan-matrix tbody tr:hover td,
  .plan-matrix tbody tr:hover th {
    background: rgba(217, 154, 61, 0.06);
  }
  .matrix-area {
    display: block;
    font-weight: 700;
    font-size: 0.95rem;
  }
  .matrix-summary {
    display: block;
    color: var(--muted-ink);
    font-size: 0.8rem;
    font-weight: 400;
    margin-top: 0.15rem;
    line-height: 1.4;
  }
  .matrix-check {
    color: var(--sello-bright);
    font-weight: 700;
  }
  .matrix-preparing,
  .preparing-badge {
    display: inline-block;
    margin-left: 0.35rem;
    padding: 0.1rem 0.4rem;
    font-family: var(--font-mono);
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: var(--ink);
    background: rgba(201, 162, 39, 0.2);
    border: 1px solid rgba(201, 162, 39, 0.45);
  }
  .matrix-empty {
    color: var(--muted-ink);
  }

  .plan-matrix-mobile {
    display: none;
    margin-top: 2rem;
  }
  @media (max-width: 800px) {
    .plan-matrix-desktop {
      display: none;
    }
    .plan-matrix-mobile {
      display: block;
    }
  }
  .matrix-tabs {
    display: flex;
    gap: 0.4rem;
    margin-bottom: 1rem;
    overflow-x: auto;
  }
  .matrix-tabs button {
    padding: 0.55rem 0.9rem;
    background: var(--ink-2);
    color: rgba(243, 239, 230, 0.8);
    border: 1px solid var(--line);
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: 0.82rem;
    white-space: nowrap;
  }
  .matrix-tabs button.active {
    background: var(--paper);
    color: var(--ink);
    font-weight: 700;
  }
  .matrix-mobile-list {
    list-style: none;
    margin: 0 0 1.25rem;
    padding: 0;
    display: grid;
    gap: 0.5rem;
  }
  .matrix-mobile-list li {
    display: flex;
    gap: 0.75rem;
    padding: 0.8rem 1rem;
    border: 1px solid var(--line);
    color: var(--ink);
    background: var(--ink-2);
    color: rgba(243, 239, 230, 0.8);
  }
  .matrix-mobile-list li strong {
    display: block;
    margin-bottom: 0.2rem;
  }
  .matrix-mobile-list li p {
    color: rgba(243, 239, 230, 0.7);
    font-size: 0.82rem;
    line-height: 1.45;
  }
  .matrix-mobile-list li.included {
    border-color: var(--sello-bright);
  }
  .matrix-mobile-list .matrix-check {
    color: var(--sello-bright);
    font-weight: 700;
    padding-top: 0.1rem;
  }
</style>
