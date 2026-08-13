<script lang="ts" generics="T extends object">
  import type { Snippet } from 'svelte';
  import EmptyState from './EmptyState.svelte';

  interface TableColumn {
    label: string;
    align?: 'left' | 'right';
  }

  let {
    columns,
    items = [],
    empty = 'Sin registros',
    cell,
    class: className = '',
    ...restProps
  }: {
    columns: TableColumn[];
    items?: T[];
    empty?: string;
    cell?: Snippet<[T, TableColumn]>;
    class?: string;
  } & Record<string, unknown> = $props();
</script>

<div class="ui-table-wrap" {...restProps}>
  <table class="ui-table {className}">
    <thead>
      <tr>
        {#each columns as col}
          <th class:right={col.align === 'right'}>{col.label}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each items as item}
        <tr>
          {#each columns as col}
            <td class:right={col.align === 'right'}>
              {@render cell?.(item, col)}
            </td>
          {/each}
        </tr>
      {/each}
      {#if items.length === 0}
        <tr>
          <td colspan={columns.length}>
            <EmptyState title={empty} />
          </td>
        </tr>
      {/if}
    </tbody>
  </table>
</div>

<style>
  .ui-table-wrap {
    overflow-x: auto;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
  }

  .ui-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }

  .ui-table th {
    text-align: left;
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    background: var(--bg-button-sec);
    padding: 0.625rem 0.875rem;
    border-bottom: 1px solid var(--border-subtle);
  }

  .ui-table th.right,
  .ui-table td.right {
    text-align: right;
  }

  .ui-table td {
    padding: 0.625rem 0.875rem;
    border-bottom: 1px solid var(--border-subtle);
    color: var(--text-main);
    vertical-align: middle;
  }

  .ui-table tbody tr:last-child td {
    border-bottom: none;
  }

  .ui-table tbody tr:hover td {
    background: var(--bg-glass-hover);
  }
</style>
