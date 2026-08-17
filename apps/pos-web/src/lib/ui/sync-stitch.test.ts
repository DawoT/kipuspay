import { describe, expect, it } from 'vitest';
import { stitchClass, stitchStateFromFlags } from './sync-stitch';

describe('stitchStateFromFlags', () => {
  it('cose mientras cobra, está offline o hay cola', () => {
    expect(stitchStateFromFlags({ online: true, pendingCount: 0, charging: true })).toBe('pending');
    expect(stitchStateFromFlags({ online: false, pendingCount: 0, charging: false })).toBe(
      'pending',
    );
    expect(stitchStateFromFlags({ online: true, pendingCount: 2, charging: false })).toBe(
      'pending',
    );
  });

  it('remata en verde cuando no hay pendiente', () => {
    expect(stitchStateFromFlags({ online: true, pendingCount: 0, charging: false })).toBe('synced');
  });
});

describe('stitchClass', () => {
  it('usa las mismas clases que marketing (.stitch / .stitch.in)', () => {
    expect(stitchClass('pending')).toBe('stitch');
    expect(stitchClass('synced')).toBe('stitch in');
    expect(stitchClass('idle')).toBe('');
  });
});
