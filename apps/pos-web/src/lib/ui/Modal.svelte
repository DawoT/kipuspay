<script lang="ts">
  import Button from './Button.svelte';

  let {
    open = false,
    title,
    tone = 'primary',
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    showConfirm = true,
    showCancel = true,
    busy = false,
    confirmTestid,
    cancelTestid,
    onConfirm,
    onCancel,
    class: className = '',
    children,
    ...restProps
  }: {
    open?: boolean;
    title?: string;
    tone?: 'primary' | 'danger';
    confirmText?: string;
    cancelText?: string;
    showConfirm?: boolean;
    showCancel?: boolean;
    busy?: boolean;
    confirmTestid?: string;
    cancelTestid?: string;
    onConfirm?: () => void;
    onCancel?: () => void;
    class?: string;
    children?: import('svelte').Snippet;
  } & Record<string, unknown> = $props();

  let card = $state<HTMLDivElement>();

  $effect(() => {
    if (!open) return;
    const root = card;
    if (!root) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusable = () =>
      Array.from(
        root.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute('disabled'));
    const focusDialog = () => {
      if (!root.isConnected) return;
      if (root.contains(document.activeElement)) return;
      root.focus();
    };
    focusDialog();
    const raf = requestAnimationFrame(focusDialog);
    const timer = setTimeout(focusDialog, 100);
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (current === root) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && current === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
  });
</script>

{#if open}
  <div class="modal-overlay">
    <div
      class="modal-card {tone === 'danger' ? 'ui-modal-danger' : ''} {className}"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ui-modal-title"
      tabindex="-1"
      bind:this={card}
      {...restProps}
    >
      {#if title}
        <h2 id="ui-modal-title">{title}</h2>
      {/if}
      <div class="ui-modal-body">
        {@render children?.()}
      </div>
      {#if showCancel || showConfirm}
        <div class="modal-actions">
          {#if showCancel}
            <Button
              variant="secondary"
              onclick={onCancel}
              data-testid={cancelTestid}
            >
              {cancelText}
            </Button>
          {/if}
          {#if showConfirm}
            <Button
              variant={tone === 'danger' ? 'danger' : 'primary'}
              busy={busy}
              onclick={onConfirm}
              data-testid={confirmTestid}
            >
              {confirmText}
            </Button>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 300;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
  }

  .modal-card {
    width: min(26rem, 100%);
    background: var(--bg-surface);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    padding: var(--inset-card);
    display: grid;
    gap: 0.6rem;
  }

  .modal-card:global(.ui-modal-danger) {
    border-color: var(--rose-red);
  }

  .modal-card h2 {
    font-family: var(--font-heading);
    margin: 0;
    font-size: 1.1rem;
    color: var(--text-main);
  }

  .ui-modal-body {
    display: grid;
    gap: 0.6rem;
  }

  .modal-actions {
    display: flex;
    gap: 0.75rem;
    margin-top: 0.5rem;
  }

  .modal-actions :global(button) {
    flex: 1;
  }
</style>
