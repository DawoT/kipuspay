<script lang="ts">
  import { STUBS } from '$lib/content/home';
  const stub = STUBS.find((s) => s.path === '/blog')!;
</script>

<svelte:head>
  <title>Blog · KipusPay</title>
  <meta name="description" content="Blog KipusPay — Sprint 12." />
  <meta name="robots" content="noindex" />
</svelte:head>

<main class="stub" data-testid="stub-page">
  <h1>{stub.title}</h1>
  <p class="sprint">Sprint {stub.unlockSprint}</p>
  <p>{stub.blurb}</p>
  <a class="btn" href="/">Volver al inicio</a>
</main>
