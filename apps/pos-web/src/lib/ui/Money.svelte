<script lang="ts">
  import { formatMoney } from './money';

  let {
    cents = 0,
    class: className = '',
    ...restProps
  }: {
    cents?: number;
    class?: string;
  } & Record<string, unknown> = $props();
</script>

<span class="tabular-nums {className}" {...restProps}>
  {formatMoney(cents)}
</span>
