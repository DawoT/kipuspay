import { SellableCatalogError, type SellableCatalogItem } from './sellable-catalog-client.js';

export interface SellableCatalogLoaderState {
  readonly items: readonly SellableCatalogItem[];
  readonly loading: boolean;
  readonly error: string;
}

export interface SellableCatalogLoader {
  readonly state: SellableCatalogLoaderState;
  refresh(input: { readonly tenantId: string; readonly enabled: boolean }): Promise<void>;
  dispose(): void;
}

export function createSellableCatalogLoader(input: {
  readonly fetchCatalog: (input: {
    readonly tenantId: string;
    readonly signal: AbortSignal;
  }) => Promise<readonly SellableCatalogItem[]>;
  readonly onChange?: (state: SellableCatalogLoaderState) => void;
}): SellableCatalogLoader {
  let requestId = 0;
  let controller: AbortController | undefined;
  let current: SellableCatalogLoaderState = { items: [], loading: false, error: '' };

  const publish = (next: SellableCatalogLoaderState) => {
    current = next;
    input.onChange?.(next);
  };

  const refresh = async ({
    tenantId,
    enabled,
  }: {
    readonly tenantId: string;
    readonly enabled: boolean;
  }) => {
    const id = ++requestId;
    controller?.abort();
    controller = undefined;

    if (!enabled || !tenantId) {
      publish({ items: [], loading: false, error: '' });
      return;
    }

    const nextController = new AbortController();
    controller = nextController;
    publish({ items: [], loading: true, error: '' });
    try {
      const items = await input.fetchCatalog({ tenantId, signal: nextController.signal });
      if (id !== requestId || nextController.signal.aborted) return;
      publish({ items, loading: false, error: '' });
    } catch (error) {
      if (id !== requestId || nextController.signal.aborted) return;
      if (error instanceof SellableCatalogError && error.code === 'FEATURE_OFF') {
        publish({ items: [], loading: false, error: '' });
        return;
      }
      publish({
        items: [],
        loading: false,
        error: 'No se pudo cargar el catálogo. La venta rápida sigue disponible.',
      });
    }
  };

  return {
    get state() {
      return current;
    },
    refresh,
    dispose() {
      requestId += 1;
      controller?.abort();
      controller = undefined;
    },
  };
}
