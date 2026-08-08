import { formatTicketCents } from './format-cents.js';
import { sanitizePrinterText } from './sanitize.js';

export type PriceLabelBarcodeType = 'EAN8' | 'EAN13' | 'CODE128';
export type PriceLabelAlignment = 'LEFT' | 'CENTER' | 'RIGHT';

export interface PriceLabelSnapshot {
  productId: string;
  productName: string;
  priceCents: number;
  barcodeType: PriceLabelBarcodeType;
  barcodeValue: string;
  templateVersion: number;
}

interface FieldBlock {
  type: 'TEXT' | 'PRICE' | 'BARCODE';
  field: 'product_name' | 'price' | 'barcode';
  align: PriceLabelAlignment;
}

interface SpacerBlock {
  type: 'SPACER';
  lines: number;
}

export interface PriceLabelTemplateV1 {
  dslVersion: 'PRICE_LABEL_V1';
  blocks: ReadonlyArray<FieldBlock | SpacerBlock>;
}

const encoder = new TextEncoder();
const alignments = new Set<PriceLabelAlignment>(['LEFT', 'CENTER', 'RIGHT']);
const fieldByType = {
  TEXT: 'product_name',
  PRICE: 'price',
  BARCODE: 'barcode',
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index])
  );
}

function templateError(): never {
  throw new Error('PRICE_LABEL_TEMPLATE_NOT_ALLOWED');
}

function validateTemplateBlock(candidate: unknown): void {
  if (!isRecord(candidate) || typeof candidate.type !== 'string') templateError();
  if (candidate.type === 'SPACER') {
    if (
      !hasExactKeys(candidate, ['type', 'lines']) ||
      !Number.isInteger(candidate.lines) ||
      (candidate.lines as number) < 1 ||
      (candidate.lines as number) > 4
    ) {
      templateError();
    }
    return;
  }
  if (!(candidate.type in fieldByType)) templateError();
  const type = candidate.type as keyof typeof fieldByType;
  if (
    !hasExactKeys(candidate, ['type', 'field', 'align']) ||
    candidate.field !== fieldByType[type] ||
    !alignments.has(candidate.align as PriceLabelAlignment)
  ) {
    templateError();
  }
}

export function validatePriceLabelTemplate(value: unknown): PriceLabelTemplateV1 {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['dslVersion', 'blocks']) ||
    value.dslVersion !== 'PRICE_LABEL_V1' ||
    !Array.isArray(value.blocks) ||
    value.blocks.length < 1 ||
    value.blocks.length > 16
  ) {
    return templateError();
  }

  value.blocks.forEach(validateTemplateBlock);
  return value as unknown as PriceLabelTemplateV1;
}

function gs1CheckDigit(digitsWithoutCheck: string): number {
  let sum = 0;
  let weight = 3;
  for (let index = digitsWithoutCheck.length - 1; index >= 0; index -= 1) {
    sum += (digitsWithoutCheck.charCodeAt(index) - 48) * weight;
    weight = weight === 3 ? 1 : 3;
  }
  return (10 - (sum % 10)) % 10;
}

function validateEan(kind: 'EAN8' | 'EAN13', value: string): void {
  const digitsOnly = kind === 'EAN8' ? /^\d{8}$/ : /^\d{13}$/;
  if (!digitsOnly.test(value)) throw new Error(`BARCODE_${kind}_INVALID`);
  const body = value.slice(0, -1);
  if (gs1CheckDigit(body) !== value.charCodeAt(value.length - 1) - 48) {
    throw new Error(`BARCODE_${kind}_CHECKSUM`);
  }
}

/**
 * Returns barcode codewords. CODE128 uses set B and includes start, modulo-103
 * checksum and stop; EAN returns its validated digit codewords.
 */
export function encodePriceLabelBarcode(kind: PriceLabelBarcodeType, value: string): Uint8Array {
  if (kind === 'EAN8' || kind === 'EAN13') {
    validateEan(kind, value);
    return Uint8Array.from(value, (digit) => digit.charCodeAt(0) - 48);
  }
  if (kind !== 'CODE128') throw new Error('BARCODE_TYPE_INVALID');
  if (value.length < 1 || value.length > 80 || !/^[\x20-\x7e]+$/.test(value)) {
    throw new Error('BARCODE_CODE128_INVALID');
  }
  const data = Array.from(value, (character) => character.charCodeAt(0) - 32);
  const checksum = data.reduce((sum, code, index) => sum + code * (index + 1), 104) % 103;
  return new Uint8Array([104, ...data, checksum, 106]);
}

function assertSnapshot(snapshot: PriceLabelSnapshot): void {
  if (
    !isRecord(snapshot) ||
    typeof snapshot.productId !== 'string' ||
    snapshot.productId.length < 1 ||
    snapshot.productId.length > 128 ||
    typeof snapshot.productName !== 'string' ||
    snapshot.productName.length < 1 ||
    snapshot.productName.length > 120 ||
    !Number.isSafeInteger(snapshot.priceCents) ||
    snapshot.priceCents < 0 ||
    !Number.isSafeInteger(snapshot.templateVersion) ||
    snapshot.templateVersion < 1 ||
    typeof snapshot.barcodeValue !== 'string'
  ) {
    throw new Error('PRICE_LABEL_SNAPSHOT_INVALID');
  }
  try {
    encodePriceLabelBarcode(snapshot.barcodeType, snapshot.barcodeValue);
  } catch {
    throw new Error('PRICE_LABEL_SNAPSHOT_INVALID');
  }
}

export function canonicalizePriceLabelSnapshots(snapshots: readonly PriceLabelSnapshot[]): string {
  if (snapshots.length < 1 || snapshots.length > 500) {
    throw new Error('PRICE_LABEL_COUNT_INVALID');
  }
  return JSON.stringify(
    snapshots.map((snapshot) => {
      assertSnapshot(snapshot);
      return {
        barcodeType: snapshot.barcodeType,
        barcodeValue: snapshot.barcodeValue,
        priceCents: snapshot.priceCents,
        productId: snapshot.productId,
        productName: snapshot.productName,
        templateVersion: snapshot.templateVersion,
      };
    }),
  );
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function hashPriceLabelSnapshots(snapshots: readonly PriceLabelSnapshot[]): Promise<string> {
  return sha256Hex(encoder.encode(canonicalizePriceLabelSnapshots(snapshots)));
}

export function hashPriceLabelPayload(payload: Uint8Array): Promise<string> {
  return sha256Hex(payload);
}

function alignmentCode(align: PriceLabelAlignment): number {
  return align === 'LEFT' ? 0 : align === 'CENTER' ? 1 : 2;
}

function alignedLine(value: string, align: PriceLabelAlignment, width: number): string {
  const text = sanitizePrinterText(value).slice(0, width);
  if (align === 'LEFT') return `${text}\n`;
  const padding = Math.max(0, width - text.length);
  if (align === 'RIGHT') return `${' '.repeat(padding)}${text}\n`;
  const left = Math.floor(padding / 2);
  return `${' '.repeat(left)}${text}\n`;
}

function appendBarcodeCommand(
  output: number[],
  snapshot: PriceLabelSnapshot,
  align: PriceLabelAlignment,
): void {
  encodePriceLabelBarcode(snapshot.barcodeType, snapshot.barcodeValue);
  output.push(0x1b, 0x61, alignmentCode(align), 0x1d, 0x68, 64, 0x1d, 0x48, 2);
  if (snapshot.barcodeType === 'CODE128') {
    const data = encoder.encode(`{B${snapshot.barcodeValue}`);
    output.push(0x1d, 0x6b, 73, data.length, ...data);
  } else {
    const mode = snapshot.barcodeType === 'EAN8' ? 3 : 2;
    output.push(0x1d, 0x6b, mode, ...encoder.encode(snapshot.barcodeValue), 0);
  }
  output.push(0x0a);
}

export function compilePriceLabelTemplate(
  templateValue: unknown,
  snapshot: PriceLabelSnapshot,
  paperWidthMm: 58 | 80,
): Uint8Array {
  const template = validatePriceLabelTemplate(templateValue);
  assertSnapshot(snapshot);
  if (paperWidthMm !== 58 && paperWidthMm !== 80) {
    throw new Error('PRICE_LABEL_PAPER_WIDTH_INVALID');
  }
  const width = paperWidthMm === 58 ? 32 : 48;
  const output: number[] = [0x1b, 0x40];
  for (const block of template.blocks) {
    if (block.type === 'SPACER') {
      output.push(...encoder.encode('\n'.repeat(block.lines)));
    } else if (block.type === 'BARCODE') {
      appendBarcodeCommand(output, snapshot, block.align);
    } else {
      output.push(0x1b, 0x61, alignmentCode(block.align));
      if (block.type === 'PRICE') output.push(0x1b, 0x45, 1, 0x1d, 0x21, 0x11);
      const value =
        block.type === 'PRICE'
          ? `S/ ${formatTicketCents(snapshot.priceCents)}`
          : snapshot.productName;
      output.push(...encoder.encode(alignedLine(value, block.align, width)));
      if (block.type === 'PRICE') output.push(0x1d, 0x21, 0, 0x1b, 0x45, 0);
    }
  }
  output.push(0x1b, 0x61, 0, 0x0a, 0x1d, 0x56, 0x42, 0x04);
  return new Uint8Array(output);
}
