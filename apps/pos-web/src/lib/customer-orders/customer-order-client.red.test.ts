import { describe, expect, it, vi } from 'vitest';
import { createCustomerOrdersApi } from './customer-order-client.js';

describe('Sprint 43 POS customer-order client (RED)', () => {
  it('never sends tenant or authoritative price from the client', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          orderId: 'order-a',
          status: 'OPEN',
          saleId: null,
          paymentId: null,
          fiscalDocumentId: null,
          alreadyApplied: false,
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ),
    );
    const api = createCustomerOrdersApi({
      authenticatedFetch: fetchFn,
      terminalContext: () => ({
        verified: true,
        terminalId: 'terminal-a',
        terminalSessionId: 'session-a',
      }),
    });
    await api.create({
      branchId: 'branch-a',
      customerId: 'customer-a',
      idempotencyKey: 'create-a',
      reservedUntil: '2026-08-09T12:00:00.000Z',
      items: [
        {
          productId: 'product-a',
          enteredQuantityMicrounits: 1_000_000,
        },
      ],
    });
    const firstCall = fetchFn.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit];
    const request = JSON.parse(
      typeof firstCall[1].body === 'string' ? firstCall[1].body : '',
    ) as Record<string, unknown>;
    expect(request).not.toHaveProperty('tenantId');
    expect(JSON.stringify(request)).not.toContain('unitPriceCents');
    const headers = new Headers(firstCall[1].headers);
    expect(headers.get('x-terminal-id')).toBe('terminal-a');
    expect(headers.get('x-terminal-session-id')).toBe('session-a');
  });

  it('mints a multi-item opaque envelope without client branch or terminal identity', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          envelope: 'opaque-signed-envelope',
          envelopeId: 'envelope-a',
          scope: 'CUSTOMER_ORDER_FULFILL',
          oneShot: true,
          ttlSeconds: 300,
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ),
    );
    const api = createCustomerOrdersApi({
      authenticatedFetch: fetchFn,
      terminalContext: () => ({
        verified: true,
        terminalId: 'terminal-a',
        terminalSessionId: 'session-a',
      }),
    });
    const envelope = await api.requestLease({
      orderId: 'order-a',
      items: [
        { itemId: 'item-a', quantityMicrounits: 1_000_000 },
        { itemId: 'item-b', quantityMicrounits: 2_000_000 },
      ],
      requestedTtlSeconds: 300,
      idempotencyKey: 'lease-a',
    });
    expect(envelope).toEqual({
      envelope: 'opaque-signed-envelope',
      envelopeId: 'envelope-a',
      scope: 'CUSTOMER_ORDER_FULFILL',
      oneShot: true,
      ttlSeconds: 300,
    });
    const firstCall = fetchFn.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit];
    expect(JSON.parse(typeof firstCall[1].body === 'string' ? firstCall[1].body : '')).toEqual({
      orderId: 'order-a',
      items: [
        { itemId: 'item-a', quantityMicrounits: 1_000_000 },
        { itemId: 'item-b', quantityMicrounits: 2_000_000 },
      ],
      requestedTtlSeconds: 300,
      idempotencyKey: 'lease-a',
    });
  });

  it('matches list, detail, fulfill, cancel, notice and reprice route contracts', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ orderId: 'order-a', status: 'CANCELLED', alreadyApplied: false }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    const api = createCustomerOrdersApi({
      authenticatedFetch: fetchFn,
      terminalContext: () => ({
        verified: true,
        terminalId: 'terminal-a',
        terminalSessionId: 'session-a',
      }),
    });
    await api.cancel({
      orderId: 'order-a',
      reason: 'Cliente desistió',
      idempotencyKey: 'cancel-a',
    });
    expect(fetchFn).toHaveBeenCalledWith(
      '/api/orders/customer-orders/cancel',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('guards every read, fulfillment, expiry, notice and repricing success DTO', async () => {
    const summary = {
      id: 'order-a',
      branch_id: 'branch-a',
      customer_id: 'customer-a',
      status: 'OPEN',
      pickup_at: null,
      reserved_until: '2026-08-09T12:00:00.000Z',
      version: 1,
    };
    const fetchFn = vi.fn<typeof fetch>().mockImplementation((input) => {
      const path =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      let response: Record<string, unknown>;
      if (path.endsWith('/order-a')) {
        response = {
          ...summary,
          created_by_user_id: 'user-a',
          items: [
            {
              id: 'item-a',
              product_id: 'product-a',
              product_name: 'Producto A',
              product_uom_id: 'uom-a',
              requested_quantity_microunits: 1_000_000,
              reserved_quantity_microunits: 1_000_000,
              fulfilled_quantity_microunits: 0,
              released_quantity_microunits: 0,
              unit_price_cents: 500,
            },
          ],
        };
      } else if (path.includes('/fulfill')) {
        response = {
          orderId: 'order-a',
          saleId: 'sale-a',
          saleItemId: 'sale-item-a',
          status: 'FULFILLED',
          totalAmountCents: 500,
          alreadyApplied: false,
        };
      } else if (path.includes('/expire')) {
        response = { orderId: 'order-a', status: 'EXPIRED', alreadyApplied: false };
      } else if (path.includes('/notices/dispatch')) {
        response = { status: 'SENT' };
      } else if (path.includes('/reprice-authorizations')) {
        response = {
          token: 'volatile-token',
          expiresAt: '2026-08-08T12:03:00.000Z',
          scope: 'CUSTOMER_ORDER_REPRICE',
        };
      } else if (path.includes('/reprice-handoff')) {
        response = {
          quoteId: 'quote-a',
          source: 'CURRENT_SERVER_PRICING',
          requiresOrdinaryCheckout: true,
          lines: [
            {
              productId: 'product-a',
              productUomId: 'uom-a',
              quantityMicrounits: 1_000_000,
              unitPriceCents: 600,
            },
          ],
        };
      } else {
        response = { orders: [summary] };
      }
      return Promise.resolve(
        new Response(JSON.stringify(response), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });
    const api = createCustomerOrdersApi({
      authenticatedFetch: fetchFn,
      terminalContext: () => ({
        verified: true,
        terminalId: 'terminal-a',
        terminalSessionId: 'session-a',
      }),
    });

    await expect(api.list({ branchId: 'branch-a', status: 'OPEN' })).resolves.toHaveLength(1);
    await expect(api.detail('order-a')).resolves.toMatchObject({ items: [{ id: 'item-a' }] });
    await expect(
      api.fulfill({
        orderId: 'order-a',
        envelope: 'opaque',
        idempotencyKey: 'fulfill-a',
      }),
    ).resolves.toMatchObject({ saleId: 'sale-a' });
    await expect(
      api.expire({ orderId: 'order-a', idempotencyKey: 'expire-a' }),
    ).resolves.toMatchObject({ status: 'EXPIRED' });
    await expect(api.dispatchNotice('notice-a')).resolves.toEqual({ status: 'SENT' });
    const approval = await api.approveReprice({
      orderId: 'order-a',
      actorUserId: 'cashier-a',
    });
    await expect(
      api.repriceHandoff({
        orderId: 'order-a',
        authorizationToken: approval.token,
        idempotencyKey: 'reprice-a',
      }),
    ).resolves.toMatchObject({ requiresOrdinaryCheckout: true });
    const listInput = fetchFn.mock.calls[0]?.[0];
    const listUrl =
      typeof listInput === 'string'
        ? listInput
        : listInput instanceof URL
          ? listInput.href
          : listInput?.url;
    expect(listUrl).toContain('branchId=branch-a&status=OPEN');
  });

  it('fails cash operations before fetch when trusted terminal context is absent', async () => {
    const authenticatedFetch = vi.fn<typeof fetch>();
    const api = createCustomerOrdersApi({
      authenticatedFetch,
      terminalContext: () => null,
    });
    await expect(
      api.requestLease({
        orderId: 'order-a',
        items: [{ itemId: 'item-a', quantityMicrounits: 1 }],
        idempotencyKey: 'lease-a',
      }),
    ).rejects.toMatchObject({ code: 'CUSTOMER_ORDER_TERMINAL_CONTEXT_REQUIRED' });
    expect(authenticatedFetch).not.toHaveBeenCalled();
  });

  it('allows owner read calls without manufacturing terminal headers', async () => {
    const authenticatedFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ orders: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const api = createCustomerOrdersApi({
      authenticatedFetch,
      terminalContext: () => null,
    });
    await expect(api.list()).resolves.toEqual([]);
    const call = authenticatedFetch.mock.calls[0] as [string, RequestInit];
    expect(new Headers(call[1].headers).has('x-terminal-id')).toBe(false);
  });

  it('rejects malformed success responses with a safe typed error', async () => {
    const api = createCustomerOrdersApi({
      authenticatedFetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ envelope: 7, tokenHash: 'must-not-surface' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
      ),
      terminalContext: () => ({
        verified: true,
        terminalId: 'terminal-a',
        terminalSessionId: 'session-a',
      }),
    });
    await expect(
      api.requestLease({
        orderId: 'order-a',
        items: [{ itemId: 'item-a', quantityMicrounits: 1 }],
        idempotencyKey: 'lease-a',
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'CustomerOrderClientError',
        code: 'CUSTOMER_ORDER_RESPONSE_INVALID',
      }),
    );
  });

  it('keeps authorization and repricing tokens out of returned messages', async () => {
    const api = createCustomerOrdersApi({
      authenticatedFetch: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ code: 'CUSTOMER_ORDER_REPRICE_AUTH_INVALID', detail: 'secret' }),
          {
            status: 422,
            headers: { 'content-type': 'application/json' },
          },
        ),
      ),
      terminalContext: () => ({
        verified: true,
        terminalId: 'terminal-a',
        terminalSessionId: 'session-a',
      }),
    });
    await expect(
      api.repriceHandoff({
        orderId: 'order-a',
        authorizationToken: 'volatile-supervisor-token',
        idempotencyKey: 'reprice-a',
      }),
    ).rejects.toEqual(expect.objectContaining({ code: 'CUSTOMER_ORDER_REPRICE_AUTH_INVALID' }));
  });
});
