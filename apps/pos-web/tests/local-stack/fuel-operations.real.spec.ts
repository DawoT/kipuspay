import {
  apiOrigin,
  attachEvidence,
  expect,
  loginSeedTenant,
  queryD1,
  sqlText,
  test,
} from './fixtures';

test('grifo usa precio servidor, enlaza venta/caja, reintenta sin duplicar y entrega turno', async ({
  page,
}, testInfo) => {
  const auth = await loginSeedTenant(page, 'grifos');
  const ownerHeaders = { authorization: `Bearer ${auth.token}`, 'x-tenant-id': auth.tenantId };

  const catalogResponse = await page.request.get(`${apiOrigin}/api/fuel/catalog`, {
    headers: ownerHeaders,
  });
  expect(catalogResponse.status()).toBe(200);
  const catalog = (await catalogResponse.json()) as {
    items: readonly { code: string; priceCentsPerGallon: number }[];
  };
  expect(catalog.items).toEqual([
    expect.objectContaining({ code: 'GAS95', priceCentsPerGallon: 1450 }),
  ]);

  const dispatch = {
    dispatchId: 'fuel-e2e-dispatch-001',
    idempotencyKey: 'fuel-e2e-idempotency-001',
    fuelCode: 'GAS95',
    volumeMicrounits: 1_000_000,
    businessInvoice: false,
    documentType: 'NV',
    islandId: 'island-e2e',
    nozzleId: 'nozzle-e2e',
    paymentMethod: 'cash',
    branchId: auth.branchId,
    cashRegisterSessionId: auth.sessionId,
    series: 'NV01',
    plate: 'E2E-123',
    meterReadingMicrounits: 101_000_000,
  };
  const firstResponse = await page.request.post(`${apiOrigin}/api/fuel/dispatches`, {
    headers: ownerHeaders,
    data: dispatch,
  });
  expect(firstResponse.status()).toBe(201);
  const first = (await firstResponse.json()) as {
    dispatchId: string;
    saleId: string;
    totalCents: number;
    replayed?: boolean;
  };
  expect(first).toMatchObject({ dispatchId: dispatch.dispatchId, totalCents: 1711 });

  const replayResponse = await page.request.post(`${apiOrigin}/api/fuel/dispatches`, {
    headers: ownerHeaders,
    data: { ...dispatch, volumeMicrounits: 99_000_000 },
  });
  expect(replayResponse.status()).toBe(200);
  const replay = (await replayResponse.json()) as { replayed: boolean; dispatchId: string };
  expect(replay).toMatchObject({ replayed: true, dispatchId: dispatch.dispatchId });

  const reportResponse = await page.request.get(
    `${apiOrigin}/api/fuel/island-shift-report?islandId=island-e2e`,
    { headers: ownerHeaders },
  );
  expect(reportResponse.status()).toBe(200);
  const report = (await reportResponse.json()) as {
    reports: readonly {
      islandId: string;
      dispatchCount: number;
      volumeMicrounits: number;
      totalCents: number;
    }[];
    cashRegisterSessionIds: readonly string[];
  };
  expect(report.reports).toEqual([
    expect.objectContaining({
      islandId: 'island-e2e',
      dispatchCount: 1,
      volumeMicrounits: 1_000_000,
      totalCents: 1711,
    }),
  ]);
  expect(report.cashRegisterSessionIds).toContain(auth.sessionId);

  const cashierLoginResponse = await page.request.post(`${apiOrigin}/api/auth/cashier-login`, {
    data: {
      tenantId: auth.tenantId,
      identifier: 'seed_grifos_cashier',
      pin: process.env.KIPUSPAY_LOCAL_STACK_PIN ?? '4826',
    },
  });
  expect(cashierLoginResponse.status()).toBe(200);
  const cashierLogin = (await cashierLoginResponse.json()) as { token: string };
  const cashierHeaders = {
    authorization: `Bearer ${cashierLogin.token}`,
    'x-tenant-id': auth.tenantId,
  };
  const pinResponse = await page.request.post(`${apiOrigin}/api/cash/shifts/pin`, {
    headers: cashierHeaders,
    data: { sessionId: 'seed_grifos_cashier_session' },
  });
  expect(pinResponse.status()).toBe(200);
  const issuedPin = (await pinResponse.json()) as { shiftId: string; pin: string };
  const handoffResponse = await page.request.post(`${apiOrigin}/api/cash/shifts/transfer`, {
    headers: ownerHeaders,
    data: {
      sessionId: 'seed_grifos_cashier_session',
      pin: issuedPin.pin,
      outgoingUserId: 'seed_grifos_cashier',
      interimCountCents: 50_000,
    },
  });
  expect(handoffResponse.status()).toBe(200);
  const handoff = (await handoffResponse.json()) as {
    shiftId: string;
    incomingUserId: string;
    cashDiffCents: number | null;
  };
  expect(handoff).toMatchObject({ incomingUserId: 'seed_grifos_owner', cashDiffCents: null });

  const persisted = await queryD1<{
    dispatch_count: number;
    sale_count: number;
    total_cents: number;
    cash_register_session_id: string;
    stock_microunits: number;
    current_user_id: string;
    cash_session_status: string;
  }>(`SELECT COUNT(DISTINCT fd.dispatch_id) AS dispatch_count,
             COUNT(DISTINCT s.id) AS sale_count,
             MAX(fd.total_cents) AS total_cents,
             MAX(s.cash_register_session_id) AS cash_register_session_id,
             MAX(fc.stock_microunits) AS stock_microunits,
             MAX(crs.user_id) AS current_user_id,
             MAX(crs.status) AS cash_session_status
        FROM fuel_dispatches fd
        JOIN sales s ON s.tenant_id = fd.tenant_id AND s.id = fd.sale_id
        JOIN fuel_catalog fc ON fc.tenant_id = fd.tenant_id AND fc.code = fd.fuel_code
        JOIN cash_register_sessions crs
          ON crs.tenant_id = fd.tenant_id AND crs.id = 'seed_grifos_cashier_session'
       WHERE fd.tenant_id = ${sqlText(auth.tenantId)}
         AND fd.idempotency_key = ${sqlText(dispatch.idempotencyKey)}`);
  expect(persisted).toEqual([
    {
      dispatch_count: 1,
      sale_count: 1,
      total_cents: 1711,
      cash_register_session_id: auth.sessionId,
      stock_microunits: 248_000_000,
      current_user_id: 'seed_grifos_cashier',
      cash_session_status: 'OPEN',
    },
  ]);

  await attachEvidence(testInfo, 'local-stack-fuel-operations', {
    environment: 'local-worker-d1',
    tenantId: auth.tenantId,
    role: 'owner',
    catalog,
    first,
    replay,
    report,
    handoff: { ...handoff, pinIncluded: false },
    persisted,
  });
});
