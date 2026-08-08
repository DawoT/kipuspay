import {
  assertBoundedFrame,
  reading,
  type ReleasableScaleTransport,
  type ScaleReading,
} from './types.js';

interface WebSerialProfile {
  readonly deviceId: string;
  readonly baudRate: 9600 | 19_200 | 38_400 | 115_200;
  readonly maxFrameBytes: number;
}

function checksum(payload: string): string {
  let value = 0;
  for (const byte of new TextEncoder().encode(payload)) value ^= byte;
  return value.toString(16).padStart(2, '0').toUpperCase();
}

export function serialFixture(grams: number, stable: boolean): Uint8Array {
  const payload = `${stable ? 'ST' : 'US'},GS,+${String(grams).padStart(6, '0')} g`;
  return new TextEncoder().encode(`${payload}*${checksum(payload)}\r\n`);
}

export function createWebSerialScale(input: {
  readonly profile: WebSerialProfile;
  readonly transport: ReleasableScaleTransport;
}) {
  let connected = true;
  let sequence = 0;
  return {
    parseChunk(frame: Uint8Array, observedAtEpochMs: number): ScaleReading {
      if (!connected) throw new Error('SCALE_RECONNECT_REQUIRED');
      assertBoundedFrame(frame, input.profile.maxFrameBytes);
      const value = new TextDecoder('ascii', { fatal: true }).decode(frame);
      if (!value.endsWith('\r\n')) throw new Error('SCALE_FRAME_INCOMPLETE');
      const match = /^(ST|US),GS,\+(\d{6}) g\*([0-9A-F]{2})\r\n$/.exec(value);
      if (!match) throw new Error('SCALE_FRAME_INVALID');
      const payload = value.slice(0, value.indexOf('*'));
      if (checksum(payload) !== match[3]) throw new Error('SCALE_CHECKSUM_INVALID');
      if (match[1] !== 'ST') throw new Error('SCALE_SIGNAL_UNSTABLE');
      sequence += 1;
      return reading(
        input.profile.deviceId,
        'WEB_SERIAL',
        sequence,
        Number(match[2]) * 1_000,
        observedAtEpochMs,
      );
    },
    async disconnect(): Promise<void> {
      connected = false;
      await input.transport.close();
    },
  };
}
