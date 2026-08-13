<script lang="ts">
  let {
    variant = 'muted',
    dot = false,
    class: className = '',
    children,
    ...restProps
  }: {
    variant?: 'muted' | 'indigo' | 'warning' | 'success' | 'danger' | 'online' | 'offline' | 'amber';
    dot?: boolean;
    class?: string;
    children?: import('svelte').Snippet;
  } & Record<string, unknown> = $props();
</script>

<span class="badge badge-{variant} {className}" {...restProps}>
  {#if dot}
    <span class="ui-badge-dot" aria-hidden="true"></span>
  {/if}
  {@render children?.()}
</span>

<style>
  .ui-badge-dot {
    width: 6px;
    height: 6px;
    min-width: 6px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.9;
  }
</style>
