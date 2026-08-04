/** Estado de carrito POS — dinero solo cents enteros. */

export interface CartLine {
  readonly productId: string;
  readonly name: string;
  readonly unitPriceCents: number;
  readonly quantity: number;
}

export function lineTotalCents(line: CartLine): number {
  return line.unitPriceCents * line.quantity;
}

export function cartTotalCents(lines: readonly CartLine[]): number {
  return lines.reduce((sum, line) => sum + lineTotalCents(line), 0);
}

export function addOrBumpLine(lines: readonly CartLine[], next: CartLine): CartLine[] {
  const idx = lines.findIndex((l) => l.productId === next.productId);
  if (idx < 0) return [...lines, next];
  const prev = lines[idx];
  if (!prev) return [...lines, next];
  const updated: CartLine = {
    ...prev,
    quantity: prev.quantity + next.quantity,
  };
  return lines.map((l, i) => (i === idx ? updated : l));
}
