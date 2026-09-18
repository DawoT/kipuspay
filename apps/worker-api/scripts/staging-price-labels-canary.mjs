#!/usr/bin/env node

import { fileURLToPath } from 'node:url';

const apiBase = (
  process.env.STAGING_PRICE_LABELS_API ??
  'https://kipuspay-worker-api-staging.cristian-pcalderon.workers.dev'
).replace(/\/$/, '');
const ownerToken = process.env.STAGING_PRICE_LABELS_OWNER_TOKEN;
const operatorToken = process.env.STAGING_PRICE_LABELS_OPERATOR_TOKEN;
const tenantId = process.env.STAGING_PRICE_LABELS_TENANT_ID;
const productId = process.env.STAGING_PRICE_LABELS_PRODUCT_ID;
const terminalId = process.env.STAGING_PRICE_LABELS_TERMINAL_ID;
const terminalSessionId = process.env.STAGING_PRICE_LABELS_TERMINAL_SESSION_ID;

const required = [
  ['STAGING_PRICE_LABELS_OWNER_TOKEN', ownerToken],
  ['STAGING_PRICE_LABELS_OPERATOR_TOKEN', operatorToken],
  ['STAGING_PRICE_LABELS_TENANT_ID', tenantId],
  ['STAGING_PRICE_LABELS_PRODUCT_ID', productId],
  ['STAGING_PRICE_LABELS_TERMINAL_ID', terminalId],
  ['STAGING_PRICE_LABELS_TERMINAL_SESSION_ID', terminalSessionId],
];

export async function assertJsonResponse(response, label) {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(`${label}_CONTENT_TYPE_INVALID`);
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`${label}_JSON_INVALID`);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error(`${label}_BODY_INVALID`);
  }
  return body;
}

export function buildAuthHeaders(token, tenant, terminal, session) {
  return {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'x-tenant-id': tenant,
    ...(terminal && session
      ? {
          'x-terminal-id': terminal,
          'x-terminal-session-id': session,
        }
      : {}),
  };
}

function headers(token, withTerminal = false) {
  return buildAuthHeaders(
    token,
    tenantId,
    withTerminal ? terminalId : undefined,
    withTerminal ? terminalSessionId : undefined,
  );
}

async function post(path, token, body, label, withTerminal = false) {
  const response = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: headers(token, withTerminal),
    body: JSON.stringify(body),
  });
  const json = await assertJsonResponse(response, label);
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${label}_HTTP_${response.status}`);
  }
  return { status: response.status, body: json };
}

export function buildCanaryReport(input) {
  const report = {
    apiBase: input.apiBase,
    templateStatus: input.templateStatus,
    batchStatus: input.batchStatus,
    reprintStatus: input.reprintStatus,
    ackStatus: input.ackStatus,
    batchId: input.batchId,
    reprintBatchId: input.reprintBatchId,
    ackedCount: input.acked.length,
  };
  const complete =
    typeof report.apiBase === 'string' &&
    report.apiBase.length > 0 &&
    [report.templateStatus, report.batchStatus, report.reprintStatus, report.ackStatus].every(
      (status) => Number.isInteger(status) && status >= 200 && status < 300,
    ) &&
    typeof report.batchId === 'string' &&
    report.batchId.length > 0 &&
    typeof report.reprintBatchId === 'string' &&
    report.reprintBatchId.length > 0 &&
    report.ackedCount > 0;
  return { ...report, complete };
}

async function main() {
  if (required.some(([, value]) => !value)) {
    console.error(
      `Faltan credenciales/IDs fuera del repositorio: ${required
        .filter(([, value]) => !value)
        .map(([name]) => name)
        .join(', ')}`,
    );
    process.exit(2);
  }
  const prefix = `s41-canary-${Date.now()}`;
  const template = await post(
    '/api/catalog/price-labels/templates',
    ownerToken,
    {
      templateKey: prefix,
      name: `Canary ${prefix}`,
      paperWidthMm: 58,
      template: {
        dslVersion: 'PRICE_LABEL_V1',
        blocks: [
          { type: 'TEXT', field: 'name', align: 'LEFT' },
          { type: 'PRICE', field: 'price', align: 'RIGHT' },
          { type: 'BARCODE', field: 'barcode', align: 'LEFT' },
        ],
      },
    },
    'template',
  );
  const templateId = template.body.templateId;
  if (typeof templateId !== 'string' || !templateId) throw new Error('TEMPLATE_ID_MISSING');

  const batch = await post(
    '/api/catalog/price-labels/batches',
    operatorToken,
    {
      templateId,
      products: [{ productId, copies: 1 }],
      idempotencyKey: `${prefix}-batch`,
    },
    'batch',
    true,
  );
  const batchId = batch.body.batchId;
  const items = Array.isArray(batch.body.items) ? batch.body.items : [];
  const itemIds = items
    .map((item) => (item && typeof item.itemId === 'string' ? item.itemId : ''))
    .filter(Boolean);
  if (typeof batchId !== 'string' || !batchId || itemIds.length === 0) {
    throw new Error('BATCH_ITEMS_MISSING');
  }

  const reprint = await post(
    '/api/catalog/price-labels/batches/reprint',
    operatorToken,
    { batchId, idempotencyKey: `${prefix}-reprint` },
    'reprint',
    true,
  );
  const ack = await post(
    '/api/catalog/price-labels/batches/ack',
    operatorToken,
    {
      batchId,
      acknowledgements: itemIds.map((itemId) => ({ itemId, status: 'ACKED' })),
    },
    'ack',
    true,
  );

  const report = buildCanaryReport({
    apiBase,
    templateStatus: template.status,
    batchStatus: batch.status,
    reprintStatus: reprint.status,
    ackStatus: ack.status,
    batchId,
    reprintBatchId: reprint.body.batchId,
    acked: itemIds,
    token: `${ownerToken}${operatorToken}`,
  });
  console.log(JSON.stringify(report));
  if (!report.complete) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
