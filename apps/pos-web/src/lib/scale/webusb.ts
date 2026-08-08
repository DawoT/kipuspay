import {
  assertBoundedFrame,
  reading,
  type ReleasableScaleTransport,
  type ScaleReading,
} from './types.js';

interface WebUsbProfile {
  readonly deviceId: string;
  readonly vendorId: number;
  readonly productId: number;
  readonly endpoint: number;
  readonly maxFrameBytes: number;
}

export function createWebUsbScale(input: {
  readonly profile: WebUsbProfile;
  readonly transport: ReleasableScaleTransport & {
    readonly vendorId: number;
    readonly productId: number;
  };
}) {
  if (
    input.transport.vendorId !== input.profile.vendorId ||
    input.transport.productId !== input.profile.productId
  ) {
    throw new Error('SCALE_DEVICE_NOT_ALLOWED');
  }
  let connected = true;
  let sequence = 0;
  return {
    parseTransfer(endpoint: number, frame: Uint8Array, observedAtEpochMs: number): ScaleReading {
      if (!connected) throw new Error('SCALE_RECONNECT_REQUIRED');
      if (endpoint !== input.profile.endpoint) throw new Error('SCALE_ENDPOINT_NOT_ALLOWED');
      assertBoundedFrame(frame, input.profile.maxFrameBytes);
      if (frame.byteLength !== 8) throw new Error('SCALE_FRAME_INVALID');
      if ((frame[0] & 1) !== 1) throw new Error('SCALE_SIGNAL_UNSTABLE');
      const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
      const weightMicrounits = view.getUint32(4, false);
      sequence += 1;
      return reading(
        input.profile.deviceId,
        'WEBUSB',
        sequence,
        weightMicrounits,
        observedAtEpochMs,
      );
    },
    async disconnect(): Promise<void> {
      connected = false;
      await input.transport.close();
    },
  };
}
