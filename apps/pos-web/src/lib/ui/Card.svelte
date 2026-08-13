<script lang="ts">
  let {
    padding = true,
    class: className = '',
    children,
    ...restProps
  }: {
    padding?: boolean;
    class?: string;
    children?: import('svelte').Snippet;
  } & Record<string, unknown> = $props();
</script>

<section class="glass-card {padding ? 'section-pad' : ''} {className}" {...restProps}>
  {@render children?.()}
</section>
