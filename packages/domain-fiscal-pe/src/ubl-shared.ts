/**
 * Helpers UBL compartidos (zero-dep Web Platform) — usados por los builders
 * de Invoice, CreditNote y DebitNote. DRY: un solo lugar para escape, cents y
 * well-formedness (Arquitectura §5.2 / ADR-FISCAL-001).
 */

export function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function centsToAmount(cents: number): string {
  if (!Number.isInteger(cents)) throw new Error('INVALID_CENTS');
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${sign}${whole}.${frac}`;
}

/** Tasa IGV catálogo 07 (ratio, no dinero). Gravado `10` = 18%; resto 0. */
export function ublIgvPercent(affectationCode: string): string {
  return affectationCode === '10' ? '18.00' : '0.00';
}

/** Catálogo 09 — descripción de discrepancia NC (e-beta 2136 exige el tag). */
export function ublNcMotiveDescription(motiveCode: string): string {
  return motiveCode === '01' ? 'Anulacion de la operacion' : 'Ajuste del comprobante';
}

/** Catálogo 10 — descripción de discrepancia ND. */
export function ublNdMotiveDescription(motiveCode: string): string {
  return motiveCode === '02' ? 'Aumento en el valor' : 'Ajuste del comprobante';
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
