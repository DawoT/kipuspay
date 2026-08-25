<script lang="ts">
  import { publishedPosts } from '$lib/content/blog';
  import { reveal } from '$lib/components/reveal';
  import QuipuSectionMark from '$lib/brand/QuipuSectionMark.svelte';
  import { ogImageFor } from '$lib/seo';

  const posts = publishedPosts();
</script>

<svelte:head>
  <title>Blog · KipusPay</title>
  <meta
    name="description"
    content="Guías prácticas, tributación, medios de pago y gestión de mostrador para comercios en el Perú."
  />
  <meta property="og:title" content="Blog · KipusPay" />
  <meta
    property="og:description"
    content="Guías prácticas para el dueño del comercio: RUC 10 vs RUC 20, cuadre de caja, cobro con Yape y Plin, y apertura de negocios."
  />
  <meta property="og:image" content={ogImageFor()} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Blog · KipusPay" />
  <meta
    name="twitter:description"
    content="Guías prácticas para el dueño del comercio: RUC 10 vs RUC 20, cuadre de caja, cobro con Yape y Plin, y apertura de negocios."
  />
  <meta name="twitter:image" content={ogImageFor()} />
  <link rel="canonical" href="https://kipuspay.com/blog" />
</svelte:head>

<section class="hero hero-compact">
  <div class="hero-inner">
    <div class="hero-copy">
      <p class="eyebrow">
        <span class="knot-dot" aria-hidden="true"></span>
        Blog de negocio
      </p>
      <p class="brand-mark">KipusPay</p>
      <h1>Guías cortas para el dueño, no para el ingeniero.</h1>
      <p class="hero-sub">
        Consejos directos sobre cómo pasar de tu cuaderno a la caja electrónica, formalizarte y cuadrar tu mostrador sin rodeos.
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
            <article class="post-card" data-testid="blog-post-card">
              <a href={`/blog/${post.slug}`} class="post-card-link" data-testid="blog-post-link">
                <div class="post-cover-wrap">
                  <img
                    src={post.coverImage}
                    alt={post.coverAlt}
                    loading="lazy"
                    width="600"
                    height="340"
                    class="post-cover"
                  />
                  <span class="category-badge">{post.category}</span>
                </div>
                <div class="post-card-content">
                  <p class="post-card-meta">
                    <span class="knot-dot" aria-hidden="true"></span>
                    <time datetime={post.date}>{post.date}</time>
                    <span class="meta-sep" aria-hidden="true">·</span>
                    <span>{post.readingTimeMinutes} min de lectura</span>
                  </p>
                  <h3>{post.title}</h3>
                  <p class="post-card-excerpt">{post.excerpt}</p>
                  {#if post.tags && post.tags.length > 0}
                    <div class="card-tags" aria-label="Temas del artículo">
                      {#each post.tags.slice(0, 3) as tag}
                        <span class="tag-pill">{tag}</span>
                      {/each}
                    </div>
                  {/if}
                  <span class="read-more">Leer artículo →</span>
                </div>
              </a>
            </article>
          </li>
        {/each}
      </ul>
    </div>
  </div>
</section>

<style>
  .post-grid {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 2rem;
  }

  @media (min-width: 719px) {
    .post-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .post-card {
    background: var(--ink-2);
    border: 1px solid var(--line);
    border-radius: 4px;
    overflow: hidden;
    height: 100%;
    transition: border-color 0.2s ease;
  }

  .post-card:hover,
  .post-card:focus-within {
    border-color: var(--amber);
  }

  .post-card-link {
    display: flex;
    flex-direction: column;
    height: 100%;
    text-decoration: none;
    color: var(--paper);
  }

  .post-cover-wrap {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    background: #111418;
    overflow: hidden;
  }

  .post-cover {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition: transform 0.3s ease;
  }

  .post-card:hover .post-cover {
    transform: scale(1.03);
  }

  .category-badge {
    position: absolute;
    bottom: 0.75rem;
    left: 0.75rem;
    background: rgba(18, 20, 24, 0.9);
    backdrop-filter: blur(4px);
    color: var(--amber-bright);
    font-family: var(--font-mono);
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 0.3rem 0.6rem;
    border-radius: 2px;
    border: 1px solid rgba(229, 169, 59, 0.3);
  }

  .post-card-content {
    padding: var(--inset-card);
    display: flex;
    flex-direction: column;
    flex-grow: 1;
  }

  .post-card-meta {
    font-family: var(--font-mono);
    font-size: 0.76rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(243, 239, 230, 0.65);
    margin-bottom: 0.6rem;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .meta-sep {
    opacity: 0.5;
  }

  .post-card h3 {
    font-family: var(--font-display);
    font-size: 1.25rem;
    font-weight: 700;
    line-height: 1.25;
    margin-bottom: 0.75rem;
    color: var(--paper);
  }

  .post-card-excerpt {
    font-size: 0.92rem;
    line-height: 1.55;
    color: rgba(243, 239, 230, 0.8);
    margin-bottom: 1.25rem;
    flex-grow: 1;
  }

  .card-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-bottom: 1.25rem;
  }

  .tag-pill {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    background: rgba(243, 239, 230, 0.06);
    color: rgba(243, 239, 230, 0.75);
    padding: 0.2rem 0.5rem;
    border-radius: 2px;
  }

  .post-card .read-more {
    font-family: var(--font-mono);
    font-size: 0.85rem;
    color: var(--amber-bright);
    font-weight: 600;
    margin-top: auto;
    display: inline-flex;
    align-items: center;
    min-height: 44px;
  }
</style>
