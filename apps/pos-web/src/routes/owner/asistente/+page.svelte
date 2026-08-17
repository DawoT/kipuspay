<script lang="ts">
  import { isAgenticInsightsEnabled, isOwnerModeEnabled } from '$lib/features';
  import { readAdminAuthenticatedSessionState } from '$lib/admin/authenticated-session';
  import { createInsightsClient, type BriefingDto } from '$lib/insights/insights-client';
  import Button from '$lib/ui/Button.svelte';
import { resolveApiBase } from '$lib/auth/api-client';

  const ownerEnabled = isOwnerModeEnabled();
  const insightsEnabled = isAgenticInsightsEnabled();
  const sessionState = readAdminAuthenticatedSessionState();
  const session = $derived(sessionState?.current ?? null);
  const api = $derived(
    session
      ? createInsightsClient({
          authenticatedFetch: session.authenticatedFetch,
          apiBase: resolveApiBase(localStorage),
        })
      : null,
  );

  let briefing = $state<BriefingDto | null>(null);
  let briefingStatus = $state<'loading' | 'ready' | 'missing'>('loading');
  let question = $state('');
  let answer = $state('');
  let pending = $state(false);
  let error = $state('');
  let message = $state('');
  let briefingBullets = $derived.by(() => {
    if (!briefing) return [] as string[];
    try {
      return (JSON.parse(briefing.briefing) as { bullets?: string[] }).bullets ?? [];
    } catch {
      return [];
    }
  });

  async function loadBriefing() {
    if (!api) return;
    briefingStatus = 'loading';
    try {
      briefing = await api.briefing();
      briefingStatus = briefing ? 'ready' : 'missing';
    } catch {
      briefingStatus = 'missing';
    }
  }

  async function ask() {
    if (!api || pending) return;
    const q = question.trim();
    if (!q) return;
    pending = true;
    error = '';
    answer = '';
    try {
      answer = await api.chat(q, crypto.randomUUID());
      message = 'Respuesta calculada por el servidor.';
    } catch (err) {
      error = 'No se pudo calcular la respuesta. Inténtalo de nuevo.';
    } finally {
      pending = false;
    }
  }

  $effect(() => {
    if (insightsEnabled && api) void loadBriefing();
  });
</script>

<svelte:head><title>Asistente · Modo Dueño · KipusPay</title></svelte:head>

{#if !ownerEnabled}
  <p data-testid="owner-off">El Modo Dueño no está activo para este negocio.</p>
{:else if !insightsEnabled}
  <p data-testid="insights-off">El asistente no está activo para este negocio.</p>
{:else if !session}
  <p data-testid="insights-off">Sin sesión autenticada.</p>
{:else}
  <main class="assistant" data-testid="assistant-page">
    <section class="card" aria-labelledby="briefing-title">
      <div class="card-head">
        <h2 id="briefing-title">Resumen de hoy</h2>
        {#if briefingStatus === 'loading'}
          <span class="muted">Cargando…</span>
        {:else if briefing}
          <span class="muted" data-testid="briefing-stale">
            Datos del {briefing.reportDate}, calculados por el servidor.
          </span>
        {:else}
          <span class="muted" data-testid="briefing-missing">Aún no hay resumen para hoy.</span>
        {/if}
      </div>
      {#if briefing}
        <ul class="bullets" data-testid="briefing-bullets">
          {#each briefingBullets as bullet}
            <li>{bullet}</li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="card" aria-labelledby="chat-title">
      <div class="card-head">
        <h2 id="chat-title">Pregunta sobre tu negocio</h2>
        <span class="muted">El servidor calcula los números; no es una IA que opina.</span>
      </div>
      <form onsubmit={(e) => { e.preventDefault(); void ask(); }}>
        <label class="sr-only" for="question">Pregunta</label>
        <textarea
          id="question"
          data-testid="assistant-question"
          bind:value={question}
          rows="2"
          placeholder="Ej.: ¿cómo van las ventas de ayer?"
        ></textarea>
        <Button variant="primary" type="submit" data-testid="assistant-ask" disabled={pending || !question.trim()} busy={pending}>
          {pending ? 'Calculando…' : 'Preguntar'}
        </Button>
      </form>
      {#if error}
        <p class="error" role="alert" data-testid="assistant-error">{error}</p>
      {/if}
      {#if answer}
        <p class="answer" data-testid="assistant-answer" aria-live="polite">{answer}</p>
      {/if}
      <p class="sr-only" role="status" aria-live="polite">{message}</p>
    </section>
  </main>
{/if}

<style>
  .assistant { display: grid; gap: 1rem; padding: 1rem 1.25rem; }
  .card { background: var(--owner-surface); border: 1px solid var(--owner-border); border-radius: 0.75rem; padding: 1rem; }
  .card-head { display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem; flex-wrap: wrap; }
  h2 { margin: 0 0 0.5rem; font-size: 1.05rem; }
  .muted { color: var(--owner-muted); font-size: 0.8rem; }
  .bullets { margin: 0.5rem 0 0; padding-left: 1.1rem; display: grid; gap: 0.4rem; font-size: 0.92rem; }
  textarea { width: 100%; min-height: 3.5rem; border-radius: 0.5rem; border: 1px solid var(--owner-border); background: var(--owner-bg); color: var(--owner-fg); padding: 0.6rem; font: inherit; }
  .error { color: var(--alerta); font-size: 0.85rem; margin: 0.6rem 0 0; }
  .answer { margin: 0.8rem 0 0; padding: 0.75rem; background: var(--owner-bg); border-radius: 0.5rem; border-left: 3px solid var(--owner-accent); }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; animation: none !important; } }
</style>
