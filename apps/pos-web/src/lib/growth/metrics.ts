/**
 * Métricas GTM §9 — agregación pura (SoT lógica; persistencia = growth_events D1).
 */

export interface GrowthEvent {
  readonly tenantId: string;
  readonly eventType:
    | 'onboarding_started'
    | 'first_sale'
    | 'formalization_upgrade'
    | 'trial_to_paid'
    | 'plan_upgrade'
    | 'referral_credited';
  readonly occurredAtIso: string;
  readonly meta?: Record<string, unknown>;
}

export interface GrowthMetricsSnapshot {
  readonly ttfsMsP80: number | null;
  readonly ttfsSampleSize: number;
  readonly formalizationUpgradeRate: number | null;
  readonly trialToPaidRate: number | null;
  readonly nrrProxy: number | null | 'n/d';
  readonly kFactor: number | null;
}

function percentileAsc(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)] ?? null;
}

function computeKFactor(opts: {
  creditedAttributions: number;
  activeReferrersWithCredit: number;
}): number | null {
  if (opts.activeReferrersWithCredit <= 0) return null;
  return opts.creditedAttributions / opts.activeReferrersWithCredit;
}

function indexOnboarding(events: readonly GrowthEvent[]): Map<string, string> {
  const started = new Map<string, string>();
  for (const e of events) {
    if (e.eventType === 'onboarding_started') started.set(e.tenantId, e.occurredAtIso);
  }
  return started;
}

function collectTtfsSamples(
  events: readonly GrowthEvent[],
  started: Map<string, string>,
): number[] {
  const samples: number[] = [];
  for (const e of events) {
    if (e.eventType !== 'first_sale') continue;
    const startAt = started.get(e.tenantId);
    if (!startAt) continue;
    const ms = Date.parse(e.occurredAtIso) - Date.parse(startAt);
    if (Number.isFinite(ms) && ms >= 0) samples.push(ms);
  }
  return samples.sort((a, b) => a - b);
}

function rateForType(
  events: readonly GrowthEvent[],
  type: GrowthEvent['eventType'],
  baseSize: number,
): number | null {
  if (baseSize <= 0) return null;
  const set = new Set<string>();
  for (const e of events) {
    if (e.eventType === type) set.add(e.tenantId);
  }
  return set.size / baseSize;
}

function kFactorFromEvents(events: readonly GrowthEvent[]): number | null {
  const creditedByReferrer = new Map<string, number>();
  for (const e of events) {
    if (e.eventType !== 'referral_credited') continue;
    const ref = typeof e.meta?.referrerTenantId === 'string' ? e.meta.referrerTenantId : e.tenantId;
    creditedByReferrer.set(ref, (creditedByReferrer.get(ref) ?? 0) + 1);
  }
  let creditedTotal = 0;
  for (const n of creditedByReferrer.values()) creditedTotal += n;
  return computeKFactor({
    creditedAttributions: creditedTotal,
    activeReferrersWithCredit: creditedByReferrer.size,
  });
}

export function computeGrowthMetrics(events: readonly GrowthEvent[]): GrowthMetricsSnapshot {
  const started = indexOnboarding(events);
  const ttfsSamples = collectTtfsSamples(events, started);
  const planUpRate = rateForType(events, 'plan_upgrade', started.size);
  const nrrProxy: number | null | 'n/d' =
    started.size === 0 ? 'n/d' : planUpRate != null && planUpRate > 0 ? planUpRate : 'n/d';

  return {
    ttfsMsP80: percentileAsc(ttfsSamples, 80),
    ttfsSampleSize: ttfsSamples.length,
    formalizationUpgradeRate: rateForType(events, 'formalization_upgrade', started.size),
    trialToPaidRate: rateForType(events, 'trial_to_paid', started.size),
    nrrProxy,
    kFactor: kFactorFromEvents(events),
  };
}
