/**
 * Sprint 52 — mapeo de flags del POS a capabilities del tour (ADR-ARCH-002).
 * El tour se activa EXCLUSIVAMENTE por capabilities habilitadas del tenant;
 * este módulo traduce las flags locales (las mismas que ya activan cada
 * feature) al Set que consume domain-onboarding. Puro.
 */

export interface PosCapabilityFlags {
  readonly kds: boolean;
  readonly fefo: boolean;
  readonly scale: boolean;
  readonly promotions: boolean;
  readonly variants: boolean;
  readonly quickAdd: boolean;
  readonly shiftHandoff: boolean;
  readonly teamInvite: boolean;
  readonly hardwareDiagnostics: boolean;
}

export function capabilitiesFromFlags(flags: PosCapabilityFlags): ReadonlySet<string> {
  const set = new Set<string>();
  if (flags.kds) set.add('kds');
  if (flags.fefo) set.add('fefo');
  if (flags.scale) set.add('scale');
  if (flags.promotions) set.add('promotions');
  if (flags.variants) set.add('variants');
  if (flags.quickAdd) set.add('quick_add');
  if (flags.shiftHandoff) set.add('shift_handoff');
  if (flags.teamInvite) set.add('team_invite');
  if (flags.hardwareDiagnostics) set.add('hardware.diagnostics');
  return set;
}

/** Convierte el snapshot autoritativo de sesión en las claves del tour. */
export function capabilitiesFromTenantSnapshot(snapshot: ReadonlySet<string>): ReadonlySet<string> {
  const result = new Set(
    capabilitiesFromFlags({
      kds: snapshot.has('orders.kds'),
      fefo: snapshot.has('inventory.batches'),
      scale: snapshot.has('inventory.scale'),
      promotions: snapshot.has('pricing.promotions'),
      variants: snapshot.has('catalog.variants'),
      quickAdd: snapshot.has('catalog.quick_add'),
      shiftHandoff: snapshot.has('ops.shift_handoff'),
      teamInvite: snapshot.has('ops.team_invite'),
      hardwareDiagnostics: snapshot.has('hardware.diagnostics'),
    }),
  );
  if (snapshot.has('fuel.dispatch')) result.add('fuel_station');
  return result;
}
