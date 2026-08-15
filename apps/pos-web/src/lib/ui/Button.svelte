<script lang="ts">
  import Icon, { type IconName } from './Icon.svelte';

  let {
    variant = 'primary',
    size = 'md',
    busy = false,
    icon,
    href,

    type = 'button',
    disabled = false,
    class: className = '',
    children,
    ...restProps
  }: {
    variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'ghost';
    size?: 'sm' | 'md' | 'full' | 'xl' | 'lg';
    busy?: boolean;
    icon?: IconName;
    href?: string;

    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
    class?: string;
    children?: import('svelte').Snippet;
  } & Record<string, unknown> = $props();

  const buttonClass = $derived(`ui-btn ui-btn-${variant} ui-btn-${size} ${className}`);
</script>

{#if href}
  <a
    href={href}
    class={buttonClass}
    aria-disabled={disabled || undefined}
    {...restProps}
  >
    {#if icon}
      <Icon name={icon} size={16} />
    {/if}
    {@render children?.()}
  </a>
{:else}
  <button
    {type}
    class={buttonClass}
    disabled={busy || disabled}
    aria-busy={busy || undefined}
    {...restProps}
  >
    {#if busy}
      <span class="ui-btn-spinner" aria-hidden="true"></span>
    {/if}
    {#if icon}
      <Icon name={icon} size={16} />
    {/if}
    {@render children?.()}
  </button>
{/if}

<style>
  .ui-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.625rem 1.25rem;
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 0.9375rem;
    border-radius: var(--radius-md);
    border: 1px solid transparent;
    color: var(--text-main);
    cursor: pointer;
    transition: all var(--transition-fast);
    text-decoration: none;
    user-select: none;
    min-height: 44px;
  }

  .ui-btn:active {
    transform: scale(0.98);
  }

  .ui-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    transform: none !important;
    box-shadow: none !important;
  }

  .ui-btn:focus-visible {
    outline: 3px solid rgba(217, 154, 61, 0.55);
    outline-offset: 2px;
  }

  .ui-btn-primary {
    background: var(--accent-gradient);
    color: #14161c;
    font-weight: 700;
    box-shadow: 0 4px 14px rgba(217, 154, 61, 0.35);
  }
  .ui-btn-primary:hover:not(:disabled) {
    box-shadow: 0 6px 20px rgba(217, 154, 61, 0.5);
    filter: brightness(1.08);
  }

  .ui-btn-secondary {
    background: var(--bg-button-sec);
    border-color: var(--border-subtle);
    color: var(--text-main);
  }
  .ui-btn-secondary:hover:not(:disabled) {
    background: var(--bg-glass-hover);
    border-color: var(--border-strong);
  }

  .ui-btn-success {
    background: var(--emerald-gradient);
    color: #ffffff;
    box-shadow: var(--shadow-emerald);
  }

  .ui-btn-danger {
    background: rgba(217, 106, 60, 0.12);
    border-color: rgba(217, 106, 60, 0.3);
    color: var(--rose-red);
  }
  .ui-btn-danger:hover:not(:disabled) {
    background: rgba(217, 106, 60, 0.2);
    border-color: rgba(217, 106, 60, 0.5);
  }

  .ui-btn-ghost {
    background: transparent;
    color: var(--text-muted);
  }
  .ui-btn-ghost:hover:not(:disabled) {
    color: var(--text-main);
  }

  .ui-btn-sm {
    padding: 0.375rem 0.875rem;
    font-size: 0.8125rem;
    min-height: 44px;
  }

  .ui-btn-lg {
    min-height: 48px;
  }

  .ui-btn-full {
    width: 100%;
  }

  .ui-btn-xl {
    width: 100%;
    padding: 1rem;
    font-size: 1.125rem;
    letter-spacing: 0.02em;
  }

  .ui-btn-spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid rgba(255, 255, 255, 0.35);
    border-top-color: currentColor;
    border-radius: 50%;
    animation: ui-btn-spin 0.7s linear infinite;
  }

  @keyframes ui-btn-spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
