/**
 * UBL 2.1 Invoice builder mínimo (factura 01) — zero-dep Web Platform.
 * Arquitectura §5.2 / ADR-FISCAL-001. No usa npm runtime.
 */
/* eslint-disable no-secrets/no-secrets -- XML UBL namespaces y tags, no secretos */

export interface UblInvoiceLine {
  readonly id: number;
  readonly description: string;
  readonly quantity: number;
  readonly unitCode: string;
  readonly unitPriceCents: number;
  readonly igvAffectationCode: string; // Catálogo 07
  readonly igvCents: number;
  readonly lineTotalCents: number;
  readonly icbperCents: number;
}

export interface UblInvoiceInput {
  readonly ublVersion: '2.1';
  readonly customizationId: '2.0';
  readonly id: string; // F001-00000001
  readonly issueDate: string; // YYYY-MM-DD Lima
  readonly issueTime: string; // HH:MM:SS
  readonly invoiceTypeCode: '01' | '03';
  readonly currency: 'PEN';
  readonly issuerRuc: string;
  readonly issuerName: string;
  readonly customerDocType: string;
  readonly customerDocNumber: string;
  readonly customerName: string;
  readonly totalTaxableCents: number;
  readonly totalIgvCents: number;
  readonly totalIcbperCents: number;
  readonly totalAmountCents: number;
  readonly lines: readonly UblInvoiceLine[];
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function centsToAmount(cents: number): string {
  if (!Number.isInteger(cents)) throw new Error('INVALID_CENTS');
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${sign}${whole}.${frac}`;
}

/** Construye XML UBL Invoice 2.1 mínimo válido para fixtures de prueba. */
export function buildUblInvoiceXml(input: UblInvoiceInput): string {
  if (input.ublVersion !== '2.1') throw new Error('UNSUPPORTED_UBL_VERSION');
  if (!/^\d{11}$/.test(input.issuerRuc)) throw new Error('INVALID_ISSUER_RUC');
  if (input.invoiceTypeCode === '01' && input.customerDocType !== '6') {
    throw new Error('FACTURA_REQUIRES_RUC');
  }
  if (!input.lines.length) throw new Error('EMPTY_LINES');

  const linesXml = input.lines
    .map((line) => {
      const netCents = line.lineTotalCents - line.igvCents - line.icbperCents;
      const unitValueCents = Math.round(netCents / (line.quantity || 1));
      return `
  <cac:InvoiceLine>
    <cbc:ID>${line.id}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${escapeXml(line.unitCode)}">${line.quantity}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${input.currency}">${centsToAmount(netCents)}</cbc:LineExtensionAmount>
    <cac:PricingReference>
      <cac:AlternativeConditionPrice>
        <cbc:PriceAmount currencyID="${input.currency}">${centsToAmount(line.unitPriceCents)}</cbc:PriceAmount>
        <cbc:PriceTypeCode>01</cbc:PriceTypeCode>
      </cac:AlternativeConditionPrice>
    </cac:PricingReference>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${input.currency}">${centsToAmount(line.igvCents + line.icbperCents)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxAmount currencyID="${input.currency}">${centsToAmount(line.igvCents)}</cbc:TaxAmount>
        <cac:TaxCategory>
          <cbc:TaxExemptionReasonCode>${escapeXml(line.igvAffectationCode)}</cbc:TaxExemptionReasonCode>
          <cac:TaxScheme>
            <cbc:ID>1000</cbc:ID>
            <cbc:Name>IGV</cbc:Name>
            <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
          </cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Description>${escapeXml(line.description)}</cbc:Description>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${input.currency}">${centsToAmount(unitValueCents)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>${input.customizationId}</cbc:CustomizationID>
  <cbc:ID>${escapeXml(input.id)}</cbc:ID>
  <cbc:IssueDate>${escapeXml(input.issueDate)}</cbc:IssueDate>
  <cbc:IssueTime>${escapeXml(input.issueTime)}</cbc:IssueTime>
  <cbc:InvoiceTypeCode listID="0101">${input.invoiceTypeCode}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${input.currency}</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="6">${escapeXml(input.issuerRuc)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(input.issuerName)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${escapeXml(input.customerDocType)}">${escapeXml(input.customerDocNumber)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(input.customerName)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${input.currency}">${centsToAmount(input.totalIgvCents + input.totalIcbperCents)}</cbc:TaxAmount>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${input.currency}">${centsToAmount(input.totalTaxableCents)}</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="${input.currency}">${centsToAmount(input.totalAmountCents)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${input.currency}">${centsToAmount(input.totalAmountCents)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${linesXml}
</Invoice>
`;
}

/** Firma detachada SHA-256 del XML (staging / mock PSE — no XAdES completo). */
export async function hashUblXml(xml: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(xml));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Valida well-formedness XML mínima (zero-dep, Web Platform): un solo root,
 * tags balanceados, atributos entre comillas, entidades escapadas. Suficiente
 * para el pipeline fiscal (el transporte/OSE valida el XSD real); detecta XML
 * roto que los `string.includes` no ven. F5-1 (auditoría fase 2).
 */
export function assertWellFormedXml(xml: string): void {
  const ctx: XmlParseCtx = { xml, i: 0, stack: [], rootSeen: false };

  const fail = (reason: string): never => {
    throw new Error(`MALFORMED_XML: ${reason} (offset ${ctx.i})`);
  };
  ctx.fail = fail;

  const skipWhitespace = (): void => {
    while (ctx.i < ctx.xml.length && /\s/.test(ctx.xml[ctx.i]!)) ctx.i += 1;
  };

  const readName = (): string => {
    const start = ctx.i;
    while (ctx.i < ctx.xml.length && /[A-Za-z0-9_.:-]/.test(ctx.xml[ctx.i]!)) ctx.i += 1;
    if (ctx.i === start) fail(`esperaba nombre en <${ctx.xml.slice(start, start + 20)}`);
    return ctx.xml.slice(start, ctx.i);
  };

  const parseAttributes = (): void => {
    for (;;) {
      skipWhitespace();
      if (ctx.i >= ctx.xml.length) fail('fin de archivo dentro de un tag');
      if (ctx.xml[ctx.i] === '>' || ctx.xml[ctx.i] === '/') return;
      readName(); // nombre del atributo
      skipWhitespace();
      if (ctx.xml[ctx.i] !== '=') fail('atributo sin "="');
      ctx.i += 1;
      skipWhitespace();
      const quote = ctx.xml[ctx.i];
      if (quote !== '"' && quote !== "'") fail('valor de atributo sin comillas');
      ctx.i += 1;
      const valueStart = ctx.i;
      while (ctx.i < ctx.xml.length && ctx.xml[ctx.i] !== quote) ctx.i += 1;
      if (ctx.i >= ctx.xml.length) fail('valor de atributo sin cerrar');
      checkXmlEntities(ctx.xml.slice(valueStart, ctx.i), fail);
      ctx.i += 1; // cierra comilla
    }
  };

  const registerRoot = (name: string): void => {
    if (!ctx.rootSeen) {
      ctx.rootSeen = true;
    } else if (ctx.stack.length === 0) {
      fail(`segundo root: <${name}>`);
    }
  };

  // Declaración XML opcional al inicio.
  if (xml.startsWith('<?xml')) {
    const end = xml.indexOf('?>');
    if (end < 0) fail('declaración XML sin cerrar');
    ctx.i = end + 2;
  }

  for (;;) {
    skipWhitespace();
    if (ctx.i >= ctx.xml.length) break;

    if (ctx.xml[ctx.i] !== '<') {
      // Texto fuera de tag: solo entidades escapadas.
      const textStart = ctx.i;
      while (ctx.i < ctx.xml.length && ctx.xml[ctx.i] !== '<') ctx.i += 1;
      checkXmlEntities(ctx.xml.slice(textStart, ctx.i), fail);
      continue;
    }

    const skipped = skipXmlSpecialSection(ctx.xml, ctx.i, fail);
    if (skipped !== null) {
      ctx.i = skipped;
      continue;
    }

    parseXmlTag(ctx, fail, readName, parseAttributes, skipWhitespace, registerRoot);
  }

  if (ctx.stack.length > 0) fail(`tags sin cerrar: <${ctx.stack.join('>, <')}>`);
  if (!ctx.rootSeen) fail('sin elemento raíz');
}

interface XmlParseCtx {
  readonly xml: string;
  i: number;
  stack: string[];
  rootSeen: boolean;
  fail?: (reason: string) => never;
}

function parseXmlTag(
  ctx: XmlParseCtx,
  fail: (reason: string) => never,
  readName: () => string,
  parseAttributes: () => void,
  skipWhitespace: () => void,
  registerRoot: (name: string) => void,
): void {
  // Tag de cierre.
  if (ctx.xml[ctx.i + 1] === '/') {
    ctx.i += 2;
    const name = readName();
    skipWhitespace();
    if (ctx.xml[ctx.i] !== '>') fail(`cierre malformado </${name}`);
    ctx.i += 1;
    const open = ctx.stack.pop();
    if (open === undefined) fail(`cierre sin apertura </${name}>`);
    if (open !== name) fail(`cierre desbalanceado: abrió <${open}> cerró </${name}>`);
    return;
  }
  // Tag de apertura (o self-closing).
  ctx.i += 1;
  const name = readName();
  parseAttributes();
  if (ctx.i >= ctx.xml.length) fail('fin de archivo dentro de un tag');
  // parseAttributes garantiza que aquí xml[i] es '>' o '/'.
  if (ctx.xml[ctx.i] === '/') {
    ctx.i += 1;
    if (ctx.xml[ctx.i] !== '>') fail('self-closing malformado');
    ctx.i += 1;
    registerRoot(name);
    return;
  }
  ctx.i += 1;
  registerRoot(name);
  ctx.stack.push(name);
}

function checkXmlEntities(text: string, fail: (reason: string) => never): void {
  const entities = text.match(/&[^;]*;/g) ?? [];
  for (const e of entities) {
    if (!/^&(amp|lt|gt|quot|apos|#\d{1,6});$/.test(e)) fail(`entidad inválida ${e}`);
  }
  if (text.includes('&') && entities.length === 0) fail('& sin entidad válida');
}

function skipXmlSpecialSection(
  xml: string,
  i: number,
  fail: (reason: string) => never,
): number | null {
  if (xml.startsWith('<!--', i)) {
    const end = xml.indexOf('-->', i + 4);
    if (end < 0) fail('comentario sin cerrar');
    return end + 3;
  }
  if (xml.startsWith('<![CDATA[', i)) {
    const end = xml.indexOf(']]>', i + 9);
    if (end < 0) fail('CDATA sin cerrar');
    return end + 3;
  }
  return null;
}

export function assertValidFacturaXml(xml: string): void {
  assertWellFormedXml(xml);
  if (!xml.includes('<cbc:UBLVersionID>2.1</cbc:UBLVersionID>')) {
    throw new Error('INVALID_UBL_VERSION');
  }
  if (!xml.includes('<cbc:InvoiceTypeCode')) throw new Error('MISSING_INVOICE_TYPE');
  if (!xml.includes('schemeID="6"')) throw new Error('MISSING_ISSUER_RUC');
  if (!xml.includes('<cac:InvoiceLine>')) throw new Error('MISSING_LINES');
  if (xml.toLowerCase().includes('contingencia')) throw new Error('CONTINGENCIA_FORBIDDEN');
}
