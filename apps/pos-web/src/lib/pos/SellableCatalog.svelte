<script lang="ts">
  import { formatCents } from '$lib/cents';
  import Icon from '$lib/ui/Icon.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Button from '$lib/ui/Button.svelte';
  import type { SellableCatalogItem } from '$lib/catalog/sellable-catalog-client';

  let {
    items,
    loading,
    error,
    catalogOn,
    onAdd,
    query = $bindable(''),
    onQuickSale,
  }: {
    items: SellableCatalogItem[];
    loading: boolean;
    error: string;
    catalogOn: boolean;
    onAdd: (item: SellableCatalogItem) => void;
    query?: string;
    onQuickSale?: () => void;
  } = $props();

  const visibleItems = $derived(
    query.trim()
      ? items.filter((item) => {
          const q = query.trim().toLowerCase();
          return (
            item.name.toLowerCase().includes(q) ||
            item.sku.toLowerCase().includes(q) ||
            (item.barcode ?? '').toLowerCase().includes(q)
          );
        })
      : items,
  );
</script>

<section class="ledger-card catalog-card" data-testid="sellable-catalog">
  <div class="card-header catalog-header">
    <h2>Catálogo</h2>
    {#if !loading && items.length > 0}
      <span class="badge badge-indigo">{items.length} items</span>
    {/if}
  </div>

  {#if catalogOn}
    <div class="catalog-search">
      <Icon name="search" size={16} class="catalog-search-icon" />
      <input
        type="search"
        class="catalog-search-input"
        placeholder="Buscar por nombre, SKU o código"
        aria-label="Buscar productos"
        autocomplete="off"
        bind:value={query}
      />
    </div>
  {/if}

  {#if loading}
    <div class="catalog-skeleton">
      <Skeleton lines={4} />
    </div>
  {:else if error}
    <StatusMessage tone="warning" role="status">
      <Icon name="alert" size={16} />
      <span>{error}</span>
    </StatusMessage>
  {:else if !catalogOn}
    <EmptyState
      icon="layers"
      title="Catálogo desactivado"
      description="El catálogo no está disponible para esta tienda. La venta rápida sigue disponible."
    >
      {#if onQuickSale}
        <Button variant="secondary" data-testid="catalog-empty-quick" onclick={onQuickSale}>
          Venta rápida
        </Button>
      {/if}
    </EmptyState>
  {:else if visibleItems.length === 0}
    <EmptyState
      icon="search"
      title={query ? 'Sin coincidencias' : 'Catálogo vacío'}
      description={query ? 'Prueba con otro nombre, SKU o código.' : 'Sube tu catálogo para empezar a cobrar. La venta rápida sigue disponible.'}
    >
      {#if onQuickSale}
        <Button variant="primary" data-testid="catalog-empty-quick" onclick={onQuickSale}>
          Venta rápida
        </Button>
      {/if}
    </EmptyState>
  {:else}
    <div class="products-grid">
      {#each visibleItems as item (item.productId)}
        <button
          type="button"
          class="product-item-btn"
          onclick={() => onAdd(item)}
          data-testid="add-line-{item.productId}"
        >
          <div class="product-icon"><Icon name="package" size={24} /></div>
          <div class="product-info">
            <span class="product-name">{item.name}</span>
            <span class="product-sku">{item.sku}</span>
            <span class="product-price tabular-nums">S/ {formatCents(item.unitPriceCents)}</span>
          </div>
          <span class="add-badge">+ Añadir</span>
        </button>
      {/each}
    </div>
  {/if}
</section>

<style>
  .catalog-header {
    margin-bottom: 0.75rem;
  }
  .catalog-search {
    position: relative;
    margin-bottom: 0.875rem;
  }
  .catalog-search :global(.catalog-search-icon) {
    position: absolute;
    left: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-dim);
    pointer-events: none;
  }
  .catalog-search-input {
    min-height: 44px;
    padding-left: 2.4rem;
  }
  .catalog-skeleton {
    padding: 0.25rem 0;
  }
  .products-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 0.75rem;
  }
  .product-item-btn {
    background: var(--bg-ledger-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 1rem;
    display: flex;
    align-items: center;
    gap: 0.875rem;
    text-align: left;
    color: var(--text-main);
    transition: all var(--transition-smooth);
    cursor: pointer;
  }
  .product-item-btn:hover {
    background: var(--bg-glass-hover);
    border-color: var(--accent-primary);
  }
  .product-icon {
    font-size: 1.75rem;
    color: var(--text-main);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .product-info {
    display: flex;
    flex-direction: column;
    flex: 1;
    color: var(--text-main);
  }
  .product-name {
    font-weight: 600;
    font-size: 0.9375rem;
    color: var(--text-main);
  }
  .product-sku {
    font-size: 0.6875rem;
    color: var(--text-dim);
    font-family: var(--font-mono);
    margin-top: 0.125rem;
  }
  .product-price {
    color: var(--emerald-green);
    font-weight: 700;
    font-size: 1rem;
  }
  .add-badge {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--accent-primary);
  }
</style>
