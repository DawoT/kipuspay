/** Costura de sync (Arquitectura §0.2): pendiente → línea punteada; confirmado → sólida. */

export type StitchState = 'idle' | 'pending' | 'synced';

export function stitchClass(state: StitchState): string {
  if (state === 'pending') return 'stitch';
  if (state === 'synced') return 'stitch in';
  return '';
}

export function stitchStateFromFlags(input: {
  readonly online: boolean;
  readonly pendingCount: number;
  readonly charging: boolean;
}): StitchState {
  if (input.charging || !input.online || input.pendingCount > 0) return 'pending';
  return 'synced';
}
