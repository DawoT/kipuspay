<script lang="ts">
  import VerticalLandingView from '$lib/components/VerticalLandingView.svelte';
  import { pageTitle, absoluteUrl, ogImageFor } from '$lib/seo';

  let { data } = $props();

  const url = $derived(absoluteUrl(`/para/${data.landing.slug}`));

  const breadcrumbLd = $derived(
    JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'KipusPay', item: absoluteUrl('/') },
        {
          '@type': 'ListItem',
          position: 2,
          name: data.landing.navLabel,
          item: url,
        },
      ],
    }),
  );

  const faqLd = $derived(
    JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: data.landing.faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    }),
  );
</script>

<svelte:head>
  <title>{pageTitle(data.landing.title)}</title>
  <meta name="description" content={data.landing.metaDescription} />
  <meta property="og:title" content={data.landing.hook} />
  <meta property="og:description" content={data.landing.metaDescription} />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={url} />
  <meta property="og:image" content={ogImageFor(data.landing.slug)} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <link rel="canonical" href={url} />
  <script type="application/ld+json">{@html breadcrumbLd}</script>
  <script type="application/ld+json">{@html faqLd}</script>
</svelte:head>

<VerticalLandingView landing={data.landing} />
