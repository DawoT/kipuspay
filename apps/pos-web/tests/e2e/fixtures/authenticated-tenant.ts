import type { Page } from '@playwright/test';
import { isCanonicalCapability } from '../../../../worker-api/src/capabilities/canonical-capabilities.js';

export interface AuthenticatedTenantFixture {
  readonly tenantId: string;
  readonly capabilities: readonly string[];
  readonly role?: 'cashier' | 'supervisor' | 'admin' | 'owner';
  readonly branchId?: string;
  readonly epoch?: number;
  readonly terminal?: {
    readonly terminalId: string;
    readonly terminalSessionId: string;
    readonly cashRegisterSessionId: string;
  } | null;
  readonly verticalType?:
    'retail' | 'farmacias' | 'restaurantes' | 'servicios' | 'cadenas' | 'grifos';
  readonly formalizationMode?: 'INTERNAL_CONTROL' | 'FORMALIZING' | 'ELECTRONIC_ISSUER';
  readonly tradeName?: string;
  readonly firstSaleAtIso?: string | null;
  readonly token?: string;
  readonly onboardingClaim?: {
    readonly branchId: string;
    readonly sessionId: string;
  } | null;
  readonly billing?: {
    readonly subscriptionStatus: 'trial' | 'active' | 'past_due' | 'canceled';
    readonly trialEndsAt: string | null;
    readonly pastGracePeriod: boolean;
  };
}

/**
 * Instala la única sesión autenticada que usan los E2E del POS.
 *
 * Las capabilities deben declararse en cada test. No hay fallback a flags de
 * despliegue: el mismo snapshot alimenta cache cliente y GET /api/auth/session.
 */
export async function installAuthenticatedTenant(
  page: Page,
  input: AuthenticatedTenantFixture,
): Promise<void> {
  const role = input.role ?? 'owner';
  const branchId = input.branchId ?? 'branch-e2e';
  const epoch = input.epoch ?? 1;
  const token = input.token ?? 'jwt-e2e';
  const userId = `${role}-e2e`;
  const terminal = input.terminal ?? null;
  const caps = [...input.capabilities].sort();
  const invalidCapabilities = caps.filter((capability) => !isCanonicalCapability(capability));
  if (invalidCapabilities.length > 0) {
    throw new Error(`Capability E2E no canónica: ${invalidCapabilities.join(', ')}`);
  }
  const tenantSession = {
    tenantId: input.tenantId,
    tradeName: input.tradeName ?? 'Negocio E2E',
    verticalType: input.verticalType ?? 'retail',
    formalizationMode: input.formalizationMode ?? 'INTERNAL_CONTROL',
    taxRegime: 'RG',
    onboardingStartedAtIso: null,
    firstSaleAtIso: input.firstSaleAtIso ?? null,
    brandQrEnabled: true,
    referralCode: null,
  };

  await page.addInitScript(
    ({
      nextUserId,
      nextRole,
      nextBranchId,
      nextTenantId,
      nextToken,
      nextCaps,
      nextEpoch,
      nextSession,
      nextOnboardingClaim,
    }) => {
      localStorage.setItem(
        'kipuspay_user',
        JSON.stringify({ userId: nextUserId, role: nextRole, branchId: nextBranchId }),
      );
      localStorage.setItem('kipuspay_token', nextToken);
      localStorage.setItem('kipuspay_tenant_id', nextTenantId);
      if (nextOnboardingClaim) {
        localStorage.setItem(
          'kipuspay.onboarding.claim',
          JSON.stringify({ ...nextOnboardingClaim, tenantId: nextTenantId }),
        );
      }
      localStorage.setItem(
        `kipuspay.capabilities.v1:${nextTenantId}`,
        JSON.stringify({
          caps: nextCaps,
          epoch: nextEpoch,
          fetchedAt: Date.now(),
          tenantId: nextTenantId,
        }),
      );
      sessionStorage.setItem('kipuspay.pos.tenant.v1', JSON.stringify(nextSession));
    },
    {
      nextUserId: userId,
      nextRole: role,
      nextBranchId: branchId,
      nextTenantId: input.tenantId,
      nextToken: token,
      nextCaps: caps,
      nextEpoch: epoch,
      nextSession: tenantSession,
      nextOnboardingClaim: input.onboardingClaim ?? null,
    },
  );
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        userId,
        role,
        branchId,
        terminal,
        capabilities: caps,
        capabilitiesEpoch: epoch,
        ...(input.billing ? { billing: input.billing } : {}),
      }),
    }),
  );
  await page.route('**/api/tenant/context', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(tenantSession),
    }),
  );
}
