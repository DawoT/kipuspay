/**
 * Bridge marketing→POS para E2E boleta+ND vía RC (H1).
 * Gated: DEV o PUBLIC_E2E_AUTOTEST=1. Tree-shakeable en prod.
 * Tras el claim del onboarding, emite boleta 03 S/0.01 a DNI 10715001701
 * (afectación 20) y luego ND 08 sobre esa boleta.
 */
import { env as publicEnv } from '$env/dynamic/public';
import { resolveApiBase, resolveApiAuth } from '$lib/auth/api-client';

function isAutotestEnabled(): boolean {
  return (
    Boolean(import.meta.env.DEV) ||
    publicEnv.PUBLIC_E2E_AUTOTEST === '1' ||
    publicEnv.PUBLIC_E2E_AUTOTEST === 'true'
  );
}

async function waitForTenantId(timeoutMs = 6000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const fromStore = localStorage.getItem('kipuspay_tenant_id');
    if (fromStore) return fromStore;
    try {
      const raw = sessionStorage.getItem('kipuspay.pos.tenant.v1');
      if (raw) {
        const parsed = JSON.parse(raw) as { tenantId?: unknown };
        if (typeof parsed.tenantId === 'string' && parsed.tenantId) return parsed.tenantId;
      }
    } catch {
      // storage corrupto: ignora y reintenta
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return '';
}

export async function maybeRunMarketingAutotest(): Promise<void> {
  if (!isAutotestEnabled()) return;
  const autotest = new URLSearchParams(window.location.search).get('autotest');
  if (autotest !== 'boleta') return;

  const tenantId = await waitForTenantId();
  if (!tenantId) return;

  // Evita doble ejecución en el mismo tenant
  const flagKey = `kipuspay_autotest_${tenantId}_boleta`;
  if (sessionStorage.getItem(flagKey)) return;
  sessionStorage.setItem(flagKey, '1');

  try {
    const headers = resolveApiAuth(localStorage) as Record<string, string>;
    const base = resolveApiBase(localStorage).replace(/\/+$/, '');
    const salesUrl = `${base}/api/v1/sync/sales`;
    const debitNotesUrl = `${base}/api/sales/debit-notes`;

    // Boleta 03 S/0.01 a DNI 10715001701, afectación 20 (exonerada)
    const saleRes = await fetch(salesUrl, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        customer: { documentType: '1', documentNumber: '10715001701', name: 'RECEPTOR PRUEBA' },
        items: [{ productId: 'test-boleta-item', quantity: 1, unitPriceCents: 1, affectationCode: '20' }],
        documentType: '03',
      }),
    });
    if (!saleRes.ok) return;
    const sale = (await saleRes.json()) as { saleId?: string; id?: string };
    const saleId = sale.saleId ?? sale.id;
    if (!saleId) return;

    // Espera a que el RC se genere y luego emite ND 08 sobre esa boleta
    await new Promise((r) => setTimeout(r, 3000));
    await fetch(debitNotesUrl, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        originalSaleId: saleId,
        reasonCode: '01',
        amountCents: 1,
      }),
    }).catch(() => {});
  } catch {
    // Silencioso en prod, no bloquea la UI
  } finally {
    // Limpia el query param para no re-ejecutar al recargar
    const u = new URL(window.location.href);
    u.searchParams.delete('autotest');
    window.history.replaceState({}, '', u.toString());
  }
}
