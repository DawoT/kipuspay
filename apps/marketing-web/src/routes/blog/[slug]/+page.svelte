<script lang="ts">
  import { page } from '$app/stores';
  import { postBySlug } from '$lib/content/blog';
  import { reveal } from '$lib/components/reveal';
  import QuipuSectionMark from '$lib/brand/QuipuSectionMark.svelte';
  import { absoluteUrl, ogImageFor, pageTitle } from '$lib/seo';

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
          datePublished: post.publishedAt,
          author: { '@type': 'Organization', name: post.author },
          articleBody: post.sections.map((s) => `${s.heading}. ${s.body}`).join(' '),
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
    <meta property="og:image" content={ogImageFor()} />
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
        <p class="eyebrow"><a href="/blog">← Volver al Blog</a></p>
        <p class="post-meta tabular-nums">{post.publishedAt} · {post.author}</p>
        <h1 class="post-title">{post.title}</h1>
        <p class="section-lead">{post.excerpt}</p>

        <article class="blog-article" use:reveal>
          {#each post.sections as section (section.heading)}
            <section class="blog-section">
              <h2>{section.heading}</h2>
              <p>{section.body}</p>
            </section>
          {/each}
        </article>

        <div class="cta-row" style="margin-top: 3rem;">
          <a class="btn" href="/empezar">Empieza gratis</a>
          <a class="btn btn-ghost" href="/blog">Ver otras guías</a>
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
  .post-meta {
    font-family: var(--font-mono);
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--muted);
    margin-bottom: 0.9rem;
  }

  .post-title {
    font-family: var(--font-display);
    font-size: var(--step-4);
    font-weight: 700;
    letter-spacing: -0.015em;
    line-height: 1.12;
    max-width: 30ch;
    margin-bottom: 1rem;
  }

  .blog-article {
    display: flex;
    flex-direction: column;
    gap: 1.6rem;
    margin-top: 2.4rem;
    max-width: 44rem;
  }

  .blog-section h2 {
    font-size: 1.3rem;
    font-weight: 700;
    margin-bottom: 0.55rem;
  }

  .blog-section p {
    color: var(--muted);
    line-height: 1.65;
  }
</style>
