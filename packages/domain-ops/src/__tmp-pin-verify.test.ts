import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { verifyPinHash } from './pin-crypto.js';

describe('tmp pin roundtrip', () => {
  it('verifica el PIN contra el hash almacenado en D1', async () => {
    const stored = JSON.parse(readFileSync('/tmp/opencode/pinrow.json', 'utf8'))[0].results[0].pin_hash;
    const result = await verifyPinHash('412873', stored);
    console.log('RESULT=' + JSON.stringify(result));
    expect(result.ok).toBe(true);
  });
});
