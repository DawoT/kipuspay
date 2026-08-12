/** Estado de carrito POS — dinero solo cents enteros. */

export interface CartLine {
  readonly productId: string;
  readonly name: string;
  readonly unitPriceCents: number;
  readonly quantity: number;
  /** Sprint 50 (regla 34b): línea genérica sin catálogo — productId '' + precio manual. */
  readonly isUncatalogued?: boolean;
  readonly manualPriceCents?: number;
  /** Sprint 31: identidad y cantidad en la UOM elegida (cliente no envía factor). */
  readonly uomId?: string;
  readonly uomCode?: string;
  readonly enteredQuantityMicrounits?: number;
  /** Sprint 30: IDs de promo (display); el servidor impone el precio. */
  readonly promotionIds?: readonly string[];
  /** Sprint 39: one physical unit and its opaque terminal lease. */
  readonly serialId?: string;
  readonly serialLeaseToken?: string;
  /** Sprint 40: each weighing is a distinct line; facts only, never client money. */
  readonly saleItemId?: string;
  readonly weightMeasurement?: {
    readonly measurementId: string;
    readonly weightMicrounits: number;
    readonly measurementSource: 'DEVICE' | 'MANUAL';
    readonly scaleProtocol?: 'WEBHID' | 'WEB_SERIAL' | 'WEBUSB';
    readonly scaleDeviceId?: string;
    readonly heartbeatSequence?: number;
    readonly observedAt: string;
    readonly authorizationToken?: string;
  };
}

/** Sprint 50: línea genérica de venta rápida (regla 34b) — sin catálogo. */
export function genericLine(name: string, manualPriceCents: number, quantity = 1): CartLine {
  return {
    productId: '',
    name,
    unitPriceCents: manualPriceCents,
    manualPriceCents,
    isUncatalogued: true,
    quantity,
  };
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
      line.serialId === next.serialId &&
      line.weightMeasurement?.measurementId === next.weightMeasurement?.measurementId,
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
