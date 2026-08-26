<script lang="ts">
  import { HOME } from '$lib/content/home';
  import { allVerticals } from '$lib/content/verticals';
  import { COMPARE_ROWS } from '$lib/content/compare';
  import { reveal } from '$lib/components/reveal';
  import QuipuHero from '$lib/brand/QuipuHero.svelte';
  import QuipuMotif from '$lib/brand/QuipuMotif.svelte';
  import QuipuSectionMark from '$lib/brand/QuipuSectionMark.svelte';
  import CheckoutMock from '$lib/brand/CheckoutMock.svelte';
  import OwnerModeMock from '$lib/components/OwnerModeMock.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import { ogImageFor } from '$lib/seo';

  const verticals = allVerticals();

  const [offlineBefore, offlineAfter] = HOME.offline.body.split('sincroniza');

  const faqHome = HOME.faq.slice(0, 6);

  const faqLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqHome.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  });

  const itemsLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: verticals.map((v, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: v.title,
      url: `https://kipuspay.com/para/${v.slug}`,
    })),
  });
</script>

<svelte:head>
  <title>KipusPay — Atiende más rápido, factura en automático y controla tu negocio</title>
  <meta
    name="description"
    content="Punto de venta y facturación electrónica para comercios del Perú. Cobra en segundos, factura a SUNAT y controla tu negocio con Modo Dueño."
  />
  <meta property="og:title" content="KipusPay" />
  <meta property="og:description" content={HOME.subheadline} />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://kipuspay.com/" />
  <meta property="og:image" content={ogImageFor()} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta
    name="twitter:title"
    content="KipusPay — Atiende más rápido, factura en automático y controla tu negocio"
  />
  <meta name="twitter:description" content={HOME.subheadline} />
  <meta name="twitter:image" content={ogImageFor()} />
  <link rel="canonical" href="https://kipuspay.com/" />
  <!-- Svelte 5 no evalúa expresiones dentro de <script>: el JSON-LD se inyecta
       envolviendo el elemento completo ({@html}); faqLd/itemsLd ya son JSON string. -->
  {@html `<script type="application/ld+json">${faqLd}</script>`}
  {@html `<script type="application/ld+json">${itemsLd}</script>`}
</svelte:head>

<section class="hero" data-testid="home-hero">
  <QuipuHero videoSrc="/media/hero-quipu.mp4" poster="/media/hero-quipu-poster.jpg" />
  <div class="hero-inner">
    <div class="hero-copy">
      <p class="eyebrow">
        <span class="knot-dot" aria-hidden="true"></span>
        {HOME.eyebrow}
      </p>
      <p class="brand-mark">{HOME.brand}</p>
      <h1>{HOME.headline}</h1>
      <p class="hero-sub">{HOME.subheadline}</p>
      <div class="hero-actions">
        <a class="btn" href="/empezar">{HOME.ctaPrimary}</a>
        <a class="btn btn-ghost" href="#como">{HOME.ctaSecondary}</a>
      </div>
      <p class="trust">{HOME.activation} · {HOME.trustLine}</p>

      <div class="hero-badges" aria-label="Beneficios principales">
        {#each HOME.heroBadges as badge}
          <div class="hero-badge-item">
            <span class="hero-badge-icon" aria-hidden="true">
              <Icon name={badge.icon} size={20} tone="amber" />
            </span>
            <div class="hero-badge-text">
              <strong>{badge.title}</strong>
              <span>{badge.description}</span>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>
</section>

<section class="section section-paper" id="rubros" data-testid="vertical-picker">
  <div class="section-frame">
    <div class="section-gutter" aria-hidden="true" use:reveal>
      <QuipuSectionMark state="entry" tone="paper" />
    </div>
    <div class="section-body">
      <div class="sec-head" use:reveal>
        <p class="eyebrow">
          <span class="knot-dot" aria-hidden="true"></span>
          Soluciones a la medida de tu rubro
        </p>
        <h2>Diseñado para la realidad de tu comercio</h2>
        <p class="section-lead">
          Elige tu rubro y mira la solución hecha para el mostrador y la gestión de tu local.
        </p>
      </div>
      <div class="vertical-picker editorial-picker">
        {#each verticals as v, i (v.slug)}
          <a href={`/para/${v.slug}`} use:reveal data-reveal-delay={i % 3}>
            <span class="pick-index">{String(i + 1).padStart(2, '0')}</span>
            <strong>{v.navLabel}</strong>
            <span class="pick-hook">{v.hook}</span>
            <span class="pick-arrow" aria-hidden="true">→</span>
          </a>
        {/each}
      </div>
    </div>
  </div>
</section>

<section class="section section-paper" data-testid="pillars-section">
  <div class="section-frame">
    <div class="section-gutter" aria-hidden="true" use:reveal>
      <QuipuSectionMark state="entry" tone="paper" />
    </div>
    <div class="section-body">
      <div class="sec-head" use:reveal>
        <p class="eyebrow">
          <span class="knot-dot" aria-hidden="true"></span>
          Beneficios reales
        </p>
        <h2>Agilidad, confiabilidad y control en cada venta</h2>
      </div>
      <div class="pain-grid editorial-pains">
        {#each HOME.pillars as item, i (item.key)}
          <article use:reveal data-reveal-delay={i % 3}>
            <p class="pillar-eyebrow">
              <span class="knot-dot" aria-hidden="true"></span>
              {item.eyebrow}
            </p>
            <h3>{item.title}</h3>
            <p class="pillar-desc">{item.description}</p>
          </article>
        {/each}
      </div>
    </div>
  </div>
</section>

<section class="section" id="como">
  <div class="section-frame">
    <div class="section-gutter" aria-hidden="true" use:reveal>
      <QuipuSectionMark state="entry" tone="ink" />
    </div>
    <div class="section-body">
      <div class="sec-head" use:reveal>
        <p class="eyebrow">
          <span class="knot-dot" aria-hidden="true"></span>
          Cómo funciona
        </p>
        <h2>Tres pasos y estás vendiendo.</h2>
        <p class="section-lead">Sin instalador, sin capacitación larga, sin letra chica.</p>
      </div>
      <ol class="knot-steps" use:reveal>
        {#each HOME.steps as step, i (step.title)}
          <li style={`--i:${i}`}>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </li>
        {/each}
      </ol>
    </div>
  </div>
</section>

<section class="section" id="producto" data-testid="product-section">
  <div class="section-frame">
    <div class="section-gutter" aria-hidden="true" use:reveal>
      <QuipuSectionMark state="synced" tone="ink" />
    </div>
    <div class="section-body product-grid">
      <div class="sec-head" use:reveal>
        <p class="eyebrow">
          <span class="knot-dot" aria-hidden="true"></span>
          {HOME.product.eyebrow}
        </p>
        <h2>{HOME.product.headline}</h2>
        <p class="section-lead">{HOME.product.body}</p>
        <ul class="knot-list">
          {#each HOME.product.points as point (point)}
            <li>{point}</li>
          {/each}
        </ul>
      </div>
      <div class="product-screen" use:reveal>
        <CheckoutMock
          lines={HOME.product.demo.lines}
          documentLabel={HOME.product.demo.documentLabel}
          register={HOME.product.demo.register}
          syncState={HOME.product.demo.syncState}
          caption={HOME.product.demo.caption}
        />
      </div>
    </div>
  </div>
</section>

<section class="section section-paper" data-testid="offline-section">
  <div class="section-frame">
    <div class="section-gutter" aria-hidden="true" use:reveal>
      <QuipuSectionMark state="synced" tone="paper" />
    </div>
    <div class="section-body">
      <div class="sec-head" use:reveal>
        <p class="eyebrow">
          <span class="knot-dot" aria-hidden="true"></span>
          {HOME.offline.eyebrow}
        </p>
        <h2>{HOME.offline.headline}</h2>
        <p class="section-lead">
          {offlineBefore}<span class="stitch" use:reveal>sincroniza</span>{offlineAfter}
        </p>
      </div>
      <div class="reconnect-wrap" use:reveal>
        <div class="reconnect-motif" aria-hidden="true">
          <QuipuMotif id="home-offline" />
        </div>
        <div class="split-grid offline-compare" role="list">
          <div class="offline-row muted" role="listitem">
            <h3>Con tu sistema actual</h3>
            <p>{HOME.offline.withOthers}</p>
          </div>
          <div class="offline-row kipus" role="listitem">
            <h3>Con KipusPay</h3>
            <p>{HOME.offline.withKipus}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="section" data-testid="ledger-section">
  <div class="section-frame">
    <div class="section-gutter" aria-hidden="true" use:reveal>
      <QuipuSectionMark state="reconciled" tone="ink" />
    </div>
    <div class="section-body">
      <div class="sec-head" use:reveal>
        <p class="eyebrow">
          <span class="knot-dot" aria-hidden="true"></span>
          {HOME.ledger.eyebrow}
        </p>
        <h2>{HOME.ledger.headline}</h2>
        <p class="section-lead">{HOME.ledger.body}</p>
      </div>
      <ul class="knot-list">
        {#each HOME.ledger.points as point, i (point)}
          <li use:reveal data-reveal-delay={i % 3}>{point}</li>
        {/each}
      </ul>
      <div class="ledger-table-wrap" use:reveal>
        <table class="ledger-table" aria-label="Registros de cierre de caja">
          <thead>
            <tr>
              <th scope="col">Entrada</th>
              <th scope="col">Estado</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Apertura de caja</th>
              <td class="kipus"><span class="kipus-mark">REGISTRADO</span></td>
            </tr>
            <tr>
              <th scope="row">Ventas del día</th>
              <td class="kipus"><span class="kipus-mark">REGISTRADO</span></td>
            </tr>
            <tr>
              <th scope="row">Pagos recibidos</th>
              <td class="kipus"><span class="kipus-mark">REGISTRADO</span></td>
            </tr>
            <tr>
              <th scope="row">Cierre de caja</th>
              <td class="kipus"><span class="kipus-mark">CONCILIADO</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</section>

<section class="section section-paper" data-testid="owner-section">
  <div class="section-frame">
    <div class="section-gutter" aria-hidden="true" use:reveal>
      <QuipuSectionMark state="reconciled" tone="paper" />
    </div>
    <div class="section-body owner-grid">
      <div class="sec-head" use:reveal>
        <p class="eyebrow">
          <span class="knot-dot" aria-hidden="true"></span>
          {HOME.owner.eyebrow}
        </p>
        <h2>{HOME.owner.headline}</h2>
        <p class="section-lead">{HOME.owner.body}</p>
        <p class="owner-note">{HOME.owner.note}</p>
      </div>
      <div class="owner-mock-wrap" use:reveal>
        <OwnerModeMock />
      </div>
    </div>
  </div>
</section>

<section class="section" data-testid="compare-section">
  <div class="section-frame">
    <div class="section-gutter" aria-hidden="true" use:reveal>
      <QuipuSectionMark state="entry" tone="ink" />
    </div>
    <div class="section-body">
      <div class="sec-head" use:reveal>
        <p class="eyebrow">
          <span class="knot-dot" aria-hidden="true"></span>
          La diferencia
        </p>
        <h2>En la caja se siente, no se explica.</h2>
        <p class="section-lead">
          Sin jerga técnica: así cambia tu día a día frente al sistema tradicional.
        </p>
      </div>
      <div class="ledger-table-wrap comparison-table-wrap" use:reveal>
        <table
          class="ledger-table comparison-table"
          aria-label="Comparativa frente a sistemas tradicionales"
        >
          <thead>
            <tr>
              <th scope="col"></th>
              <th scope="col">Sistemas tradicionales</th>
              <th scope="col">KipusPay</th>
            </tr>
          </thead>
          <tbody>
            {#each COMPARE_ROWS as row (row.label)}
              <tr>
                <th scope="row">{row.label}</th>
                <td data-label="Sistema tradicional">{row.reported}</td>
                <td class="kipus" data-label="KipusPay">{row.kipus}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="compare-more">
        <a class="btn btn-ghost" href="/comparar/bsale">Ver la comparativa completa</a>
      </p>
    </div>
  </div>
</section>

<section class="section section-paper" id="confianza" data-testid="trust-section">
  <div class="section-frame">
    <div class="section-gutter" aria-hidden="true" use:reveal>
      <QuipuSectionMark state="reconciled" tone="paper" />
    </div>
    <div class="section-body">
      <div class="sec-head" use:reveal>
        <p class="eyebrow">
          <span class="knot-dot" aria-hidden="true"></span>
          {HOME.trust.eyebrow}
        </p>
        <h2>{HOME.trust.headline}</h2>
      </div>
      <div class="trust-grid">
        <div class="trust-ledger">
          {#each HOME.trust.items.slice(0, 3) as item, i (item.title)}
            <article class="trust-row" use:reveal data-reveal-delay={i % 3}>
              <span class="trust-idx">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            </article>
          {/each}
          <p class="trust-more">
            <a class="btn btn-ghost" href="/seguridad">Ver confianza y seguridad</a>
          </p>
        </div>
        <div class="trust-ticket-wrap" use:reveal>
          <figure class="trust-ticket-figure">
            <img
              src="/media/mockup-ticket-sunat.jpg"
              alt="Comprobante de pago electrónico emitido en ticket térmico con código QR y formato estándar SUNAT"
              class="trust-ticket-img"
              width="640"
              height="800"
              loading="lazy"
            />
            <figcaption class="trust-ticket-caption">
              Comprobantes electrónicos y notas de venta con formato térmico estándar de 80mm y 58mm.
            </figcaption>
          </figure>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="section" id="preguntas" data-testid="faq-section">
  <div class="section-frame">
    <div class="section-gutter" aria-hidden="true" use:reveal>
      <QuipuSectionMark state="entry" tone="ink" />
    </div>
    <div class="section-body">
      <div class="sec-head" use:reveal>
        <p class="eyebrow">
          <span class="knot-dot" aria-hidden="true"></span>
          Preguntas frecuentes
        </p>
        <h2>Las dudas de verdad, respondidas.</h2>
      </div>
      <div class="faq">
        {#each faqHome as f, i (f.q)}
          <details class="faq-item" use:reveal data-reveal-delay={i % 3}>
            <summary>
              <span class="num">{String(i + 1).padStart(2, '0')}</span>
              <span class="q">{f.q}</span>
            </summary>
            <div class="faq-content-wrap">
              <div class="faq-content-inner">
                <p class="a">{f.a}</p>
              </div>
            </div>
          </details>
        {/each}
      </div>
      <p class="faq-more">
        <a class="btn btn-ghost" href="/ayuda">Ver todas las preguntas en Ayuda</a>
      </p>
    </div>
  </div>
</section>

<section class="section section-paper final-cta" data-testid="final-cta" use:reveal>
  <div class="section-inner">
    <p class="eyebrow">
      <span class="knot-dot" aria-hidden="true"></span>
      Empezar
    </p>
    <p class="brand-mark">{HOME.finalCta.headline}</p>
    <p>{HOME.subheadline}</p>
    <div class="cta-row">
      <a class="btn" href="/empezar">{HOME.finalCta.cta}</a>
      <a class="btn btn-ghost" href="#como">{HOME.ctaSecondary}</a>
    </div>
    <p class="microcopy">{HOME.finalCta.microcopy}</p>
  </div>
</section>

<a class="btn btn-sticky" href="/empezar">{HOME.ctaPrimary}</a>
