#!/usr/bin/env node
/**
 * Staff: sendBill/sendSummary a e-beta. SOL solo por env (nunca literales).
 * Corre con Vite (resuelve imports .ts):
 *   pnpm --filter @kipuspay/adapters-sunat exec vitest run --no-coverage ../../scripts/staff/send-beta-cpe.mjs
 * O: STAFF_SEND_BETA=1 + SIGNED_XML + SUNAT_SOL_USER + SUNAT_SOL_PASSWORD
 *    y un test/runner que importe sendBetaCpeFromEnv.
 * Nunca imprime secretos.
 */
import { readFileSync } from 'node:fs';
import { sendBetaCpeXml } from '../../packages/adapters-sunat/src/staff-cdr-report.ts';

function asCpeKind(value) {
  // RC → '03': el transporte enruta boleta/RC a sendSummary (§5.2).
  if (value === 'RC') return '03';
  if (value === '01' || value === '03' || value === '07' || value === '08') return value;
  throw new Error(`UNSUPPORTED_DOC_KIND:${value}`);
}

export async function sendBetaCpeFromEnv(env = process.env) {
  const xmlPath = env.SIGNED_XML?.trim();
  const solUser = env.SUNAT_SOL_USER?.trim();
  const solPassword = env.SUNAT_SOL_PASSWORD;
  const documentType = asCpeKind((env.DOC_KIND ?? '01').trim());
  if (!xmlPath || !solUser || !solPassword) {
    throw new Error('SIGNED_XML, SUNAT_SOL_USER, SUNAT_SOL_PASSWORD required');
  }
  const xml = readFileSync(xmlPath, 'utf8');
  return sendBetaCpeXml(
    xml,
    {
      tenantId: env.TENANT_ID?.trim() || 'tenant_stg_rosa_negra_001',
      saleId: env.SALE_ID?.trim() || 'sale_staff_beta_f001_12',
      documentType,
    },
    {
      solUser,
      solPassword,
      ...(env.SUNAT_BILL_ENDPOINT_URL?.trim()
        ? { endpointUrl: env.SUNAT_BILL_ENDPOINT_URL.trim() }
        : {}),
    },
  );
}

if (process.env.STAFF_SEND_BETA === '1') {
  const report = await sendBetaCpeFromEnv();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
