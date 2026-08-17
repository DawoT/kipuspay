<script lang="ts">
  import { tick } from 'svelte';
  import type { TourStep } from '@kipuspay/domain-onboarding';

  interface Props {
    steps: readonly TourStep[];
    onComplete: () => void;
    onDismiss: () => void;
  }

  let { steps, onComplete, onDismiss }: Props = $props();
  let index = $state(0);
  let position = $state<{ left: number; top: number } | null>(null);

  const current = $derived(steps[index] ?? null);
  const isLast = $derived(index === steps.length - 1);

  $effect(() => {
    void highlightTarget();
  });

  async function highlightTarget() {
    position = null;
    await tick();
    const target = document.querySelector(`[data-tour-target="${current?.target}"]`);
    if (!target) return;
    const rect = target.getBoundingClientRect();
    target.classList.add('tour-target-highlight');
    position = {
      left: Math.max(16, Math.min(window.innerWidth - 340, rect.left + rect.width / 2 - 160)),
      top: rect.bottom + 12,
    };
  }

  function next() {
    const target = document.querySelector(`[data-tour-target="${current?.target}"]`);
    target?.classList.remove('tour-target-highlight');
    if (isLast) {
      onComplete();
      return;
    }
    index += 1;
  }
</script>

{#if current}
  <div class="tour-overlay" role="dialog" aria-modal="false" aria-label="Tour del producto" data-testid="tour">
    <div
      class="tour-card"
      style={position ? `left:${position.left}px;top:${position.top}px;` : ''}
    >
      <div class="tour-step-counter">
        <span class="tour-step-num">{index + 1} / {steps.length}</span>
        <span class="tour-step-title">{current.title}</span>
      </div>
      <p class="tour-body" data-testid="tour-body">{current.body}</p>
      <div class="tour-actions">
        <button type="button" class="secondary tour-skip-btn" data-testid="tour-skip" onclick={onDismiss}>
          Omitir
        </button>
        <button type="button" class="primary" data-testid="tour-next" onclick={next}>
          {isLast ? 'Entendido' : 'Siguiente'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .tour-overlay {
    position: fixed;
    inset: 0;
    z-index: 1200;
    background: rgba(2, 6, 23, 0.35);
    pointer-events: none;
  }

  .tour-card {
    position: fixed;
    width: 320px;
    max-width: calc(100vw - 32px);
    background: var(--bg-primary);
    border: 1px solid var(--border-glow, rgba(61, 187, 134, 0.4));
    border-radius: var(--radius-md, 12px);
    padding: 1rem 1.125rem;
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
    pointer-events: auto;
  }

  .tour-step-counter {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .tour-step-num {
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    color: var(--emerald-green);
  }

  .tour-step-title {
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--text-main);
  }

  .tour-body {
    font-size: 0.9rem;
    line-height: 1.5;
    color: var(--text-main);
    margin: 0;
  }

  .tour-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .tour-skip-btn {
    font-size: 0.8rem;
  }

  :global(.tour-target-highlight) {
    outline: 3px solid var(--emerald-green);
    outline-offset: 2px;
    border-radius: 8px;
  }
</style>
