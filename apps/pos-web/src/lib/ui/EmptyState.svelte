<script lang="ts">
  import Icon, { type IconName } from './Icon.svelte';

  let {
    icon = 'box',
    title = 'Sin datos',
    description,
    class: className = '',
    children,
    ...restProps
  }: {
    icon?: IconName;
    title?: string;
    description?: string;
    class?: string;
    children?: import('svelte').Snippet;
  } & Record<string, unknown> = $props();
</script>

<div class="ui-empty {className}" {...restProps}>
  <span class="ui-empty-icon" aria-hidden="true">
    <Icon name={icon} size={20} />
    <span class="ui-empty-knot"></span>
  </span>
  <p class="ui-empty-title">{title}</p>
  {#if description}
    <p class="ui-empty-desc">{description}</p>
  {/if}
  {#if children}
    <div class="ui-empty-action">
      {@render children?.()}
    </div>
  {/if}
</div>

<style>
  .ui-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.875rem;
    padding: 2rem 1.5rem;
    text-align: center;
    color: var(--text-muted);
    background: var(--bg-ledger-card);
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius-md);
    animation: ui-empty-in 0.32s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .ui-empty-icon {
    position: relative;
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    background: var(--bg-button-sec);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .ui-empty-icon :global(.kipus-icon) {
    opacity: 0.9;
  }

  .ui-empty-knot {
    position: absolute;
    right: -5px;
    top: -5px;
    width: 10px;
    height: 10px;
    background: var(--accent-primary);
    transform: rotate(45deg);
    border: 1px solid var(--bg-ledger-card);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
  }

  .ui-empty-title {
    margin: 0;
    font-family: var(--font-heading);
    font-weight: 700;
    font-size: 1rem;
    letter-spacing: -0.015em;
    line-height: 1.3;
    color: var(--text-main);
  }

  .ui-empty-desc {
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.6;
    color: var(--text-muted);
    max-width: 36ch;
    text-wrap: balance;
  }

  .ui-empty-action {
    margin-top: 0.5rem;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
  }

  .ui-empty-action :global(.ui-btn),
  .ui-empty-action :global(button),
  .ui-empty-action :global(a) {
    min-height: 44px;
  }

  @keyframes ui-empty-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ui-empty {
      animation: none;
    }
  }
</style>
