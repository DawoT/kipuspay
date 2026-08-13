import { describe, expect, it, vi } from 'vitest';
import {
  buildShiftTransfer,
  generatePin,
  hashPin,
  TRANSFER_PIN_LENGTH,
  TRANSFER_PIN_TTL_MS,
  verifyTransferPin,
  type ShiftTransferCommand,
} from './shift-handoff.js';

const NOW = Date.parse('2026-08-12T12:00:00Z');

describe('generatePin', () => {
  it('genera un PIN de la longitud pedida con solo dígitos', () => {
    const pin = generatePin(6);
    expect(pin).toMatch(/^\d{6}$/);
  });

  it('usa el rng inyectado (determinista en tests)', () => {
    const rng = () => 0.42;
    const pin = generatePin(6, rng);
    expect(pin).toBe('444444');
  });

  it('pins consecutivos del mismo rng determinista se repiten (inyección controlada)', () => {
    let calls = 0;
    const rng = () => (calls++ % 2 === 0 ? 0.1 : 0.9);
    expect(generatePin(4, rng)).toBe('1919');
  });

  it('fail-closed: sin crypto lanza CRYPTO_UNAVAILABLE', () => {
    const desc = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      expect(() => generatePin(4)).toThrow('CRYPTO_UNAVAILABLE');
    } finally {
      if (desc) Object.defineProperty(globalThis, 'crypto', desc);
    }
  });
});

describe('hashPin', () => {
  it('hashea un pin con salt (salt:64hex) y es único por invocación', async () => {
    const h1 = await hashPin('123456');
    const h2 = await hashPin('123456');
    expect(h1).toMatch(/^[0-9a-f]{32}:[0-9a-f]{64}$/);
    expect(h1).not.toBe(h2); // salt aleatorio por hash
    const [, hash1] = h1.split(':');
    const [, hash2] = h2.split(':');
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    expect(hash2).toMatch(/^[0-9a-f]{64}$/);
  });

  it('nunca expone el pin en claro en el hash', async () => {
    const h = await hashPin('123456');
    expect(h).not.toContain('123456');
  });

  it('fail-closed: sin crypto.subtle lanza CRYPTO_SUBTLE_UNAVAILABLE', async () => {
    const desc = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      await expect(hashPin('123456')).rejects.toThrow('CRYPTO_SUBTLE_UNAVAILABLE');
    } finally {
      if (desc) Object.defineProperty(globalThis, 'crypto', desc);
    }
  });
});

describe('verifyTransferPin', () => {
  const validExpiry = new Date(NOW + TRANSFER_PIN_TTL_MS).toISOString();

  it('acepta el pin correcto dentro del TTL', async () => {
    const pin = generatePin(TRANSFER_PIN_LENGTH, () => 0.5);
    const hash = await hashPin(pin);
    expect(await verifyTransferPin(pin, hash, validExpiry, NOW)).toBe('OK');
  });

  it('rechaza un pin distinto (PIN_INVALID)', async () => {
    const hash = await hashPin('111111');
    expect(await verifyTransferPin('222222', hash, validExpiry, NOW)).toBe('PIN_INVALID');
  });

  it('rechaza un pin expirado (PIN_EXPIRED), fail-closed', async () => {
    const pin = generatePin(TRANSFER_PIN_LENGTH, () => 0.5);
    const hash = await hashPin(pin);
    const expiredAt = new Date(NOW - 1).toISOString();
    expect(await verifyTransferPin(pin, hash, expiredAt, NOW)).toBe('PIN_EXPIRED');
  });

  it('PIN_EXPIRED gana aunque el hash sea incorrecto (TTL primero, fail-closed)', async () => {
    const hash = await hashPin('000000');
    const expiredAt = new Date(NOW - 1).toISOString();
    expect(await verifyTransferPin('111111', hash, expiredAt, NOW)).toBe('PIN_EXPIRED');
  });

  it('rechaza formato no numérico sin hashear (longitud/forma)', async () => {
    const hash = await hashPin('123456');
    expect(await verifyTransferPin('abcdef', hash, validExpiry, NOW)).toBe('PIN_INVALID');
    expect(await verifyTransferPin('12345', hash, validExpiry, NOW)).toBe('PIN_INVALID');
    expect(await verifyTransferPin('1234567', hash, validExpiry, NOW)).toBe('PIN_INVALID');
  });

  it('rechaza fecha de expiración inválida como PIN_INVALID', async () => {
    const pin = generatePin(TRANSFER_PIN_LENGTH, () => 0.5);
    const hash = await hashPin(pin);
    expect(await verifyTransferPin(pin, hash, 'no-una-fecha', NOW)).toBe('PIN_INVALID');
  });

  it('rechaza hash sin formato salt:hash (PIN_INVALID)', async () => {
    expect(await verifyTransferPin('123456', 'sin-dos-puntos', validExpiry, NOW)).toBe(
      'PIN_INVALID',
    );
  });

  it('fail-closed: sin crypto.subtle verifica como PIN_INVALID', async () => {
    const hash = await hashPin('123456');
    const desc = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      expect(await verifyTransferPin('123456', hash, validExpiry, NOW)).toBe('PIN_INVALID');
    } finally {
      if (desc) Object.defineProperty(globalThis, 'crypto', desc);
    }
  });
});

describe('buildShiftTransfer', () => {
  const base = {
    sessionId: 'sess-1',
    tenantId: 'tenant-a',
    branchId: 'branch-1',
    outgoingUserId: 'user-a',
    incomingUserId: 'user-b',
    pin: '123456',
    pinHash: 'a'.repeat(64),
    pinExpiresAtIso: new Date(NOW + TRANSFER_PIN_TTL_MS).toISOString(),
    nowIso: new Date(NOW).toISOString(),
  };

  it('construye el comando sin conteo intermedio cuando la política no lo exige', () => {
    const result = buildShiftTransfer({ ...base, policy: { interimRequired: false } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const command: ShiftTransferCommand = result.command;
    expect(command.sessionId).toBe('sess-1');
    expect(command.outgoingUserId).toBe('user-a');
    expect(command.incomingUserId).toBe('user-b');
    expect(command.interimCountCents).toBeNull();
    expect(command.expectedInterimCashCents).toBeNull();
    expect(command.cashDiffCents).toBeNull();
    expect(command.startedAtIso).toBe(base.nowIso);
  });

  it('exige el conteo intermedio si interim_required (INTERIM_COUNT_REQUIRED)', () => {
    const result = buildShiftTransfer({
      ...base,
      policy: { interimRequired: true },
      interimCountCents: null,
    });
    expect(result).toEqual({ ok: false, code: 'INTERIM_COUNT_REQUIRED' });
  });

  it('rechaza conteo no entero o negativo (INTERIM_COUNT_INVALID)', () => {
    const invalid = buildShiftTransfer({
      ...base,
      policy: { interimRequired: true },
      interimCountCents: 10.5,
    });
    expect(invalid).toEqual({ ok: false, code: 'INTERIM_COUNT_INVALID' });
    const negative = buildShiftTransfer({
      ...base,
      policy: { interimRequired: true },
      interimCountCents: -1,
    });
    expect(negative).toEqual({ ok: false, code: 'INTERIM_COUNT_INVALID' });
  });

  it('calcula cash_diff = expected - counted y NO bloquea la transferencia', () => {
    const result = buildShiftTransfer({
      ...base,
      policy: { interimRequired: true },
      interimCountCents: 9500,
      expectedInterimCashCents: 10000,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.command.cashDiffCents).toBe(500);
    expect(result.command.interimCountCents).toBe(9500);
  });

  it('diferencia negativa (sobrante) también se audita sin bloquear', () => {
    const result = buildShiftTransfer({
      ...base,
      policy: { interimRequired: true },
      interimCountCents: 12000,
      expectedInterimCashCents: 10000,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.command.cashDiffCents).toBe(-2000);
  });

  it('rechaza transferencia al mismo operador (SAME_OPERATOR)', () => {
    const result = buildShiftTransfer({
      ...base,
      outgoingUserId: 'user-a',
      incomingUserId: 'user-a',
      policy: { interimRequired: false },
    });
    expect(result).toEqual({ ok: false, code: 'SAME_OPERATOR' });
  });

  it('acepta conteo explícito aunque la política no lo exija (opcional)', () => {
    const result = buildShiftTransfer({
      ...base,
      policy: { interimRequired: false },
      interimCountCents: 10000,
      expectedInterimCashCents: 10000,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.command.cashDiffCents).toBe(0);
  });
});

describe('hashPin sin Web Crypto (fail-closed)', () => {
  it('lanza CRYPTO_SUBTLE_UNAVAILABLE si no hay subtle', async () => {
    vi.stubGlobal('crypto', undefined);
    try {
      await expect(hashPin('123456')).rejects.toThrow('CRYPTO_SUBTLE_UNAVAILABLE');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
