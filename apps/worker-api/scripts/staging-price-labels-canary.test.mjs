import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertJsonResponse,
  buildAuthHeaders,
  buildCanaryReport,
} from './staging-price-labels-canary.mjs';

test('rejects a successful response that is not JSON', async () => {
  await assert.rejects(
    () => assertJsonResponse(new Response('not-json', { status: 200 }), 'templates'),
    /templates_CONTENT_TYPE_INVALID/,
  );
});

test('report requires the complete snapshot flow and never includes credentials', () => {
  const report = buildCanaryReport({
    apiBase: 'https://example.invalid',
    templateStatus: 201,
    batchStatus: 201,
    reprintStatus: 201,
    ackStatus: 200,
    batchId: 'batch-1',
    reprintBatchId: 'batch-2',
    acked: ['item-1'],
    token: 'secret-token',
  });

  assert.deepEqual(report, {
    apiBase: 'https://example.invalid',
    templateStatus: 201,
    batchStatus: 201,
    reprintStatus: 201,
    ackStatus: 200,
    batchId: 'batch-1',
    reprintBatchId: 'batch-2',
    ackedCount: 1,
    complete: true,
  });
  assert.equal(JSON.stringify(report).includes('secret-token'), false);
});

test('report is incomplete when reprint identity is absent', () => {
  const report = buildCanaryReport({
    apiBase: 'https://example.invalid',
    templateStatus: 201,
    batchStatus: 201,
    reprintStatus: 201,
    ackStatus: 200,
    batchId: 'batch-1',
    reprintBatchId: undefined,
    acked: ['item-1'],
  });

  assert.equal(report.complete, false);
});

test('auth headers carry the explicit tenant hint for the staging host', () => {
  assert.deepEqual(buildAuthHeaders('secret-token', 'tenant-stg', 'terminal-1', 'session-1'), {
    authorization: 'Bearer secret-token',
    'content-type': 'application/json',
    'x-tenant-id': 'tenant-stg',
    'x-terminal-id': 'terminal-1',
    'x-terminal-session-id': 'session-1',
  });
});
