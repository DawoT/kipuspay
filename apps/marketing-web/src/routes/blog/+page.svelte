<script lang="ts">
  import { publishedPosts } from '$lib/content/blog';
  import { reveal } from '$lib/components/reveal';
  import QuipuSectionMark from '$lib/brand/QuipuSectionMark.svelte';
  import { ogImageFor } from '$lib/seo';

  const posts = publishedPosts();
</script>

<svelte:head>
  <title>Blog · KipusPay</title>
  <meta name="description" content="Guías prácticas para comercios: primera venta, referidos y formalización." />
  <meta property="og:title" content="Blog · KipusPay" />
  <meta property="og:description" content="Guías prácticas para el dueño del comercio." />
  <meta property="og:image" content={ogImageFor()} />
  <link rel="canonical" href="https://kipuspay.com/blog" />
</svelte:head>

<section class="hero hero-compact">
  <div class="hero-inner">
    <div class="hero-copy">
      <p class="eyebrow">
        <span class="knot-dot" aria-hidden="true"></span>
        Blog de negocio
      </p>
      <h1>Guías cortas para el dueño, no para el ingeniero.</h1>
      <p class="hero-sub">
        Consejos directos sobre cómo pasar de tu cuaderno a la caja electrónica sin rodeos.
      </p>
      <div class="hero-actions">
        <a class="btn" href="/empezar">Empieza gratis</a>
        <a class="btn btn-ghost" href="#articulos">Ver guías</a>
      </div>
    </div>
  </div>
</section>

<section class="section section-paper" id="articulos" data-testid="blog-page">
  <div class="section-frame">
    <div class="section-gutter" aria-hidden="true" use:reveal>
      <QuipuSectionMark state="entry" tone="paper" />
    </div>
    <div class="section-body">
      <ul class="post-grid">
        {#each posts as post, i (post.slug)}
          <li use:reveal data-reveal-delay={i % 3}>
            <a href={`/blog/${post.slug}`} class="post-card" data-testid="blog-post-link">
              <p class="eyebrow">
                <span class="knot-dot" aria-hidden="true"></span>
                {post.publishedAt} · {post.author}
              </p>
              <h3>{post.title}</h3>
              <p>{post.excerpt}</p>
              <span class="read-more">Leer artículo →</span>
            </a>
          </li>
        {/each}
      </ul>
    </div>
  </div>
</section>
