import { isCatalogPriceLabelsEnabled } from '../features.js';

export { isCatalogPriceLabelsEnabled };

export interface PriceLabelBatchProduct {
  readonly productId: string;
  readonly copies: number;
}

export interface PriceLabelBatchRequest {
  readonly products: readonly PriceLabelBatchProduct[];
  readonly templateId: string;
  readonly priceListId?: string;
  readonly idempotencyKey: string;
}

export interface PriceLabelBatchItemDto {
  readonly itemId: string;
  readonly productId: string;
  readonly ordinal: number;
  readonly productName: string;
  readonly priceCents: number;
  readonly barcodeType: 'EAN8' | 'EAN13' | 'CODE128';
  readonly barcodeValue: string;
  readonly templateVersion: number;
  readonly priceSource: 'PRICE_LIST' | 'PRODUCT_DEFAULT';
  readonly resolvedAt: string;
  readonly resolutionVersion: string;
  readonly renderedPayloadHash: string;
  readonly renderedPayloadHex: string;
  readonly status: 'PENDING' | 'ACKED' | 'FAILED';
}

export interface PriceLabelBatchDto {
  readonly batchId: string;
  readonly branchId: string;
  readonly templateId: string;
  readonly priceListId: string;
  readonly priceListIdentity: 'EXPLICIT' | 'BRANCH_DEFAULT' | 'TENANT_DEFAULT';
  readonly reprintOfBatchId: string | null;
  readonly snapshotHash: string;
  readonly status: 'PENDING' | 'PRINTING' | 'PARTIAL' | 'ACKED' | 'FAILED';
  readonly items: readonly PriceLabelBatchItemDto[];
}

type FetchPort = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface VerifiedTerminalContext {
  readonly verified: true;
  readonly terminalId: string;
  readonly terminalSessionId: string;
}

export interface PriceLabelAcknowledgement {
  readonly itemId: string;
  readonly status: 'ACKED' | 'FAILED';
  readonly errorCode?: string;
}

export function priceLabelUiState(input: { readonly online: boolean }): {
  readonly canCreate: boolean;
  readonly canReprint: boolean;
  readonly canRetry: boolean;
  readonly stale: boolean;
} {
  return {
    canCreate: input.online,
    canReprint: input.online,
    canRetry: true,
    stale: !input.online,
  };
}

function onlineRequired(online: () => boolean): void {
  if (!online()) throw new Error('PRICE_LABEL_ONLINE_REQUIRED');
}

async function trustedJson(response: Response): Promise<PriceLabelBatchDto> {
  const value = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof value.error === 'string' ? value.error : `PRICE_LABEL_API_${response.status}`);
  }
  if (
    typeof value.batchId !== 'string' ||
    !value.batchId ||
    typeof value.branchId !== 'string' ||
    typeof value.templateId !== 'string' ||
    typeof value.priceListId !== 'string' ||
    !['EXPLICIT', 'BRANCH_DEFAULT', 'TENANT_DEFAULT'].includes(
      String(value.priceListIdentity),
    ) ||
    !(value.reprintOfBatchId === null || typeof value.reprintOfBatchId === 'string') ||
    typeof value.snapshotHash !== 'string' ||
    !['PENDING', 'PRINTING', 'PARTIAL', 'ACKED', 'FAILED'].includes(String(value.status)) ||
    !Array.isArray(value.items) ||
    !value.items.every(isPriceLabelBatchItemDto)
  ) {
    throw new Error('PRICE_LABEL_RESPONSE_INVALID');
  }
  return value as unknown as PriceLabelBatchDto;
}

function isPriceLabelBatchItemDto(value: unknown): value is PriceLabelBatchItemDto {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    [
      'itemId',
      'productId',
      'productName',
      'barcodeValue',
      'resolvedAt',
      'resolutionVersion',
      'renderedPayloadHash',
      'renderedPayloadHex',
    ].every((key) => typeof item[key] === 'string') &&
    ['ordinal', 'priceCents', 'templateVersion'].every(
      (key) => typeof item[key] === 'number' && Number.isSafeInteger(item[key]),
    ) &&
    ['EAN8', 'EAN13', 'CODE128'].includes(String(item.barcodeType)) &&
    ['PRICE_LIST', 'PRODUCT_DEFAULT'].includes(String(item.priceSource)) &&
    ['PENDING', 'ACKED', 'FAILED'].includes(String(item.status))
  );
}

export function createPriceLabelClient(input: {
  readonly fetcher: FetchPort;
  readonly online?: () => boolean;
  readonly apiBase?: string;
  readonly terminalContext: () => VerifiedTerminalContext | null;
}) {
  const fetcher = input.fetcher;
  const online = input.online ?? (() => typeof navigator === 'undefined' || navigator.onLine);
  const apiBase = (input.apiBase ?? '').replace(/\/$/, '');
  const requestHeaders = (): Record<string, string> => {
    const terminal = input.terminalContext();
    if (
      terminal?.verified !== true ||
      !terminal.terminalId.trim() ||
      !terminal.terminalSessionId.trim()
    ) {
      throw new Error('PRICE_LABEL_TERMINAL_CONTEXT_REQUIRED');
    }
    return {
      'content-type': 'application/json',
      'x-terminal-id': terminal.terminalId,
      'x-terminal-session-id': terminal.terminalSessionId,
    };
  };

  return {
    async createBatch(request: Partial<PriceLabelBatchRequest>): Promise<PriceLabelBatchDto> {
      onlineRequired(online);
      const headers = requestHeaders();
      if (
        !request.products?.length ||
        request.products.some(
          (product) =>
            !product.productId.trim() ||
            !Number.isSafeInteger(product.copies) ||
            product.copies < 1,
        ) ||
        !request.templateId ||
        !request.idempotencyKey
      ) {
        throw new Error('PRICE_LABEL_REQUEST_INVALID');
      }
      const body: PriceLabelBatchRequest = {
        products: request.products,
        templateId: request.templateId,
        ...(request.priceListId ? { priceListId: request.priceListId } : {}),
        idempotencyKey: request.idempotencyKey,
      };
      return trustedJson(
        await fetcher(`${apiBase}/api/catalog/price-labels/batches`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        }),
      );
    },
    async reprintBatch(request: {
      readonly batchId: string;
      readonly idempotencyKey: string;
    }): Promise<PriceLabelBatchDto> {
      onlineRequired(online);
      const headers = requestHeaders();
      return trustedJson(
        await fetcher(`${apiBase}/api/catalog/price-labels/batches/reprint`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            batchId: request.batchId,
            idempotencyKey: request.idempotencyKey,
          }),
        }),
      );
    },
    retryBatch(request: { readonly batchId: string }) {
      return Promise.resolve({ batchId: request.batchId, mode: 'RETRY_SNAPSHOT' as const });
    },
    async acknowledgeItems(request: {
      readonly batchId: string;
      readonly acknowledgements: readonly PriceLabelAcknowledgement[];
    }): Promise<{ readonly batchStatus: string; readonly retryItemIds: readonly string[] }> {
      const headers = requestHeaders();
      const response = await fetcher(
        `${apiBase}/api/catalog/price-labels/batches/ack`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(request),
        },
      );
      if (!response.ok) throw new Error(`PRICE_LABEL_ACK_${response.status}`);
      const value = (await response.json()) as Record<string, unknown>;
      if (typeof value.batchStatus !== 'string' || !Array.isArray(value.retryItemIds)) {
        throw new Error('PRICE_LABEL_ACK_RESPONSE_INVALID');
      }
      return {
        batchStatus: value.batchStatus,
        retryItemIds: value.retryItemIds.filter(
          (itemId): itemId is string => typeof itemId === 'string',
        ),
      };
    },
  };
}
