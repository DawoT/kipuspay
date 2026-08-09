import type { Page, Route } from '@playwright/test';

export type RecurringRole = 'cashier' | 'supervisor' | 'admin' | 'owner';

export interface RecurringHarness {
  role: RecurringRole;
  created: Record<string, unknown>[];
  transitions: string[];
  immediateConfirmed: boolean;
}

const plan = {
  id: 'membership-e2e',
  branch_id: 'branch-e2e',
  customer_id: 'customer-e2e',
  document_type: '03',
  pricing_policy: 'CURRENT',
  frequency: 'MONTHLY',
  status: 'ACTIVE',
  grace_days: 3,
  next_run_at: '2026-08-31T09:00:00-05:00',
  retry_count: 1,
  next_retry_at: '2026-08-08T20:00:00-05:00',
  last_error_code: 'RECURRING_INSUFFICIENT_STOCK',
  version: 4,
  balance_due_cents: 4800,
};

async function json(route: Route, body: Record<string, unknown>, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

export async function installRecurringSalesFixture(
  page: Page,
  role: RecurringRole = 'admin',
): Promise<RecurringHarness> {
  const harness: RecurringHarness = {
    role,
    created: [],
    transitions: [],
    immediateConfirmed: false,
  };
  const currentPlan = { ...plan };
  await page.route('**/api/auth/session', async (route) => {
    await json(route, {
      userId: `${harness.role}-e2e`,
      role: harness.role,
      branchId: 'branch-e2e',
      terminal: null,
    });
  });
  await page.route('**/api/admin/recurring-plans**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET' && path.endsWith('/recurring-plans')) {
      await json(route, { plans: [currentPlan] });
      return;
    }
    if (path.endsWith('/occurrences')) {
      await json(route, {
        occurrences: [
          {
            id: 'occurrence-e2e',
            document_type: '03',
            period_start: '2026-08-01T09:00:00-05:00',
            period_end: '2026-09-01T09:00:00-05:00',
            total_amount_cents: 4800,
            balance_due_cents: 4800,
            receivable_status: 'OPEN',
          },
        ],
        retry: { count: 1, status: 'PENDING' },
      });
      return;
    }
    if (request.method() === 'GET' && path.endsWith('/preview')) {
      await json(route, {
        planId: currentPlan.id,
        pricingPolicy: 'CURRENT',
        nextRunAt: currentPlan.next_run_at,
        periodStart: '2026-08-31T09:00:00-05:00',
        periodEnd: '2026-09-30T09:00:00-05:00',
        items: [],
        serverAuthoritative: true,
      });
      return;
    }
    if (path.endsWith('/cancel-preview')) {
      await json(route, {
        previewId: 'preview-e2e',
        creditAmountCents: 2400,
        adjustmentDocumentType: '07',
        confirmationRequired: true,
      });
      return;
    }
    if (path.endsWith('/pause')) {
      harness.transitions.push('pause');
      currentPlan.status = 'PAUSED';
      currentPlan.version += 1;
      await json(route, { status: 'PAUSED' });
      return;
    }
    if (path.endsWith('/resume')) {
      harness.transitions.push('resume');
      currentPlan.status = 'ACTIVE';
      currentPlan.version += 1;
      await json(route, { status: 'ACTIVE' });
      return;
    }
    if (path.endsWith('/cancel')) {
      const body = request.postDataJSON() as Record<string, unknown>;
      harness.immediateConfirmed = body.mode === 'IMMEDIATE' && body.confirm === true;
      await json(route, {
        status: body.mode === 'IMMEDIATE' ? 'CANCELLED' : 'CANCEL_AT_PERIOD_END',
        creditAmountCents: body.mode === 'IMMEDIATE' ? 2400 : 0,
      });
      return;
    }
    if (request.method() === 'POST' && path.endsWith('/recurring-plans')) {
      const body = request.postDataJSON() as Record<string, unknown>;
      harness.created.push(body);
      await json(
        route,
        {
          planId: `created-${harness.created.length}`,
          planVersion: 1,
          pricingPolicy: body.pricingPolicy,
          nextRunAt: '2026-08-31T09:00:00-05:00',
        },
        201,
      );
      return;
    }
    await json(route, { code: 'E2E_ROUTE_NOT_IMPLEMENTED' }, 501);
  });
  return harness;
}
