/**
 * Farmacia premium — FEFO semáforo + venta fraccionada exacta.
 * Zero-dependency, Web Platform only. Ceros floats para dinero/stock.
 * Gating: isInventoryOpsEnabled() (capability inventory.batches) en la UI.
 */

export const MICROS_PER_UNIT = 1_000_000;

export type ExpiryTone = 'success' | 'warning' | 'danger' | 'neutral';

export interface FefoBadge {
  readonly tone: ExpiryTone;
  readonly label: string;
  readonly days: number | null;
}

function parseExpiryMidnightUtc(expiresAt: string | null | undefined): number | null {
  if (!expiresAt || typeof expiresAt !== 'string') return null;
  const s = expiresAt.trim();
  if (!s) return null;
  // YYYY-MM-DD
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!Number.isSafeInteger(y) || !Number.isSafeInteger(mo) || !Number.isSafeInteger(d)) return null;
    return Date.UTC(y, mo - 1, d);
  }
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function parseNowMidnightUtc(nowIso: string): number {
  const t = Date.parse(nowIso);
  if (!Number.isFinite(t)) return Date.now();
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Días enteros hasta vencimiento (floor). null = sin fecha. */
export function daysUntilExpiry(
  expiresAt: string | null | undefined,
  nowIso: string,
): number | null {
  const expiry = parseExpiryMidnightUtc(expiresAt);
  if (expiry === null) return null;
  const now = parseNowMidnightUtc(nowIso);
  const diffMs = expiry - now;
  return Math.floor(diffMs / 86_400_000);
}

/** Semáforo FEFO humano — cero jerga técnica visible. */
export function expiryBadge(
  expiresAt: string | null | undefined,
  nowIso: string,
): FefoBadge {
  const days = daysUntilExpiry(expiresAt, nowIso);
  if (days === null) return { tone: 'neutral', label: 'Sin fecha', days: null };
  if (days <= 0) return { tone: 'danger', label: 'Vencido', days };
  if (days < 30) return { tone: 'danger', label: 'Vence pronto', days };
  if (days <= 90) return { tone: 'warning', label: 'Por vencer', days };
  return { tone: 'success', label: 'Vigente', days };
}

/** Orden FEFO: vence más pronto primero, sin fecha al final. */
export function sortByExpiry<T>(
  items: readonly T[],
  getExpiry: (item: T) => string | null | undefined,
  nowIso: string,
): T[] {
  const withKey = items.map((item) => {
    const days = daysUntilExpiry(getExpiry(item), nowIso);
    const rank = days === null ? Number.MAX_SAFE_INTEGER : days;
    return { item, rank };
  });
  withKey.sort((a, b) => a.rank - b.rank);
  return withKey.map((x) => x.item);
}

// — Venta fraccionada exacta (microunits + cents enteros) —

export interface PackSpec {
  readonly unitsPerBlister: number;
  readonly blistersPerBox: number;
}

function assertPackSpec(spec: PackSpec): void {
  if (!Number.isSafeInteger(spec.unitsPerBlister) || spec.unitsPerBlister <= 0) throw new Error('PACK_SPEC_INVALID');
  if (!Number.isSafeInteger(spec.blistersPerBox) || spec.blistersPerBox <= 0) throw new Error('PACK_SPEC_INVALID');
}

function factorFor(presentation: 'CAJA' | 'BLISTER' | 'UNIDAD', spec: PackSpec): number {
  assertPackSpec(spec);
  const pres = presentation.toUpperCase();
  if (pres === 'UNIDAD') return 1;
  if (pres === 'BLISTER') return spec.unitsPerBlister;
  if (pres === 'CAJA') return spec.unitsPerBlister * spec.blistersPerBox;
  throw new Error('PRESENTATION_INVALID');
}

/** Convierte presentación farmacéutica a microunits exactas (INTEGER). */
export function packToMicrounits(
  presentation: 'CAJA' | 'BLISTER' | 'UNIDAD',
  count: number,
  spec: PackSpec,
): number {
  if (!Number.isSafeInteger(count) || count <= 0) throw new Error('COUNT_INVALID');
  const factor = factorFor(presentation, spec);
  const totalUnits = count * factor;
  if (!Number.isSafeInteger(totalUnits)) throw new Error('UNITS_OVERFLOW');
  const micros = totalUnits * MICROS_PER_UNIT;
  if (!Number.isSafeInteger(micros)) throw new Error('MICROS_OVERFLOW');
  return micros;
}

/** Precio proporcional exacto en cents (INTEGER), sin floats. */
export function priceForPresentation(
  unitPriceCents: number,
  presentation: 'CAJA' | 'BLISTER' | 'UNIDAD',
  count: number,
  spec: PackSpec,
): number {
  if (!Number.isSafeInteger(unitPriceCents) || unitPriceCents < 0) throw new Error('PRICE_INVALID');
  const factor = factorFor(presentation, spec);
  const totalUnits = count * factor;
  const price = totalUnits * unitPriceCents;
  if (!Number.isSafeInteger(price)) throw new Error('PRICE_OVERFLOW');
  return price;
}

/** Display humano de stock — cero "microunits" en el texto visible. */
export function stockToDisplay(microunits: number, spec: PackSpec): string {
  if (!Number.isSafeInteger(microunits) || microunits < 0) throw new Error('STOCK_INVALID');
  if (microunits === 0) return 'Sin stock';
  assertPackSpec(spec);
  const totalUnits = Math.floor(microunits / MICROS_PER_UNIT);
  const unitsPerBox = spec.unitsPerBlister * spec.blistersPerBox;
  const boxes = Math.floor(totalUnits / unitsPerBox);
  const remAfterBoxes = totalUnits % unitsPerBox;
  const blisters = Math.floor(remAfterBoxes / spec.unitsPerBlister);
  const units = remAfterBoxes % spec.unitsPerBlister;

  const parts: string[] = [];
  if (boxes > 0) parts.push(boxes === 1 ? '1 caja' : `${boxes} cajas`);
  if (blisters > 0) parts.push(blisters === 1 ? '1 blíster' : `${blisters} blísters`);
  if (units > 0) parts.push(units === 1 ? '1 unidad' : `${units} unidades`);
  if (parts.length === 0) return `${totalUnits} unidades`;
  if (parts.length === 1) return String(parts[0] ?? '');
  if (parts.length === 2) return `${parts[0]} y ${parts[1]}`;
  return `${parts[0]}, ${parts[1]} y ${parts[2]}`;
}
