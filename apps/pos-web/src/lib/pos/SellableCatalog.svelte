<script lang="ts">
  import { formatCents } from '$lib/cents';
  import Icon from '$lib/ui/Icon.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { isInventoryOpsEnabled } from '$lib/features';
  import { expiryBadge, stockToDisplay } from '$lib/pharmacy/fefo';
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

  const fefoOn = isInventoryOpsEnabled();
  const pharmacySpec = { unitsPerBlister: 10, blistersPerBox: 10 };

  function normalize(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  const visibleItems = $derived(
    query.trim()
      ? items.filter((item) => {
          const q = normalize(query.trim());
          const haystacks = [
            normalize(item.name),
            normalize(item.sku),
            normalize(item.barcode ?? ''),
            fefoOn ? normalize((item as { activeIngredient?: string | null }).activeIngredient ?? '') : '',
          ];
          return haystacks.some((h) => h.includes(q));
        })
      : items,
  );

  function escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function highlightName(name: string, q: string): string {
    const raw = q.trim();
    if (!raw) return escapeHtml(name);
    const idx = normalize(name).indexOf(normalize(raw));
    if (idx < 0) return escapeHtml(name);
    const before = escapeHtml(name.slice(0, idx));
    const match = escapeHtml(name.slice(idx, idx + raw.length));
    const after = escapeHtml(name.slice(idx + raw.length));
    return `${before}<mark class="pharmacy-mark">${match}</mark>${after}`;
  }

  function stockLabel(item: SellableCatalogItem): string {
    if (!fefoOn) return '';
    try {
      return stockToDisplay(item.stockMicrounits, pharmacySpec);
    } catch {
      return '';
    }
  }

  function expiryFor(item: SellableCatalogItem): ReturnType<typeof expiryBadge> | null {
    if (!fefoOn) return null;
    const raw = (item as { nextExpiryAt?: string | null }).nextExpiryAt ?? null;
    if (!raw) return null;
    return expiryBadge(raw, new Date().toISOString());
  }
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
        placeholder={fefoOn ? 'Buscar medicamento, principio o código' : 'Buscar por nombre, SKU o código'}
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
        {@const badge = expiryFor(item)}
        {@const stock = stockLabel(item)}
        <button
          type="button"
          class="product-item-btn"
          class:product-item-btn--pharmacy={fefoOn}
          onclick={() => onAdd(item)}
          data-testid="add-line-{item.productId}"
        >
          <div class="product-icon"><Icon name="package" size={24} /></div>
          <div class="product-info">
            <span class="product-name">{@html highlightName(item.name, query)}</span>
            <span class="product-sku">{item.sku}</span>
            {#if (item as { activeIngredient?: string | null }).activeIngredient}
              <span class="product-active" data-testid="active-{item.productId}"
                >{ (item as { activeIngredient?: string | null }).activeIngredient }</span
              >
            {/if}
            <span class="product-price tabular-nums">S/ {formatCents(item.unitPriceCents)}</span>
            {#if stock}
              <span class="pharmacy-stock" data-testid="stock-{item.productId}">{stock}</span>
            {/if}
            {#if badge}
              <span
                class="pharmacy-fefo"
                class:fefo-success={badge.tone === 'success'}
                class:fefo-warning={badge.tone === 'warning'}
                class:fefo-danger={badge.tone === 'danger'}
                class:fefo-neutral={badge.tone === 'neutral'}
                data-testid="fefo-{item.productId}"
                role="status"
                aria-label={badge.label}
              >
                <span class="fefo-dot" aria-hidden="true"></span>
                {badge.label}{badge.days !== null && badge.days > 0 && badge.days <= 90 ? ` en ${badge.days} días` : ''}
              </span>
            {/if}
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
  .product-active {
    font-size: 0.75rem;
    color: var(--text-dim);
    font-style: italic;
    margin-top: 0.125rem;
  }
  .pharmacy-stock {
    font-size: 0.75rem;
    color: var(--text-dim);
    margin-top: 0.25rem;
    font-weight: 500;
  }
  .pharmacy-fefo {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.75rem;
    font-weight: 700;
    margin-top: 0.25rem;
    padding: 0.2rem 0.5rem;
    border-radius: 999px;
    line-height: 1;
    min-height: 22px;
  }
  .pharmacy-fefo .fefo-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: 0 0 8px;
  }
  .fefo-success {
    background: color-mix(in srgb, var(--emerald-green) 14%, transparent);
    color: var(--emerald-green);
    border: 1px solid color-mix(in srgb, var(--emerald-green) 30%, transparent);
  }
  .fefo-success .fefo-dot {
    background: var(--emerald-green);
  }
  .fefo-warning {
    background: color-mix(in srgb, #d97706 14%, transparent);
    color: #92400e;
    border: 1px solid color-mix(in srgb, #d97706 30%, transparent);
  }
  .fefo-warning .fefo-dot {
    background: #d97706;
  }
  .fefo-danger {
    background: color-mix(in srgb, #dc2626 14%, transparent);
    color: #991b1b;
    border: 1px solid color-mix(in srgb, #dc2626 30%, transparent);
  }
  .fefo-danger .fefo-dot {
    background: #dc2626;
  }
  .fefo-neutral {
    background: color-mix(in srgb, var(--text-dim) 10%, transparent);
    color: var(--text-dim);
    border: 1px solid var(--border-subtle);
  }
  .fefo-neutral .fefo-dot {
    background: var(--text-dim);
  }
  .product-item-btn--pharmacy {
    min-height: 88px;
  }
  :global(.pharmacy-mark) {
    background: color-mix(in srgb, var(--accent-primary) 22%, transparent);
    color: inherit;
    padding: 0 0.1rem;
    border-radius: 2px;
    font-weight: 700;
  }
</style>
