import {
  apiOrigin,
  attachEvidence,
  expect,
  loginSeedTenant,
  queryD1,
  sqlText,
  test,
} from './fixtures';

test('cadena transfiere, recibe parcialmente y concilia 3-way con efecto contable', async ({
  page,
}, testInfo) => {
  const auth = await loginSeedTenant(page, 'cadena');
  const headers = { authorization: `Bearer ${auth.token}`, 'x-tenant-id': auth.tenantId };

  const transferResponse = await page.request.post(`${apiOrigin}/api/inventory/transfers`, {
    headers,
    data: {
      fromBranchId: auth.branchId,
      toBranchId: 'seed_cadena_branch_2',
      lines: [{ productId: 'seed_cadena_product', qtySent: 3 }],
    },
  });
  expect(transferResponse.status()).toBe(201);
  const transfer = (await transferResponse.json()) as { id: string; status: string };
  const transferLines = await queryD1<{ id: string }>(`SELECT id FROM stock_transfer_lines
    WHERE tenant_id = ${sqlText(auth.tenantId)} AND transfer_id = ${sqlText(transfer.id)}`);
  expect(transferLines).toHaveLength(1);

  const shipResponse = await page.request.post(`${apiOrigin}/api/inventory/transfers/ship`, {
    headers,
    data: { transferId: transfer.id },
  });
  expect(shipResponse.status()).toBe(200);
  const receiveResponse = await page.request.post(`${apiOrigin}/api/inventory/transfers/receive`, {
    headers,
    data: {
      transferId: transfer.id,
      lines: [
        {
          lineId: transferLines[0]!.id,
          qtyReceived: 2,
          qtyShrink: 1,
          shrinkReason: 'Merma sintética E2E',
        },
      ],
    },
  });
  expect(receiveResponse.status()).toBe(200);
  const receivedTransfer = (await receiveResponse.json()) as { status: string };
  expect(receivedTransfer.status).toBe('RECEIVED');

  const createPoResponse = await page.request.post(`${apiOrigin}/api/purchasing/orders`, {
    headers,
    data: {
      branchId: auth.branchId,
      supplierId: 'seed_cadena_supplier',
      totalAmountCents: 2800,
      lines: [{ productId: 'seed_cadena_product', quantity: 4, unitCostCents: 700 }],
    },
  });
  expect(createPoResponse.status()).toBe(200);
  const purchaseOrder = (await createPoResponse.json()) as { id: string };
  const sentPoResponse = await page.request.post(`${apiOrigin}/api/purchasing/orders/transition`, {
    headers,
    data: { purchaseOrderId: purchaseOrder.id, toStatus: 'SENT' },
  });
  expect(sentPoResponse.status()).toBe(200);

  const partialResponse = await page.request.post(
    `${apiOrigin}/api/purchasing/orders/partial-receive`,
    {
      headers,
      data: {
        purchaseOrderId: purchaseOrder.id,
        branchId: auth.branchId,
        lines: [
          {
            productId: 'seed_cadena_product',
            quantity: 2,
            unitCostCents: 700,
            batchNumber: 'CHAIN-E2E-001',
            expiryDate: '2099-12-31',
          },
        ],
      },
    },
  );
  expect(partialResponse.status()).toBe(200);
  const partial = (await partialResponse.json()) as {
    receiptId: string;
    nextStatus: string;
    apAmountCents: number;
  };
  expect(partial.nextStatus).toBe('PARTIALLY_RECEIVED');
  expect(partial.apAmountCents).toBe(0);

  const matchResponse = await page.request.post(`${apiOrigin}/api/purchasing/invoices/match`, {
    headers,
    data: {
      purchaseOrderId: purchaseOrder.id,
      branchId: auth.branchId,
      invoiceNumber: 'F001-E2E-CHAIN',
      totalCents: 1400,
      igvCents: 214,
      lines: [
        {
          productId: 'seed_cadena_product',
          invoicedQty: 2,
          invoiceUnitCostCents: 700,
        },
      ],
    },
  });
  expect(matchResponse.status()).toBe(200);
  const matched = (await matchResponse.json()) as {
    invoiceId: string;
    invoiceStatus: string;
    apId: string;
    apAmountCents: number;
  };
  expect(matched.invoiceStatus).toBe('PARTIAL');
  expect(matched.apAmountCents).toBe(1400);

  const persisted = await queryD1<{
    transfer_status: string;
    qty_received: number;
    qty_shrink: number;
    po_status: string;
    invoice_status: string;
    ap_balance_cents: number;
    journal_lines: number;
  }>(`SELECT st.status AS transfer_status,
             stl.qty_received, stl.qty_shrink,
             po.status AS po_status,
             si.status AS invoice_status,
             ap.balance_due_cents AS ap_balance_cents,
             (SELECT COUNT(*) FROM journal_lines jl
               JOIN journal_entries je ON je.tenant_id = jl.tenant_id AND je.id = jl.journal_entry_id
              WHERE je.tenant_id = po.tenant_id AND je.source_id = si.id) AS journal_lines
        FROM stock_transfers st
        JOIN stock_transfer_lines stl
          ON stl.tenant_id = st.tenant_id AND stl.transfer_id = st.id
        JOIN purchase_orders po ON po.tenant_id = st.tenant_id AND po.id = ${sqlText(purchaseOrder.id)}
        JOIN supplier_invoices si
          ON si.tenant_id = po.tenant_id AND si.purchase_order_id = po.id
        JOIN accounts_payable ap ON ap.tenant_id = si.tenant_id AND ap.purchase_order_id = po.id
       WHERE st.tenant_id = ${sqlText(auth.tenantId)} AND st.id = ${sqlText(transfer.id)}`);
  expect(persisted).toHaveLength(1);
  expect(persisted[0]).toMatchObject({
    transfer_status: 'RECEIVED',
    qty_received: 2,
    qty_shrink: 1,
    po_status: 'PARTIALLY_RECEIVED',
    invoice_status: 'PARTIAL',
    ap_balance_cents: 1400,
  });
  expect(persisted[0]!.journal_lines).toBeGreaterThan(0);

  await attachEvidence(testInfo, 'local-stack-chain-operations', {
    environment: 'local-worker-d1',
    tenantId: auth.tenantId,
    role: 'owner',
    transfer,
    receivedTransfer,
    purchaseOrder,
    partial,
    matched,
    persisted,
  });
});
