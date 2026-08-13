/* eslint-disable no-secrets/no-secrets -- canonical domain error identifiers */
import { describe, expect, it } from 'vitest';
import { AtomicPlanBuilder, type D1Bound, type D1DatabaseLike } from './index.js';
import {
  appendWeightMeasurementToPlan,
  assertWeightedMeasurementCoverage,
  configureTenantWeightPolicy,
  diagnoseScaleDevice,
  disableScaleDevice,
  listScaleDevices,
  reconcileWeightedSync,
  registerScaleDevice,
  registerTerminalSession,
  resolveActiveTerminalSession,
  submitWeightMeasurementAtomic,
  validateWeightOverrideAuthorization,
  writeScaleHeartbeat,
  type ResolvedWeightMeasurementInput,
  type ScaleDeviceProfile,
  type WeightOverrideScope,
  type WeightOverrideToken,
} from './process-inventory-scale-atomic.js';

interface RecordedCall {
  readonly sql: string;
  readonly params: readonly unknown[];
}

interface ScriptedDb {
  readonly db: D1DatabaseLike;
  readonly calls: RecordedCall[];
  readonly batches: readonly D1Bound[][];
}

function scriptedDb(options?: {
  readonly first?: readonly unknown[];
  readonly all?: readonly (readonly unknown[])[];
}): ScriptedDb {
  const first = [...(options?.first ?? [])];
  const all = [...(options?.all ?? [])];
  const calls: RecordedCall[] = [];
  const batches: D1Bound[][] = [];
  const db: D1DatabaseLike = {
    prepare(sql) {
      const bound: D1Bound = {
        bind: (...params) => {
          calls.push({ sql, params });
          return bound;
        },
        all: <T>() =>
          Promise.resolve({
            results: (all.shift() ?? []) as T[],
            success: true,
            meta: {},
          }),
        first: <T>() => Promise.resolve((first.shift() ?? null) as T | null),
        run: () => Promise.resolve({ results: [], success: true, meta: {} }),
      };
      return { bind: (...params) => bound.bind(...params) };
    },
    batch(statements) {
      batches.push([...statements]);
      return Promise.resolve([]);
    },
  };
  return { db, calls, batches };
}

function callContaining(script: ScriptedDb, fragment: string): RecordedCall {
  const call = script.calls.find((candidate) => candidate.sql.includes(fragment));
  expect(call, `expected SQL containing ${fragment}`).toBeDefined();
  return call!;
}

const activeSessionRow = {
  terminal_session_id: 'terminal-session-a',
  terminal_id: 'terminal-a',
  cash_register_session_id: 'register-a',
  user_id: 'cashier-a',
  branch_id: 'branch-a',
};

const heartbeatInput = {
  tenantId: 'tenant-a',
  userId: 'cashier-a',
  terminalId: 'terminal-a',
  terminalSessionId: 'terminal-session-a',
  cashRegisterSessionId: 'register-a',
  branchId: 'branch-a',
  deviceId: 'device-a',
  protocol: 'WEBUSB' as const,
  heartbeatSequence: 7,
  observedAt: new Date().toISOString(),
};

const manualMeasurement = {
  tenantId: 'tenant-a',
  actorUserId: 'cashier-a',
  terminalId: 'terminal-a',
  saleItemId: 'line-a',
  productId: 'product-a',
  measurementId: 'measurement-a',
  weightMicrounits: 500_000,
  measurementSource: 'MANUAL' as const,
  scaleProtocol: null,
  scaleDeviceId: null,
  heartbeatSequence: null,
};

const resolvedMeasurement: ResolvedWeightMeasurementInput = {
  ...manualMeasurement,
  saleId: 'sale-a',
  unitPricePerBaseCents: 199,
};

const validToken: WeightOverrideToken = {
  id: 'token-a',
  action: 'WEIGHT_OVERRIDE',
  tenantId: 'tenant-a',
  actorUserId: 'cashier-a',
  terminalId: 'terminal-a',
  saleId: 'sale-a',
  offlineSaleId: null,
  saleItemId: 'line-a',
  measurementId: 'measurement-a',
  issuedAtEpochMs: 10_000,
  expiresAtEpochMs: 100_000,
  usedAtEpochMs: null,
};

const validScope: WeightOverrideScope = {
  nowEpochMs: 50_000,
  tenantId: 'tenant-a',
  actorUserId: 'cashier-a',
  terminalId: 'terminal-a',
  saleId: 'sale-a',
  offlineSaleId: null,
  saleItemId: 'line-a',
  measurementId: 'measurement-a',
};

describe('inventory scale policy and authorization branches', () => {
  it.each([
    { tenantId: '', manualWeightThresholdMicrounits: 0 },
    { tenantId: 'tenant-a', manualWeightThresholdMicrounits: -1 },
    { tenantId: 'tenant-a', manualWeightThresholdMicrounits: 1.5 },
    { tenantId: 'tenant-a', manualWeightThresholdMicrounits: Number.MAX_SAFE_INTEGER + 1 },
  ])('rejects invalid tenant policy %#', async (input) => {
    const script = scriptedDb();
    await expect(configureTenantWeightPolicy(script.db, input)).rejects.toThrow(
      'WEIGHT_POLICY_INVALID',
    );
    expect(script.batches).toHaveLength(0);
  });

  it('accepts the zero threshold boundary and binds both update and insert', async () => {
    const script = scriptedDb();
    await expect(
      configureTenantWeightPolicy(script.db, {
        tenantId: 'tenant-a',
        manualWeightThresholdMicrounits: 0,
      }),
    ).resolves.toEqual({ manualWeightThresholdMicrounits: 0 });
    expect(callContaining(script, 'UPDATE tenant_weight_policies').params).toEqual([0, 'tenant-a']);
    expect(callContaining(script, 'INSERT INTO tenant_weight_policies').params.slice(1)).toEqual([
      'tenant-a',
      0,
      'tenant-a',
    ]);
  });

  it.each([
    [{ ...validToken, issuedAtEpochMs: 1.5 }, 'WEIGHT_OVERRIDE_TTL_INVALID'],
    [{ ...validToken, expiresAtEpochMs: 1.5 }, 'WEIGHT_OVERRIDE_TTL_INVALID'],
    [
      { ...validToken, expiresAtEpochMs: validToken.issuedAtEpochMs },
      'WEIGHT_OVERRIDE_TTL_INVALID',
    ],
    [{ ...validToken, expiresAtEpochMs: 100_001 }, 'WEIGHT_OVERRIDE_TTL_INVALID'],
    [{ ...validToken, usedAtEpochMs: 20_000 }, 'WEIGHT_OVERRIDE_ALREADY_USED'],
  ] as const)('rejects invalid authorization token state %#', (token, error) => {
    expect(() => validateWeightOverrideAuthorization(token, validScope)).toThrow(error);
  });

  it.each([
    [{ ...validScope, nowEpochMs: 1.5 }, 'WEIGHT_OVERRIDE_EXPIRED'],
    [{ ...validScope, nowEpochMs: 9_999 }, 'WEIGHT_OVERRIDE_EXPIRED'],
    [{ ...validScope, nowEpochMs: validToken.expiresAtEpochMs }, 'WEIGHT_OVERRIDE_EXPIRED'],
    [{ ...validScope, tenantId: 'tenant-b' }, 'WEIGHT_OVERRIDE_SCOPE_INVALID'],
    [{ ...validScope, actorUserId: 'cashier-b' }, 'WEIGHT_OVERRIDE_SCOPE_INVALID'],
    [{ ...validScope, terminalId: 'terminal-b' }, 'WEIGHT_OVERRIDE_SCOPE_INVALID'],
    [{ ...validScope, saleId: 'sale-b' }, 'WEIGHT_OVERRIDE_SCOPE_INVALID'],
    [{ ...validScope, offlineSaleId: 'offline-a' }, 'WEIGHT_OVERRIDE_SCOPE_INVALID'],
    [{ ...validScope, saleItemId: 'line-b' }, 'WEIGHT_OVERRIDE_SCOPE_INVALID'],
    [{ ...validScope, measurementId: 'measurement-b' }, 'WEIGHT_OVERRIDE_SCOPE_INVALID'],
  ] as const)('rejects invalid authorization scope %#', (scope, error) => {
    expect(() => validateWeightOverrideAuthorization(validToken, scope)).toThrow(error);
  });

  it('accepts authorization exactly at issuance and rejects the wrong action', () => {
    expect(
      validateWeightOverrideAuthorization(validToken, {
        ...validScope,
        nowEpochMs: validToken.issuedAtEpochMs,
      }),
    ).toEqual({ authorizationTokenId: 'token-a', consumeOnce: true });
    expect(() =>
      validateWeightOverrideAuthorization({ ...validToken, action: 'REFUND' }, validScope),
    ).toThrow('WEIGHT_OVERRIDE_SCOPE_INVALID');
  });
});

describe('inventory scale terminal session branches', () => {
  it.each([
    { tenantId: '', userId: 'cashier-a', terminalId: 'terminal-a' },
    { tenantId: 'tenant-a', userId: '', terminalId: 'terminal-a' },
    { tenantId: 'tenant-a', userId: 'cashier-a', terminalId: '' },
  ])('rejects incomplete terminal scope %#', async (input) => {
    await expect(resolveActiveTerminalSession(scriptedDb().db, input)).rejects.toThrow(
      'TERMINAL_SESSION_FORBIDDEN',
    );
  });

  it('rejects a missing or revoked terminal session', async () => {
    await expect(
      resolveActiveTerminalSession(scriptedDb({ first: [null] }).db, {
        tenantId: 'tenant-a',
        userId: 'cashier-a',
        terminalId: 'terminal-a',
      }),
    ).rejects.toThrow('TERMINAL_SESSION_FORBIDDEN');
  });

  it('resolves the complete tenant/user/terminal/session/register/branch binding', async () => {
    const script = scriptedDb({ first: [activeSessionRow] });
    await expect(
      resolveActiveTerminalSession(script.db, {
        tenantId: 'tenant-a',
        userId: 'cashier-a',
        terminalId: 'terminal-a',
        terminalSessionId: ' terminal-session-a ',
        cashRegisterSessionId: ' register-a ',
        branchId: ' branch-a ',
      }),
    ).resolves.toEqual({
      terminalSessionId: 'terminal-session-a',
      terminalId: 'terminal-a',
      cashRegisterSessionId: 'register-a',
      userId: 'cashier-a',
      branchId: 'branch-a',
    });
    expect(callContaining(script, 'FROM pos_terminal_sessions').params).toEqual([
      'tenant-a',
      'cashier-a',
      'terminal-a',
      'terminal-session-a',
      'terminal-session-a',
      'register-a',
      'register-a',
      'branch-a',
      'branch-a',
    ]);
  });

  it('uses empty optional filters when resolving a terminal session', async () => {
    const script = scriptedDb({ first: [activeSessionRow] });
    await resolveActiveTerminalSession(script.db, {
      tenantId: 'tenant-a',
      userId: 'cashier-a',
      terminalId: 'terminal-a',
    });
    expect(callContaining(script, 'FROM pos_terminal_sessions').params.slice(3)).toEqual([
      '',
      '',
      '',
      '',
      '',
      '',
    ]);
  });

  it('rejects registration when terminal, open register, user, or branch binding is invalid', async () => {
    await expect(
      registerTerminalSession(scriptedDb({ first: [null] }).db, {
        tenantId: 'tenant-a',
        terminalId: 'terminal-a',
        cashRegisterSessionId: 'register-a',
        userId: 'cashier-a',
      }),
    ).rejects.toThrow('TERMINAL_SESSION_TARGET_INVALID');
  });

  it('returns the already-active exact terminal session', async () => {
    const script = scriptedDb({ first: [{ branch_id: 'branch-a' }, { id: 'session-existing' }] });
    await expect(
      registerTerminalSession(script.db, {
        tenantId: 'tenant-a',
        terminalId: 'terminal-a',
        cashRegisterSessionId: 'register-a',
        userId: 'cashier-a',
      }),
    ).resolves.toEqual({ terminalSessionId: 'session-existing', status: 'ACTIVE' });
    expect(script.batches).toHaveLength(0);
  });

  it('guards concurrent terminal/register ownership before inserting a session', async () => {
    const script = scriptedDb({ first: [{ branch_id: 'branch-a' }, null] });
    const result = await registerTerminalSession(script.db, {
      tenantId: 'tenant-a',
      terminalId: 'terminal-a',
      cashRegisterSessionId: 'register-a',
      userId: 'cashier-a',
    });
    expect(result).toMatchObject({ status: 'ACTIVE' });
    expect(result.terminalSessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(callContaining(script, 'CASE WHEN EXISTS').sql).toContain(
      'terminal_id = ? OR cash_register_session_id = ?',
    );
    expect(callContaining(script, 'INSERT INTO pos_terminal_sessions').params.slice(1)).toEqual([
      'tenant-a',
      'terminal-a',
      'register-a',
      'cashier-a',
      'branch-a',
    ]);
    expect(script.batches).toHaveLength(1);
  });
});

describe('inventory scale device branches', () => {
  const profiles = {
    WEBHID: {
      protocol: 'WEBHID' as const,
      deviceFingerprint: 'hid:1234:5678:profile-a',
      profile: { profileId: 'profile-a', vendorId: 0x1234, productId: 0x5678, reportId: 1 },
    },
    WEBUSB: {
      protocol: 'WEBUSB' as const,
      deviceFingerprint: 'usb:1234:5678:profile-a',
      profile: { profileId: 'profile-a', vendorId: 0x1234, productId: 0x5678, endpoint: 2 },
    },
    WEB_SERIAL: {
      protocol: 'WEB_SERIAL' as const,
      deviceFingerprint: 'serial:1234:5678:profile-a',
      profile: { profileId: 'profile-a', vendorId: 0x1234, productId: 0x5678, baudRate: 9_600 },
    },
  };

  it.each(Object.values(profiles))(
    'registers an allowlisted $protocol profile',
    async (profile) => {
      const script = scriptedDb({ first: [{ id: 'terminal-a' }, null] });
      const result = await registerScaleDevice(script.db, {
        tenantId: 'tenant-a',
        terminalId: 'terminal-a',
        ...profile,
      });
      expect(result.status).toBe('ACTIVE');
      expect(callContaining(script, 'INSERT INTO scale_devices').params).toEqual([
        result.deviceId,
        'tenant-a',
        'terminal-a',
        profile.protocol,
        profile.deviceFingerprint,
        JSON.stringify(profile.profile),
      ]);
      expect(callContaining(script, 'CASE WHEN EXISTS').sql).toContain("status = 'ACTIVE'");
    },
  );

  it.each([
    {
      ...profiles.WEBHID,
      deviceFingerprint: '',
    },
    {
      ...profiles.WEBHID,
      deviceFingerprint: 'x'.repeat(257),
    },
    {
      ...profiles.WEBHID,
      profile: { ...profiles.WEBHID.profile, profileId: '' },
    },
    {
      ...profiles.WEBHID,
      profile: { ...profiles.WEBHID.profile, vendorId: 1.5 },
    },
    {
      ...profiles.WEBHID,
      profile: { ...profiles.WEBHID.profile, productId: Number.NaN },
    },
    {
      ...profiles.WEBHID,
      profile: { ...profiles.WEBHID.profile, reportId: undefined },
    },
    {
      ...profiles.WEBUSB,
      profile: { ...profiles.WEBUSB.profile, endpoint: undefined },
    },
    {
      ...profiles.WEB_SERIAL,
      profile: { ...profiles.WEB_SERIAL.profile, baudRate: 4_800 },
    },
    {
      ...profiles.WEBHID,
      deviceFingerprint: 'hid:1234:5678:different-profile',
    },
  ])('rejects a non-allowlisted or mismatched device profile %#', async (profile) => {
    await expect(
      registerScaleDevice(scriptedDb().db, {
        tenantId: 'tenant-a',
        terminalId: 'terminal-a',
        ...profile,
        profile: profile.profile as ScaleDeviceProfile,
      }),
    ).rejects.toThrow('SCALE_PROFILE_NOT_ALLOWED');
  });

  it('rejects an allowlisted device for a missing terminal', async () => {
    await expect(
      registerScaleDevice(scriptedDb({ first: [null] }).db, {
        tenantId: 'tenant-a',
        terminalId: 'terminal-a',
        ...profiles.WEBHID,
      }),
    ).rejects.toThrow('SCALE_TERMINAL_NOT_FOUND');
  });

  it('rejects switching an active terminal to another fingerprint', async () => {
    await expect(
      registerScaleDevice(
        scriptedDb({
          first: [{ id: 'terminal-a' }, { id: 'device-a', device_fingerprint: 'hid:aaaa:bbbb:x' }],
        }).db,
        {
          tenantId: 'tenant-a',
          terminalId: 'terminal-a',
          ...profiles.WEBHID,
        },
      ),
    ).rejects.toThrow('SCALE_DEVICE_SWITCH_REQUIRES_DISABLE');
  });

  it.each([
    { id: 'device-a', device_fingerprint: profiles.WEBHID.deviceFingerprint },
    { id: 'device-a' },
  ])('reuses an active compatible device without writing %#', async (active) => {
    const script = scriptedDb({ first: [{ id: 'terminal-a' }, active] });
    await expect(
      registerScaleDevice(script.db, {
        tenantId: 'tenant-a',
        terminalId: 'terminal-a',
        ...profiles.WEBHID,
      }),
    ).resolves.toEqual({ deviceId: 'device-a', status: 'ACTIVE' });
    expect(script.batches).toHaveLength(0);
  });

  it('lists all tenant devices or filters one terminal', async () => {
    const all = scriptedDb({ all: [[{ id: 'all-a' }]] });
    const terminal = scriptedDb({ all: [[{ id: 'terminal-a' }]] });
    await expect(listScaleDevices(all.db, { tenantId: 'tenant-a' })).resolves.toEqual([
      { id: 'all-a' },
    ]);
    await expect(
      listScaleDevices(terminal.db, { tenantId: 'tenant-a', terminalId: 'terminal-a' }),
    ).resolves.toEqual([{ id: 'terminal-a' }]);
    expect(all.calls[0]?.params).toEqual(['tenant-a']);
    expect(terminal.calls[0]?.params).toEqual(['tenant-a', 'terminal-a']);
  });

  it('maps missing diagnosis and idempotent disable states', async () => {
    const missing = scriptedDb({ first: [null] });
    await expect(
      diagnoseScaleDevice(missing.db, {
        tenantId: 'tenant-a',
        terminalId: 'terminal-a',
        deviceId: 'device-a',
      }),
    ).rejects.toThrow('SCALE_DEVICE_NOT_FOUND');

    const disabled = scriptedDb({ first: [{ id: 'device-a', status: 'DISABLED' }] });
    await expect(
      disableScaleDevice(disabled.db, {
        tenantId: 'tenant-a',
        terminalId: 'terminal-a',
        deviceId: 'device-a',
      }),
    ).resolves.toEqual({ deviceId: 'device-a', status: 'DISABLED' });
    expect(disabled.batches).toHaveLength(0);
  });

  it('disables an active device with complete tenant and terminal scope', async () => {
    const script = scriptedDb({ first: [{ id: 'device-a', status: 'ACTIVE' }] });
    await disableScaleDevice(script.db, {
      tenantId: 'tenant-a',
      terminalId: 'terminal-a',
      deviceId: 'device-a',
    });
    expect(callContaining(script, 'UPDATE scale_devices').params).toEqual([
      'tenant-a',
      'terminal-a',
      'device-a',
    ]);
    expect(script.batches).toHaveLength(1);
  });
});

describe('inventory scale heartbeat branches', () => {
  it.each([
    { heartbeatSequence: -1 },
    { heartbeatSequence: 1.5 },
    { observedAt: 'not-a-date' },
    { observedAt: new Date(Date.now() - 2_000).toISOString() },
    { observedAt: new Date(Date.now() + 10_000).toISOString() },
  ])('rejects stale or invalid heartbeat %#', async (override) => {
    const script = scriptedDb({ first: [activeSessionRow] });
    await expect(
      writeScaleHeartbeat(script.db, { ...heartbeatInput, ...override }),
    ).rejects.toThrow('SCALE_HEARTBEAT_STALE');
    expect(script.calls.some((call) => call.sql.includes('FROM scale_devices'))).toBe(false);
  });

  it('rejects device scope, protocol, and reordered sequence mismatches', async () => {
    await expect(
      writeScaleHeartbeat(scriptedDb({ first: [activeSessionRow, null] }).db, heartbeatInput),
    ).rejects.toThrow('SCALE_DEVICE_SCOPE_MISMATCH');
    await expect(
      writeScaleHeartbeat(
        scriptedDb({
          first: [activeSessionRow, { protocol: 'WEBHID', last_heartbeat_sequence: null }],
        }).db,
        heartbeatInput,
      ),
    ).rejects.toThrow('SCALE_HEARTBEAT_PROTOCOL_MISMATCH');
    await expect(
      writeScaleHeartbeat(
        scriptedDb({
          first: [activeSessionRow, { protocol: 'WEBUSB', last_heartbeat_sequence: 7 }],
        }).db,
        heartbeatInput,
      ),
    ).rejects.toThrow('SCALE_HEARTBEAT_REORDERED');
  });

  it.each([null, 6])(
    'writes monotonic heartbeat guarded against concurrent reorder (%s)',
    async (last) => {
      const script = scriptedDb({
        first: [activeSessionRow, { protocol: 'WEBUSB', last_heartbeat_sequence: last }],
      });
      await expect(writeScaleHeartbeat(script.db, heartbeatInput)).resolves.toEqual({
        deviceId: 'device-a',
        heartbeatSequence: 7,
      });
      expect(callContaining(script, 'CASE WHEN EXISTS').params.slice(1)).toEqual([
        'tenant-a',
        'device-a',
        'terminal-a',
        'WEBUSB',
        7,
      ]);
      expect(callContaining(script, 'UPDATE scale_devices').params).toEqual([
        heartbeatInput.observedAt,
        7,
        null, // sin weightMicrounits → lectura null (S40-H1)
        'tenant-a',
        'device-a',
        'terminal-a',
        'WEBUSB',
        7,
      ]);
    },
  );
});

describe('inventory scale measurement submission branches', () => {
  it('rejects manual transport metadata before policy and sale lookup', async () => {
    const script = scriptedDb();
    await expect(
      submitWeightMeasurementAtomic(script.db, {
        ...manualMeasurement,
        scaleDeviceId: 'device-a',
      }),
    ).rejects.toThrow('WEIGHT_SOURCE_MISMATCH');
    expect(script.calls).toHaveLength(0);
  });

  it.each([
    { policy: undefined, weightMicrounits: 1 },
    { policy: 499_999, weightMicrounits: 500_000 },
  ])(
    'requires authorization above the manual policy threshold %#',
    async ({ policy, weightMicrounits }) => {
      const script = scriptedDb({
        first: [policy === undefined ? null : { manual_weight_threshold_microunits: policy }],
      });
      await expect(
        submitWeightMeasurementAtomic(script.db, { ...manualMeasurement, weightMicrounits }),
      ).rejects.toThrow('WEIGHT_OVERRIDE_REQUIRED');
    },
  );

  it('accepts manual weight exactly at the policy threshold without authorization', async () => {
    const script = scriptedDb({
      first: [
        { manual_weight_threshold_microunits: 500_000 },
        { sale_id: 'sale-a', price_cents: 199 },
        null,
      ],
    });
    await expect(submitWeightMeasurementAtomic(script.db, manualMeasurement)).resolves.toEqual({
      measurementId: 'measurement-a',
      weightMicrounits: 500_000,
      authoritativeSubtotalCents: 100,
    });
    expect(script.batches).toHaveLength(1);
    expect(callContaining(script, 'INSERT INTO weight_measurements').params.at(-1)).toBeNull();
  });

  it('maps a missing weighted sale line before any write', async () => {
    const script = scriptedDb({
      first: [{ manual_weight_threshold_microunits: 500_000 }, null],
    });
    await expect(submitWeightMeasurementAtomic(script.db, manualMeasurement)).rejects.toThrow(
      'WEIGH_SALE_LINE_NOT_FOUND',
    );
    expect(script.batches).toHaveLength(0);
  });

  it('rejects an unknown, expired, replayed, or out-of-scope override token', async () => {
    const script = scriptedDb({
      first: [
        { manual_weight_threshold_microunits: 0 },
        { sale_id: 'sale-a', price_cents: 199 },
        null,
      ],
    });
    await expect(
      submitWeightMeasurementAtomic(script.db, {
        ...manualMeasurement,
        authorizationToken: 'weight_secret',
      }),
    ).rejects.toThrow('WEIGHT_OVERRIDE_SCOPE_INVALID');
    const tokenLookup = callContaining(script, 'FROM authorization_tokens');
    expect(tokenLookup.params[1]).not.toBe('weight_secret');
    expect(tokenLookup.sql).toContain('used_at IS NULL');
    expect(tokenLookup.sql).toContain('expires_at > CURRENT_TIMESTAMP');
    expect(tokenLookup.sql).toContain("datetime(created_at, '+90 seconds')");
  });

  it('consumes a valid override in the same guarded batch as the measurement', async () => {
    const script = scriptedDb({
      first: [
        { manual_weight_threshold_microunits: 0 },
        { sale_id: 'sale-a', price_cents: 199 },
        { id: 'token-a' },
        null,
      ],
    });
    await expect(
      submitWeightMeasurementAtomic(script.db, {
        ...manualMeasurement,
        authorizationToken: 'weight_secret',
      }),
    ).resolves.toMatchObject({ authoritativeSubtotalCents: 100 });
    expect(callContaining(script, 'INSERT INTO weight_measurements').params.at(-1)).toBe('token-a');
    expect(callContaining(script, 'UPDATE authorization_tokens').params[1]).toBe('token-a');
    expect(script.batches).toHaveLength(1);
  });

  it.each([
    { scaleDeviceId: null },
    { scaleProtocol: null },
    { heartbeatSequence: 1.5 },
    { observedAt: 'invalid' },
    { observedAt: new Date(Date.now() - 2_000).toISOString() },
    { observedAt: new Date(Date.now() + 10_000).toISOString() },
  ])('rejects invalid DEVICE frame metadata %#', async (override) => {
    const script = scriptedDb();
    await expect(
      submitWeightMeasurementAtomic(script.db, {
        ...manualMeasurement,
        measurementSource: 'DEVICE',
        scaleDeviceId: 'device-a',
        scaleProtocol: 'WEBUSB',
        heartbeatSequence: 1,
        observedAt: new Date().toISOString(),
        ...override,
      }),
    ).rejects.toThrow('SCALE_HEARTBEAT_STALE');
  });

  it.each([
    null,
    { last_heartbeat_at: null, last_heartbeat_sequence: 1 },
    { last_heartbeat_at: 'invalid', last_heartbeat_sequence: 1 },
    { last_heartbeat_at: new Date(Date.now() - 2_000).toISOString(), last_heartbeat_sequence: 1 },
    { last_heartbeat_at: new Date(Date.now() + 10_000).toISOString(), last_heartbeat_sequence: 1 },
  ])('rejects missing or stale persisted device heartbeat %#', async (device) => {
    const script = scriptedDb({ first: [device] });
    await expect(
      submitWeightMeasurementAtomic(script.db, {
        ...manualMeasurement,
        measurementSource: 'DEVICE',
        scaleDeviceId: 'device-a',
        scaleProtocol: 'WEBUSB',
        heartbeatSequence: 1,
        observedAt: new Date().toISOString(),
      }),
    ).rejects.toThrow('SCALE_HEARTBEAT_STALE');
  });

  it('submits an authorized current DEVICE measurement without manual policy lookup', async () => {
    const now = new Date().toISOString();
    const script = scriptedDb({
      first: [
        // S40-H1: la lectura registrada del device (500000 µ → 100 subtotal).
        {
          last_heartbeat_at: now,
          last_heartbeat_sequence: 4,
          last_weight_microunits: 500000,
        },
        { sale_id: 'sale-a', price_cents: 199 },
        null,
      ],
    });
    await expect(
      submitWeightMeasurementAtomic(script.db, {
        ...manualMeasurement,
        measurementSource: 'DEVICE',
        scaleDeviceId: 'device-a',
        scaleProtocol: 'WEBUSB',
        heartbeatSequence: 5,
        observedAt: now,
        weightMicrounits: 500000,
      }),
    ).resolves.toMatchObject({ authoritativeSubtotalCents: 100 });
    expect(script.calls.some((call) => call.sql.includes('tenant_weight_policies'))).toBe(false);
  });
});

describe('inventory scale audit and reconciliation branches', () => {
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid resolved weight %s',
    async (weightMicrounits) => {
      const script = scriptedDb();
      const plan = new AtomicPlanBuilder(script.db);
      await expect(
        appendWeightMeasurementToPlan(plan, script.db, {
          ...resolvedMeasurement,
          weightMicrounits,
        }),
      ).rejects.toThrow('SCALE_WEIGHT_INVALID');
      expect(plan.size).toBe(0);
    },
  );

  it('uses explicit idempotency, observed time, and previous audit hash without reading history', async () => {
    const script = scriptedDb();
    const plan = new AtomicPlanBuilder(script.db);
    const result = await appendWeightMeasurementToPlan(plan, script.db, {
      ...resolvedMeasurement,
      idempotencyKey: 'idem-a',
      observedAt: '2026-08-08T12:00:00.000Z',
      previousAuditHash: 'previous-a',
      offlineSaleId: 'offline-a',
    });
    expect(result.rowHash).toMatch(/^[0-9a-f]{64}$/);
    expect(
      script.calls.some(
        (call) =>
          call.sql.includes('SELECT row_hash') && call.sql.includes('ORDER BY created_at DESC'),
      ),
    ).toBe(false);
    expect(callContaining(script, 'INSERT INTO weight_measurements').params).toEqual([
      'measurement-a',
      'tenant-a',
      'line-a',
      'product-a',
      'terminal-a',
      null,
      'sale-a',
      'idem-a',
      500_000,
      199,
      100,
      'MANUAL',
      null,
      null,
      '2026-08-08T12:00:00.000Z',
      null,
    ]);
    expect(callContaining(script, 'INSERT INTO audit_events').params.at(-2)).toBe('previous-a');
  });

  it('chains a deterministic safe hash to the latest tenant audit and guards concurrent append', async () => {
    const first = scriptedDb({ first: [{ row_hash: 'previous-a' }] });
    const second = scriptedDb({ first: [{ row_hash: 'previous-a' }] });
    const firstResult = await appendWeightMeasurementToPlan(
      new AtomicPlanBuilder(first.db),
      first.db,
      resolvedMeasurement,
    );
    const secondResult = await appendWeightMeasurementToPlan(
      new AtomicPlanBuilder(second.db),
      second.db,
      resolvedMeasurement,
    );
    expect(secondResult.rowHash).toBe(firstResult.rowHash);
    expect(callContaining(first, 'CASE WHEN COALESCE').params.slice(1)).toEqual([
      'tenant-a',
      'previous-a',
    ]);
  });

  it('uses a null audit predecessor and default measurement identity when history is empty', async () => {
    const script = scriptedDb({ first: [null] });
    const plan = new AtomicPlanBuilder(script.db);
    await appendWeightMeasurementToPlan(plan, script.db, resolvedMeasurement);
    expect(callContaining(script, 'INSERT INTO weight_measurements').params[7]).toBe(
      'measurement-a',
    );
    expect(callContaining(script, 'INSERT INTO audit_events').params.at(-2)).toBeNull();
    expect(callContaining(script, 'INSERT INTO audit_events').sql).toContain(
      "'WEIGHT_MEASUREMENT'",
    );
  });

  it('covers valid, unmatched, wrong-product, and excess weighted measurement cardinality', () => {
    const lines = [{ saleItemId: 'line-a', productId: 'product-a', productType: 'WEIGH' }];
    expect(
      assertWeightedMeasurementCoverage(lines, [
        { measurementId: 'measurement-a', saleItemId: 'line-a', productId: 'product-a' },
      ]),
    ).toHaveLength(1);
    expect(() =>
      assertWeightedMeasurementCoverage(lines, [
        { measurementId: 'measurement-a', saleItemId: 'line-a', productId: 'product-b' },
      ]),
    ).toThrow('WEIGHT_MEASUREMENT_REQUIRED');
    expect(() =>
      assertWeightedMeasurementCoverage(lines, [
        { measurementId: 'measurement-a', saleItemId: 'line-a', productId: 'product-a' },
        { measurementId: 'measurement-extra', saleItemId: 'line-a', productId: 'product-b' },
      ]),
    ).toThrow('WEIGHT_MEASUREMENT_CARDINALITY');
  });

  it('rejects duplicate lines, missing/non-weight products, and total overflow during reconciliation', () => {
    const catalog = [
      { productId: 'product-a', productType: 'WEIGH', unitPricePerBaseCents: 100 },
      { productId: 'product-b', productType: 'PHYSICAL', unitPricePerBaseCents: 100 },
    ];
    const measurement = {
      measurementId: 'measurement-a',
      saleItemId: 'line-a',
      productId: 'product-a',
      weightMicrounits: 1_000_000,
      measurementSource: 'DEVICE' as const,
    };
    expect(() =>
      reconcileWeightedSync({
        catalog,
        measurements: [measurement, { ...measurement, measurementId: 'measurement-b' }],
        clientProjectedTotalCents: 0,
        transport: 'ONLINE',
      }),
    ).toThrow('WEIGHT_MEASUREMENT_CARDINALITY');
    expect(() =>
      reconcileWeightedSync({
        catalog,
        measurements: [{ ...measurement, productId: 'missing' }],
        clientProjectedTotalCents: 0,
        transport: 'ONLINE',
      }),
    ).toThrow('WEIGH_PRODUCT_REQUIRED');
    expect(() =>
      reconcileWeightedSync({
        catalog,
        measurements: [{ ...measurement, productId: 'product-b' }],
        clientProjectedTotalCents: 0,
        transport: 'ONLINE',
      }),
    ).toThrow('WEIGH_PRODUCT_REQUIRED');
    expect(() =>
      reconcileWeightedSync({
        catalog: [
          {
            productId: 'product-a',
            productType: 'WEIGH',
            unitPricePerBaseCents: Number.MAX_SAFE_INTEGER,
          },
        ],
        measurements: [
          measurement,
          { ...measurement, measurementId: 'measurement-b', saleItemId: 'line-b' },
        ],
        clientProjectedTotalCents: 0,
        transport: 'OFFLINE_SYNC',
      }),
    ).toThrow('WEIGHTED_SUBTOTAL_OVERFLOW');
  });
});
