<script lang="ts">
  import Badge from './Badge.svelte';
  import Icon, { type IconName } from './Icon.svelte';

  let {
    title,
    icon,
    counter,
    class: className = '',
    children,
    ...restProps
  }: {
    title: string;
    icon?: IconName;
    counter?: number | string;
    class?: string;
    children?: import('svelte').Snippet;
  } & Record<string, unknown> = $props();
</script>

<div class="ui-card-header {className}" {...restProps}>
  <div class="ui-card-header-title">
    {#if icon}
      <Icon name={icon} size={16} />
    {/if}
    <h2>{title}</h2>
    {#if counter !== undefined}
      <Badge variant="indigo">{counter}</Badge>
    {/if}
  </div>
  {#if children}
    <div class="ui-card-header-actions">
      {@render children?.()}
    </div>
  {/if}
</div>

<style>
  .ui-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.25rem;
    padding-bottom: 0.875rem;
    border-bottom: 1px solid var(--border-subtle);
  }

  .ui-card-header-title {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    color: var(--text-muted);
  }

  .ui-card-header h2 {
    font-family: var(--font-heading);
    font-size: 1rem;
    font-weight: 700;
    color: var(--text-main);
    margin: 0;
  }

  .ui-card-header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-left: auto;
  }
</style>
