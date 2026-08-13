import { describe, expect, it } from 'vitest';
import { capabilitiesFromFlags } from './capabilities';

describe('capabilitiesFromFlags (ADR-ARCH-002)', () => {
  it('solo las capabilities habilitadas pasan al tour', () => {
    const set = capabilitiesFromFlags({
      kds: true,
      fefo: false,
      scale: true,
      promotions: false,
      variants: false,
      quickAdd: true,
      shiftHandoff: false,
      teamInvite: true,
      hardwareDiagnostics: true,
    });
    expect(set.has('kds')).toBe(true);
    expect(set.has('scale')).toBe(true);
    expect(set.has('quick_add')).toBe(true);
    expect(set.has('team_invite')).toBe(true);
    expect(set.has('hardware.diagnostics')).toBe(true);
    expect(set.has('fefo')).toBe(false);
    expect(set.has('promotions')).toBe(false);
    expect(set.has('shift_handoff')).toBe(false);
  });

  it('sin flags no hay capabilities', () => {
    const set = capabilitiesFromFlags({
      kds: false,
      fefo: false,
      scale: false,
      promotions: false,
      variants: false,
      quickAdd: false,
      shiftHandoff: false,
      teamInvite: false,
      hardwareDiagnostics: false,
    });
    expect(set.size).toBe(0);
  });
});
