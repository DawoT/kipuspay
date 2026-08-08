import {
  assertBoundedFrame,
  reading,
  type ReleasableScaleTransport,
  type ScaleReading,
} from './types.js';

interface WebHidProfile {
  readonly deviceId: string;
  readonly vendorId: number;
  readonly productId: number;
  readonly reportId: number;
  readonly maxFrameBytes?: number;
}

export function createWebHidScale(input: {
  readonly profile: WebHidProfile;
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
  let sequence = 0;
  let connected = true;
  return {
    parseReport(reportId: number, frame: Uint8Array, observedAtEpochMs: number): ScaleReading {
      if (!connected) throw new Error('SCALE_RECONNECT_REQUIRED');
      if (input.profile.reportId !== 0 && reportId !== input.profile.reportId) {
        throw new Error('SCALE_REPORT_NOT_ALLOWED');
      }
      assertBoundedFrame(frame, input.profile.maxFrameBytes ?? 32);
      if (frame.byteLength < 5) throw new Error('SCALE_FRAME_INVALID');
      if ((frame[0] & 1) !== 1) throw new Error('SCALE_SIGNAL_UNSTABLE');
      const magnitudeGrams = (frame[3] << 8) | frame[4];
      sequence += 1;
      return reading(
        input.profile.deviceId,
        'WEBHID',
        sequence,
        magnitudeGrams * 1_000,
        observedAtEpochMs,
      );
    },
    async disconnect(): Promise<void> {
      connected = false;
      await input.transport.close();
    },
  };
}
