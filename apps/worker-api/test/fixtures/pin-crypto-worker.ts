import { hashPinArgon2id, verifyPinHash } from '../../../../packages/domain-ops/src/pin-crypto.js';

export default {
  async fetch(): Promise<Response> {
    const hash = await hashPinArgon2id('4826');
    const validPin = await verifyPinHash('4826', hash);
    const wrongPin = await verifyPinHash('0000', hash);
    return Response.json({
      phcFormat: hash.startsWith('$argon2id$v=19$'),
      parameters: hash.includes('m=65536,t=3,p=1'),
      validPin,
      wrongPin,
    });
  },
};
