export type Cents = number;

export type DrawerState = 'closed' | 'open' | 'suspended';

export interface DrawerSnapshot {
  readonly sessionId: string;
  readonly state: DrawerState;
  readonly openingCents: Cents;
  readonly expectedCents: Cents;
  readonly countedCents: Cents | null;
}

export function diffCents(snapshot: DrawerSnapshot): Cents | null {
  if (snapshot.countedCents === null) {
    return null;
  }
  return snapshot.countedCents - snapshot.expectedCents;
}

export function drawIsBalanced(snapshot: DrawerSnapshot): boolean {
  const diff = diffCents(snapshot);
  return diff !== null && diff === 0;
}
