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
          articleBody: post.body,
          url: url,
          publisher: {
            '@type': 'Organization',
            name: 'KipusPay',
            logo: 'https://kipuspay.pe/favicon.svg',
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
    <meta property="og:image" content={ogImageFor('home')} />
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
        <h1 style="font-size: var(--step-4); margin-bottom: 1rem;">{post.title}</h1>
        <p class="section-lead">{post.excerpt}</p>

        <div class="blog-article-body" use:reveal>
          <p>{post.body}</p>
        </div>

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
