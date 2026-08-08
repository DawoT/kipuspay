export type ScaleProtocol = 'WEBHID' | 'WEB_SERIAL' | 'WEBUSB';

export interface ScaleReading {
  readonly deviceId: string;
  readonly protocol: ScaleProtocol;
  readonly sequence: number;
  readonly weightMicrounits: number;
  readonly stable: boolean;
  readonly observedAtEpochMs: number;
}

export interface ReleasableScaleTransport {
  close(): Promise<void>;
}

export function assertBoundedFrame(frame: Uint8Array, maxFrameBytes: number): void {
  if (frame.byteLength === 0 || frame.byteLength > maxFrameBytes) {
    throw new Error('SCALE_FRAME_SIZE_INVALID');
  }
}

export function reading(
  deviceId: string,
  protocol: ScaleProtocol,
  sequence: number,
  weightMicrounits: number,
  observedAtEpochMs: number,
): ScaleReading {
  if (!Number.isSafeInteger(weightMicrounits) || weightMicrounits <= 0) {
    throw new Error('SCALE_WEIGHT_INVALID');
  }
  return {
    deviceId,
    protocol,
    sequence,
    weightMicrounits,
    stable: true,
    observedAtEpochMs,
  };
}
