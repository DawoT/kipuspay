import { describe, expect, it } from 'vitest';
import {
  childrenOf,
  decodeInteger,
  decodeOid,
  derToPem,
  readBer,
  unwrapOctet,
  unwrapSequence,
} from './pkcs12-ber.js';

describe('pkcs12-ber', () => {
  it('lee SEQUENCE definite y OID 1.2.840.113549.1.7.1', () => {
    const der = Uint8Array.of(0x30, 0x03, 0x02, 0x01, 0x03);
    const { node, next } = readBer(der, 0);
    expect(next).toBe(5);
    expect(unwrapSequence(node)[0]!.tag).toBe(0x02);
    expect(decodeInteger(unwrapSequence(node)[0]!.bytes)).toBe(3);
    expect(decodeOid(Uint8Array.of(0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x01))).toBe(
      '1.2.840.113549.1.7.1',
    );
  });

  it('aplana OCTET STRING construido (chunks Java PKCS#12)', () => {
    const constructed = Uint8Array.of(0x24, 0x08, 0x04, 0x02, 0xab, 0xcd, 0x04, 0x02, 0xef, 0x01);
    const { node } = readBer(constructed, 0);
    expect([...node.bytes]).toEqual([0xab, 0xcd, 0xef, 0x01]);
  });

  it('lee longitud indefinida y rechaza overflow', () => {
    const indef = Uint8Array.of(0x30, 0x80, 0x04, 0x01, 0xaa, 0x00, 0x00);
    const { node } = readBer(indef, 0);
    expect(unwrapOctet(childrenOf(node.bytes)[0]!)).toEqual(Uint8Array.of(0xaa));
    expect(() => readBer(Uint8Array.of(0x04, 0x05, 0x00), 0)).toThrow(/PKCS12_BER/);
    expect(() => unwrapSequence({ tag: 0x04, bytes: new Uint8Array() })).toThrow(/sequence/);
  });

  it('cubre longitudes largas, OID incompleto y octet inválido', () => {
    const payload = new Uint8Array(200).fill(0x11);
    const seq = new Uint8Array(3 + payload.length);
    seq[0] = 0x30;
    seq[1] = 0x81;
    seq[2] = payload.length;
    seq.set(payload, 3);
    const constructed = new Uint8Array(3 + seq.length);
    constructed[0] = 0x24;
    constructed[1] = 0x81;
    constructed[2] = seq.length;
    constructed.set(seq, 3);
    const { node } = readBer(constructed, 0);
    expect(node.bytes.byteLength).toBeGreaterThan(200);

    const big = new Uint8Array(260).fill(0x22);
    const seq2 = new Uint8Array(4 + big.length);
    seq2[0] = 0x30;
    seq2[1] = 0x82;
    seq2[2] = 0x01;
    seq2[3] = 0x04;
    seq2.set(big, 4);
    const c2 = new Uint8Array(4 + seq2.length);
    c2[0] = 0x24;
    c2[1] = 0x82;
    c2[2] = (seq2.length >> 8) & 0xff;
    c2[3] = seq2.length & 0xff;
    c2.set(seq2, 4);
    expect(readBer(c2, 0).node.bytes.byteLength).toBeGreaterThan(260);

    expect(() => unwrapOctet({ tag: 0x30, bytes: new Uint8Array() })).toThrow(/octet/);
    expect(() => decodeOid(new Uint8Array())).toThrow(/oid/);
    expect(() => decodeOid(Uint8Array.of(0x2a, 0x80))).toThrow(/oid/);
    expect(() => decodeInteger(new Uint8Array())).toThrow(/int/);
    expect(() => decodeInteger(new Uint8Array(7))).toThrow(/int/);
    expect(() => readBer(Uint8Array.of(0x04, 0x80), 0)).toThrow(/indefinite-primitive/);
    expect(() => readBer(new Uint8Array(), 0)).toThrow(/eof/);
    expect(() => readBer(Uint8Array.of(0x30), 0)).toThrow(/len/);
    expect(() => readBer(Uint8Array.of(0x30, 0x80, 0x04, 0x01, 0xaa), 0)).toThrow(/eoc/);
    const indefSeq = Uint8Array.of(0x30, 0x80, 0x02, 0x01, 0x01, 0x00, 0x00);
    expect(readBer(indefSeq, 0).node.bytes.byteLength).toBeGreaterThan(0);
    const constructedEoc = Uint8Array.of(0x24, 0x05, 0x04, 0x01, 0xaa, 0x00, 0x00);
    expect([...readBer(constructedEoc, 0).node.bytes]).toEqual([0xaa]);
    expect(derToPem(new Uint8Array(70).fill(0x41), 'TEST')).toContain('BEGIN TEST');
  });

  it('encodeLength 0x83 para OCTET construido >64KiB', () => {
    const payload = new Uint8Array(0x10000).fill(0x33);
    const seq = new Uint8Array(5 + payload.length);
    seq[0] = 0x30;
    seq[1] = 0x83;
    seq[2] = 0x01;
    seq[3] = 0x00;
    seq[4] = 0x00;
    seq.set(payload, 5);
    const c = new Uint8Array(5 + seq.length);
    c[0] = 0x24;
    c[1] = 0x83;
    c[2] = (seq.length >> 16) & 0xff;
    c[3] = (seq.length >> 8) & 0xff;
    c[4] = seq.length & 0xff;
    c.set(seq, 5);
    expect(readBer(c, 0).node.bytes.byteLength).toBeGreaterThan(0x10000);
  });
});
