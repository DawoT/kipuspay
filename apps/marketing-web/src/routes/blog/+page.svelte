<script lang="ts">
  import { publishedPosts } from '$lib/content/blog';
  import { ogImageFor } from '$lib/seo';

  const posts = publishedPosts();
</script>

<svelte:head>
  <title>Blog · KipusPay</title>
  <meta name="description" content="Guias practicas para comercios: primera venta, referidos y formalizacion." />
  <meta property="og:image" content={ogImageFor('home')} />
</svelte:head>

<section class="section section-paper" data-testid="blog-page">
  <div class="section-frame">
    <div class="section-body">
      <p class="eyebrow">Blog</p>
      <h1>Guias cortas para el dueno, no para el ingeniero.</h1>
      <p class="section-lead">Contenido del growth loop: onboarding, referidos y formalizacion.</p>
      <ul class="post-list">
        {#each posts as post (post.slug)}
          <li>
            <a href={`/blog/${post.slug}`} data-testid="blog-post-link">
              <strong>{post.title}</strong>
              <span>{post.excerpt}</span>
            </a>
          </li>
        {/each}
      </ul>
    </div>
  </div>
</section>
