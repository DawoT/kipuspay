/**
 * Sprint 51 — ops.team_invite (Arquitectura §5.3 regla 36).
 *
 * - POST /api/team/invites: el Owner/Admin invita cajeros/vendedores (único
 *   por email, 409 si ya existe) y emite PIN de caja + badge `EMP-` únicos
 *   del tenant; el PIN claro se devuelve una sola vez; audit TEAM_INVITE.
 * - POST /api/team/resolve: atribución del vendedor en el carrito en <1 s —
 *   badge escaneado (namespace EMP-, edge 1A) o PIN de caja (hash server-side);
 *   fail-closed (404) ante identificadores desconocidos.
 *
 * Gating: flag default-off → 404; solo owner/admin invitan.
 */
import { processTeamInviteAtomic, resolveSellerIdentifier } from '@kipuspay/adapters-d1';
import type { HttpResult, QuickAddActor } from '../catalog/quick-add-routes.js';

export interface TeamEnv {
  readonly FEATURE_TEAM_INVITE?: string;
  readonly DB?: unknown;
}

export function isTeamInviteEnabled(env: TeamEnv | undefined): boolean {
  return env?.FEATURE_TEAM_INVITE === '1';
}

const ADMIN_ROLES = new Set(['owner', 'admin', 'supervisor']);

export async function runTeamInviteHttp(
  env: TeamEnv,
  actor: QuickAddActor,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  if (!isTeamInviteEnabled(env)) return { status: 404, body: { code: 'FEATURE_OFF' } };
  if (!env.DB) return { status: 503, body: { code: 'TEAM_DB_UNAVAILABLE' } };
  if (!ADMIN_ROLES.has(actor.role.toLowerCase())) {
    return { status: 403, body: { code: 'FORBIDDEN' } };
  }
  const email = typeof body.email === 'string' ? body.email : '';
  const role = typeof body.role === 'string' ? body.role : '';
  const branchId = typeof body.branchId === 'string' ? body.branchId : '';
  if (!email || !role) {
    return { status: 400, body: { code: 'BAD_REQUEST', error: 'email and role required' } };
  }
  // S51-H5: jerarquía de roles — el invitado jamás tiene más privilegios que
  // quien invita: owner→todo; admin→no owner; supervisor→solo cashier.
  const actorRole = actor.role.toLowerCase();
  const hierarchy: Record<string, number> = { cashier: 0, supervisor: 1, admin: 2, owner: 3 };
  const invitedRank = hierarchy[role] ?? -1;
  const actorRank = hierarchy[actorRole] ?? -1;
  if (invitedRank < 0 || invitedRank > actorRank) {
    return { status: 403, body: { code: 'FORBIDDEN_ROLE' } };
  }
  const invited = await processTeamInviteAtomic(env.DB as never, {
    tenantId: actor.tenantId,
    branchId: branchId || null,
    actorUserId: actor.userId,
    email,
    role: role as 'cashier' | 'supervisor' | 'admin',
  });
  if (!invited.ok) return { status: invited.status, body: invited.body };
  return {
    status: 201,
    body: {
      userId: invited.userId,
      badgeBarcode: invited.badgeBarcode,
      cashierPin: invited.cashierPin,
    },
  };
}

export async function runResolveSellerHttp(
  env: TeamEnv,
  actor: QuickAddActor,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  if (!isTeamInviteEnabled(env)) return { status: 404, body: { code: 'FEATURE_OFF' } };
  if (!env.DB) return { status: 503, body: { code: 'TEAM_DB_UNAVAILABLE' } };
  const identifier = typeof body.identifier === 'string' ? body.identifier : '';
  if (!identifier) {
    return { status: 400, body: { code: 'BAD_REQUEST', error: 'identifier required' } };
  }
  const resolved = await resolveSellerIdentifier(env.DB as never, actor.tenantId, identifier);
  if (!resolved.ok) return { status: resolved.status, body: resolved.body };
  return {
    status: 200,
    body: {
      userId: resolved.seller.userId,
      email: resolved.seller.email,
      role: resolved.seller.role,
      badgeBarcode: resolved.seller.badgeBarcode,
      resolvedBy: resolved.seller.resolvedBy,
    },
  };
}
