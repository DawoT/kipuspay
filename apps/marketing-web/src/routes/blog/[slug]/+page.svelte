<script lang="ts">
  import { page } from '$app/stores';
  import { postBySlug } from '$lib/content/blog';
  import { reveal } from '$lib/components/reveal';
  import QuipuSectionMark from '$lib/brand/QuipuSectionMark.svelte';
  import { absoluteUrl, pageTitle } from '$lib/seo';

  const slug = $derived($page.params.slug ?? '');
  const post = $derived(postBySlug(slug));
  const url = $derived(absoluteUrl(`/blog/${slug}`));

  const articleLd = $derived(
    post
      ? JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: post.title,
          description: post.excerpt,
          datePublished: post.date,
          image: absoluteUrl(post.coverImage),
          author: { '@type': 'Organization', name: 'Equipo KipusPay' },
          articleBody: post.sections
            .map((s) => `${s.heading}. ${s.paragraphs.join(' ')}`)
            .join(' '),
          url: url,
          publisher: {
            '@type': 'Organization',
            name: 'KipusPay',
            logo: 'https://kipuspay.com/favicon.svg',
          },
        })
      : null,
  );
</script>

<svelte:head>
  {#if post}
    <title>{pageTitle(post.title)}</title>
    <meta name="description" content={post.excerpt} />
    <meta property="og:title" content={post.title} />
    <meta property="og:description" content={post.excerpt} />
    <meta property="og:type" content="article" />
    <meta property="og:url" content={url} />
    <meta property="og:image" content={absoluteUrl(post.coverImage)} />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={post.title} />
    <meta name="twitter:description" content={post.excerpt} />
    <meta name="twitter:image" content={absoluteUrl(post.coverImage)} />
    <link rel="canonical" href={url} />
    {#if articleLd}
      <script type="application/ld+json">{@html articleLd}</script>
    {/if}
  {:else}
    <title>Artículo · KipusPay</title>
    <meta name="robots" content="noindex" />
  {/if}
</svelte:head>

<section class="section section-paper" data-testid="blog-post">
  <div class="section-frame">
    <div class="section-gutter" aria-hidden="true" use:reveal>
      <QuipuSectionMark state="entry" tone="paper" />
    </div>
    <div class="section-body">
      {#if post}
        <nav aria-label="Migas de pan" class="breadcrumbs">
          <ol>
            <li><a href="/">Inicio</a></li>
            <li aria-hidden="true">/</li>
            <li><a href="/blog">Blog</a></li>
            <li aria-hidden="true">/</li>
            <li aria-current="page"><span>{post.category}</span></li>
          </ol>
        </nav>

        <header class="post-header">
          <div class="post-meta-badges">
            <span class="category-badge">{post.category}</span>
            <span class="meta-item">{post.readingTimeMinutes} min de lectura</span>
            <span class="meta-sep" aria-hidden="true">·</span>
            <time class="meta-item" datetime={post.date}>{post.date}</time>
          </div>
          <h1 class="post-title">{post.title}</h1>
          <p class="section-lead">{post.excerpt}</p>
          <p class="post-audience">
            <strong>Dirigido a:</strong> {post.audience}
          </p>
        </header>

        <figure class="article-cover-figure" use:reveal>
          <img
            src={post.coverImage}
            alt={post.coverAlt}
            class="article-cover-img"
            width="1200"
            height="675"
          />
          <figcaption class="article-cover-caption">{post.coverAlt}</figcaption>
        </figure>

        <article class="blog-article" use:reveal>
          {#each post.sections as section (section.heading)}
            <section class="blog-section">
              <h2>{section.heading}</h2>
              {#each section.paragraphs as paragraph}
                <p>{paragraph}</p>
              {/each}
            </section>
          {/each}
        </article>

        {#if post.tags && post.tags.length > 0}
          <div class="article-tags-wrap" use:reveal>
            <span class="tags-label">Temas relacionados:</span>
            <div class="tags-list">
              {#each post.tags as tag}
                <span class="tag-item">{tag}</span>
              {/each}
            </div>
          </div>
        {/if}

        {#if post.contextualCta}
          <aside class="contextual-cta-box" aria-label="Llamada a la acción" use:reveal>
            <div class="cta-inner">
              <h3>{post.contextualCta.title}</h3>
              <p>{post.contextualCta.description}</p>
              <a class="btn" href={post.contextualCta.buttonHref}>
                {post.contextualCta.buttonText}
              </a>
            </div>
          </aside>
        {/if}

        <div class="cta-row" style="margin-top: 3rem;">
          <a class="btn btn-ghost" href="/blog">← Ver todas las guías</a>
          <a class="btn" href="/empezar">Empieza gratis</a>
        </div>
      {:else}
        <h1>No encontramos este artículo</h1>
        <p class="section-lead">El artículo que buscas no existe o fue movido.</p>
        <a class="btn" href="/blog">Volver al blog</a>
      {/if}
    </div>
  </div>
</section>

<style>
  .breadcrumbs {
    margin-bottom: 1.5rem;
    font-family: var(--font-mono);
    font-size: 0.82rem;
  }

  .breadcrumbs ol {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    color: var(--muted);
  }

  .breadcrumbs a {
    color: var(--muted);
    text-decoration: none;
  }

  .breadcrumbs a:hover {
    color: var(--ink);
    text-decoration: underline;
  }

  .breadcrumbs [aria-current='page'] {
    color: var(--ink);
    font-weight: 600;
  }

  .post-header {
    margin-bottom: 2rem;
  }

  .post-meta-badges {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem;
    margin-bottom: 1rem;
    font-family: var(--font-mono);
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .category-badge {
    background: rgba(229, 169, 59, 0.2);
    color: #925400;
    padding: 0.25rem 0.6rem;
    border-radius: 2px;
    font-weight: 700;
  }

  .meta-item {
    color: var(--muted);
  }

  .meta-sep {
    color: var(--muted);
    opacity: 0.6;
  }

  .post-title {
    font-family: var(--font-display);
    font-size: clamp(1.8rem, 3.5vw, 2.5rem);
    font-weight: 700;
    letter-spacing: -0.015em;
    line-height: 1.15;
    max-width: 32ch;
    margin-bottom: 1rem;
    color: var(--ink);
  }

  .post-audience {
    font-size: 0.9rem;
    color: var(--muted);
    margin-top: 0.75rem;
  }

  .article-cover-figure {
    margin: 0 0 2.5rem 0;
    max-width: 48rem;
  }

  .article-cover-img {
    width: 100%;
    height: auto;
    border-radius: 4px;
    border: 1px solid var(--line);
    display: block;
  }

  .article-cover-caption {
    font-size: 0.8rem;
    font-style: italic;
    color: var(--muted);
    margin-top: 0.5rem;
  }

  .blog-article {
    display: flex;
    flex-direction: column;
    gap: 2.2rem;
    max-width: 46rem;
  }

  .blog-section h2 {
    font-size: 1.4rem;
    font-weight: 700;
    margin-bottom: 0.75rem;
    color: var(--ink);
    line-height: 1.25;
  }

  .blog-section p {
    color: rgba(26, 29, 35, 0.88);
    font-size: 1.05rem;
    line-height: 1.7;
    margin-bottom: 0.9rem;
  }

  .blog-section p:last-child {
    margin-bottom: 0;
  }

  .article-tags-wrap {
    margin-top: 2.5rem;
    padding-top: 1.5rem;
    border-top: 1px solid var(--line);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    max-width: 46rem;
  }

  .tags-label {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--muted);
  }

  .tags-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .tag-item {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    background: rgba(0, 0, 0, 0.05);
    color: var(--ink);
    padding: 0.2rem 0.6rem;
    border-radius: 2px;
  }

  .contextual-cta-box {
    margin-top: 3rem;
    max-width: 46rem;
    background: var(--ink-2);
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: var(--inset-card);
    color: var(--paper);
  }

  .cta-inner h3 {
    font-family: var(--font-display);
    font-size: 1.35rem;
    font-weight: 700;
    margin-bottom: 0.6rem;
    color: var(--paper);
  }

  .cta-inner p {
    font-size: 0.95rem;
    line-height: 1.55;
    color: rgba(243, 239, 230, 0.85);
    margin-bottom: 1.25rem;
  }
</style>
