<script lang="ts">
  import { page } from '$app/stores';
  import { postBySlug } from '$lib/content/blog';
  import { ogImageFor } from '$lib/seo';

  const post = $derived(postBySlug($page.params.slug ?? ''));
</script>

<svelte:head>
  {#if post}
    <title>{post.title} · KipusPay</title>
    <meta name="description" content={post.excerpt} />
    <meta property="og:image" content={ogImageFor('home')} />
  {:else}
    <title>Articulo · KipusPay</title>
    <meta name="robots" content="noindex" />
  {/if}
</svelte:head>

<section class="section section-paper" data-testid="blog-post">
  <div class="section-frame">
    <div class="section-body">
      {#if post}
        <p class="eyebrow"><a href="/blog">Blog</a></p>
        <h1>{post.title}</h1>
        <p class="section-lead">{post.excerpt}</p>
        <p>{post.body}</p>
        <a class="btn" href="/empezar">Empieza gratis</a>
      {:else}
        <h1>No encontramos este articulo</h1>
        <a href="/blog">Volver al blog</a>
      {/if}
    </div>
  </div>
</section>
