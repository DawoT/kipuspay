<script lang="ts">
  import { computeSetupProgress, type SetupServerState } from '@kipuspay/domain-onboarding';
  import Icon from '$lib/ui/Icon.svelte';

  interface Props {
    server: SetupServerState;
    printerReady: boolean;
  }

  let { server, printerReady }: Props = $props();

  const progress = $derived(computeSetupProgress(server, printerReady));
</script>

<section class="glass-panel checklist-card" data-testid="setup-checklist">
  <div class="checklist-header">
    <div>
      <span class="badge badge-indigo">Segundo día</span>
      <h3 class="checklist-title">Tu negocio listo</h3>
    </div>
    <span class="checklist-percent tabular-nums" data-testid="setup-percent">
      {progress.percent}%
    </span>
  </div>
  <div class="progress-track" aria-label="Progreso del setup">
    <div class="progress-fill" style="width:{progress.percent}%;"></div>
  </div>
  <ul class="checklist-steps">
    {#each progress.steps as step}
      <li class="checklist-step" data-testid={`setup-step-${step.id}`} class:done={step.done}>
        <span class="step-dot">
          {#if step.done}
            <Icon name="check" size={12} />
          {/if}
        </span>
        <div class="step-copy">
          <span class="step-title">{step.title}</span>
          <span class="step-hint">{step.hint}</span>
        </div>
      </li>
    {/each}
  </ul>
  {#if progress.isComplete}
    <p class="checklist-done-msg" data-testid="setup-complete">
      ¡Listo! Tu negocio quedó configurado para vender todos los días.
    </p>
  {/if}
</section>

<style>
  .checklist-card {
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
  }

  .checklist-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
  }

  .checklist-title {
    margin-top: 0.25rem;
    font-size: 1.125rem;
    font-weight: 800;
  }

  .checklist-percent {
    font-size: 1.5rem;
    font-weight: 800;
    color: var(--emerald-green, #3dbb86);
  }

  .progress-track {
    height: 8px;
    border-radius: 999px;
    background: rgba(148, 163, 184, 0.18);
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    border-radius: 999px;
    background: var(--emerald-gradient, linear-gradient(135deg, #3dbb86 0%, #0f6b4c 100%));
    transition: width 0.4s ease;
  }

  .checklist-steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .checklist-step {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    opacity: 0.65;
  }

  .checklist-step.done {
    opacity: 1;
  }

  .step-dot {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid rgba(148, 163, 184, 0.4);
    display: grid;
    place-items: center;
    color: #0f172a;
  }

  .checklist-step.done .step-dot {
    background: var(--emerald-green, #3dbb86);
    border-color: var(--emerald-green, #3dbb86);
  }

  .step-copy {
    display: flex;
    flex-direction: column;
  }

  .step-title {
    font-size: 0.875rem;
    font-weight: 600;
  }

  .step-hint {
    font-size: 0.75rem;
    color: var(--text-muted, #94a3b8);
  }

  .checklist-done-msg {
    margin: 0;
    font-size: 0.875rem;
    color: var(--emerald-green, #3dbb86);
    font-weight: 600;
  }
</style>
