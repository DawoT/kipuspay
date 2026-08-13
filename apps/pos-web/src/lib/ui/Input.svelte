<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';

  let {
    value = $bindable(''),
    type = 'text',
    id,
    placeholder,
    inputmode,
    autocomplete,
    class: className = '',
    ...restProps
  }: {
    value?: string | number;
    type?: HTMLInputAttributes['type'];
    id?: string;
    placeholder?: string;
    inputmode?: HTMLInputAttributes['inputmode'];
    autocomplete?: HTMLInputAttributes['autocomplete'];
    class?: string;
  } & Record<string, unknown> = $props();
</script>

<input
  {type}
  {id}
  {placeholder}
  {inputmode}
  {autocomplete}
  class="ui-input {className}"
  bind:value
  {...restProps}
/>

<style>
  .ui-input {
    min-height: 44px;
    width: 100%;
    padding: 0.625rem 0.875rem;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    color: var(--text-main);
    font-family: var(--font-sans);
    font-size: 0.9375rem;
    transition:
      border-color var(--transition-fast),
      box-shadow var(--transition-fast);
    outline: none;
  }

  .ui-input:focus {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px rgba(217, 154, 61, 0.25);
  }

  .ui-input:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
</style>
