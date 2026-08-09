/**
 * Sprint 40 — weighted-line reconciliation and composable D1 batch planning.
 * This module adds statements to the caller-owned plan; it never commits alone.
 */
/* eslint-disable no-secrets/no-secrets -- canonical domain and SQL identifiers */
import { calculateWeightedSubtotalCents } from '@kipuspay/domain-inventory';
import { runD1AtomicPlan, type AtomicPlanBuilder, type D1DatabaseLike } from './index.js';
import { sha256Hex } from './crypto.js';

const SCALE_PROTOCOLS = new Set(['WEBHID', 'WEB_SERIAL', 'WEBUSB']);

export async function createWeightOverrideAuthorization(
  db: D1DatabaseLike,
  input: {
    readonly tenantId: string;
    readonly actorUserId: string;
    readonly approvedByUserId?: string;
    readonly terminalId: string;
    readonly saleId?: string | null;
    readonly offlineSaleId?: string | null;
    readonly saleItemId: string;
    readonly measurementId: string;
    readonly action: 'WEIGHT_OVERRIDE';
    readonly ttlSeconds: 90;
  },
): Promise<{ readonly authorizationToken: string; readonly expiresInSeconds: 90 }> {
  const authorizationToken = `weight_${crypto.randomUUID()}`;
  const tokenHash = await sha256Hex(authorizationToken);
  const id = crypto.randomUUID();
  await runD1AtomicPlan(db, (plan) => {
    plan.add(
      db
        .prepare(
          `INSERT INTO authorization_tokens (
             id, tenant_id, token_hash, approved_by_user_id, expires_at, action,
             actor_user_id, terminal_id, sale_id, offline_sale_id, sale_item_id, measurement_id
           ) VALUES (?, ?, ?, ?, datetime('now', '+90 seconds'), 'WEIGHT_OVERRIDE',
                     ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          input.tenantId,
          tokenHash,
          input.approvedByUserId ?? input.actorUserId,
          input.actorUserId,
          input.terminalId,
          input.saleId ?? null,
          input.offlineSaleId ?? null,
          input.saleItemId,
          input.measurementId,
        ),
    );
  });
  return { authorizationToken, expiresInSeconds: 90 };
}

export async function configureTenantWeightPolicy(
  db: D1DatabaseLike,
  input: { readonly tenantId: string; readonly manualWeightThresholdMicrounits: number },
): Promise<{ readonly manualWeightThresholdMicrounits: number }> {
  if (
    !input.tenantId ||
    !Number.isSafeInteger(input.manualWeightThresholdMicrounits) ||
    input.manualWeightThresholdMicrounits < 0
  ) {
    throw new Error('WEIGHT_POLICY_INVALID');
  }
  await runD1AtomicPlan(db, (plan) => {
    plan.add(
      db
        .prepare(
          `UPDATE tenant_weight_policies
           SET manual_weight_threshold_microunits = ?, updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = ?`,
        )
        .bind(input.manualWeightThresholdMicrounits, input.tenantId),
    );
    plan.add(
      db
        .prepare(
          `INSERT INTO tenant_weight_policies (
             id, tenant_id, manual_weight_threshold_microunits
           )
           SELECT ?, ?, ? WHERE NOT EXISTS (
             SELECT 1 FROM tenant_weight_policies WHERE tenant_id = ?
           )`,
        )
        .bind(
          crypto.randomUUID(),
          input.tenantId,
          input.manualWeightThresholdMicrounits,
          input.tenantId,
        ),
    );
  });
  return { manualWeightThresholdMicrounits: input.manualWeightThresholdMicrounits };
}

export interface ActiveTerminalSession {
  readonly terminalSessionId: string;
  readonly terminalId: string;
  readonly cashRegisterSessionId: string;
  readonly userId: string;
  readonly branchId: string;
}

export async function resolveActiveTerminalSession(
  db: D1DatabaseLike,
  input: {
    readonly tenantId: string;
    readonly userId: string;
    readonly terminalId: string;
    readonly terminalSessionId?: string;
    readonly cashRegisterSessionId?: string;
    readonly branchId?: string;
  },
): Promise<ActiveTerminalSession> {
  if (!input.tenantId || !input.userId || !input.terminalId) {
    throw new Error('TERMINAL_SESSION_FORBIDDEN');
  }
  const row = await db
    .prepare(
      `SELECT pts.id AS terminal_session_id, pts.terminal_id,
              pts.cash_register_session_id, pts.user_id, pts.branch_id
       FROM pos_terminal_sessions pts
       INNER JOIN pos_terminals pt
         ON pt.tenant_id = pts.tenant_id AND pt.id = pts.terminal_id
        AND pt.branch_id = pts.branch_id AND pt.active = 1
       INNER JOIN cash_register_sessions crs
         ON crs.tenant_id = pts.tenant_id AND crs.id = pts.cash_register_session_id
        AND crs.branch_id = pts.branch_id AND crs.user_id = pts.user_id
        AND crs.status = 'OPEN'
       INNER JOIN users u
         ON u.tenant_id = pts.tenant_id AND u.id = pts.user_id
        AND u.branch_id = pts.branch_id AND u.is_active = 1 AND u.deleted_at IS NULL
       WHERE pts.tenant_id = ? AND pts.user_id = ? AND pts.terminal_id = ?
         AND pts.status = 'ACTIVE'
         AND (? = '' OR pts.id = ?)
         AND (? = '' OR pts.cash_register_session_id = ?)
         AND (? = '' OR pts.branch_id = ?)
       LIMIT 1`,
    )
    .bind(
      input.tenantId,
      input.userId,
      input.terminalId,
      input.terminalSessionId?.trim() ?? '',
      input.terminalSessionId?.trim() ?? '',
      input.cashRegisterSessionId?.trim() ?? '',
      input.cashRegisterSessionId?.trim() ?? '',
      input.branchId?.trim() ?? '',
      input.branchId?.trim() ?? '',
    )
    .first<{
      terminal_session_id: string;
      terminal_id: string;
      cash_register_session_id: string;
      user_id: string;
      branch_id: string;
    }>();
  if (!row) throw new Error('TERMINAL_SESSION_FORBIDDEN');
  return {
    terminalSessionId: row.terminal_session_id,
    terminalId: row.terminal_id,
    cashRegisterSessionId: row.cash_register_session_id,
    userId: row.user_id,
    branchId: row.branch_id,
  };
}

export async function registerTerminalSession(
  db: D1DatabaseLike,
  input: {
    readonly tenantId: string;
    readonly terminalId: string;
    readonly cashRegisterSessionId: string;
    readonly userId: string;
  },
): Promise<{ readonly terminalSessionId: string; readonly status: 'ACTIVE' }> {
  const target = await db
    .prepare(
      `SELECT pt.branch_id
       FROM pos_terminals pt
       INNER JOIN cash_register_sessions crs
         ON crs.tenant_id = pt.tenant_id AND crs.branch_id = pt.branch_id
        AND crs.id = ? AND crs.user_id = ? AND crs.status = 'OPEN'
       INNER JOIN users u
         ON u.tenant_id = pt.tenant_id AND u.id = crs.user_id
        AND u.branch_id = pt.branch_id AND u.is_active = 1 AND u.deleted_at IS NULL
       WHERE pt.tenant_id = ? AND pt.id = ? AND pt.active = 1
       LIMIT 1`,
    )
    .bind(input.cashRegisterSessionId, input.userId, input.tenantId, input.terminalId)
    .first<{ branch_id: string }>();
  if (!target) throw new Error('TERMINAL_SESSION_TARGET_INVALID');
  const existing = await db
    .prepare(
      `SELECT id FROM pos_terminal_sessions
       WHERE tenant_id = ? AND terminal_id = ? AND cash_register_session_id = ?
         AND user_id = ? AND branch_id = ? AND status = 'ACTIVE' LIMIT 1`,
    )
    .bind(
      input.tenantId,
      input.terminalId,
      input.cashRegisterSessionId,
      input.userId,
      target.branch_id,
    )
    .first<{ id: string }>();
  if (existing) return { terminalSessionId: existing.id, status: 'ACTIVE' };
  const terminalSessionId = crypto.randomUUID();
  await runD1AtomicPlan(db, (plan) => {
    plan.guardState(
      `SELECT 1
       WHERE NOT EXISTS (
         SELECT 1 FROM pos_terminal_sessions
         WHERE tenant_id = ? AND status = 'ACTIVE'
           AND (terminal_id = ? OR cash_register_session_id = ?)
       )`,
      [input.tenantId, input.terminalId, input.cashRegisterSessionId],
    );
    plan.add(
      db
        .prepare(
          `INSERT INTO pos_terminal_sessions (
             id, tenant_id, terminal_id, cash_register_session_id, user_id, branch_id, status
           ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')`,
        )
        .bind(
          terminalSessionId,
          input.tenantId,
          input.terminalId,
          input.cashRegisterSessionId,
          input.userId,
          target.branch_id,
        ),
    );
  });
  return { terminalSessionId, status: 'ACTIVE' };
}

export async function writeScaleHeartbeat(
  db: D1DatabaseLike,
  input: {
    readonly tenantId: string;
    readonly userId: string;
    readonly terminalId: string;
    readonly terminalSessionId: string;
    readonly cashRegisterSessionId: string;
    readonly branchId: string;
    readonly deviceId: string;
    readonly protocol: 'WEBHID' | 'WEB_SERIAL' | 'WEBUSB';
    readonly heartbeatSequence: number;
    readonly observedAt: string;
  },
): Promise<{ readonly deviceId: string; readonly heartbeatSequence: number }> {
  await resolveActiveTerminalSession(db, input);
  const observedAtMs = Date.parse(input.observedAt);
  const nowMs = Date.now();
  if (
    !Number.isSafeInteger(input.heartbeatSequence) ||
    input.heartbeatSequence < 0 ||
    !Number.isFinite(observedAtMs) ||
    nowMs - observedAtMs >= 2_000 ||
    observedAtMs > nowMs
  ) {
    throw new Error('SCALE_HEARTBEAT_STALE');
  }
  const device = await db
    .prepare(
      `SELECT protocol, last_heartbeat_sequence
       FROM scale_devices
       WHERE tenant_id = ? AND id = ? AND terminal_id = ? AND status = 'ACTIVE' LIMIT 1`,
    )
    .bind(input.tenantId, input.deviceId, input.terminalId)
    .first<{ protocol: string; last_heartbeat_sequence: number | null }>();
  if (!device) throw new Error('SCALE_DEVICE_SCOPE_MISMATCH');
  if (device.protocol !== input.protocol) throw new Error('SCALE_HEARTBEAT_PROTOCOL_MISMATCH');
  if (
    device.last_heartbeat_sequence !== null &&
    input.heartbeatSequence <= device.last_heartbeat_sequence
  ) {
    throw new Error('SCALE_HEARTBEAT_REORDERED');
  }
  await runD1AtomicPlan(db, (plan) => {
    plan.guardState(
      `SELECT 1 FROM scale_devices
       WHERE tenant_id = ? AND id = ? AND terminal_id = ? AND protocol = ?
         AND status = 'ACTIVE'
         AND (last_heartbeat_sequence IS NULL OR last_heartbeat_sequence < ?)`,
      [input.tenantId, input.deviceId, input.terminalId, input.protocol, input.heartbeatSequence],
    );
    plan.add(
      db
        .prepare(
          `UPDATE scale_devices
           SET last_heartbeat_at = CURRENT_TIMESTAMP, last_heartbeat_sequence = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = ? AND id = ? AND terminal_id = ? AND protocol = ?
             AND status = 'ACTIVE'
             AND (last_heartbeat_sequence IS NULL OR last_heartbeat_sequence < ?)`,
        )
        .bind(
          input.heartbeatSequence,
          input.tenantId,
          input.deviceId,
          input.terminalId,
          input.protocol,
          input.heartbeatSequence,
        ),
    );
  });
  return { deviceId: input.deviceId, heartbeatSequence: input.heartbeatSequence };
}

export interface ScaleDeviceProfile {
  readonly profileId: string;
  readonly vendorId: number;
  readonly productId: number;
  readonly reportId?: number;
  readonly endpoint?: number;
  readonly baudRate?: number;
}

function expectedScaleFingerprint(input: {
  readonly protocol: 'WEBHID' | 'WEB_SERIAL' | 'WEBUSB';
  readonly profile: ScaleDeviceProfile;
}): string {
  const prefix =
    input.protocol === 'WEBHID' ? 'hid' : input.protocol === 'WEBUSB' ? 'usb' : 'serial';
  return `${prefix}:${input.profile.vendorId.toString(16).padStart(4, '0')}:${input.profile.productId
    .toString(16)
    .padStart(4, '0')}:${input.profile.profileId}`.toLowerCase();
}

function assertScaleRegistrationAllowed(input: {
  readonly protocol: 'WEBHID' | 'WEB_SERIAL' | 'WEBUSB';
  readonly deviceFingerprint: string;
  readonly profile: ScaleDeviceProfile;
}): void {
  if (!SCALE_PROTOCOLS.has(input.protocol)) throw new Error('SCALE_PROTOCOL_NOT_ALLOWED');
  const baseProfileValid =
    Boolean(input.deviceFingerprint) &&
    input.deviceFingerprint.length <= 256 &&
    Boolean(input.profile.profileId) &&
    Number.isSafeInteger(input.profile.vendorId) &&
    Number.isSafeInteger(input.profile.productId);
  const transportProfileValid =
    (input.protocol === 'WEBHID' && Number.isSafeInteger(input.profile.reportId)) ||
    (input.protocol === 'WEBUSB' && Number.isSafeInteger(input.profile.endpoint)) ||
    (input.protocol === 'WEB_SERIAL' &&
      [9_600, 19_200, 38_400, 115_200].includes(input.profile.baudRate ?? 0));
  if (
    !baseProfileValid ||
    !transportProfileValid ||
    input.deviceFingerprint.toLowerCase() !== expectedScaleFingerprint(input)
  ) {
    throw new Error('SCALE_PROFILE_NOT_ALLOWED');
  }
}

export async function registerScaleDevice(
  db: D1DatabaseLike,
  input: {
    readonly tenantId: string;
    readonly terminalId: string;
    readonly protocol: 'WEBHID' | 'WEB_SERIAL' | 'WEBUSB';
    readonly deviceFingerprint: string;
    readonly profile: ScaleDeviceProfile;
  },
): Promise<{ readonly deviceId: string; readonly status: 'ACTIVE' }> {
  assertScaleRegistrationAllowed(input);
  const terminal = await db
    .prepare(`SELECT id FROM pos_terminals WHERE tenant_id = ? AND id = ? LIMIT 1`)
    .bind(input.tenantId, input.terminalId)
    .first<{ id: string }>();
  if (!terminal) throw new Error('SCALE_TERMINAL_NOT_FOUND');
  const active = await db
    .prepare(
      `SELECT id, device_fingerprint FROM scale_devices
       WHERE tenant_id = ? AND terminal_id = ? AND status = 'ACTIVE' LIMIT 1`,
    )
    .bind(input.tenantId, input.terminalId)
    .first<{ id: string; device_fingerprint?: string }>();
  if (active?.device_fingerprint && active.device_fingerprint !== input.deviceFingerprint) {
    throw new Error('SCALE_DEVICE_SWITCH_REQUIRES_DISABLE');
  }
  const deviceId = active?.id ?? crypto.randomUUID();
  if (!active) {
    await runD1AtomicPlan(db, (plan) => {
      plan.guardState(
        `SELECT 1 WHERE NOT EXISTS (
           SELECT 1 FROM scale_devices
           WHERE tenant_id = ? AND terminal_id = ? AND status = 'ACTIVE'
         )`,
        [input.tenantId, input.terminalId],
      );
      plan.add(
        db
          .prepare(
            `INSERT INTO scale_devices (
               id, tenant_id, terminal_id, protocol, device_fingerprint, config_json, status
             ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')`,
          )
          .bind(
            deviceId,
            input.tenantId,
            input.terminalId,
            input.protocol,
            input.deviceFingerprint,
            JSON.stringify(input.profile),
          ),
      );
    });
  }
  return { deviceId, status: 'ACTIVE' };
}

export async function listScaleDevices(
  db: D1DatabaseLike,
  input: { readonly tenantId: string; readonly terminalId?: string },
): Promise<readonly Record<string, unknown>[]> {
  const query = input.terminalId
    ? db
        .prepare(
          `SELECT id, terminal_id, protocol, device_fingerprint, config_json, status,
                  last_heartbeat_at
           FROM scale_devices WHERE tenant_id = ? AND terminal_id = ?
           ORDER BY created_at DESC`,
        )
        .bind(input.tenantId, input.terminalId)
    : db
        .prepare(
          `SELECT id, terminal_id, protocol, device_fingerprint, config_json, status,
                  last_heartbeat_at
           FROM scale_devices WHERE tenant_id = ? ORDER BY created_at DESC`,
        )
        .bind(input.tenantId);
  return (await query.all<Record<string, unknown>>()).results;
}

export async function diagnoseScaleDevice(
  db: D1DatabaseLike,
  input: { readonly tenantId: string; readonly terminalId: string; readonly deviceId: string },
): Promise<Record<string, unknown>> {
  const device = await db
    .prepare(
      `SELECT id, terminal_id, protocol, device_fingerprint, config_json, status,
              last_heartbeat_at
       FROM scale_devices WHERE tenant_id = ? AND terminal_id = ? AND id = ? LIMIT 1`,
    )
    .bind(input.tenantId, input.terminalId, input.deviceId)
    .first<Record<string, unknown>>();
  if (!device) throw new Error('SCALE_DEVICE_NOT_FOUND');
  return device;
}

export async function disableScaleDevice(
  db: D1DatabaseLike,
  input: { readonly tenantId: string; readonly terminalId: string; readonly deviceId: string },
): Promise<{ readonly deviceId: string; readonly status: 'DISABLED' }> {
  const device = await diagnoseScaleDevice(db, input);
  if (device.status === 'DISABLED') return { deviceId: input.deviceId, status: 'DISABLED' };
  await runD1AtomicPlan(db, (plan) => {
    plan.add(
      db
        .prepare(
          `UPDATE scale_devices SET status = 'DISABLED', updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = ? AND terminal_id = ? AND id = ? AND status != 'DISABLED'`,
        )
        .bind(input.tenantId, input.terminalId, input.deviceId),
    );
  });
  return { deviceId: input.deviceId, status: 'DISABLED' };
}

// eslint-disable-next-line complexity -- zero-trust validation enumerates source and policy branches
export async function submitWeightMeasurementAtomic(
  db: D1DatabaseLike,
  input: Omit<
    ResolvedWeightMeasurementInput,
    'unitPricePerBaseCents' | 'saleId' | 'authorizationTokenId'
  > & { readonly authorizationToken?: string | null },
): Promise<{
  readonly measurementId: string;
  readonly weightMicrounits: number;
  readonly authoritativeSubtotalCents: number;
}> {
  const nowMs = Date.now();
  if (input.measurementSource === 'DEVICE') {
    const observedAtMs = Date.parse(input.observedAt ?? '');
    if (
      !input.scaleDeviceId ||
      !input.scaleProtocol ||
      !Number.isSafeInteger(input.heartbeatSequence) ||
      !Number.isFinite(observedAtMs) ||
      nowMs - observedAtMs >= 2_000 ||
      observedAtMs > nowMs
    ) {
      throw new Error('SCALE_HEARTBEAT_STALE');
    }
    const device = await db
      .prepare(
        `SELECT last_heartbeat_at, last_heartbeat_sequence FROM scale_devices
         WHERE tenant_id = ? AND id = ? AND terminal_id = ? AND protocol = ?
           AND status = 'ACTIVE' LIMIT 1`,
      )
      .bind(input.tenantId, input.scaleDeviceId, input.terminalId, input.scaleProtocol)
      .first<{ last_heartbeat_at: string | null; last_heartbeat_sequence: number | null }>();
    const deviceHeartbeatMs = device?.last_heartbeat_at
      ? Date.parse(device.last_heartbeat_at)
      : NaN;
    if (
      !device ||
      !Number.isFinite(deviceHeartbeatMs) ||
      nowMs - deviceHeartbeatMs >= 2_000 ||
      deviceHeartbeatMs > nowMs
    ) {
      throw new Error('SCALE_HEARTBEAT_STALE');
    }
  } else {
    if (input.scaleDeviceId || input.scaleProtocol || input.heartbeatSequence !== null) {
      throw new Error('WEIGHT_SOURCE_MISMATCH');
    }
    const policy = await db
      .prepare(
        `SELECT manual_weight_threshold_microunits
         FROM tenant_weight_policies WHERE tenant_id = ? LIMIT 1`,
      )
      .bind(input.tenantId)
      .first<{ manual_weight_threshold_microunits: number }>();
    if (
      input.weightMicrounits > (policy?.manual_weight_threshold_microunits ?? 0) &&
      !input.authorizationToken
    ) {
      throw new Error('WEIGHT_OVERRIDE_REQUIRED');
    }
  }
  const resolved = await db
    .prepare(
      `SELECT si.sale_id, p.price_cents
       FROM sale_items si
       INNER JOIN products p ON p.tenant_id = si.tenant_id AND p.id = si.product_id
       WHERE si.tenant_id = ? AND si.id = ? AND si.product_id = ?
         AND si.product_type = 'WEIGH' AND p.product_type = 'WEIGH' LIMIT 1`,
    )
    .bind(input.tenantId, input.saleItemId, input.productId)
    .first<{ sale_id: string; price_cents: number }>();
  if (!resolved) throw new Error('WEIGH_SALE_LINE_NOT_FOUND');
  let authorizationTokenId: string | null = null;
  if (input.authorizationToken) {
    const tokenHash = await sha256Hex(input.authorizationToken);
    const token = await db
      .prepare(
        `SELECT id FROM authorization_tokens
         WHERE tenant_id = ? AND token_hash = ? AND action = 'WEIGHT_OVERRIDE'
           AND actor_user_id = ? AND terminal_id = ? AND sale_item_id = ?
           AND measurement_id = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
           AND datetime(expires_at) <= datetime(created_at, '+90 seconds')
           AND ((sale_id = ? AND offline_sale_id IS NULL)
             OR (sale_id IS NULL AND offline_sale_id = ?))
         LIMIT 1`,
      )
      .bind(
        input.tenantId,
        tokenHash,
        input.actorUserId,
        input.terminalId,
        input.saleItemId,
        input.measurementId,
        resolved.sale_id,
        input.offlineSaleId ?? null,
      )
      .first<{ id: string }>();
    if (!token) throw new Error('WEIGHT_OVERRIDE_SCOPE_INVALID');
    authorizationTokenId = token.id;
  }
  const authoritativeSubtotalCents = calculateWeightedSubtotalCents({
    unitPricePerBaseCents: resolved.price_cents,
    weightMicrounits: input.weightMicrounits,
  });
  await runD1AtomicPlan(db, async (plan) => {
    await appendWeightMeasurementToPlan(plan, db, {
      ...input,
      saleId: resolved.sale_id,
      unitPricePerBaseCents: resolved.price_cents,
      authorizationTokenId,
    });
  });
  return {
    measurementId: input.measurementId,
    weightMicrounits: input.weightMicrounits,
    authoritativeSubtotalCents,
  };
}

export interface WeightedSaleLine {
  readonly saleItemId: string;
  readonly productId: string;
  readonly productType: string;
}

export interface WeightedMeasurementIdentity {
  readonly measurementId: string;
  readonly saleItemId: string;
  readonly productId: string;
}

export function assertWeightedMeasurementCoverage(
  lines: readonly WeightedSaleLine[],
  measurements: readonly WeightedMeasurementIdentity[],
): readonly (WeightedMeasurementIdentity & { readonly saleItemId: string })[] {
  const weightedLines = lines.filter((line) => line.productType === 'WEIGH');
  const weightedIds = new Set(weightedLines.map((line) => line.saleItemId));
  const matches = measurements.filter((measurement) => weightedIds.has(measurement.saleItemId));
  for (const line of weightedLines) {
    const lineMeasurements = matches.filter(
      (measurement) =>
        measurement.saleItemId === line.saleItemId && measurement.productId === line.productId,
    );
    if (lineMeasurements.length === 0) throw new Error('WEIGHT_MEASUREMENT_REQUIRED');
    if (lineMeasurements.length !== 1) throw new Error('WEIGHT_MEASUREMENT_CARDINALITY');
  }
  if (matches.length !== weightedLines.length) throw new Error('WEIGHT_MEASUREMENT_CARDINALITY');
  return matches;
}

export interface WeightOverrideToken {
  readonly id: string;
  readonly action: string;
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly terminalId: string;
  readonly saleId?: string | null;
  readonly offlineSaleId?: string | null;
  readonly saleItemId: string;
  readonly measurementId: string;
  readonly issuedAtEpochMs: number;
  readonly expiresAtEpochMs: number;
  readonly usedAtEpochMs: number | null;
}

export interface WeightOverrideScope {
  readonly nowEpochMs: number;
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly terminalId: string;
  readonly saleId?: string | null;
  readonly offlineSaleId?: string | null;
  readonly saleItemId: string;
  readonly measurementId: string;
}

function hasValidWeightOverrideTtl(token: WeightOverrideToken): boolean {
  return (
    Number.isSafeInteger(token.issuedAtEpochMs) &&
    Number.isSafeInteger(token.expiresAtEpochMs) &&
    token.expiresAtEpochMs > token.issuedAtEpochMs &&
    token.expiresAtEpochMs - token.issuedAtEpochMs <= 90_000
  );
}

function matchesWeightOverrideScope(
  token: WeightOverrideToken,
  scope: WeightOverrideScope,
): boolean {
  const tokenScope = [
    token.action,
    token.tenantId,
    token.actorUserId,
    token.terminalId,
    token.saleId ?? null,
    token.offlineSaleId ?? null,
    token.saleItemId,
    token.measurementId,
  ];
  const expectedScope = [
    'WEIGHT_OVERRIDE',
    scope.tenantId,
    scope.actorUserId,
    scope.terminalId,
    scope.saleId ?? null,
    scope.offlineSaleId ?? null,
    scope.saleItemId,
    scope.measurementId,
  ];
  return tokenScope.every((value, index) => value === expectedScope[index]);
}

export function validateWeightOverrideAuthorization(
  token: WeightOverrideToken,
  scope: WeightOverrideScope,
): { readonly authorizationTokenId: string; readonly consumeOnce: true } {
  if (!hasValidWeightOverrideTtl(token)) {
    throw new Error('WEIGHT_OVERRIDE_TTL_INVALID');
  }
  if (token.usedAtEpochMs !== null) throw new Error('WEIGHT_OVERRIDE_ALREADY_USED');
  if (
    !Number.isSafeInteger(scope.nowEpochMs) ||
    scope.nowEpochMs < token.issuedAtEpochMs ||
    scope.nowEpochMs >= token.expiresAtEpochMs
  ) {
    throw new Error('WEIGHT_OVERRIDE_EXPIRED');
  }
  if (!matchesWeightOverrideScope(token, scope)) throw new Error('WEIGHT_OVERRIDE_SCOPE_INVALID');
  return { authorizationTokenId: token.id, consumeOnce: true };
}

/**
 * Internal resolved input. HTTP DTOs must never construct this directly: price,
 * subtotal policy and tenant scope are loaded by the sale reconciler first.
 */
export interface ResolvedWeightMeasurementInput {
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly terminalId: string;
  readonly saleId: string;
  readonly offlineSaleId?: string | null;
  readonly saleItemId: string;
  readonly productId: string;
  readonly measurementId: string;
  readonly weightMicrounits: number;
  readonly unitPricePerBaseCents: number;
  readonly measurementSource: 'DEVICE' | 'MANUAL';
  readonly authorizationTokenId?: string | null;
  readonly scaleProtocol?: 'WEBHID' | 'WEB_SERIAL' | 'WEBUSB' | null;
  readonly scaleDeviceId?: string | null;
  readonly heartbeatSequence?: number | null;
  readonly observedAt?: string;
  readonly idempotencyKey?: string;
  readonly previousAuditHash?: string | null;
}

async function scaleAuditHash(value: Record<string, unknown>): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function appendWeightMeasurementToPlan(
  plan: AtomicPlanBuilder,
  db: D1DatabaseLike,
  input: ResolvedWeightMeasurementInput,
): Promise<{ readonly rowHash: string }> {
  if (!Number.isSafeInteger(input.weightMicrounits) || input.weightMicrounits <= 0) {
    throw new Error('SCALE_WEIGHT_INVALID');
  }
  const subtotalCents = calculateWeightedSubtotalCents(input);
  const idempotencyKey = input.idempotencyKey ?? input.measurementId;
  const previousAudit =
    input.previousAuditHash === undefined
      ? await db
          .prepare(
            `SELECT row_hash FROM audit_events
             WHERE tenant_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
          )
          .bind(input.tenantId)
          .first<{ row_hash: string }>()
      : null;
  const previousHash =
    input.previousAuditHash === undefined
      ? (previousAudit?.row_hash ?? null)
      : input.previousAuditHash;
  const auditAction = input.authorizationTokenId ? 'WEIGHT_OVERRIDE' : 'WEIGHT_MEASUREMENT';
  const auditPayload = {
    saleId: input.saleId,
    saleItemId: input.saleItemId,
    productId: input.productId,
    weightMicrounits: input.weightMicrounits,
    authorizationTokenId: input.authorizationTokenId ?? null,
  };
  const rowHash = await scaleAuditHash({
    action: auditAction,
    entityType: 'weight_measurement',
    entityId: input.measurementId,
    payload: auditPayload,
    previousHash,
  });
  plan.add(
    db
      .prepare(
        `INSERT INTO weight_measurements (
           id, tenant_id, sale_item_id, product_id, terminal_id, scale_device_id,
           operation_type, operation_id, idempotency_key, weight_microunits,
           unit_price_per_base_cents, subtotal_cents, measurement_source,
           scale_protocol, heartbeat_sequence, observed_at, authorization_token_id
         ) VALUES (?, ?, ?, ?, ?, ?, 'SALE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.measurementId,
        input.tenantId,
        input.saleItemId,
        input.productId,
        input.terminalId,
        input.scaleDeviceId ?? null,
        input.saleId,
        idempotencyKey,
        input.weightMicrounits,
        input.unitPricePerBaseCents,
        subtotalCents,
        input.measurementSource,
        input.scaleProtocol ?? null,
        input.heartbeatSequence ?? null,
        input.observedAt ?? new Date().toISOString(),
        input.authorizationTokenId ?? null,
      ),
  );
  if (input.authorizationTokenId) {
    const tokenGuardId = crypto.randomUUID();
    plan.add(
      db
        .prepare(
          `INSERT INTO atomic_guards (id, ok)
           SELECT ?, CASE WHEN EXISTS (
             SELECT 1 FROM authorization_tokens
             WHERE tenant_id = ? AND id = ? AND action = 'WEIGHT_OVERRIDE'
               AND actor_user_id = ? AND terminal_id = ?
               AND sale_item_id = ? AND measurement_id = ?
               AND ((sale_id = ? AND offline_sale_id IS NULL)
                 OR (sale_id IS NULL AND offline_sale_id = ?))
               AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
               AND datetime(expires_at) <= datetime(created_at, '+90 seconds')
           ) THEN 1 ELSE 0 END`,
        )
        .bind(
          tokenGuardId,
          input.tenantId,
          input.authorizationTokenId,
          input.actorUserId,
          input.terminalId,
          input.saleItemId,
          input.measurementId,
          input.saleId,
          input.offlineSaleId ?? null,
        ),
    );
    plan.add(
      db
        .prepare(
          `UPDATE authorization_tokens
           SET used_at = CURRENT_TIMESTAMP
           WHERE tenant_id = ? AND id = ? AND action = 'WEIGHT_OVERRIDE'
             AND actor_user_id = ? AND terminal_id = ? AND sale_item_id = ?
             AND measurement_id = ? AND used_at IS NULL
             AND ((sale_id = ? AND offline_sale_id IS NULL)
               OR (sale_id IS NULL AND offline_sale_id = ?))`,
        )
        .bind(
          input.tenantId,
          input.authorizationTokenId,
          input.actorUserId,
          input.terminalId,
          input.saleItemId,
          input.measurementId,
          input.saleId,
          input.offlineSaleId ?? null,
        ),
    );
    plan.add(db.prepare(`DELETE FROM atomic_guards WHERE id = ?`).bind(tokenGuardId));
  }
  const auditGuardId = crypto.randomUUID();
  plan.add(
    db
      .prepare(
        `INSERT INTO atomic_guards (id, ok)
         SELECT ?, CASE WHEN COALESCE((
           SELECT row_hash FROM audit_events
           WHERE tenant_id = ? ORDER BY rowid DESC LIMIT 1
         ), '') = COALESCE(?, '') THEN 1 ELSE 0 END`,
      )
      .bind(auditGuardId, input.tenantId, previousHash),
  );
  plan.add(
    db
      .prepare(
        `INSERT INTO audit_events (
           id, tenant_id, actor_user_id, action, entity_type, entity_id,
           payload_json, prev_hash, row_hash
         ) VALUES (?, ?, ?, '${auditAction}', 'weight_measurement', ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        input.tenantId,
        input.actorUserId,
        input.measurementId,
        JSON.stringify(auditPayload),
        previousHash,
        rowHash,
      ),
  );
  plan.add(db.prepare(`DELETE FROM atomic_guards WHERE id = ?`).bind(auditGuardId));
  return { rowHash };
}

export function reconcileWeightedSync(input: {
  readonly catalog: readonly {
    readonly productId: string;
    readonly productType: string;
    readonly unitPricePerBaseCents: number;
  }[];
  readonly measurements: readonly {
    readonly measurementId: string;
    readonly saleItemId: string;
    readonly productId: string;
    readonly weightMicrounits: number;
    readonly measurementSource: 'DEVICE' | 'MANUAL';
  }[];
  readonly clientProjectedTotalCents: number;
  readonly transport: 'ONLINE' | 'OFFLINE_SYNC';
}): {
  readonly authoritativeTotalCents: number;
  readonly lines: readonly {
    readonly measurementId: string;
    readonly saleItemId: string;
    readonly productId: string;
    readonly weightMicrounits: number;
    readonly subtotalCents: number;
  }[];
} {
  const catalogByProduct = new Map(input.catalog.map((item) => [item.productId, item]));
  const seenLines = new Set<string>();
  const lines = input.measurements.map((measurement) => {
    if (seenLines.has(measurement.saleItemId)) {
      throw new Error('WEIGHT_MEASUREMENT_CARDINALITY');
    }
    seenLines.add(measurement.saleItemId);
    const product = catalogByProduct.get(measurement.productId);
    if (!product || product.productType !== 'WEIGH') throw new Error('WEIGH_PRODUCT_REQUIRED');
    const subtotalCents = calculateWeightedSubtotalCents({
      unitPricePerBaseCents: product.unitPricePerBaseCents,
      weightMicrounits: measurement.weightMicrounits,
    });
    return {
      measurementId: measurement.measurementId,
      saleItemId: measurement.saleItemId,
      productId: measurement.productId,
      weightMicrounits: measurement.weightMicrounits,
      subtotalCents,
    };
  });
  const authoritativeTotalCents = lines.reduce((total, line) => {
    const next = total + line.subtotalCents;
    if (!Number.isSafeInteger(next)) throw new Error('WEIGHTED_SUBTOTAL_OVERFLOW');
    return next;
  }, 0);
  return { authoritativeTotalCents, lines };
}
