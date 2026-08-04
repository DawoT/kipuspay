<script lang="ts">
  import { COMPARE_ROWS } from '$lib/content/compare';
  import { absoluteUrl, pageTitle } from '$lib/seo';

  let { data } = $props();
</script>

<svelte:head>
  <title>{pageTitle(data.page.title)}</title>
  <meta name="description" content={data.page.metaDescription} />
  <link rel="canonical" href={absoluteUrl(`/comparar/${data.page.slug}`)} />
</svelte:head>

<section class="section" data-testid="compare-page">
  <h1>{data.page.title}</h1>
  <p>{data.page.intro}</p>
  <table class="compare-table">
    <thead>
      <tr>
        <th></th>
        <th>Sistemas tradicionales</th>
        <th>KipusPay</th>
      </tr>
    </thead>
    <tbody>
      {#each COMPARE_ROWS as row}
        <tr>
          <th scope="row">{row.label}</th>
          <td>{row.traditional}</td>
          <td>{row.kipus}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  <a class="btn" href="/empezar">Empieza gratis</a>
</section>
