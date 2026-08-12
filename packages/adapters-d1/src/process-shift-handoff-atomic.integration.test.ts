import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import {
  issueShiftPinAtomic,
  processShiftTransferAtomic,
  processTeamInviteAtomic,
  resolveSellerIdentifier,
} from './process-shift-handoff-atomic.js';

async function seedHandoffFixture(
  tenantId: string,
  openingBalanceCents = 10000,
): Promise<{
  branchId: string;
  sessionId: string;
  outgoingUserId: string;
  incomingUserId: string;
  registerId: string;
}> {
  const branchId = `b-${tenantId}`;
  const registerId = `cr-${tenantId}`;
  const outgoingUserId = `u-out-${tenantId}`;
  const incomingUserId = `u-in-${tenantId}`;
  const sessionId = `s-${tenantId}`;

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(tenantId, 'Turnos SAC', 'retail', 'shard-1', 'INTERNAL_CONTROL'),
    env.DB.prepare(
      `INSERT INTO branches (id, tenant_id, code, name, address) VALUES (?, ?, ?, ?, ?)`,
    ).bind(branchId, tenantId, 'C01', 'Centro', 'Lima'),
    env.DB.prepare(
      `INSERT INTO cash_registers (id, tenant_id, branch_id, name) VALUES (?, ?, ?, ?)`,
    ).bind(registerId, tenantId, branchId, 'Caja 1'),
    env.DB.prepare(
      `INSERT INTO users (id, tenant_id, branch_id, email, role) VALUES (?, ?, ?, ?, ?)`,
    ).bind(outgoingUserId, tenantId, branchId, `out-${tenantId}@example.com`, 'cashier'),
    env.DB.prepare(
      `INSERT INTO users (id, tenant_id, branch_id, email, role) VALUES (?, ?, ?, ?, ?)`,
    ).bind(incomingUserId, tenantId, branchId, `in-${tenantId}@example.com`, 'cashier'),
    env.DB.prepare(
      `INSERT INTO cash_register_sessions
         (id, tenant_id, branch_id, cash_register_id, user_id, opening_balance_cents, status)
       VALUES (?, ?, ?, ?, ?, ?, 'OPEN')`,
    ).bind(sessionId, tenantId, branchId, registerId, outgoingUserId, openingBalanceCents),
    env.DB.prepare(
      `INSERT INTO tenant_discount_policies (tenant_id, interim_required) VALUES (?, ?)`,
    ).bind(tenantId, 0),
  ]);

  return { branchId, sessionId, outgoingUserId, incomingUserId, registerId };
}

describe('shift handoff — edge de integración (Sprint 51)', () => {
  it('transfiere la sesión OPEN con PIN de un solo uso y audita SHIFT_TRANSFER', async () => {
    const tenantId = `t-handoff-${Date.now()}`;
    const { branchId, sessionId, outgoingUserId, incomingUserId } =
      await seedHandoffFixture(tenantId);

    const issued = await issueShiftPinAtomic(env.DB, {
      tenantId,
      userId: outgoingUserId,
      sessionId,
      nowIso: '2026-08-12T12:00:00.000Z',
    });
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    expect(issued.pin).toMatch(/^\d{6}$/);

    const result = await processShiftTransferAtomic(env.DB, {
      tenantId,
      sessionId,
      outgoingUserId,
      incomingUserId,
      pin: issued.pin,
      branchId,
      nowIso: '2026-08-12T12:00:01.000Z',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const shifts = await env.DB.prepare(
      `SELECT user_id, started_at, ended_at FROM cash_register_shifts
         WHERE tenant_id = ? AND cash_register_session_id = ? ORDER BY started_at`,
    )
      .bind(tenantId, sessionId)
      .all<{ user_id: string; started_at: string; ended_at: string | null }>();
    expect(shifts.results).toHaveLength(2);
    expect(shifts.results[0]!.user_id).toBe(outgoingUserId);
    expect(shifts.results[0]!.ended_at).not.toBeNull();
    expect(shifts.results[1]!.user_id).toBe(incomingUserId);
    expect(shifts.results[1]!.ended_at).toBeNull();

    const audit = await env.DB.prepare(
      `SELECT action, payload_json, row_hash, prev_hash FROM audit_events
         WHERE tenant_id = ? AND action = 'SHIFT_TRANSFER' LIMIT 1`,
    )
      .bind(tenantId)
      .first<{
        action: string;
        payload_json: string;
        row_hash: string;
        prev_hash: string | null;
      }>();
    expect(audit?.action).toBe('SHIFT_TRANSFER');
    expect(JSON.parse(audit!.payload_json).incomingUserId).toBe(incomingUserId);

    const session = await env.DB.prepare(
      `SELECT status FROM cash_register_sessions WHERE id = ? AND tenant_id = ?`,
    )
      .bind(sessionId, tenantId)
      .first<{ status: string }>();
    expect(session?.status).toBe('OPEN');

    const reused = await processShiftTransferAtomic(env.DB, {
      tenantId,
      sessionId,
      outgoingUserId,
      incomingUserId: 'u-otro',
      pin: issued.pin,
      branchId,
      nowIso: '2026-08-12T12:00:02.000Z',
    });
    // El tramo del saliente ya quedó cerrado: el mismo PIN no vuelve a
    // transferir nada (single-use, criterio "reuso → 401"). El 409 PIN_USED
    // del guard cubre el doble uso CONCURRENTE (dos batches en vuelo).
    expect(reused.ok).toBe(false);
    if (reused.ok) return;
    expect(reused.status).toBe(401);
    expect(reused.body.code).toBe('PIN_NOT_ISSUED');
  });

  it('PIN expirado → 401 (fail-closed) y no consume el tramo', async () => {
    const tenantId = `t-expired-${Date.now()}`;
    const { branchId, sessionId, outgoingUserId, incomingUserId } =
      await seedHandoffFixture(tenantId);

    const issued = await issueShiftPinAtomic(env.DB, {
      tenantId,
      userId: outgoingUserId,
      sessionId,
      nowIso: '2026-08-12T12:00:00.000Z',
    });
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    const expired = await processShiftTransferAtomic(env.DB, {
      tenantId,
      sessionId,
      outgoingUserId,
      incomingUserId,
      pin: issued.pin,
      branchId,
      nowIso: '2026-08-12T13:00:00.000Z',
    });
    expect(expired.ok).toBe(false);
    if (expired.ok) return;
    expect(expired.status).toBe(401);
    expect(expired.body.code).toBe('PIN_EXPIRED');

    const open = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM cash_register_shifts
         WHERE tenant_id = ? AND cash_register_session_id = ? AND ended_at IS NULL`,
    )
      .bind(tenantId, sessionId)
      .first<{ n: number }>();
    expect(open?.n).toBe(1);
  });

  it('interim_required: la diferencia se audita en SHIFT_TRANSFER sin bloquear', async () => {
    const tenantId = `t-interim-${Date.now()}`;
    const { branchId, sessionId, outgoingUserId, incomingUserId } = await seedHandoffFixture(
      tenantId,
      10000,
    );
    await env.DB.prepare(
      `UPDATE tenant_discount_policies SET interim_required = 1 WHERE tenant_id = ?`,
    )
      .bind(tenantId)
      .run();

    const issued = await issueShiftPinAtomic(env.DB, {
      tenantId,
      userId: outgoingUserId,
      sessionId,
      nowIso: '2026-08-12T12:00:00.000Z',
    });
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    const missingCount = await processShiftTransferAtomic(env.DB, {
      tenantId,
      sessionId,
      outgoingUserId,
      incomingUserId,
      pin: issued.pin,
      branchId,
      nowIso: '2026-08-12T12:00:01.000Z',
    });
    expect(missingCount.ok).toBe(false);
    if (missingCount.ok) return;
    expect(missingCount.status).toBe(422);
    expect(missingCount.body.code).toBe('INTERIM_COUNT_REQUIRED');

    // El 422 no consumió el PIN: la transferencia con conteo sigue el mismo.
    const withCount = await processShiftTransferAtomic(env.DB, {
      tenantId,
      sessionId,
      outgoingUserId,
      incomingUserId,
      pin: issued.pin,
      branchId,
      interimCountCents: 8000,
      nowIso: '2026-08-12T12:00:02.000Z',
    });
    expect(withCount.ok).toBe(true);
    if (!withCount.ok) return;
    // expected = opening 10000 (sin ventas ni movimientos) → faltan 2000.
    expect(withCount.cashDiffCents).toBe(2000);
    expect(withCount.interimRequired).toBe(true);

    const shift = await env.DB.prepare(
      `SELECT cash_diff_cents, interim_count_cents FROM cash_register_shifts
         WHERE tenant_id = ? AND cash_register_session_id = ? AND ended_at IS NOT NULL`,
    )
      .bind(tenantId, sessionId)
      .first<{ cash_diff_cents: number | null; interim_count_cents: number | null }>();
    expect(shift?.cash_diff_cents).toBe(2000);
    expect(shift?.interim_count_cents).toBe(8000);
  });

  it('invitación: único por email (409), emite badge EMP- y PIN de caja, audit TEAM_INVITE', async () => {
    const tenantId = `t-invite-${Date.now()}`;
    const { branchId, outgoingUserId } = await seedHandoffFixture(tenantId);

    const invited = await processTeamInviteAtomic(env.DB, {
      tenantId,
      branchId,
      actorUserId: outgoingUserId,
      email: '  VENDEDOR1@TIENDA.PE ',
      role: 'cashier',
      nowIso: '2026-08-12T12:00:00.000Z',
    });
    expect(invited.ok).toBe(true);
    if (!invited.ok) return;
    expect(invited.badgeBarcode).toMatch(/^EMP-\d{5,}$/);
    expect(invited.cashierPin).toMatch(/^\d{4}$/);

    const dup = await processTeamInviteAtomic(env.DB, {
      tenantId,
      branchId,
      actorUserId: outgoingUserId,
      email: 'vendedor1@tienda.pe',
      role: 'cashier',
    });
    expect(dup.ok).toBe(false);
    if (dup.ok) return;
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('USER_ALREADY_INVITED');

    const audit = await env.DB.prepare(
      `SELECT action FROM audit_events WHERE tenant_id = ? AND action = 'TEAM_INVITE' LIMIT 1`,
    )
      .bind(tenantId)
      .first<{ action: string }>();
    expect(audit?.action).toBe('TEAM_INVITE');

    const byBadge = await resolveSellerIdentifier(env.DB, tenantId, invited.badgeBarcode);
    expect(byBadge.ok).toBe(true);
    if (!byBadge.ok) return;
    expect(byBadge.seller.resolvedBy).toBe('badge');
    expect(byBadge.seller.email).toBe('vendedor1@tienda.pe');

    const byPin = await resolveSellerIdentifier(env.DB, tenantId, invited.cashierPin);
    expect(byPin.ok).toBe(true);
    if (!byPin.ok) return;
    expect(byPin.seller.resolvedBy).toBe('pin');
    expect(byPin.seller.userId).toBe(invited.userId);
  });

  it('resolve: fail-closed — identificador desconocido no resuelve a nadie', async () => {
    const tenantId = `t-resolve-${Date.now()}`;
    await seedHandoffFixture(tenantId);

    const unknown = await resolveSellerIdentifier(env.DB, tenantId, 'EMP-99999');
    expect(unknown.ok).toBe(false);
    if (unknown.ok) return;
    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe('UNKNOWN_IDENTIFIER');

    const notSeller = await resolveSellerIdentifier(env.DB, tenantId, 'abcd');
    expect(notSeller.ok).toBe(false);
  });
});
