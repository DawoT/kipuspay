<script lang="ts">
  import { HOME } from '$lib/content/home';
  import { allVerticals } from '$lib/content/verticals';

  const verticals = allVerticals();
</script>

<svelte:head>
  <title>KipusPay — El unico POS que no se cae contigo</title>
  <meta
    name="description"
    content="Vende, cobra y factura aunque se corte el internet. POS y facturacion para comercios en Peru."
  />
  <meta property="og:title" content="KipusPay" />
  <meta property="og:description" content={HOME.subheadline} />
  <link rel="canonical" href="https://kipuspay.pe/" />
</svelte:head>

<section class="hero" data-testid="home-hero">
  <div class="hero-media">
    <img
      src="/media/hero-poster.svg"
      alt=""
      width="1920"
      height="1080"
      fetchpriority="high"
    />
  </div>
  <div class="hero-copy">
    <p class="brand-mark">{HOME.brand}</p>
    <h1>{HOME.headline}</h1>
    <p>{HOME.subheadline}</p>
    <div class="hero-actions">
      <a class="btn" href="/empezar">{HOME.ctaPrimary}</a>
      <a class="btn btn-ghost" href="#como">{HOME.ctaSecondary}</a>
    </div>
    <p class="trust">{HOME.trustLine}</p>
  </div>
</section>

<section class="section" data-testid="vertical-picker">
  <h2>Cual es tu negocio?</h2>
  <div class="vertical-picker">
    {#each verticals as v}
      <a href={`/para/${v.slug}`}>
        <strong>{v.slug}</strong>
        <span>{v.hook}</span>
      </a>
    {/each}
  </div>
</section>

<section class="section">
  <h2>El problema que ya conoces</h2>
  <div class="pain-grid">
    {#each HOME.pains as item}
      <article>
        <p>“{item.pain}”</p>
        <p class="relief">{item.relief}</p>
      </article>
    {/each}
  </div>
</section>

<section class="section" id="como">
  <h2>Como funciona</h2>
  <ol class="steps">
    {#each HOME.steps as step}
      <li>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
      </li>
    {/each}
  </ol>
</section>

<a class="btn btn-sticky" href="/empezar">{HOME.ctaPrimary}</a>
