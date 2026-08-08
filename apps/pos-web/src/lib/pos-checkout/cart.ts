/** Estado de carrito POS — dinero solo cents enteros. */

export interface CartLine {
  readonly productId: string;
  readonly name: string;
  readonly unitPriceCents: number;
  readonly quantity: number;
  /** Sprint 31: identidad y cantidad en la UOM elegida (cliente no envía factor). */
  readonly uomId?: string;
  readonly uomCode?: string;
  readonly enteredQuantityMicrounits?: number;
  /** Sprint 30: IDs de promo (display); el servidor impone el precio. */
  readonly promotionIds?: readonly string[];
  /** Sprint 39: one physical unit and its opaque terminal lease. */
  readonly serialId?: string;
  readonly serialLeaseToken?: string;
}

export function lineTotalCents(line: CartLine): number {
  return line.unitPriceCents * line.quantity;
}

export function cartTotalCents(lines: readonly CartLine[]): number {
  return lines.reduce((sum, line) => sum + lineTotalCents(line), 0);
}

export function addOrBumpLine(lines: readonly CartLine[], next: CartLine): CartLine[] {
  const idx = lines.findIndex(
    (line) =>
      line.productId === next.productId &&
      line.uomId === next.uomId &&
      line.serialId === next.serialId,
  );
  if (idx < 0) return [...lines, next];
  const prev = lines[idx];
  if (!prev) return [...lines, next];
  const updated: CartLine = {
    ...prev,
    quantity: prev.quantity + next.quantity,
    ...(prev.enteredQuantityMicrounits !== undefined || next.enteredQuantityMicrounits !== undefined
      ? {
          enteredQuantityMicrounits:
            (prev.enteredQuantityMicrounits ?? 0) + (next.enteredQuantityMicrounits ?? 0),
        }
      : {}),
    ...(next.promotionIds ? { promotionIds: next.promotionIds } : {}),
  };
  return lines.map((l, i) => (i === idx ? updated : l));
}
