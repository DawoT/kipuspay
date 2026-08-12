import { describe, expect, it } from 'vitest';
import {
  generateBadgeBarcode,
  generateCashierPin,
  isValidGeneratedBadge,
  isValidInviteEmail,
  normalizeInviteEmail,
} from './team-invite.js';

describe('generateBadgeBarcode', () => {
  it('genera EMP- + 5 dígitos, único dentro del set del tenant', () => {
    const existing = new Set(['EMP-12345', 'EMP-67890']);
    const badge = generateBadgeBarcode(existing);
    expect(isValidGeneratedBadge(badge)).toBe(true);
    expect(existing.has(badge)).toBe(false);
  });

  it('colisiones se resuelven con reintentos (rng inyectado)', () => {
    let calls = 0;
    const badge = generateBadgeBarcode(new Set(['EMP-44444']), () => (calls++ < 5 ? 0.42 : 0.51));
    expect(badge).not.toBe('EMP-44444');
    expect(badge).toBe('EMP-55555');
  });

  it('agota el namespace de forma controlada (BADGE_NAMESPACE_EXHAUSTED)', () => {
    const all = new Set(
      Array.from({ length: 100000 }, (_, i) => `EMP-${String(i).padStart(5, '0')}`),
    );
    expect(() => generateBadgeBarcode(all, () => 0.42)).toThrow('BADGE_NAMESPACE_EXHAUSTED');
  });

  it('valida el formato EMP- con sufijo mínimo de 5 dígitos', () => {
    expect(isValidGeneratedBadge('EMP-12345')).toBe(true);
    expect(isValidGeneratedBadge('EMP-123456789')).toBe(true);
    expect(isValidGeneratedBadge('EMP-1234')).toBe(false);
    expect(isValidGeneratedBadge('EMP-abcde')).toBe(false);
    expect(isValidGeneratedBadge('12345')).toBe(false);
    expect(isValidGeneratedBadge('')).toBe(false);
  });
});

describe('generateCashierPin', () => {
  it('genera PIN de 4 dígitos para tecleo rápido', () => {
    const pin = generateCashierPin();
    expect(pin).toMatch(/^\d{4}$/);
  });

  it('nunca empieza con 0 (longitud ambigua al teclear)', () => {
    const pin = generateCashierPin(() => 0.05);
    expect(pin[0]).not.toBe('0');
  });
});

describe('invite email', () => {
  it('normaliza minúsculas y espacios', () => {
    expect(normalizeInviteEmail('  VENDEDOR@X.COM ')).toBe('vendedor@x.com');
  });

  it('acepta correos válidos', () => {
    expect(isValidInviteEmail('cajero@tienda.pe')).toBe(true);
    expect(isValidInviteEmail('a.b+c@dominio.com')).toBe(true);
  });

  it('rechaza correos inválidos (sin @, doble @, sin TLD, vacío)', () => {
    expect(isValidInviteEmail('')).toBe(false);
    expect(isValidInviteEmail('sinarroba')).toBe(false);
    expect(isValidInviteEmail('a@b@c.com')).toBe(false);
    expect(isValidInviteEmail('@dominio.com')).toBe(false);
    expect(isValidInviteEmail('a@')).toBe(false);
    expect(isValidInviteEmail('a@dominio')).toBe(false);
    expect(isValidInviteEmail('a@dominio..com')).toBe(false);
  });
});
