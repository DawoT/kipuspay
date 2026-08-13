import type { ScaleProtocol, ScaleReading } from '../scale/types.js';

export type { ScaleProtocol, ScaleReading } from '../scale/types.js';

function decodeSerialFrame(frameInput: unknown): { weightMicrounits: number; stable: boolean } {
  const frame = frameInput as { frame?: unknown; checksumValid?: unknown };
  const match = typeof frame.frame === 'string' ? /ST,GS,\+(\d+) g/.exec(frame.frame) : null;
  if (!match || frame.checksumValid !== true) throw new Error('SCALE_FRAME_INVALID');
  return { weightMicrounits: Number(match[1]) * 1_000, stable: true };
}

function decodeHidOrUsbFrame(
  protocol: ScaleProtocol,
  frameInput: unknown,
): { weightMicrounits: number; stable: boolean } {
  const frame = frameInput as {
    reportId?: unknown;
    endpoint?: unknown;
    magnitude?: unknown;
    unit?: unknown;
    stable?: unknown;
  };
  if (typeof frame.magnitude !== 'number' || !Number.isSafeInteger(frame.magnitude)) {
    throw new Error('SCALE_FRAME_INVALID');
  }
  if (protocol === 'WEBHID' && !Number.isSafeInteger(frame.reportId)) {
    throw new Error('SCALE_FRAME_INVALID');
  }
  if (protocol === 'WEBUSB' && !Number.isSafeInteger(frame.endpoint)) {
    throw new Error('SCALE_FRAME_INVALID');
  }
  const weightMicrounits =
    frame.unit === 'GRAM'
      ? frame.magnitude * 1_000
      : frame.unit === 'MILLIGRAM'
        ? frame.magnitude
        : 0;
  return { weightMicrounits, stable: frame.stable === true };
}

export function decodeScaleFrame(input: {
  readonly protocol: ScaleProtocol;
  readonly deviceId: string;
  readonly sequence: number;
  readonly observedAtEpochMs: number;
  readonly frame: unknown;
}): ScaleReading {
  const { weightMicrounits, stable } =
    input.protocol === 'WEB_SERIAL'
      ? decodeSerialFrame(input.frame)
      : decodeHidOrUsbFrame(input.protocol, input.frame);

  if (!stable || !Number.isSafeInteger(weightMicrounits) || weightMicrounits <= 0) {
    throw new Error('SCALE_FRAME_INVALID');
  }
  return {
    protocol: input.protocol,
    deviceId: input.deviceId,
    sequence: input.sequence,
    observedAtEpochMs: input.observedAtEpochMs,
    stable,
    weightMicrounits,
  };
}

export function evaluateScaleHeartbeat(input: {
  readonly connected: boolean;
  readonly reading: ScaleReading | null;
  readonly nowEpochMs: number;
}):
  | { readonly status: 'READY'; readonly reading: ScaleReading }
  | {
      readonly status: 'MANUAL_REQUIRED';
      readonly reason: 'DEVICE_DISCONNECTED' | 'HEARTBEAT_STALE';
      readonly reading: null;
    } {
  if (!input.connected || !input.reading) {
    return { status: 'MANUAL_REQUIRED', reason: 'DEVICE_DISCONNECTED', reading: null };
  }
  if (input.nowEpochMs - input.reading.observedAtEpochMs >= 2_000) {
    return { status: 'MANUAL_REQUIRED', reason: 'HEARTBEAT_STALE', reading: null };
  }
  return { status: 'READY', reading: input.reading };
}

export function createWeightedCartLine(input: {
  readonly productId: string;
  readonly productName: string;
  readonly weightMicrounits: number;
  readonly idFactory?: () => string;
}) {
  const measurementId = (input.idFactory ?? crypto.randomUUID)();
  return {
    productId: input.productId,
    productName: input.productName,
    weightMicrounits: input.weightMicrounits,
    measurementId,
  };
}

export function buildWeightSyncDto(input: {
  readonly measurementId: string;
  readonly saleItemId: string;
  readonly productId: string;
  readonly weightMicrounits: number;
  readonly measurementSource: 'DEVICE' | 'MANUAL';
  readonly reading?: ScaleReading | null;
  readonly authorizationToken?: string;
  readonly rawFrame?: unknown;
  readonly projectedSubtotalCents?: number;
}) {
  return {
    measurementId: input.measurementId,
    saleItemId: input.saleItemId,
    productId: input.productId,
    weightMicrounits: input.weightMicrounits,
    measurementSource: input.measurementSource,
    ...(input.reading
      ? {
          scaleProtocol: input.reading.protocol,
          scaleDeviceId: input.reading.deviceId,
          heartbeatSequence: input.reading.sequence,
          observedAt: new Date(input.reading.observedAtEpochMs).toISOString(),
        }
      : {}),
    ...(input.authorizationToken ? { authorizationToken: input.authorizationToken } : {}),
  };
}
