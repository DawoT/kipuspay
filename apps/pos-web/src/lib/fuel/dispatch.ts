import { calculateFuelDispatch, type FuelDispatchCommand } from '@kipuspay/domain-fuel';

/**
 * Grifos — Despacho por surtidor (galones/monto) + detracción automática diésel.
 * Dominio puro: sin D1, sin red, sin deps npm. Dinero siempre INTEGER cents.
 * Offline-first: cálculo local <100ms sobre un snapshot firmado por servidor;
 * reconciliación autoritativa server-side.
 * No jerga técnica en mensajes visibles (V-27).
 */

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
  /** Fiscal policy returned by the server. */
  readonly igvRateBps: number;
}

export function getFuelByCode(
  code: string,
  catalog: readonly FuelProduct[],
): FuelProduct | undefined {
  return catalog.find((fuel) => fuel.code === code);
}

export function isValidFuelCode(code: string, catalog: readonly FuelProduct[]): boolean {
  return getFuelByCode(code, catalog) !== undefined;
}

export function gallonsToMicrounits(gallons: number): number {
  if (!Number.isFinite(gallons) || gallons <= 0) throw new Error('INVALID_GALLONS');
  // 3 decimales de galón = precisión de surtidor (milésimas)
  if (gallons > 10_000) throw new Error('INVALID_GALLONS');
  return Math.round(gallons * GALLON_MICROUNITS_PER_GALLON);
}

function assertPriceCents(price: number): number {
  if (!Number.isInteger(price) || price <= 0) throw new Error('INVALID_PRICE_CENTS');
  return price;
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
  readonly igvRateBps: number;
  readonly totalCents: number;
  readonly detractionCents: number;
  readonly detractionRateBps: number;
  /** Total a cobrar (detracción informativa: se deposita aparte, no se resta del total). */
  readonly netPayableCents: number;
}

/**
 * Computes a preview from the server catalog. Unlike the legacy convenience
 * function above, this path accepts arbitrary tenant-defined fuel codes and
 * uses the returned fiscal policy instead of a client catalogue.
 */
export function computeFuelDispatchByGallonsWithCatalog(
  input: FuelDispatchInputByGallons,
  catalog: readonly FuelProduct[],
): FuelDispatchResult {
  const fuel = catalog.find((candidate) => candidate.code === input.fuelCode);
  if (!fuel) throw new Error('INVALID_FUEL_CODE');
  const gallonsMicro = gallonsToMicrounits(input.gallons);
  const price = assertPriceCents(input.priceCentsPerGallon ?? fuel.priceCentsPerGallon);
  const result = calculateFuelDispatch({
    fuelCode: fuel.code,
    volumeMicrounits: gallonsMicro,
    priceCentsPerGallon: price,
    igvRateBps: fuel.igvRateBps,
    detractionRateBps: fuel.detractionRateBps ?? 0,
    businessInvoice: fuel.subjectToDetraction && input.isBusinessInvoice,
    documentType: input.documentType,
  } satisfies FuelDispatchCommand);
  return {
    fuelCode: fuel.code,
    fuelName: fuel.name,
    gallonsMicrounits: gallonsMicro,
    gallons: gallonsMicro / GALLON_MICROUNITS_PER_GALLON,
    priceCentsPerGallon: price,
    subtotalCents: result.subtotalCents,
    igvCents: result.igvCents,
    igvRateBps: fuel.igvRateBps,
    totalCents: result.totalCents,
    detractionCents: result.detractionCents,
    detractionRateBps: fuel.detractionRateBps ?? 0,
    netPayableCents: result.netPayableCents,
  };
}

/** Amount-mode counterpart for a server-provided catalog snapshot. */
export function computeFuelDispatchByAmountWithCatalog(
  input: FuelDispatchInputByAmount,
  catalog: readonly FuelProduct[],
): FuelDispatchResult {
  const fuel = catalog.find((candidate) => candidate.code === input.fuelCode);
  if (!fuel) throw new Error('INVALID_FUEL_CODE');
  const price = assertPriceCents(input.priceCentsPerGallon ?? fuel.priceCentsPerGallon);
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error('INVALID_AMOUNT_CENTS');
  }
  const gallonsMicro = Math.round((input.amountCents * GALLON_MICROUNITS_PER_GALLON) / price);
  if (gallonsMicro <= 0) throw new Error('INVALID_GALLONS');
  const result = calculateFuelDispatch({
    fuelCode: fuel.code,
    volumeMicrounits: gallonsMicro,
    priceCentsPerGallon: price,
    igvRateBps: fuel.igvRateBps,
    detractionRateBps: fuel.detractionRateBps ?? 0,
    businessInvoice: fuel.subjectToDetraction && input.isBusinessInvoice,
    documentType: input.documentType,
  } satisfies FuelDispatchCommand);
  return {
    fuelCode: fuel.code,
    fuelName: fuel.name,
    gallonsMicrounits: gallonsMicro,
    gallons: gallonsMicro / GALLON_MICROUNITS_PER_GALLON,
    priceCentsPerGallon: price,
    subtotalCents: result.subtotalCents,
    igvCents: result.igvCents,
    igvRateBps: fuel.igvRateBps,
    totalCents: result.totalCents,
    detractionCents: result.detractionCents,
    detractionRateBps: fuel.detractionRateBps ?? 0,
    netPayableCents: result.netPayableCents,
  };
}
