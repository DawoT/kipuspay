<script lang="ts">
  import VerticalLandingView from '$lib/components/VerticalLandingView.svelte';
  import { pageTitle, absoluteUrl } from '$lib/seo';

  let { data } = $props();
</script>

<svelte:head>
  <title>{pageTitle(data.landing.title)}</title>
  <meta name="description" content={data.landing.metaDescription} />
  <meta property="og:title" content={data.landing.hook} />
  <meta property="og:description" content={data.landing.metaDescription} />
  <link rel="canonical" href={absoluteUrl(`/para/${data.landing.slug}`)} />
</svelte:head>

<VerticalLandingView landing={data.landing} />

