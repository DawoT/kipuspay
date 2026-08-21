/**
 * SOAP 1.1 UsernameToken + parseo de CDR/ticket/fault de billService SUNAT.
 * Credenciales solo por opts (Secrets Store); nunca literales de SOL.
 */
import { unzipAllFiles, zipStore } from './zip-store.js';
import { inflateRawSync } from './vendor/tiny-inflate.js';

export const SUNAT_BETA_BILL_SERVICE_URL =
  'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService';

const SOAP_ENV = 'http://schemas.xmlsoap.org/soap/envelope/';
const SOAP_SER = 'http://service.sunat.gob.pe';
const SOAP_WSSE =
  'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd';

export type SunatSoapOperation = 'sendBill' | 'sendSummary' | 'getStatus';

export interface CpeZipIdentity {
  readonly ruc: string;
  readonly documentType: string;
  readonly series: string;
  readonly numberPadded: string;
}

export function bytesToBase64(der: Uint8Array): string {
  let binary = '';
  for (const byte of der) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function bytesFromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (ch) => ch.charCodeAt(0));
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function tagText(
  xml: string,
  localName:
    | 'ticket'
    | 'applicationResponse'
    | 'statusCode'
    | 'content'
    | 'faultcode'
    | 'faultstring'
    | 'FaultString'
    | 'message'
    | 'detail'
    | 'ResponseCode'
    | 'Description',
): string | null {
  let from = 0;
  while (from < xml.length) {
    const lt = xml.indexOf('<', from);
    if (lt < 0) return null;
    if (xml[lt + 1] === '!' || xml[lt + 1] === '?') {
      const skip = xml.indexOf('>', lt + 1);
      from = skip < 0 ? xml.length : skip + 1;
      continue;
    }
    if (xml[lt + 1] === '/') {
      from = lt + 2;
      continue;
    }
    const gt = xml.indexOf('>', lt + 1);
    if (gt < 0) return null;
    const head = xml.slice(lt + 1, gt);
    const nameEnd = head.search(/[\s/]/);
    const qname = nameEnd >= 0 ? head.slice(0, nameEnd) : head;
    const colon = qname.lastIndexOf(':');
    const local = colon >= 0 ? qname.slice(colon + 1) : qname;
    if (local !== localName || head.endsWith('/')) {
      from = gt + 1;
      continue;
    }
    const close = `</${qname}>`;
    const end = xml.indexOf(close, gt + 1);
    if (end < 0) return null;
    let value = xml.slice(gt + 1, end).trim();
    if (value.startsWith('<![CDATA[') && value.endsWith(']]>')) {
      value = value.slice(9, -3).trim();
    }
    return value.length > 0 ? value : null;
  }
  return null;
}

function firstCbcIdAfter(xml: string, from: number): string | null {
  const open = xml.indexOf('<cbc:ID', from);
  if (open < 0) return null;
  const gt = xml.indexOf('>', open);
  if (gt < 0) return null;
  const close = xml.indexOf('</cbc:ID>', gt);
  if (close < 0) return null;
  const value = xml.slice(gt + 1, close).trim();
  return value.length > 0 ? value : null;
}

function rootDocumentOffset(xml: string): number {
  const names = ['<Invoice', '<CreditNote', '<DebitNote', '<SummaryDocuments'] as const;
  let best = -1;
  for (const name of names) {
    const idx = xml.indexOf(name);
    if (idx >= 0 && (best < 0 || idx < best)) best = idx;
  }
  return best;
}

export function zipBaseName(id: CpeZipIdentity): string {
  return `${id.ruc}-${id.documentType}-${id.series}-${id.numberPadded}`;
}

export function parseCpeZipIdentity(xml: string, documentType: string): CpeZipIdentity | null {
  const supplierAt = xml.indexOf('AccountingSupplierParty');
  const rootAt = rootDocumentOffset(xml);
  if (supplierAt < 0 || rootAt < 0) return null;
  const ruc = firstCbcIdAfter(xml, supplierAt);
  const rawId = firstCbcIdAfter(xml, rootAt);
  if (!ruc || !/^\d{11}$/.test(ruc) || !rawId) return null;
  if (documentType === 'RC' || rawId.startsWith('RC-')) {
    const rc = /^RC-(\d{8})-(\d+)$/.exec(rawId);
    if (!rc) return null;
    return {
      ruc,
      documentType: 'RC',
      series: rc[1]!,
      numberPadded: rc[2]!.padStart(3, '0'),
    };
  }
  const parts = rawId.split('-');
  if (parts.length < 2) return null;
  const series = parts[0]!;
  const numberPadded = parts.slice(1).join('').replace(/\D/g, '').padStart(8, '0');
  if (!/^[A-Za-z0-9]{1,4}$/.test(series) || numberPadded.length !== 8) return null;
  return { ruc, documentType, series, numberPadded };
}

export function identityFromDto(input: {
  readonly issuerRuc: string;
  readonly documentType: string;
  readonly series: string;
  readonly number: number;
}): CpeZipIdentity | null {
  if (!/^\d{11}$/.test(input.issuerRuc)) return null;
  if (!Number.isInteger(input.number) || input.number < 1) return null;
  return {
    ruc: input.issuerRuc,
    documentType: input.documentType,
    series: input.series,
    numberPadded: String(input.number).padStart(8, '0'),
  };
}

export function zipUblXml(fileBaseName: string, xml: string): Uint8Array {
  return zipStore(`${fileBaseName}.xml`, new TextEncoder().encode(xml));
}

export function buildSunatSoapEnvelope(
  operation: SunatSoapOperation,
  opts: {
    readonly solUser: string;
    readonly solPassword: string;
    readonly fileName?: string;
    readonly zipBytes?: Uint8Array;
    readonly ticket?: string;
  },
): string {
  let body: string;
  if (operation === 'getStatus') {
    body = `<ser:getStatus><ticket>${escapeXml(opts.ticket ?? '')}</ticket></ser:getStatus>`;
  } else {
    const zipB64 = bytesToBase64(opts.zipBytes ?? new Uint8Array());
    const tag = operation === 'sendSummary' ? 'sendSummary' : 'sendBill';
    body = `<ser:${tag}><fileName>${escapeXml(opts.fileName ?? '')}</fileName><contentFile>${zipB64}</contentFile></ser:${tag}>`;
  }
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="${SOAP_ENV}" xmlns:ser="${SOAP_SER}" xmlns:wsse="${SOAP_WSSE}">` +
    `<soapenv:Header><wsse:Security>` +
    `<wsse:UsernameToken>` +
    `<wsse:Username>${escapeXml(opts.solUser)}</wsse:Username>` +
    `<wsse:Password>${escapeXml(opts.solPassword)}</wsse:Password>` +
    `</wsse:UsernameToken></wsse:Security></soapenv:Header>` +
    `<soapenv:Body>${body}</soapenv:Body></soapenv:Envelope>`
  );
}

export function soapAction(operation: SunatSoapOperation): string {
  return `urn:${operation}`;
}

export interface ParsedSunatSoap {
  readonly ticket: string | null;
  readonly applicationResponseB64: string | null;
  readonly statusCode: string | null;
  readonly statusContentB64: string | null;
  readonly faultCode: string | null;
  readonly faultString: string | null;
}

export function parseSunatSoapBody(soapXml: string): ParsedSunatSoap {
  const faultString = tagText(soapXml, 'faultstring') ?? tagText(soapXml, 'FaultString');
  const faultDetail = tagText(soapXml, 'message') ?? tagText(soapXml, 'detail');
  return {
    ticket: tagText(soapXml, 'ticket'),
    applicationResponseB64: tagText(soapXml, 'applicationResponse'),
    statusCode: tagText(soapXml, 'statusCode'),
    statusContentB64: tagText(soapXml, 'content'),
    faultCode: tagText(soapXml, 'faultcode'),
    faultString: faultString ?? faultDetail,
  };
}

export function normalizeCdrCode(raw: string): string {
  const trimmed = raw.trim();
  const asInt = Number.parseInt(trimmed, 10);
  if (Number.isFinite(asInt) && asInt === 0) return '0';
  return trimmed;
}

export function cdrAcceptedFromCode(code: string): boolean {
  return normalizeCdrCode(code) === '0';
}

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

function hexHead(bytes: Uint8Array, n = 24): string {
  return Array.from(bytes.subarray(0, n), (b) => b.toString(16).padStart(2, '0')).join('');
}

function huntInflateXml(zip: Uint8Array): string {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const nameLen = zip.length >= 30 ? view.getUint16(26, true) : 0;
  const extraLen = zip.length >= 30 ? view.getUint16(28, true) : 0;
  const dataStart = Math.min(zip.length, 30 + nameLen + extraLen);
  const starts = [dataStart, 30, 0].filter(
    (s, i, arr) => s < zip.length - 8 && arr.indexOf(s) === i,
  );
  const trims = [0, 16, 22, 68];
  for (const start of starts) {
    const store = decodeText(zip.subarray(start));
    if (tagText(store, 'ResponseCode')) return store;
    for (const trim of trims) {
      const end = zip.length - trim;
      if (end <= start + 8) continue;
      try {
        const out = inflateRawSync(zip.subarray(start, end), new Uint8Array(64 * 1024));
        const text = decodeText(out);
        if (tagText(text, 'ResponseCode')) return text;
      } catch {
        // siguiente recorte
      }
    }
  }
  return '';
}

function pickCdrXml(
  files: ReadonlyArray<{ readonly name: string; readonly content: Uint8Array }>,
): string {
  let best = '';
  for (const file of files) {
    const bytes = file.content;
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      continue;
    }
    const text = decodeText(bytes);
    if (tagText(text, 'ResponseCode')) return text;
    if (text.length > best.length) best = text;
  }
  return best;
}

async function xmlFromCdrPayload(
  zip: Uint8Array,
): Promise<{ xml: string; files: number; err?: string }> {
  if (zip[0] === 0x1f && zip[1] === 0x8b) {
    const ds = new DecompressionStream('gzip');
    const copy = new Uint8Array(zip.byteLength);
    copy.set(zip);
    const inflated = new Uint8Array(
      await new Response(new Blob([copy]).stream().pipeThrough(ds)).arrayBuffer(),
    );
    return xmlFromCdrPayload(inflated);
  }
  if (zip[0] === 0x50 && zip[1] === 0x4b) {
    try {
      let files = await unzipAllFiles(zip);
      for (let depth = 0; depth < 2; depth += 1) {
        const nested = files.find((f) => f.content[0] === 0x50 && f.content[1] === 0x4b);
        if (!nested) break;
        files = await unzipAllFiles(nested.content);
      }
      const xml = pickCdrXml(files) || huntInflateXml(zip);
      if (xml) return { xml, files: files.length };
      const raw = decodeText(zip);
      if (tagText(raw, 'ResponseCode')) return { xml: raw, files: files.length };
      return { xml: '', files: files.length };
    } catch (err) {
      const hunted = huntInflateXml(zip);
      const raw = decodeText(zip);
      const reason = err instanceof Error ? err.message : 'unzip';
      if (hunted) return { xml: hunted, files: 0, err: reason };
      return { xml: tagText(raw, 'ResponseCode') ? raw : '', files: 0, err: reason };
    }
  }
  return { xml: decodeText(zip), files: 0 };
}

function localZipMeta(zip: Uint8Array): string {
  if (zip.length < 30) return `short=${zip.length}`;
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const nameLen = view.getUint16(26, true);
  const extraLen = view.getUint16(28, true);
  const nameBytes = zip.subarray(30, Math.min(zip.length, 30 + nameLen));
  const name = decodeText(nameBytes).replace(/[^\x20-\x7e]/g, '.');
  const dataStart = 30 + nameLen + extraLen;
  return (
    `flg=${view.getUint16(6, true)};m=${view.getUint16(8, true)}` +
    `;cs=${view.getUint32(18, true)};us=${view.getUint32(22, true)}` +
    `;n=${nameLen};x=${extraLen};fn=${name};pay=${hexHead(zip.subarray(dataStart), 16)}`
  );
}

export async function cdrFromApplicationResponseZip(zipB64: string): Promise<{
  readonly cdrCode: string;
  readonly cdrDescription: string;
  readonly accepted: boolean;
}> {
  const compact = zipB64.replace(/\s+/g, '');
  let zip: Uint8Array;
  try {
    zip = bytesFromBase64(compact);
  } catch {
    return {
      cdrCode: '99',
      cdrDescription: `cdr_unparsed:b64_invalid:len=${compact.length}`,
      accepted: false,
    };
  }
  const { xml, files, err } = await xmlFromCdrPayload(zip);
  const codeRaw = tagText(xml, 'ResponseCode');
  const description = tagText(xml, 'Description') ?? tagText(xml, 'faultstring');
  if (!codeRaw) {
    const head = xml.replace(/\s+/g, ' ').slice(0, 80);
    return {
      cdrCode: '99',
      cdrDescription:
        `cdr_unparsed:zipLen=${zip.length};${localZipMeta(zip)};files=${files}` +
        (err ? `;err=${err}` : '') +
        (head ? `;xml=${head}` : `;xmlLen=${xml.length}`),
      accepted: false,
    };
  }
  const code = normalizeCdrCode(codeRaw);
  return {
    cdrCode: code,
    cdrDescription: description ?? 'cdr',
    accepted: cdrAcceptedFromCode(code),
  };
}

export function isSoapFaultBusiness(parsed: ParsedSunatSoap): boolean {
  const blob = `${parsed.faultCode ?? ''} ${parsed.faultString ?? ''}`;
  return /\b(Client|soap:Client|\d{3,4})\b/i.test(blob) && parsed.faultString !== null;
}
