import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAuthHeaders, isCachedSse, parseServerTiming } from './staging-insights-canary.mjs';

test('insights canary carries the explicit tenant hint', () => {
  assert.deepEqual(buildAuthHeaders('secret-token', 'tenant-stg'), {
    authorization: 'Bearer secret-token',
    'content-type': 'application/json',
    'x-tenant-id': 'tenant-stg',
  });
});

test('replay detector parses the JSON payload of an SSE event', () => {
  assert.equal(isCachedSse('data: {"cached":true,"text":"respuesta"}\n\n'), true);
  assert.equal(isCachedSse('data: {"text":"respuesta"}\n\n'), false);
  assert.equal(isCachedSse('data: {"cached":false}\n\n'), false);
  assert.equal(isCachedSse('data: no-json\n\n'), false);
});

test('canary parses only numeric Server-Timing durations by stage', () => {
  assert.deepEqual(
    parseServerTiming('quota;dur=12.5, query;dur=36, malformed, total;dur=200'),
    { quota: 12.5, query: 36, total: 200 },
  );
});
