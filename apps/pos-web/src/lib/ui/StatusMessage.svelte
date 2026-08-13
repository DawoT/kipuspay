<script lang="ts">
  let {
    tone = 'info',
    role = 'status',
    class: className = '',
    children,
    ...restProps
  }: {
    tone?: 'info' | 'danger' | 'warning';
    role?: 'alert' | 'status';
    class?: string;
    children?: import('svelte').Snippet;
  } & Record<string, unknown> = $props();
</script>

<p class="status-alert {tone} {className}" role={role} {...restProps}>
  {@render children?.()}
</p>
