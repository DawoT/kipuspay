import {
  apiOrigin,
  attachEvidence,
  expect,
  loginSeedTenant,
  queryD1,
  sqlText,
  test,
} from './fixtures';

test('aislamiento y revocación dinámica permanecen fail-closed durante la sesión', async ({
  page,
}, testInfo) => {
  const auth = await loginSeedTenant(page, 'retail');
  const headers = { authorization: `Bearer ${auth.token}`, 'x-tenant-id': auth.tenantId };
  const catalogUrl = `${apiOrigin}/api/catalog/sellable?branchId=${encodeURIComponent(auth.branchId)}`;

  const before = await page.request.get(catalogUrl, { headers });
  expect(before.status()).toBe(200);

  const crossTenant = await page.request.get(`${apiOrigin}/api/auth/session`, {
    headers: { authorization: `Bearer ${auth.token}`, 'x-tenant-id': 'seed_farmacia' },
  });
  expect([401, 403]).toContain(crossTenant.status());

  await queryD1(`UPDATE tenant_capabilities SET enabled = 0
    WHERE tenant_id = ${sqlText(auth.tenantId)} AND capability = 'catalog.sellable'`);
  const revoked = await page.request.get(catalogUrl, { headers });
  expect(revoked.status()).toBe(404);
  expect(await revoked.json()).toMatchObject({ code: 'FEATURE_OFF' });

  await queryD1(`UPDATE tenant_capabilities SET enabled = 1, config_json = '{'
    WHERE tenant_id = ${sqlText(auth.tenantId)} AND capability = 'catalog.sellable'`);
  const unavailable = await page.request.get(catalogUrl, { headers });
  expect(unavailable.status()).toBe(503);
  expect(await unavailable.json()).toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' });

  await queryD1(`UPDATE tenant_capabilities SET enabled = 1, config_json = '{"source":"operational_seed"}'
    WHERE tenant_id = ${sqlText(auth.tenantId)} AND capability = 'catalog.sellable'`);
  const restored = await page.request.get(catalogUrl, { headers });
  expect(restored.status()).toBe(200);

  const capabilityRow = await queryD1<{ enabled: number; config_json: string; epoch: number }>(
    `SELECT tc.enabled, tc.config_json, e.epoch
       FROM tenant_capabilities tc
       JOIN tenant_data_epochs e ON e.tenant_id = tc.tenant_id
      WHERE tc.tenant_id = ${sqlText(auth.tenantId)} AND tc.capability = 'catalog.sellable'`,
  );
  expect(capabilityRow).toEqual([
    expect.objectContaining({ enabled: 1, config_json: '{"source":"operational_seed"}' }),
  ]);

  await attachEvidence(testInfo, 'local-stack-security-contracts', {
    environment: 'local-worker-d1',
    tenantId: auth.tenantId,
    role: 'owner',
    statuses: {
      initialAccess: before.status(),
      crossTenant: crossTenant.status(),
      revokedCapability: revoked.status(),
      capabilitySourceUnavailable: unavailable.status(),
      restored: restored.status(),
    },
    capabilityRow,
    note: '503 proves fail-closed capability authority unavailability; control-plane revocation outage remains covered by isolated Worker tests.',
  });
});
