<script lang="ts">
  let {
    size = 12,
    class: className = '',
  }: {
    size?: number;
    class?: string;
  } = $props();
</script>

<span
  class="brand-knot {className}"
  style:width="{size}px"
  style:height="{size}px"
  aria-hidden="true"
></span>

<style>
  .brand-knot {
    display: inline-block;
    flex-shrink: 0;
    background: var(--accent-primary);
    transform: rotate(45deg);
  }
</style>
