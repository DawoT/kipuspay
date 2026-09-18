#!/usr/bin/env node

import { fileURLToPath } from 'node:url';

const apiBase = (
  process.env.STAGING_INSIGHTS_API ??
  'https://kipuspay-worker-api-staging.cristian-pcalderon.workers.dev'
).replace(/\/$/, '');
const token = process.env.STAGING_INSIGHTS_TOKEN;
const tenantId = process.env.STAGING_INSIGHTS_TENANT_ID;
const question = process.env.STAGING_INSIGHTS_QUESTION ?? '¿cómo van las ventas?';
const iterations = Math.max(3, Number.parseInt(process.env.STAGING_INSIGHTS_ITERATIONS ?? '5', 10));

function percentile(values, p) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * p) - 1)] ?? 0;
}

function assertSse(response, body) {
  if (response.status !== 200) throw new Error(`HTTP_${response.status}`);
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    throw new Error('SSE_CONTENT_TYPE_INVALID');
  }
  if (!body.includes('data:')) throw new Error('SSE_DATA_MISSING');
  if (body.includes('INSIGHTS_FAILED')) throw new Error('INSIGHTS_FAILED');
}

export function buildAuthHeaders(authToken, tenant) {
  return {
    authorization: `Bearer ${authToken}`,
    'content-type': 'application/json',
    'x-tenant-id': tenant,
  };
}

export function isCachedSse(body) {
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    try {
      const payload = JSON.parse(line.slice('data:'.length).trim());
      if (payload && typeof payload === 'object' && payload.cached === true) return true;
    } catch {
      // Ignore malformed/non-JSON SSE events; the caller already validates SSE shape.
    }
  }
  return false;
}

export function parseServerTiming(header) {
  const timings = {};
  for (const metric of (header ?? '').split(',')) {
    const match = metric.trim().match(/^([a-z][a-z0-9_-]*);dur=(\d+(?:\.\d+)?)$/i);
    if (match) timings[match[1]] = Number(match[2]);
  }
  return timings;
}

async function chat(idempotencyKey) {
  const started = performance.now();
  const response = await fetch(`${apiBase}/api/insights/chat`, {
    method: 'POST',
    headers: buildAuthHeaders(token, tenantId),
    body: JSON.stringify({ question, idempotencyKey }),
  });
  const body = await response.text();
  assertSse(response, body);
  return {
    durationMs: Math.round(performance.now() - started),
    timings: parseServerTiming(response.headers.get('server-timing')),
    body,
  };
}

async function main() {
  if (!token || !tenantId) {
    console.error(
      'STAGING_INSIGHTS_TOKEN y STAGING_INSIGHTS_TENANT_ID son obligatorios; no se ejecuta el canary sin credenciales.',
    );
    process.exit(2);
  }

  const durations = [];
  const stageSamples = new Map();
  const prefix = `s49-canary-${Date.now()}`;
  for (let index = 0; index < iterations; index += 1) {
    const result = await chat(`${prefix}-${index}`);
    durations.push(result.durationMs);
    for (const [stage, duration] of Object.entries(result.timings)) {
      const samples = stageSamples.get(stage) ?? [];
      samples.push(duration);
      stageSamples.set(stage, samples);
    }
  }
  const replay = await chat(`${prefix}-0`);

  const report = {
    apiBase,
    iterations,
    questionLength: question.length,
    fastPathCandidate: /ventas|stock|caja|deuda|producto|top/i.test(question),
    p50Ms: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    maxMs: Math.max(...durations),
    replayMs: replay.durationMs,
    replaySse: isCachedSse(replay.body),
    stageP95Ms: Object.fromEntries(
      [...stageSamples.entries()].map(([stage, values]) => [stage, percentile(values, 0.95)]),
    ),
    replayStageMs: replay.timings,
    sloP95Under2s: percentile(durations, 0.95) < 2000,
  };
  console.log(JSON.stringify(report));
  if (!report.replaySse) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
