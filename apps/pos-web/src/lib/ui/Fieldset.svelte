<script lang="ts">
  let {
    title,
    hint,
    class: className = '',
    children,
    ...restProps
  }: {
    title?: string;
    hint?: string;
    class?: string;
    children?: import('svelte').Snippet;
  } & Record<string, unknown> = $props();
</script>

<fieldset class="ui-fieldset {className}" {...restProps}>
  {#if title}
    <legend>{title}</legend>
  {/if}
  {#if hint}
    <p class="ui-fieldset-hint">{hint}</p>
  {/if}
  {@render children?.()}
</fieldset>

<style>
  .ui-fieldset {
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 1rem;
    margin: 0;
    min-width: 0;
  }

  .ui-fieldset legend {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--accent-primary);
    padding: 0 0.375rem;
  }

  .ui-fieldset-hint {
    font-size: 0.75rem;
    color: var(--text-dim);
    margin: 0 0 0.75rem;
  }
</style>
