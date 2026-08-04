<script lang="ts">
  import { STUBS } from '$lib/content/home';
  const stub = STUBS.find((s) => s.path === '/precios')!;
</script>

<svelte:head>
  <title>Precios · KipusPay</title>
  <meta name="description" content="Precios KipusPay — se publica en Sprint 11." />
  <meta name="robots" content="noindex" />
</svelte:head>

<main class="stub" data-testid="stub-page">
  <h1>{stub.title}</h1>
  <p class="sprint">Sprint {stub.unlockSprint}</p>
  <p>{stub.blurb}</p>
  <a class="btn" href="/">Volver al inicio</a>
</main>
