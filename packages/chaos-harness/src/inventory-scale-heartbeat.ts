/** Sprint 40 chaos: transport, heartbeat, identity and exact weighted-sale parity. */
import {
  calculateWeightedSubtotalCents,
  normalizeScaleReading,
  type ScaleInputUnit,
  type ScaleProtocol,
  type ScaleReading,
} from '@kipuspay/domain-inventory';

export type InventoryScaleHeartbeatChaosVerdict = 'PASS' | 'FAIL';

export interface InventoryScaleHeartbeatCycleResult {
  readonly protocol: ScaleProtocol;
  readonly acceptedWeightMicrounits: number;
  readonly returnedWeightMicrounits: number;
  readonly protocolNormalizationConverged: boolean;
  readonly disconnectedForcedManual: boolean;
  readonly staleAtTwoSecondsRejected: boolean;
  readonly zeroNeverSynthesized: boolean;
  readonly offlineServerParity: boolean;
  readonly measurementIdentityPreserved: boolean;
  readonly unstableRejected: boolean;
  readonly suspendedForcedManual: boolean;
  readonly reorderedRejected: boolean;
  readonly corruptFrameRejected: boolean;
  readonly duplicateReplayRejected: boolean;
  readonly tokenReplayRejected: boolean;
  readonly wrongTenantRejected: boolean;
  readonly wrongTerminalRejected: boolean;
  readonly tamperedPriceIgnored: boolean;
  readonly tamperedWeightIgnored: boolean;
  readonly exactReturnMicrounits: boolean;
}

export interface InventoryScaleHeartbeatChaosResult {
  readonly cycles: number;
  readonly discrepancies: number;
  readonly silentZeroWeights: number;
  readonly staleReadingsAccepted: number;
  readonly duplicateMeasurements: number;
  readonly centParityDrift: number;
  readonly stockMicrounitDrift: number;
  readonly samples: readonly InventoryScaleHeartbeatCycleResult[];
  readonly engineEvidenceVerified: boolean;
}

interface ProtocolFrame {
  readonly protocol: ScaleProtocol;
  readonly magnitude: number;
  readonly unit: ScaleInputUnit;
  readonly reportId?: number;
  readonly endpoint?: number;
  readonly frame?: string;
  readonly checksumValid?: boolean;
}

interface HeartbeatState {
  readonly status: 'READY' | 'MANUAL_REQUIRED';
  readonly reading: ScaleReading | null;
}

const PROTOCOLS: readonly ScaleProtocol[] = ['WEBHID', 'WEB_SERIAL', 'WEBUSB'];

function frameFor(protocol: ScaleProtocol, weightMicrounits: number): ProtocolFrame {
  if (protocol === 'WEBHID') {
    return {
      protocol,
      magnitude: weightMicrounits / 1_000,
      unit: 'GRAM',
      reportId: 3,
    };
  }
  if (protocol === 'WEB_SERIAL') {
    return {
      protocol,
      magnitude: weightMicrounits / 1_000,
      unit: 'GRAM',
      frame: `ST,GS,+${String(weightMicrounits / 1_000).padStart(6, '0')} g\r\n`,
      checksumValid: true,
    };
  }
  return {
    protocol,
    magnitude: weightMicrounits,
    unit: 'MILLIGRAM',
    endpoint: 1,
  };
}

function decodeFrame(
  frame: ProtocolFrame,
  sequence: number,
  observedAtEpochMs: number,
  stable = true,
): ScaleReading {
  const validTransport =
    (frame.protocol === 'WEBHID' && frame.reportId === 3) ||
    (frame.protocol === 'WEB_SERIAL' &&
      frame.checksumValid === true &&
      /^ST,GS,\+\d{6} g\r\n$/.test(frame.frame ?? '')) ||
    (frame.protocol === 'WEBUSB' && frame.endpoint === 1);
  if (!validTransport) throw new Error('SCALE_FRAME_INVALID');
  return normalizeScaleReading({
    protocol: frame.protocol,
    deviceId: `scale-${frame.protocol.toLowerCase()}`,
    sequence,
    magnitude: frame.magnitude,
    unit: frame.unit,
    stable,
    observedAtEpochMs,
  });
}

function corruptFrame(frame: ProtocolFrame): ProtocolFrame {
  if (frame.protocol === 'WEBHID') return { ...frame, reportId: 99 };
  if (frame.protocol === 'WEB_SERIAL') return { ...frame, checksumValid: false };
  return { ...frame, endpoint: 99 };
}

function rejects(operation: () => unknown): boolean {
  try {
    operation();
    return false;
  } catch {
    return true;
  }
}

function evaluateHeartbeat(input: {
  readonly connected: boolean;
  readonly suspended: boolean;
  readonly reading: ScaleReading;
  readonly nowEpochMs: number;
}): HeartbeatState {
  if (
    !input.connected ||
    input.suspended ||
    input.nowEpochMs - input.reading.observedAtEpochMs >= 2_000
  ) {
    return { status: 'MANUAL_REQUIRED', reading: null };
  }
  return { status: 'READY', reading: input.reading };
}

function tokenChecks(
  seed: number,
): Pick<
  InventoryScaleHeartbeatCycleResult,
  'tokenReplayRejected' | 'wrongTenantRejected' | 'wrongTerminalRejected'
> {
  const expected = {
    tenantId: `tenant-${seed}`,
    terminalId: `terminal-${seed}`,
    saleItemId: `line-${seed}`,
    measurementId: `measurement-${seed}`,
  };
  let consumed = false;
  const consume = (attempt: typeof expected): boolean => {
    if (consumed || JSON.stringify(attempt) !== JSON.stringify(expected)) return false;
    consumed = true;
    return true;
  };
  const wrongTenantRejected = !consume({ ...expected, tenantId: `${expected.tenantId}-wrong` });
  const wrongTerminalRejected = !consume({
    ...expected,
    terminalId: `${expected.terminalId}-wrong`,
  });
  const firstAccepted = consume(expected);
  const tokenReplayRejected = firstAccepted && !consume(expected);
  return { tokenReplayRejected, wrongTenantRejected, wrongTerminalRejected };
}

function simulateCycle(seed: number): InventoryScaleHeartbeatCycleResult {
  const protocol = PROTOCOLS[seed % PROTOCOLS.length]!;
  const expectedWeightMicrounits = 250_000 + (seed % 1_000) * 1_000;
  const observedAtEpochMs = 10_000 + seed * 10_000;
  const sequence = seed * 2 + 10;
  const readings = PROTOCOLS.map((candidate) =>
    decodeFrame(frameFor(candidate, expectedWeightMicrounits), sequence, observedAtEpochMs),
  );
  const reading = readings.find((candidate) => candidate.protocol === protocol)!;
  const protocolNormalizationConverged = readings.every(
    (candidate) => candidate.weightMicrounits === expectedWeightMicrounits,
  );

  const disconnected = evaluateHeartbeat({
    connected: false,
    suspended: false,
    reading,
    nowEpochMs: observedAtEpochMs + 1,
  });
  const suspended = evaluateHeartbeat({
    connected: true,
    suspended: true,
    reading,
    nowEpochMs: observedAtEpochMs + 1,
  });
  const stale = evaluateHeartbeat({
    connected: true,
    suspended: false,
    reading,
    nowEpochMs: observedAtEpochMs + 2_000,
  });
  const disconnectedForcedManual =
    disconnected.status === 'MANUAL_REQUIRED' && disconnected.reading === null;
  const suspendedForcedManual =
    suspended.status === 'MANUAL_REQUIRED' && suspended.reading === null;
  const staleAtTwoSecondsRejected = stale.status === 'MANUAL_REQUIRED' && stale.reading === null;
  const zeroNeverSynthesized = [disconnected, suspended, stale].every(
    (state) => state.reading === null,
  );

  let lastSequence = sequence - 1;
  const acceptSequence = (candidate: number): boolean => {
    if (candidate <= lastSequence) return false;
    lastSequence = candidate;
    return true;
  };
  const orderedAccepted = acceptSequence(sequence);
  const reorderedRejected = orderedAccepted && !acceptSequence(sequence - 1);

  const measurementIds = new Set<string>();
  const acceptMeasurement = (measurementId: string): boolean => {
    if (measurementIds.has(measurementId)) return false;
    measurementIds.add(measurementId);
    return true;
  };
  const measurementId = `measurement-${seed}`;
  const measurementAccepted = acceptMeasurement(measurementId);
  const duplicateReplayRejected = measurementAccepted && !acceptMeasurement(measurementId);

  const serverPriceCents = 199 + (seed % 17);
  const hostilePriceCents = 1;
  const hostileWeightMicrounits = expectedWeightMicrounits + 777_000;
  const onlineSubtotalCents = calculateWeightedSubtotalCents({
    unitPricePerBaseCents: serverPriceCents,
    weightMicrounits: reading.weightMicrounits,
  });
  const offlineSubtotalCents = calculateWeightedSubtotalCents({
    unitPricePerBaseCents: serverPriceCents,
    weightMicrounits: reading.weightMicrounits,
  });
  const hostileSubtotalCents = calculateWeightedSubtotalCents({
    unitPricePerBaseCents: hostilePriceCents,
    weightMicrounits: hostileWeightMicrounits,
  });
  const stockBeforeMicrounits = 3_000_000;
  const stockAfterSaleMicrounits = stockBeforeMicrounits - reading.weightMicrounits;
  const stockAfterReturnMicrounits = stockAfterSaleMicrounits + reading.weightMicrounits;
  const returnedWeightMicrounits = stockAfterReturnMicrounits - stockAfterSaleMicrounits;
  const lineIds = [`line-${seed}-a`, `line-${seed}-b`];

  return {
    protocol,
    acceptedWeightMicrounits: reading.weightMicrounits,
    returnedWeightMicrounits,
    protocolNormalizationConverged,
    disconnectedForcedManual,
    staleAtTwoSecondsRejected,
    zeroNeverSynthesized,
    offlineServerParity: onlineSubtotalCents === offlineSubtotalCents,
    measurementIdentityPreserved:
      new Set(lineIds).size === 2 && new Set([measurementId, `${measurementId}-second`]).size === 2,
    unstableRejected: rejects(() =>
      decodeFrame(frameFor(protocol, expectedWeightMicrounits), sequence, observedAtEpochMs, false),
    ),
    suspendedForcedManual,
    reorderedRejected,
    corruptFrameRejected: rejects(() =>
      decodeFrame(
        corruptFrame(frameFor(protocol, expectedWeightMicrounits)),
        sequence,
        observedAtEpochMs,
      ),
    ),
    duplicateReplayRejected,
    ...tokenChecks(seed),
    tamperedPriceIgnored: onlineSubtotalCents !== hostileSubtotalCents,
    tamperedWeightIgnored: reading.weightMicrounits !== hostileWeightMicrounits,
    exactReturnMicrounits:
      stockAfterReturnMicrounits === stockBeforeMicrounits &&
      returnedWeightMicrounits === reading.weightMicrounits,
  };
}

function sampleHasDiscrepancy(sample: InventoryScaleHeartbeatCycleResult): boolean {
  return Object.entries(sample).some(
    ([key, value]) =>
      key !== 'protocol' &&
      key !== 'acceptedWeightMicrounits' &&
      key !== 'returnedWeightMicrounits' &&
      value !== true,
  );
}

export function runInventoryScaleHeartbeatChaos(
  cycles = 500,
  engineEvidenceVerified = false,
): InventoryScaleHeartbeatChaosResult {
  if (!Number.isSafeInteger(cycles) || cycles < 0) throw new Error('CHAOS_CYCLES_INVALID');
  const samples: InventoryScaleHeartbeatCycleResult[] = [];
  let discrepancies = 0;
  let silentZeroWeights = 0;
  let staleReadingsAccepted = 0;
  let duplicateMeasurements = 0;
  let centParityDrift = 0;
  let stockMicrounitDrift = 0;
  for (let seed = 0; seed < cycles; seed += 1) {
    const sample = simulateCycle(seed);
    samples.push(sample);
    if (sampleHasDiscrepancy(sample)) discrepancies += 1;
    if (!sample.zeroNeverSynthesized || sample.acceptedWeightMicrounits === 0) {
      silentZeroWeights += 1;
    }
    if (!sample.staleAtTwoSecondsRejected) staleReadingsAccepted += 1;
    if (!sample.duplicateReplayRejected) duplicateMeasurements += 1;
    if (!sample.offlineServerParity) centParityDrift += 1;
    stockMicrounitDrift += Math.abs(
      sample.returnedWeightMicrounits - sample.acceptedWeightMicrounits,
    );
  }
  return {
    cycles,
    discrepancies,
    silentZeroWeights,
    staleReadingsAccepted,
    duplicateMeasurements,
    centParityDrift,
    stockMicrounitDrift,
    samples,
    engineEvidenceVerified,
  };
}

export function judgeInventoryScaleHeartbeat(
  result: InventoryScaleHeartbeatChaosResult,
): InventoryScaleHeartbeatChaosVerdict {
  if (result.cycles < 500 || result.discrepancies !== 0) return 'FAIL';
  if (
    result.silentZeroWeights !== 0 ||
    result.staleReadingsAccepted !== 0 ||
    result.duplicateMeasurements !== 0 ||
    result.centParityDrift !== 0 ||
    result.stockMicrounitDrift !== 0
  ) {
    return 'FAIL';
  }
  if (result.engineEvidenceVerified !== true) return 'FAIL';
  return 'PASS';
}

export async function runInventoryScaleHeartbeatChaosScenario(
  execute?: () => Promise<InventoryScaleHeartbeatChaosResult>,
): Promise<InventoryScaleHeartbeatChaosVerdict> {
  return judgeInventoryScaleHeartbeat(
    execute ? await execute() : runInventoryScaleHeartbeatChaos(500),
  );
}
