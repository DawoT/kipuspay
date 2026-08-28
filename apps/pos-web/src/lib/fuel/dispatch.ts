/**
 * Grifos — Despacho por surtidor (galones/monto) + detracción automática diésel.
 * Dominio puro: sin D1, sin red, sin deps npm. Dinero siempre INTEGER cents.
 * Offline-first: cálculo local <100ms; reconciliación autoritativa server-side.
 * No jerga técnica en mensajes visibles (V-27).
 */

export const FUEL_DETRACTION_RATE_BPS = 1000; // 10% Diésel B5 — badge en GasMock.svelte
export const GALLON_MICROUNITS_PER_GALLON = 1_000_000;

// Precios del día en cents por galón (snapshot del servidor; el cliente no impone precio final).
// Fuente canónica del mock operativo: GasMock.svelte 6 combustibles.
export interface FuelProduct {
  readonly code: string;
  readonly name: string;
  readonly priceCentsPerGallon: number;
  readonly unit: 'gal';
  readonly subjectToDetraction: boolean;
  readonly detractionRateBps: number | null;
}

export const FUEL_CATALOG: readonly FuelProduct[] = [
  {
    code: 'GASOHOL_84',
    name: 'Gasohol 84',
    priceCentsPerGallon: 1650,
    unit: 'gal',
    subjectToDetraction: false,
    detractionRateBps: null,
  },
  {
    code: 'GASOHOL_90',
    name: 'Gasohol 90',
    priceCentsPerGallon: 1720,
    unit: 'gal',
    subjectToDetraction: false,
    detractionRateBps: null,
  },
  {
    code: 'GASOHOL_95',
    name: 'Gasohol 95',
    priceCentsPerGallon: 1780,
    unit: 'gal',
    subjectToDetraction: false,
    detractionRateBps: null,
  },
  {
    code: 'GASOHOL_97',
    name: 'Gasohol 97',
    priceCentsPerGallon: 1850,
    unit: 'gal',
    subjectToDetraction: false,
    detractionRateBps: null,
  },
  {
    code: 'DIESEL_B5',
    name: 'Diésel B5',
    priceCentsPerGallon: 1620,
    unit: 'gal',
    subjectToDetraction: true,
    detractionRateBps: FUEL_DETRACTION_RATE_BPS,
  },
  {
    code: 'GLP',
    name: 'GLP',
    priceCentsPerGallon: 680,
    unit: 'gal',
    subjectToDetraction: false,
    detractionRateBps: null,
  },
] as const;

const FUEL_BY_CODE = new Map(FUEL_CATALOG.map((f) => [f.code, f]));

export function getFuelByCode(code: string): FuelProduct | undefined {
  return FUEL_BY_CODE.get(code);
}

export function isValidFuelCode(code: string): boolean {
  return FUEL_BY_CODE.has(code);
}

export function gallonsToMicrounits(gallons: number): number {
  if (!Number.isFinite(gallons) || gallons <= 0) throw new Error('INVALID_GALLONS');
  // 3 decimales de galón = precisión de surtidor (milésimas)
  if (gallons > 10_000) throw new Error('INVALID_GALLONS');
  return Math.round(gallons * GALLON_MICROUNITS_PER_GALLON);
}

function assertFuelCode(code: string): FuelProduct {
  const fuel = getFuelByCode(code);
  if (!fuel) throw new Error('INVALID_FUEL_CODE');
  return fuel;
}

function assertPriceCents(price: number): number {
  if (!Number.isInteger(price) || price <= 0) throw new Error('INVALID_PRICE_CENTS');
  return price;
}

function computeSubtotalCents(gallonsMicro: number, priceCentsPerGallon: number): number {
  // integer cents: micro * price / 1_000_000 con round half-up (server-side)
  return Math.round((gallonsMicro * priceCentsPerGallon) / GALLON_MICROUNITS_PER_GALLON);
}

function computeIgvCents(subtotalCents: number): number {
  if (!Number.isSafeInteger(subtotalCents) || subtotalCents < 0)
    throw new Error('INVALID_SUBTOTAL');
  return Math.round((subtotalCents * 18) / 100);
}

export function computeDetractionForFuel(
  totalCents: number,
  fuelCode: string,
  isBusinessInvoice: boolean,
  documentType: string,
): number {
  const fuel = getFuelByCode(fuelCode);
  if (!fuel?.subjectToDetraction) return 0;
  if (!isBusinessInvoice) return 0;
  if (documentType !== '01') return 0;
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) throw new Error('INVALID_TOTAL');
  const rate = fuel.detractionRateBps ?? FUEL_DETRACTION_RATE_BPS;
  return Math.round((totalCents * rate) / 10_000);
}

export interface FuelDispatchInputByGallons {
  readonly fuelCode: string;
  readonly gallons: number;
  readonly priceCentsPerGallon?: number;
  readonly isBusinessInvoice: boolean;
  readonly documentType: string;
}

export interface FuelDispatchInputByAmount {
  readonly fuelCode: string;
  readonly amountCents: number;
  readonly priceCentsPerGallon?: number;
  readonly isBusinessInvoice: boolean;
  readonly documentType: string;
}

export interface FuelDispatchResult {
  readonly fuelCode: string;
  readonly fuelName: string;
  readonly gallonsMicrounits: number;
  readonly gallons: number;
  readonly priceCentsPerGallon: number;
  readonly subtotalCents: number;
  readonly igvCents: number;
  readonly totalCents: number;
  readonly detractionCents: number;
  /** Total a cobrar (detracción informativa: se deposita aparte, no se resta del total). */
  readonly netPayableCents: number;
}

export function computeFuelDispatchByGallons(
  input: FuelDispatchInputByGallons,
): FuelDispatchResult {
  const fuel = assertFuelCode(input.fuelCode);
  const gallonsMicro = gallonsToMicrounits(input.gallons);
  const price = assertPriceCents(input.priceCentsPerGallon ?? fuel.priceCentsPerGallon);
  const subtotal = computeSubtotalCents(gallonsMicro, price);
  const igv = computeIgvCents(subtotal);
  const total = subtotal + igv;
  const detra = computeDetractionForFuel(
    total,
    fuel.code,
    input.isBusinessInvoice,
    input.documentType,
  );
  return {
    fuelCode: fuel.code,
    fuelName: fuel.name,
    gallonsMicrounits: gallonsMicro,
    gallons: gallonsMicro / GALLON_MICROUNITS_PER_GALLON,
    priceCentsPerGallon: price,
    subtotalCents: subtotal,
    igvCents: igv,
    totalCents: total,
    detractionCents: detra,
    netPayableCents: total,
  };
}

export function computeFuelDispatchByAmount(input: FuelDispatchInputByAmount): FuelDispatchResult {
  const fuel = assertFuelCode(input.fuelCode);
  const price = assertPriceCents(input.priceCentsPerGallon ?? fuel.priceCentsPerGallon);
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0)
    throw new Error('INVALID_AMOUNT_CENTS');
  // amount = gallons * price -> gallonsMicro = round(amount * 1_000_000 / price)
  const gallonsMicro = Math.round((input.amountCents * GALLON_MICROUNITS_PER_GALLON) / price);
  if (gallonsMicro <= 0) throw new Error('INVALID_GALLONS');
  const subtotal = computeSubtotalCents(gallonsMicro, price);
  // Para modo monto, el amount del cajero es subtotal; pero el resultado normaliza por galones
  // Si hay leve diferencia por redondeo (<1 cent por micro), respetamos el subtotal calculado de galones
  // y exponemos ese subtotal como verdad. La diferencia es <2 cents y el servidor reconcilia.
  const igv = computeIgvCents(subtotal);
  const total = subtotal + igv;
  const detra = computeDetractionForFuel(
    total,
    fuel.code,
    input.isBusinessInvoice,
    input.documentType,
  );
  return {
    fuelCode: fuel.code,
    fuelName: fuel.name,
    gallonsMicrounits: gallonsMicro,
    gallons: gallonsMicro / GALLON_MICROUNITS_PER_GALLON,
    priceCentsPerGallon: price,
    subtotalCents: subtotal,
    igvCents: igv,
    totalCents: total,
    detractionCents: detra,
    netPayableCents: total,
  };
}
