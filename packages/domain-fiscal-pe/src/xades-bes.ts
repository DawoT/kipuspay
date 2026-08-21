/**
 * XAdES-BES (XMLDSig RSA-SHA256) para CPE UBL — zero-dep WebCrypto.
 * Arquitectura §5.2 / ADR-FISCAL-006. El Edge firma; el cliente no trae npm.
 * `hashUblXml` sigue siendo integridad (`sunat_xml_hash`), no la firma.
 */
/* eslint-disable no-secrets/no-secrets -- URIs XMLDSig/XAdES y plantillas ds: */
import { assertWellFormedXml, escapeXml } from './ubl-shared.js';
import { canonicalC14n10, canonicalC14n10Subtree, rootNamespaceDeclarations } from './xml-c14n.js';
import { parseX509IssuerSerial, type X509IssuerSerial } from './x509-der.js';

const DS_NS = 'http://www.w3.org/2000/09/xmldsig#';
const XADES_NS = 'http://uri.etsi.org/01903/v1.3.2#';
const EXT_NS = 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2';
const C14N_ALG = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const SIG_ALG = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
const DIGEST_ALG = 'http://www.w3.org/2001/04/xmlenc#sha256';
const ENV_TRANSFORM = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';
const SIGNED_PROPS_TYPE = 'http://uri.etsi.org/01903#SignedProperties';
const SIGNATURE_ID = 'KipusPaySign';
const SIGNED_PROPS_ID = 'KipusPaySignedProperties';
const EMPTY_EXT =
  '<ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent></ext:ExtensionContent></ext:UBLExtension></ext:UBLExtensions>';

export interface CpeSignMaterial {
  readonly privateKeyPkcs8Der: Uint8Array;
  readonly certDer: Uint8Array;
  /** ISO-8601; inyectable para tests deterministas. */
  readonly signingTime?: string;
}

const RSA = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } as const;

function asBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

export function derToBase64(der: Uint8Array): string {
  let binary = '';
  for (const byte of der) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToDer(value: string): Uint8Array {
  try {
    return Uint8Array.from(atob(value), (ch) => ch.charCodeAt(0));
  } catch {
    throw new Error('INVALID_BASE64');
  }
}

/** Extrae el primer bloque PEM del tipo pedido (CERTIFICATE o PRIVATE KEY PKCS#8). */
export function pemBlockToDer(pem: string, label: 'CERTIFICATE' | 'PRIVATE KEY'): Uint8Array {
  const begin = `-----BEGIN ${label}-----`;
  const end = `-----END ${label}-----`;
  const start = pem.indexOf(begin);
  const stop = pem.indexOf(end, start);
  if (start < 0 || stop < 0) throw new Error(`PEM_BLOCK_MISSING:${label}`);
  const b64 = pem.slice(start + begin.length, stop).replace(/\s+/g, '');
  return base64ToDer(b64);
}

export async function sha256Bytes(data: Uint8Array | string): Promise<Uint8Array> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return new Uint8Array(await crypto.subtle.digest('SHA-256', asBuffer(bytes)));
}

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const digest = await sha256Bytes(data);
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Base64(data: Uint8Array | string): Promise<string> {
  return derToBase64(await sha256Bytes(data));
}

export async function fingerprintSha256Hex(certDer: Uint8Array): Promise<string> {
  return sha256Hex(certDer);
}

/**
 * Octetos del Reference URI="" tras enveloped-signature: C14N 1.0
 * (sin declaración XML; xmlns ordenados). SignedInfo / SignedProperties se
 * firman con C14N inclusive in-context (xmlns UBL heredados). SUNAT 2335
 * si el digest o el SignatureValue usan UTF-8 crudo o C14N de documento suelto.
 */
export function envelopedDigestOctets(xml: string): string {
  return canonicalC14n10(xml);
}

function rootTagCloseIndex(xml: string): number {
  let start = 0;
  if (xml.startsWith('<?xml')) {
    const declEnd = xml.indexOf('?>');
    if (declEnd < 0) throw new Error('MALFORMED_XML: missing root');
    start = declEnd + 2;
  }
  const close = xml.indexOf('>', start);
  if (close < 0) throw new Error('MALFORMED_XML: missing root');
  return close;
}

function addSignatureNamespaces(xml: string): string {
  const close = rootTagCloseIndex(xml);
  const open = xml.slice(0, close);
  if (open.includes('xmlns:ext=')) return xml;
  return `${open} xmlns:ext="${EXT_NS}"${xml.slice(close)}`;
}

function insertFirstChild(xml: string, child: string): string {
  const close = rootTagCloseIndex(xml);
  if (xml[close - 1] === '/') throw new Error('MALFORMED_XML: self-closing root');
  return `${xml.slice(0, close + 1)}${child}${xml.slice(close + 1)}`;
}

function buildSignedProperties(
  certDigestB64: string,
  signingTime: string,
  issuer: X509IssuerSerial,
): string {
  return (
    `<xades:SignedProperties xmlns:xades="${XADES_NS}" xmlns:ds="${DS_NS}" Id="${SIGNED_PROPS_ID}">` +
    '<xades:SignedSignatureProperties>' +
    `<xades:SigningTime>${signingTime}</xades:SigningTime>` +
    '<xades:SigningCertificate><xades:Cert><xades:CertDigest>' +
    `<ds:DigestMethod Algorithm="${DIGEST_ALG}"/>` +
    `<ds:DigestValue>${certDigestB64}</ds:DigestValue>` +
    '</xades:CertDigest>' +
    '<xades:IssuerSerial>' +
    `<ds:X509IssuerName>${escapeXml(issuer.issuerName)}</ds:X509IssuerName>` +
    `<ds:X509SerialNumber>${issuer.serialDecimal}</ds:X509SerialNumber>` +
    '</xades:IssuerSerial></xades:Cert></xades:SigningCertificate>' +
    '</xades:SignedSignatureProperties></xades:SignedProperties>'
  );
}

/** xmlns in-scope en ds:SignedInfo / xades:SignedProperties una vez insertados en el UBL. */
function xmlDsigAncestorNamespaces(xml: string): ReadonlyArray<readonly [string, string]> {
  const byPrefix = new Map<string, string>(rootNamespaceDeclarations(xml));
  if (!byPrefix.has('ds')) byPrefix.set('ds', DS_NS);
  if (!byPrefix.has('xades')) byPrefix.set('xades', XADES_NS);
  return [...byPrefix.entries()];
}

function buildSignedInfo(docDigestB64: string, propsDigestB64: string): string {
  return (
    `<ds:SignedInfo xmlns:ds="${DS_NS}">` +
    `<ds:CanonicalizationMethod Algorithm="${C14N_ALG}"/>` +
    `<ds:SignatureMethod Algorithm="${SIG_ALG}"/>` +
    `<ds:Reference URI="">` +
    '<ds:Transforms>' +
    `<ds:Transform Algorithm="${ENV_TRANSFORM}"/>` +
    `<ds:Transform Algorithm="${C14N_ALG}"/>` +
    '</ds:Transforms>' +
    `<ds:DigestMethod Algorithm="${DIGEST_ALG}"/>` +
    `<ds:DigestValue>${docDigestB64}</ds:DigestValue>` +
    '</ds:Reference>' +
    `<ds:Reference Type="${SIGNED_PROPS_TYPE}" URI="#${SIGNED_PROPS_ID}">` +
    '<ds:Transforms>' +
    `<ds:Transform Algorithm="${C14N_ALG}"/>` +
    '</ds:Transforms>' +
    `<ds:DigestMethod Algorithm="${DIGEST_ALG}"/>` +
    `<ds:DigestValue>${propsDigestB64}</ds:DigestValue>` +
    '</ds:Reference>' +
    '</ds:SignedInfo>'
  );
}

function buildSignature(
  signedInfo: string,
  signatureValueB64: string,
  certB64: string,
  signedProperties: string,
): string {
  return (
    `<ds:Signature xmlns:ds="${DS_NS}" xmlns:xades="${XADES_NS}" Id="${SIGNATURE_ID}">` +
    signedInfo +
    `<ds:SignatureValue>${signatureValueB64}</ds:SignatureValue>` +
    '<ds:KeyInfo><ds:X509Data>' +
    `<ds:X509Certificate>${certB64}</ds:X509Certificate>` +
    '</ds:X509Data></ds:KeyInfo>' +
    `<ds:Object><xades:QualifyingProperties xmlns:xades="${XADES_NS}" Target="#${SIGNATURE_ID}">` +
    signedProperties +
    '</xades:QualifyingProperties></ds:Object>' +
    '</ds:Signature>'
  );
}

async function importPrivateKey(pkcs8: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('pkcs8', asBuffer(pkcs8), RSA, false, ['sign']);
}

async function rsaSign(pkcs8: Uint8Array, canonicalSignedInfo: string): Promise<string> {
  const key = await importPrivateKey(pkcs8);
  const sig = await crypto.subtle.sign(RSA, key, new TextEncoder().encode(canonicalSignedInfo));
  return derToBase64(new Uint8Array(sig));
}

/**
 * Inserta `ds:Signature` XAdES-BES en `ext:UBLExtensions` (primer hijo del root).
 * Digest enveloped: el documento con UBLExtensions vacías, sin `ds:Signature`.
 */
export async function signCpeXml(xml: string, material: CpeSignMaterial): Promise<string> {
  assertWellFormedXml(xml);
  if (xml.includes('<ds:Signature')) throw new Error('ALREADY_SIGNED');
  const named = addSignatureNamespaces(xml);
  const withExt = named.includes('<ext:UBLExtensions') ? named : insertFirstChild(named, EMPTY_EXT);
  const docDigest = await sha256Base64(envelopedDigestOctets(withExt));
  const certDigest = await sha256Base64(material.certDer);
  const signingTime = material.signingTime ?? new Date().toISOString();
  const issuerSerial = parseX509IssuerSerial(material.certDer);
  const signedProperties = buildSignedProperties(certDigest, signingTime, issuerSerial);
  const ancestorNs = xmlDsigAncestorNamespaces(withExt);
  const propsDigest = await sha256Base64(canonicalC14n10Subtree(signedProperties, ancestorNs));
  const signedInfo = buildSignedInfo(docDigest, propsDigest);
  const signatureValue = await rsaSign(
    material.privateKeyPkcs8Der,
    canonicalC14n10Subtree(signedInfo, ancestorNs),
  );
  const signature = buildSignature(
    signedInfo,
    signatureValue,
    derToBase64(material.certDer),
    signedProperties,
  );
  const signed = withExt.replace(
    '<ext:ExtensionContent></ext:ExtensionContent>',
    `<ext:ExtensionContent>${signature}</ext:ExtensionContent>`,
  );
  assertSignedCpeXml(signed);
  return signed;
}

export function assertSignedCpeXml(xml: string): void {
  assertWellFormedXml(xml);
  if (!xml.includes('<ds:Signature')) throw new Error('MISSING_XADES_SIGNATURE');
  if (!xml.includes('<ds:SignatureValue>')) throw new Error('MISSING_SIGNATURE_VALUE');
  if (!xml.includes('<ds:X509Certificate>')) throw new Error('MISSING_X509');
  if (!xml.includes('<xades:QualifyingProperties')) throw new Error('MISSING_XADES_PROPS');
  if (!xml.includes('<ds:DigestValue>')) throw new Error('MISSING_DIGEST');
}

function extractTag(xml: string, open: string, close: string): string {
  const start = xml.indexOf(open);
  const end = xml.indexOf(close, start);
  if (start < 0 || end < 0) throw new Error(`MISSING_TAG:${open}`);
  return xml.slice(start, end + close.length);
}

function extractInner(xml: string, open: string, close: string): string {
  const start = xml.indexOf(open);
  const end = xml.indexOf(close, start);
  if (start < 0 || end < 0) throw new Error(`MISSING_TAG:${open}`);
  return xml.slice(start + open.length, end);
}

/** Quita `ds:Signature` (transform enveloped) dejando ExtensionContent vacío. */
export function stripEnvelopedSignature(xml: string): string {
  return xml.replace(/<ds:Signature\b[^>]*>[\s\S]*?<\/ds:Signature>/, '');
}

export async function verifyCpeXmlSignature(xml: string, publicKey: CryptoKey): Promise<boolean> {
  assertSignedCpeXml(xml);
  const ancestorNs = xmlDsigAncestorNamespaces(xml);
  const signedInfo = extractTag(xml, '<ds:SignedInfo', '</ds:SignedInfo>');
  const signatureValue = extractInner(xml, '<ds:SignatureValue>', '</ds:SignatureValue>');
  const ok = await crypto.subtle.verify(
    RSA,
    publicKey,
    asBuffer(base64ToDer(signatureValue)),
    new TextEncoder().encode(canonicalC14n10Subtree(signedInfo, ancestorNs)),
  );
  if (!ok) return false;
  const unsigned = stripEnvelopedSignature(xml);
  const expectedDoc = await sha256Base64(envelopedDigestOctets(unsigned));
  const docDigest = extractInner(
    extractTag(xml, '<ds:Reference URI="">', '</ds:Reference>'),
    '<ds:DigestValue>',
    '</ds:DigestValue>',
  );
  if (expectedDoc !== docDigest) return false;
  const signedProperties = extractTag(xml, '<xades:SignedProperties', '</xades:SignedProperties>');
  const expectedProps = await sha256Base64(canonicalC14n10Subtree(signedProperties, ancestorNs));
  const propsDigest = extractInner(
    extractTag(xml, `URI="#${SIGNED_PROPS_ID}"`, '</ds:Reference>'),
    '<ds:DigestValue>',
    '</ds:DigestValue>',
  );
  return expectedProps === propsDigest;
}
