/**
 * C14N 1.0 (sin comentarios) — subset UBL/XAdES zero-dep.
 * XMLDSig / SUNAT 2335: el DigestValue de URI="" es SHA-256 de estos octetos.
 * Rec: http://www.w3.org/TR/2001/REC-xml-c14n-20010315
 */

const XML_NS = 'http://www.w3.org/XML/1998/namespace';

interface XmlElement {
  readonly name: string;
  readonly attrs: ReadonlyArray<readonly [string, string]>;
  readonly children: readonly XmlChild[];
}

type XmlChild = XmlElement | string;

interface Cursor {
  readonly xml: string;
  i: number;
}

function fail(c: Cursor, reason: string): never {
  throw new Error(`MALFORMED_XML: ${reason} (offset ${c.i})`);
}

function peek(c: Cursor): string {
  return c.xml[c.i] ?? '';
}

function skipWhitespace(c: Cursor): void {
  while (c.i < c.xml.length && /\s/.test(c.xml[c.i]!)) c.i += 1;
}

function readName(c: Cursor): string {
  const start = c.i;
  while (c.i < c.xml.length && /[A-Za-z0-9_.:-]/.test(c.xml[c.i]!)) c.i += 1;
  if (c.i === start) fail(c, 'nombre');
  return c.xml.slice(start, c.i);
}

function decodeEntities(raw: string, c: Cursor): string {
  let out = '';
  let i = 0;
  while (i < raw.length) {
    const amp = raw.indexOf('&', i);
    if (amp < 0) {
      out += raw.slice(i);
      break;
    }
    out += raw.slice(i, amp);
    const semi = raw.indexOf(';', amp);
    if (semi < 0) fail(c, 'entidad sin ;');
    const ent = raw.slice(amp + 1, semi);
    if (ent === 'amp') out += '&';
    else if (ent === 'lt') out += '<';
    else if (ent === 'gt') out += '>';
    else if (ent === 'quot') out += '"';
    else if (ent === 'apos') out += "'";
    else if (/^#x[0-9A-Fa-f]+$/.test(ent)) {
      out += String.fromCodePoint(Number.parseInt(ent.slice(2), 16));
    } else if (/^#\d+$/.test(ent)) {
      out += String.fromCodePoint(Number.parseInt(ent.slice(1), 10));
    } else fail(c, `entidad ${ent}`);
    i = semi + 1;
  }
  return out;
}

function skipSpecial(c: Cursor): boolean {
  if (c.xml.startsWith('<!--', c.i)) {
    const end = c.xml.indexOf('-->', c.i + 4);
    if (end < 0) fail(c, 'comentario');
    c.i = end + 3;
    return true;
  }
  if (c.xml.startsWith('<?', c.i)) {
    const end = c.xml.indexOf('?>', c.i + 2);
    if (end < 0) fail(c, 'PI');
    c.i = end + 2;
    return true;
  }
  return false;
}

function readCdata(c: Cursor): string | null {
  if (!c.xml.startsWith('<![CDATA[', c.i)) return null;
  const end = c.xml.indexOf(']]>', c.i + 9);
  if (end < 0) fail(c, 'CDATA');
  const text = c.xml.slice(c.i + 9, end);
  c.i = end + 3;
  return text;
}

function parseAttributes(c: Cursor): Array<[string, string]> {
  const attrs: Array<[string, string]> = [];
  for (;;) {
    skipWhitespace(c);
    if (peek(c) === '>' || peek(c) === '/') return attrs;
    const name = readName(c);
    skipWhitespace(c);
    if (peek(c) !== '=') fail(c, 'atributo');
    c.i += 1;
    skipWhitespace(c);
    const quote = peek(c);
    if (quote !== '"' && quote !== "'") fail(c, 'comillas');
    c.i += 1;
    const start = c.i;
    const end = c.xml.indexOf(quote, start);
    if (end < 0) fail(c, 'atributo abierto');
    const value = decodeEntities(c.xml.slice(start, end), c);
    c.i = end + 1;
    attrs.push([name, value]);
  }
}

function parseChildren(c: Cursor, name: string): XmlChild[] {
  const children: XmlChild[] = [];
  for (;;) {
    if (c.i >= c.xml.length) fail(c, `sin cierre ${name}`);
    const cdata = readCdata(c);
    if (cdata !== null) {
      children.push(cdata);
      continue;
    }
    if (skipSpecial(c)) continue;
    if (c.xml.startsWith('</', c.i)) {
      c.i += 2;
      const close = readName(c);
      skipWhitespace(c);
      if (peek(c) !== '>') fail(c, 'cierre');
      c.i += 1;
      if (close !== name) fail(c, `cerró ${close} abrió ${name}`);
      return children;
    }
    if (peek(c) === '<') {
      children.push(parseElement(c));
      continue;
    }
    const start = c.i;
    const next = c.xml.indexOf('<', start);
    if (next < 0) fail(c, 'texto');
    children.push(decodeEntities(c.xml.slice(start, next), c));
    c.i = next;
  }
}

function parseElement(c: Cursor): XmlElement {
  if (peek(c) !== '<') fail(c, 'elemento');
  c.i += 1;
  if (peek(c) === '/') fail(c, 'cierre huérfano');
  const name = readName(c);
  const attrs = parseAttributes(c);
  if (peek(c) === '/') {
    c.i += 1;
    if (peek(c) !== '>') fail(c, 'self-closing');
    c.i += 1;
    return { name, attrs, children: [] };
  }
  if (peek(c) !== '>') fail(c, 'tag');
  c.i += 1;
  return { name, attrs, children: parseChildren(c, name) };
}

function parseDocument(xml: string): XmlElement {
  const c: Cursor = { xml, i: 0 };
  for (;;) {
    skipWhitespace(c);
    if (c.i >= c.xml.length) fail(c, 'sin raíz');
    if (skipSpecial(c)) continue;
    if (peek(c) === '<') break;
    fail(c, 'basura');
  }
  const root = parseElement(c);
  skipWhitespace(c);
  while (c.i < c.xml.length) {
    if (skipSpecial(c)) {
      skipWhitespace(c);
      continue;
    }
    if (c.i < c.xml.length) fail(c, 'tras raíz');
  }
  return root;
}

function escapeText(value: string): string {
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === '&') out += '&amp;';
    else if (ch === '<') out += '&lt;';
    else if (ch === '>') out += '&gt;';
    else if (code === 13) out += '&#xD;';
    else out += ch;
  }
  return out;
}

function escapeAttr(value: string): string {
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === '&') out += '&amp;';
    else if (ch === '<') out += '&lt;';
    else if (ch === '"') out += '&quot;';
    else if (code === 9) out += '&#x9;';
    else if (code === 10) out += '&#xA;';
    else if (code === 13) out += '&#xD;';
    else out += ch;
  }
  return out;
}

function prefixOf(qname: string): string {
  const colon = qname.indexOf(':');
  return colon < 0 ? '' : qname.slice(0, colon);
}

function localOf(qname: string): string {
  const colon = qname.indexOf(':');
  return colon < 0 ? qname : qname.slice(colon + 1);
}

function applyNs(
  parent: ReadonlyMap<string, string>,
  attrs: ReadonlyArray<readonly [string, string]>,
): Map<string, string> {
  const next = new Map(parent);
  for (const [name, value] of attrs) {
    if (name === 'xmlns') next.set('', value);
    else if (name.startsWith('xmlns:')) next.set(name.slice(6), value);
  }
  return next;
}

function nsNodesToRender(
  parent: ReadonlyMap<string, string>,
  local: ReadonlyMap<string, string>,
): Array<readonly [string, string]> {
  const nodes: Array<readonly [string, string]> = [];
  for (const [prefix, uri] of local) {
    if (prefix === 'xml' && uri === XML_NS) continue;
    if (parent.get(prefix) === uri) continue;
    if (prefix === '' && uri === '' && !parent.has('')) continue;
    nodes.push([prefix, uri]);
  }
  nodes.sort((a, b) => a[0].localeCompare(b[0]));
  return nodes;
}

function attrNsUri(name: string, ns: ReadonlyMap<string, string>): string {
  const prefix = prefixOf(name);
  if (prefix === '') return '';
  if (prefix === 'xml') return XML_NS;
  return ns.get(prefix) ?? '';
}

function regularAttrs(
  attrs: ReadonlyArray<readonly [string, string]>,
  ns: ReadonlyMap<string, string>,
): Array<readonly [string, string]> {
  const regular = attrs.filter(([name]) => name !== 'xmlns' && !name.startsWith('xmlns:'));
  regular.sort((a, b) => {
    const nsCmp = attrNsUri(a[0], ns).localeCompare(attrNsUri(b[0], ns));
    if (nsCmp !== 0) return nsCmp;
    return localOf(a[0]).localeCompare(localOf(b[0]));
  });
  return regular;
}

function renderElement(el: XmlElement, parentNs: ReadonlyMap<string, string>): string {
  const localNs = applyNs(parentNs, el.attrs);
  const nsNodes = nsNodesToRender(parentNs, localNs);
  const attrs = regularAttrs(el.attrs, localNs);
  let out = `<${el.name}`;
  for (const [prefix, uri] of nsNodes) {
    const attrName = prefix === '' ? 'xmlns' : `xmlns:${prefix}`;
    out += ` ${attrName}="${escapeAttr(uri)}"`;
  }
  for (const [name, value] of attrs) {
    out += ` ${name}="${escapeAttr(value)}"`;
  }
  out += '>';
  for (const child of el.children) {
    out += typeof child === 'string' ? escapeText(child) : renderElement(child, localNs);
  }
  out += `</${el.name}>`;
  return out;
}

const INITIAL_NS: ReadonlyMap<string, string> = new Map([['xml', XML_NS]]);

/** C14N 1.0 inclusive, sin comentarios, UTF-8 string (octetos = TextEncoder). */
export function canonicalC14n10(xml: string): string {
  return renderElement(parseDocument(xml), INITIAL_NS);
}

/** `xmlns` / `xmlns:prefix` del elemento raíz (no los heredados). */
export function rootNamespaceDeclarations(xml: string): ReadonlyArray<readonly [string, string]> {
  const root = parseDocument(xml);
  const out: Array<readonly [string, string]> = [];
  for (const [name, value] of root.attrs) {
    if (name === 'xmlns') out.push(['', value]);
    else if (name.startsWith('xmlns:')) out.push([name.slice(6), value]);
  }
  return out;
}

/**
 * Inclusive C14N 1.0 de un subárbol: el ápice emite los xmlns in-scope
 * (XMLDSig `canonicalizeSubtree` / libxml2). Sin esto, SignedInfo firmado
 * como documento suelto no coincide con SUNAT.
 */
export function mergeAncestorNamespaces(
  elementXml: string,
  ancestorNs: ReadonlyArray<readonly [string, string]>,
): string {
  let start = 0;
  if (elementXml.startsWith('<?xml')) {
    const declEnd = elementXml.indexOf('?>');
    if (declEnd < 0) throw new Error('MALFORMED_XML: missing root');
    start = declEnd + 2;
  }
  const close = elementXml.indexOf('>', start);
  if (close < 0) throw new Error('MALFORMED_XML: missing root');
  const open = elementXml.slice(start, close);
  let inject = '';
  for (const [prefix, uri] of ancestorNs) {
    if (prefix === 'xml') continue;
    const has =
      prefix === '' ? /(?:^|[\s<])xmlns="/.test(open) : open.includes(`xmlns:${prefix}="`);
    if (!has) {
      inject += prefix === '' ? ` xmlns="${uri}"` : ` xmlns:${prefix}="${uri}"`;
    }
  }
  return `${elementXml.slice(0, close)}${inject}${elementXml.slice(close)}`;
}

export function canonicalC14n10Subtree(
  elementXml: string,
  ancestorNs: ReadonlyArray<readonly [string, string]>,
): string {
  return canonicalC14n10(mergeAncestorNamespaces(elementXml, ancestorNs));
}
