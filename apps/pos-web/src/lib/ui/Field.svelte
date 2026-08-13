<script lang="ts">
  let {
    label,
    hint,
    error,
    id,
    class: className = '',
    children,
    ...restProps
  }: {
    label?: string;
    hint?: string;
    error?: string;
    id?: string;
    class?: string;
    children?: import('svelte').Snippet;
  } & Record<string, unknown> = $props();
</script>

<div class="field-group {className}" {...restProps}>
  {#if label}
    <label for={id}>{label}</label>
  {/if}
  {@render children?.()}
  {#if hint}
    <p class="ui-field-hint">{hint}</p>
  {/if}
  {#if error}
    <p class="ui-field-error" role="alert">{error}</p>
  {/if}
</div>

<style>
  .ui-field-hint {
    font-size: 0.75rem;
    color: var(--text-dim);
    margin: 0;
    line-height: 1.4;
  }

  .ui-field-error {
    font-size: 0.8125rem;
    color: var(--rose-red);
    margin: 0;
    line-height: 1.4;
  }
</style>
