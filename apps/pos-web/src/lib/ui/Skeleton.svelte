<script lang="ts">
  let {
    lines = 1,
    width = '100%',
    class: className = '',
    ...restProps
  }: {
    lines?: number;
    width?: string;
    class?: string;
  } & Record<string, unknown> = $props();
</script>

<div
  class="ui-skeleton {className}"
  style="width: {width}"
  aria-hidden="true"
  {...restProps}
>
  {#each Array(lines) as _}
    <span class="ui-skeleton-line"></span>
  {/each}
</div>

<style>
  .ui-skeleton {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .ui-skeleton-line {
    display: block;
    height: 0.875rem;
    border-radius: var(--radius-sm);
    background: linear-gradient(
      90deg,
      var(--bg-button-sec) 25%,
      var(--bg-glass-hover) 50%,
      var(--bg-button-sec) 75%
    );
    background-size: 200% 100%;
    animation: ui-skeleton-shimmer 1.4s ease-in-out infinite;
  }

  .ui-skeleton-line:last-child {
    width: 60%;
  }

  @keyframes ui-skeleton-shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ui-skeleton-line {
      animation: none;
    }
  }
</style>
