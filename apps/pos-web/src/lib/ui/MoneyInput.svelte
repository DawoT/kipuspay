<script lang="ts">
  import { parseSolesToCents } from './money';

  let {
    value = $bindable<number | null>(null),
    min = 1,
    id,
    placeholder = '0.00',
    disabled = false,
    class: className = '',
    ...restProps
  }: {
    value?: number | null;
    min?: number;
    id?: string;
    placeholder?: string;
    disabled?: boolean;
    class?: string;
  } & Record<string, unknown> = $props();

  let raw = $state(value === null ? '' : String(value));
  let committed = $state(value);

  $effect(() => {
    if (value !== committed) {
      committed = value;
      raw = value === null ? '' : String(value);
    }
  });

  function onInput(e: Event) {
    raw = (e.currentTarget as HTMLInputElement).value;
  }

  function onBlur() {
    const parsed = parseSolesToCents(raw);
    if (parsed === null || parsed < min) {
      raw = committed === null ? '' : String(committed);
      return;
    }
    committed = parsed;
    value = parsed;
    raw = String(parsed);
  }
</script>

<input
  {id}
  {placeholder}
  {disabled}
  class="ui-money-input {className}"
  type="text"
  inputmode="decimal"
  autocomplete="off"
  value={raw}
  oninput={onInput}
  onblur={onBlur}
  {...restProps}
/>

<style>
  .ui-money-input {
    min-height: 44px;
    width: 100%;
    padding: var(--inset-field);
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    color: var(--text-main);
    font-family: var(--font-mono);
    font-size: 0.9375rem;
    font-variant-numeric: tabular-nums;
    transition:
      border-color var(--transition-fast),
      box-shadow var(--transition-fast);
    outline: none;
  }

  .ui-money-input:focus {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px rgba(217, 154, 61, 0.25);
  }

  .ui-money-input:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
</style>
