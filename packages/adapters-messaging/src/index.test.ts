import { describe, expect, it } from 'vitest';
import { isPlausibleEmail, normalizeRecipient } from './index.js';

describe('normalizeRecipient', () => {
  it('normaliza espacios y mayúsculas', () => {
    expect(normalizeRecipient('  USER@Example.COM ')).toBe('user@example.com');
  });
});

describe('isPlausibleEmail', () => {
  it('requiere un @', () => {
    expect(isPlausibleEmail('user@example.com')).toBe(true);
    expect(isPlausibleEmail('no-email')).toBe(false);
  });
});
