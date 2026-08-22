import { describe, expect, it } from 'vitest';
import { sunatStatusImpliesCdrAccepted, sunatStatusLabel } from './sunat-status-label';

describe('sunatStatusLabel', () => {
  it('solo ACCEPTED es Aceptado; PENDING nunca dice aceptada', () => {
    expect(sunatStatusLabel('ACCEPTED')).toBe('Aceptado');
    expect(sunatStatusLabel('PENDING')).toBe('Pendiente');
    expect(sunatStatusLabel('PENDING').toLowerCase()).not.toContain('aceptad');
    expect(sunatStatusImpliesCdrAccepted('PENDING')).toBe(false);
    expect(sunatStatusImpliesCdrAccepted('ACCEPTED')).toBe(true);
  });
});
