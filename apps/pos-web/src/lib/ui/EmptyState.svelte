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
  <Icon name={icon} size={24} />
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
    gap: 0.5rem;
    padding: 1.5rem 1rem;
    text-align: center;
    color: var(--text-muted);
  }

  .ui-empty :global(.kipus-icon) {
    opacity: 0.55;
  }

  .ui-empty-title {
    margin: 0;
    font-weight: 700;
    font-size: 0.9375rem;
    color: var(--text-muted);
  }

  .ui-empty-desc {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--text-dim);
    max-width: 40ch;
  }

  .ui-empty-action {
    margin-top: 0.25rem;
  }
</style>
