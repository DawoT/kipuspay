import { describe, expect, it } from 'vitest';
import {
  canonicalC14n10,
  canonicalC14n10Subtree,
  mergeAncestorNamespaces,
  rootNamespaceDeclarations,
} from './xml-c14n.js';

describe('canonicalC14n10', () => {
  it('omite la declaración XML y comentarios', () => {
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<!-- x -->\n<doc>Hello</doc>';
    expect(canonicalC14n10(xml)).toBe('<doc>Hello</doc>');
  });

  it('reescribe self-closing como start-end y ordena xmlns', () => {
    expect(canonicalC14n10('<e xmlns:b="http://b" xmlns:a="http://a"/>')).toBe(
      '<e xmlns:a="http://a" xmlns:b="http://b"></e>',
    );
  });

  it('no redeclarar xmlns heredado en el hijo', () => {
    expect(canonicalC14n10('<r xmlns:a="http://a"><a:x></a:x></r>')).toBe(
      '<r xmlns:a="http://a"><a:x></a:x></r>',
    );
  });

  it('conserva whitespace entre elementos y escapa texto', () => {
    expect(canonicalC14n10('<d>\n  <x>a&amp;b&lt;c</x>\n</d>')).toBe(
      '<d>\n  <x>a&amp;b&lt;c</x>\n</d>',
    );
  });

  it('ordena atributos no-ns por URI luego local name', () => {
    expect(
      canonicalC14n10('<e xmlns:b="http://b" xmlns:a="http://a" b:z="2" a:y="1" n="0"/>'),
    ).toBe('<e xmlns:a="http://a" xmlns:b="http://b" n="0" a:y="1" b:z="2"></e>');
  });

  it('escapa tab/LF/CR en atributos y CR en texto; CDATA a texto; entidades numéricas', () => {
    expect(canonicalC14n10('<e a="&#9;&#10;&#13;">\r<![CDATA[x]]></e>')).toBe(
      '<e a="&#x9;&#xA;&#xD;">&#xD;x</e>',
    );
  });

  it('undeclara xmlns default vacío y rechaza XML roto', () => {
    expect(canonicalC14n10('<a xmlns="http://n"><b xmlns=""></b></a>')).toBe(
      '<a xmlns="http://n"><b xmlns=""></b></a>',
    );
    expect(() => canonicalC14n10('no-xml')).toThrow(/MALFORMED_XML/);
    expect(() => canonicalC14n10('<a></b>')).toThrow(/MALFORMED_XML/);
    expect(() => canonicalC14n10('<a &="1"></a>')).toThrow(/MALFORMED_XML/);
    expect(() => canonicalC14n10('<a x=1></a>')).toThrow(/MALFORMED_XML/);
    expect(() => canonicalC14n10('<a x="&foo;"></a>')).toThrow(/MALFORMED_XML/);
    expect(() => canonicalC14n10('<a x="unterminated>')).toThrow(/MALFORMED_XML/);
    expect(() => canonicalC14n10('<?xml version="1.0"?><a></a><b></b>')).toThrow(/MALFORMED_XML/);
    expect(() => canonicalC14n10('<a></a')).toThrow(/MALFORMED_XML/);
    expect(canonicalC14n10(`<e a='apos'>x</e>`)).toBe('<e a="apos">x</e>');
    expect(() => canonicalC14n10('<!--')).toThrow(/MALFORMED_XML/);
    expect(() => canonicalC14n10('<?pi')).toThrow(/MALFORMED_XML/);
    expect(() => canonicalC14n10('<a><![CDATA[x</a>')).toThrow(/MALFORMED_XML/);
    expect(() => canonicalC14n10('<a/x>')).toThrow(/MALFORMED_XML/);
    expect(() => canonicalC14n10('<></>')).toThrow(/MALFORMED_XML/);
    expect(() => canonicalC14n10('<a>&</a>')).toThrow(/MALFORMED_XML/);
    expect(() => canonicalC14n10('<a>&amp</a>')).toThrow(/MALFORMED_XML/);
    expect(canonicalC14n10('<a>x&quot;y&apos;z&#65;&#x42;</a>')).toBe('<a>x"y\'zAB</a>');
    expect(canonicalC14n10('<a>x&gt;y</a>')).toBe('<a>x&gt;y</a>');
    expect(canonicalC14n10('<a><!--c-->z</a>')).toBe('<a>z</a>');
    expect(() => canonicalC14n10('<a></a>trailing')).toThrow(/MALFORMED_XML/);
    expect(canonicalC14n10('  <?xml version="1.0"?>  <z></z>  ')).toBe('<z></z>');
    expect(canonicalC14n10('<a xmlns:foo="http://f" foo:bar="1"></a>')).toBe(
      '<a xmlns:foo="http://f" foo:bar="1"></a>',
    );
    expect(canonicalC14n10('<e xml:lang="es"></e>')).toBe('<e xml:lang="es"></e>');
    expect(canonicalC14n10('<e xml:id="a"></e>')).toBe('<e xml:id="a"></e>');
    expect(rootNamespaceDeclarations('<r xmlns="n" xmlns:a="http://a"></r>')).toEqual([
      ['', 'n'],
      ['a', 'http://a'],
    ]);
    expect(canonicalC14n10('<a></a><?pi?>')).toBe('<a></a>');
    expect(() => canonicalC14n10('<a></a><![CDATA[x]]>')).toThrow(/MALFORMED_XML/);
    expect(() => canonicalC14n10('')).toThrow(/MALFORMED_XML/);
    expect(() => canonicalC14n10('>no')).toThrow(/MALFORMED_XML/);
    expect(() => canonicalC14n10('</a>')).toThrow(/MALFORMED_XML/);
    expect(() => canonicalC14n10('<a>')).toThrow(/MALFORMED_XML/);
    expect(() => canonicalC14n10('<a>text')).toThrow(/MALFORMED_XML/);
    expect(() => canonicalC14n10('<a/')).toThrow(/MALFORMED_XML/);
    expect(canonicalC14n10('<a xmlns=""></a>')).toBe('<a></a>');
    expect(canonicalC14n10('<e foo:bar="1"></e>')).toBe('<e foo:bar="1"></e>');
    expect(canonicalC14n10('<e a = "1"></e>')).toBe('<e a="1"></e>');
    expect(() => canonicalC14n10('<e a></e>')).toThrow(/MALFORMED_XML/);
    expect(canonicalC14n10('<e z="2" a="1"></e>')).toBe('<e a="1" z="2"></e>');
    expect(canonicalC14n10('<a>x>y</a>')).toBe('<a>x&gt;y</a>');
    expect(canonicalC14n10('<e a="&apos;x"></e>')).toBe('<e a="\'x"></e>');
    expect(canonicalC14n10('<a><?pi x?></a>')).toBe('<a></a>');
    expect(canonicalC14n10('<a></a><?pi?><!--c-->')).toBe('<a></a>');
    expect(canonicalC14n10('<e a="x&gt;y"></e>')).toBe('<e a="x>y"></e>');
  });
});

describe('canonicalC14n10Subtree', () => {
  it('emite xmlns heredados en el ápice (inclusive in-context)', () => {
    const si =
      '<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">' +
      '<ds:CanonicalizationMethod Algorithm="http://example"></ds:CanonicalizationMethod>' +
      '</ds:SignedInfo>';
    const ancestorNs = [
      ['', 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2'],
      ['cac', 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2'],
      ['ds', 'http://www.w3.org/2000/09/xmldsig#'],
      ['xades', 'http://uri.etsi.org/01903/v1.3.2#'],
    ] as const;
    const merged = mergeAncestorNamespaces(si, ancestorNs);
    expect(merged).toContain('xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"');
    expect(merged).toContain('xmlns:ds="http://www.w3.org/2000/09/xmldsig#"');
    const c14n = canonicalC14n10Subtree(si, ancestorNs);
    expect(
      c14n.startsWith(
        '<ds:SignedInfo xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"',
      ),
    ).toBe(true);
    expect(c14n).toContain(
      'xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"',
    );
    expect(c14n).toContain('xmlns:ds="http://www.w3.org/2000/09/xmldsig#"');
    expect(c14n).toContain('xmlns:xades="http://uri.etsi.org/01903/v1.3.2#"');
    expect(canonicalC14n10(si).includes('Invoice-2')).toBe(false);
    expect(
      canonicalC14n10Subtree(si, [
        ['xml', 'http://www.w3.org/XML/1998/namespace'],
        ['ds', 'http://www.w3.org/2000/09/xmldsig#'],
      ]),
    ).toContain('ds:SignedInfo');
  });

  it('lee xmlns del raíz y no duplica prefijos ya declarados', () => {
    const xml =
      '<Invoice xmlns="urn:inv" xmlns:cbc="urn:cbc" xmlns:ext="urn:ext"><cbc:ID>1</cbc:ID></Invoice>';
    const ns = rootNamespaceDeclarations(xml);
    expect(ns).toContainEqual(['', 'urn:inv']);
    expect(ns).toContainEqual(['cbc', 'urn:cbc']);
    expect(mergeAncestorNamespaces('<e xmlns:cbc="urn:cbc"></e>', ns)).not.toMatch(
      /xmlns:cbc="urn:cbc".*xmlns:cbc=/,
    );
    expect(() => mergeAncestorNamespaces('no-root', [])).toThrow(/MALFORMED_XML/);
    expect(() => mergeAncestorNamespaces('<?xml version="1.0"?', [])).toThrow(/MALFORMED_XML/);
    expect(
      mergeAncestorNamespaces('<?xml version="1.0"?><e></e>', [
        ['xml', 'http://www.w3.org/XML/1998/namespace'],
      ]),
    ).toBe('<?xml version="1.0"?><e></e>');
  });
});
