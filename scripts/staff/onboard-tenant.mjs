#!/usr/bin/env node
/**
 * KipusPay staff onboarding — alta atómica y parametrizada de un negocio emisor.
 *
 * Reemplaza el copy-paste del seed (scripts/staff/seed-rosa-negra-staging.sql +
 * apply-rosa-negra-staging.sh) para negocios nuevos. Gap LEDGER 0472/0473.
 *
 * Uso:
 *   node scripts/staff/onboard-tenant.mjs --tenant-id <id> --ruc <11 dígitos> \
 *     --nombre "RAZON SOCIAL SAC" [--trade-name X] [--direccion Y] \
 *     [--tax-regime RG] [--doc-types 01,03,07,08] [--env staging] \
 *     [--kv-namespace-id <ns>] [--apply]
 *
 * Default: DRY-RUN (genera SQL + plan, no toca nada). Sin --apply jamás ejecuta.
 * Idempotencia: preflight SELECT por id y RUC; si existe → error tipado
 * (TENANT_EXISTS / RUC_ALREADY_REGISTERED). El SQL generado usa INSERT limpio:
 * sin INSERT OR IGNORE ni ON CONFLICT — el alta es limpia o falla con error.
 * Atomicidad: un solo archivo SQL con los INSERT del skeleton; wrangler d1
 * execute --file lo envía como batch D1 (transaccional, all-or-nothing,
 * verificado empíricamente) + post-verificación de conteos por tabla.
 * Secretos: este comando NO maneja secretos (ni PINs, ni certificados, ni SOL).
 * Nunca imprime material sensible; el owner user se crea por flujo de auth.
 */
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TMP_STAFF = path.join(ROOT, 'tmp-staff');

/** Catálogo camino A (runbook fiscal-onboarding-tenant §2.1): emisor directo. */
const SERIES_BY_DOC = Object.freeze({
  '01': 'F001',
  '03': 'B001',
  '07': 'FC01',
  '08': 'FD01',
});
const TAX_REGIMES = Object.freeze(['NRUS', 'RER', 'RMT', 'RG', 'UNKNOWN']);
const SUPPORTED_ENVS = Object.freeze(['staging']); // canal productivo fiscal WAIT
const TENANT_ID_RE = /^tenant_[a-z0-9_]+$/;
const RUC_RE = /^\d{11}$/;

export class OnboardingError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'OnboardingError';
    this.code = code;
  }
}

/** Checksum módulo 11 oficial SUNAT (pesos 5,4,3,2,7,6,5,4,3,2). */
export function isValidRucChecksum(ruc) {
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(ruc[i]) * weights[i];
  const check = 11 - (sum % 11);
  const expected = check === 10 ? 0 : check === 11 ? 1 : check;
  return expected === Number(ruc[10]);
}

/** Escape de literal SQL: duplica comillas simples. Todo valor pasa por aquí. */
export function sqlQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function deriveIds(tenantId) {
  return {
    branchId: `${tenantId}_branch_0001`,
    registerId: `${tenantId}_register_0001`,
    seriesId: (doc) => `${tenantId}_series_${doc}`,
  };
}

/**
 * Valida entrada cruda (flags ya parseadas) → config normalizada.
 * Fail-closed: cualquier campo inválido lanza OnboardingError tipado.
 */
export function validateInputs(raw) {
  const tenantId = typeof raw.tenantId === 'string' ? raw.tenantId.trim() : '';
  if (!TENANT_ID_RE.test(tenantId) || tenantId.length > 64 || tenantId.endsWith('_')) {
    throw new OnboardingError(
      'ERR_TENANT_ID_FORMAT',
      `--tenant-id inválido: "${raw.tenantId}". Formato: tenant_<snake_case a-z0-9_> (≤64, sin _ final).`,
    );
  }

  const ruc = typeof raw.ruc === 'string' ? raw.ruc.trim() : '';
  if (!RUC_RE.test(ruc)) {
    throw new OnboardingError(
      'ERR_RUC_FORMAT',
      `--ruc inválido: "${raw.ruc ?? ''}". Debe ser exactamente 11 dígitos.`,
    );
  }
  if (!isValidRucChecksum(ruc)) {
    throw new OnboardingError(
      'ERR_RUC_CHECKSUM',
      `--ruc ${ruc} no pasa el dígito verificador módulo 11 de SUNAT (typo?).`,
    );
  }

  const businessName = typeof raw.nombre === 'string' ? raw.nombre.trim() : '';
  if (businessName.length === 0 || businessName.length > 200) {
    throw new OnboardingError(
      'ERR_BUSINESS_NAME_EMPTY',
      '--nombre es obligatorio (1..200 caracteres tras trim).',
    );
  }

  let docTypes;
  if (Array.isArray(raw.docTypes)) {
    docTypes = raw.docTypes;
  } else if (typeof raw.docTypes === 'string' && raw.docTypes.trim() !== '') {
    docTypes = raw.docTypes.split(',');
  } else {
    docTypes = ['01', '03', '07', '08'];
  }
  docTypes = [...new Set(docTypes.map((d) => String(d).trim()))];
  for (const doc of docTypes) {
    if (!(doc in SERIES_BY_DOC)) {
      throw new OnboardingError(
        'ERR_DOC_TYPES_INVALID',
        `--doc-types contiene "${doc}" fuera del catálogo camino A: ${Object.keys(SERIES_BY_DOC).join(',')}.`,
      );
    }
  }

  const taxRegime = raw.taxRegime ?? 'RG';
  if (!TAX_REGIMES.includes(taxRegime)) {
    throw new OnboardingError(
      'ERR_TAX_REGIME_INVALID',
      `--tax-regime "${taxRegime}" fuera del CHECK de DDL: ${TAX_REGIMES.join('|')}.`,
    );
  }

  const env = raw.env ?? 'staging';
  if (!SUPPORTED_ENVS.includes(env)) {
    throw new OnboardingError(
      'ERR_ENV_UNSUPPORTED',
      `--env "${env}" no soportado hoy (canal productivo fiscal en WAIT): ${SUPPORTED_ENVS.join('|')}.`,
    );
  }

  return {
    tenantId,
    ruc,
    businessName,
    tradeName: typeof raw.tradeName === 'string' && raw.tradeName.trim() !== '' ? raw.tradeName.trim() : null,
    address: typeof raw.direccion === 'string' ? raw.direccion.trim() : '',
    taxRegime,
    docTypes,
    env,
    apply: Boolean(raw.apply),
    kvNamespaceId: typeof raw.kvNamespaceId === 'string' && raw.kvNamespaceId.trim() !== '' ? raw.kvNamespaceId.trim() : null,
  };
}

/** SQL de preflight: existencia por id Y por RUC (dos contadores independientes). */
export function buildPreflightSql(cfg) {
  return [
    'SELECT',
    `  (SELECT COUNT(*) FROM tenants WHERE id = ${sqlQuote(cfg.tenantId)}) AS tenant_id_hits,`,
    `  (SELECT COUNT(*) FROM tenants WHERE ruc = ${sqlQuote(cfg.ruc)} AND deleted_at IS NULL) AS ruc_hits,`,
    `  ${sqlQuote(cfg.tenantId)} AS checked_tenant_id,`,
    `  ${sqlQuote(cfg.ruc)} AS checked_ruc;`,
  ].join('\n');
}

/** Error tipado si el preflight encuentra colisión (idempotencia limpia). */
export function assertTenantAbsent(rows) {
  const row = rows?.[0] ?? {};
  if (Number(row.tenant_id_hits) > 0) {
    throw new OnboardingError(
      'TENANT_EXISTS',
      `El tenant ${row.checked_tenant_id ?? '(consultado)'} ya existe: nada fue modificado. Reusa el alta o elige otro --tenant-id.`,
    );
  }
  if (Number(row.ruc_hits) > 0) {
    throw new OnboardingError(
      'RUC_ALREADY_REGISTERED',
      `El RUC ${row.checked_ruc ?? '(consultado)'} ya está registrado en otro tenant activo: nada fue modificado.`,
    );
  }
}

/** SQL post-batch: conteos esperados por tabla para detectar aplicación parcial. */
export function buildPostVerifySql(cfg) {
  const t = sqlQuote(cfg.tenantId);
  return [
    'SELECT',
    `  (SELECT COUNT(*) FROM tenants WHERE id = ${t}) AS tenants,`,
    `  (SELECT COUNT(*) FROM branches WHERE tenant_id = ${t}) AS branches,`,
    `  (SELECT COUNT(*) FROM cash_registers WHERE tenant_id = ${t}) AS cash_registers,`,
    `  (SELECT COUNT(*) FROM branch_document_series WHERE tenant_id = ${t}) AS series,`,
    `  (SELECT COUNT(*) FROM payment_methods WHERE tenant_id = ${t}) AS payment_methods;`,
  ].join('\n');
}

/**
 * SQL del skeleton del emisor: tenants + branches + cash_registers +
 * branch_document_series + payment_methods. INSERT limpio (el preflight
 * garantiza que no hay colisión); un solo archivo = batch D1 atómico.
 */
export function buildOnboardingSql(cfg) {
  const { branchId, registerId, seriesId } = deriveIds(cfg.tenantId);
  const t = sqlQuote(cfg.tenantId);
  const enabledDocs = JSON.stringify(cfg.docTypes);
  const tradeName = cfg.tradeName ?? cfg.businessName;
  const seriesValues = cfg.docTypes.map((doc) => {
    const series = SERIES_BY_DOC[doc];
    return `  (${sqlQuote(seriesId(doc))}, ${t}, ${sqlQuote(branchId)}, ${sqlQuote(doc)}, ${sqlQuote(series)}, 0, 'AUTHORIZED', 1)`;
  });

  return [
    `-- KipusPay staff onboarding — generado por scripts/staff/onboard-tenant.mjs`,
    `-- tenant: ${cfg.tenantId} · ruc: ${cfg.ruc} · env: ${cfg.env} · docs: ${enabledDocs}`,
    `-- Camino A (emisor directo): ELECTRONIC_ISSUER + TENANT_CERT + PENDING_UPLOAD.`,
    `-- Alta limpia: el preflight previo garantiza que no hay colisión de id ni RUC.`,
    ``,
    `INSERT INTO tenants (`,
    `  id, ruc, business_name, trade_name, address, vertical_type, tax_regime,`,
    `  formalization_mode, sunat_certificate_status, pse_mode, enabled_document_types,`,
    `  plan_id, subscription_status, is_active`,
    `) VALUES (`,
    `  ${t}, ${sqlQuote(cfg.ruc)}, ${sqlQuote(cfg.businessName)}, ${sqlQuote(tradeName)},`,
    `  ${sqlQuote(cfg.address)}, 'retail', ${sqlQuote(cfg.taxRegime)},`,
    `  'ELECTRONIC_ISSUER', 'PENDING_UPLOAD', 'TENANT_CERT', ${sqlQuote(enabledDocs)},`,
    `  'arranque', 'trial', 1`,
    `);`,
    ``,
    `INSERT INTO branches (id, tenant_id, code, name, address, is_active)`,
    `VALUES (${sqlQuote(branchId)}, ${t}, '0001', 'Local principal', ${sqlQuote(cfg.address)}, 1);`,
    ``,
    `INSERT INTO cash_registers (id, tenant_id, branch_id, name, is_active)`,
    `VALUES (${sqlQuote(registerId)}, ${t}, ${sqlQuote(branchId)}, 'Caja principal', 1);`,
    ``,
    `INSERT INTO branch_document_series (`,
    `  id, tenant_id, branch_id, document_type_code, series, current_number, authorization_status, is_active`,
    `) VALUES`,
    seriesValues.join(',\n'),
    `;`,
    ``,
    `INSERT INTO payment_methods (tenant_id, id, code, name, is_active)`,
    `VALUES (${t}, 'pm-cash', 'cash', 'Efectivo', 1);`,
    ``,
  ].join('\n');
}

/** Snapshot TENANT_KV — patrón exacto de rosa-negra-tenant-kv.json. */
export function buildKvSnapshot(cfg) {
  return {
    id: cfg.tenantId,
    status: 'active',
    subscriptionStatus: 'trial',
    trialEndsAt: null,
    pastGracePeriod: false,
  };
}

/** Plan legible para el operador staff (se imprime antes de cualquier acción). */
export function buildPlan(cfg, { apply }) {
  const { branchId } = deriveIds(cfg.tenantId);
  const mode = apply ? 'APPLY (ejecuta contra D1 remoto + KV)' : 'DRY-RUN (no ejecuta nada)';
  const lines = [
    `[onboard-tenant] modo: ${mode}`,
    `  tenant:   ${cfg.tenantId}`,
    `  ruc:      ${cfg.ruc} (checksum OK)`,
    `  nombre:   ${cfg.businessName}`,
    `  env:      ${cfg.env}`,
    `  series:   ${cfg.docTypes.map((d) => `${d}→${SERIES_BY_DOC[d]}`).join(' ')}`,
    `  tablas:   tenants, branches (${branchId}), cash_registers, branch_document_series, payment_methods`,
    `  TENANT_KV: tenant:${cfg.tenantId}${cfg.kvNamespaceId ? ` → namespace ${cfg.kvNamespaceId}` : ' → namespace (requerido con --apply)'}`,
  ];
  if (apply) {
    lines.push(`  orden:    preflight SELECT → batch D1 (--file) → KV put → post-verificación`);
  }
  return lines;
}

function expectedCounts(cfg) {
  return {
    tenants: 1,
    branches: 1,
    cash_registers: 1,
    series: cfg.docTypes.length,
    payment_methods: 1,
  };
}

/** Compara conteos post-batch; cualquier desvío → PARTIAL_APPLY visible. */
export function assertPostVerifyCounts(rows, cfg) {
  const row = rows?.[0] ?? {};
  const expected = expectedCounts(cfg);
  const mismatches = Object.entries(expected)
    .filter(([key, want]) => Number(row[key]) !== want)
    .map(([key, want]) => `${key}: esperado ${want}, encontrado ${row[key] ?? 'ausente'}`);
  if (mismatches.length > 0) {
    throw new OnboardingError(
      'PARTIAL_APPLY',
      `Conteo post-batch inconsistente (revisar D1 antes de reintentar): ${mismatches.join('; ')}.`,
    );
  }
}

function parseWranglerJson(stdout) {
  const start = stdout.indexOf('[');
  if (start === -1) throw new OnboardingError('ERR_WRANGLER_OUTPUT', 'Salida de wrangler sin JSON de resultados.');
  return JSON.parse(stdout.slice(start));
}

/**
 * Orquestación del modo --apply:
 *   preflight SELECT → escribir SQL+KV en tmp-staff/ → batch D1 (--file) →
 *   KV put → post-verificación de conteos.
 * deps inyectables para tests; nunca maneja secretos.
 */
export async function applyOnboarding(cfg, deps) {
  const runWrangler = deps.runWrangler;
  const writeFileDep = deps.writeFile;

  if (!cfg.kvNamespaceId) {
    throw new OnboardingError(
      'ERR_KV_NAMESPACE_REQUIRED',
      '--apply exige --kv-namespace-id (o TENANT_KV_NAMESPACE_ID): sin namespace explícito no se escribe el snapshot.',
    );
  }

  // 1) Preflight read-only: colisión → error tipado, cero escrituras.
  const preflight = await runWrangler([
    'd1', 'execute', 'DB', '--env', cfg.env, '--remote', '--command', buildPreflightSql(cfg),
  ]);
  assertTenantAbsent(parseWranglerJson(preflight.stdout)[0].results);

  await mkdir(TMP_STAFF, { recursive: true });
  const sqlPath = path.join(TMP_STAFF, `${cfg.tenantId}-onboarding.sql`);
  const kvPath = path.join(TMP_STAFF, `${cfg.tenantId}-tenant-kv.json`);

  // 2) Batch D1 atómico (un archivo = una llamada = all-or-nothing).
  await writeFileDep(sqlPath, buildOnboardingSql(cfg));
  await runWrangler(['d1', 'execute', 'DB', '--env', cfg.env, '--remote', '--file', sqlPath]);

  // 3) Snapshot TENANT_KV.
  await writeFileDep(kvPath, `${JSON.stringify(buildKvSnapshot(cfg), null, 2)}\n`);
  await runWrangler([
    'kv', 'key', 'put', `tenant:${cfg.tenantId}`,
    `--namespace-id=${cfg.kvNamespaceId}`, '--path', kvPath, '--remote',
  ]);

  // 4) Post-verificación: conteos exactos por tabla.
  const verify = await runWrangler([
    'd1', 'execute', 'DB', '--env', cfg.env, '--remote', '--command', buildPostVerifySql(cfg),
  ]);
  assertPostVerifyCounts(parseWranglerJson(verify.stdout)[0].results, cfg);

  return { verified: true, sqlFile: sqlPath, kvKey: `tenant:${cfg.tenantId}` };
}

const USAGE = `Uso:
  node scripts/staff/onboard-tenant.mjs --tenant-id <id> --ruc <11d> --nombre "RAZON SOCIAL"
    [--trade-name N] [--direccion D] [--tax-regime RG|NRUS|RER|RMT|UNKNOWN]
    [--doc-types 01,03,07,08] [--env staging] [--kv-namespace-id NS | env TENANT_KV_NAMESPACE_ID]
    [--dry-run] [--apply]

Default DRY-RUN: genera SQL + plan y sale. --apply ejecuta preflight → batch D1 → KV → verificación.`;

/** Parser de flags fail-closed: desconocida o conflicto de modo → error tipado. */
export function parseArgs(argv) {
  const flags = {};
  const required = ['tenant-id', 'ruc', 'nombre'];
  const valueFlags = new Set([
    'tenant-id', 'ruc', 'nombre', 'trade-name', 'direccion', 'tax-regime',
    'doc-types', 'env', 'kv-namespace-id',
  ]);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') { flags.apply = true; continue; }
    if (arg === '--dry-run') { flags.dryRun = true; continue; }
    if (arg === '--help' || arg === '-h') { flags.help = true; return flags; }
    if (!arg.startsWith('--')) {
      throw new OnboardingError('ERR_UNKNOWN_FLAG', `Argumento inesperado "${arg}". ${USAGE}`);
    }
    const name = arg.slice(2);
    if (!valueFlags.has(name)) {
      throw new OnboardingError('ERR_UNKNOWN_FLAG', `Flag desconocida "--${name}". ${USAGE}`);
    }
    const value = argv[++i];
    if (value === undefined) {
      throw new OnboardingError('ERR_UNKNOWN_FLAG', `Flag "--${name}" requiere valor. ${USAGE}`);
    }
    flags[name] = value;
  }
  if (flags.dryRun && flags.apply) {
    throw new OnboardingError('ERR_CONFLICTING_MODE', '--dry-run y --apply son excluyentes.');
  }
  const missing = required.filter((r) => !(r in flags));
  if (missing.length > 0) {
    throw new OnboardingError(
      'ERR_MISSING_REQUIRED',
      `Faltan flags obligatorias: ${missing.map((m) => `--${m}`).join(', ')}. ${USAGE}`,
    );
  }
  return { ...flags, apply: flags.apply === true, dryRun: flags.dryRun === true || !flags.apply };
}

/** Runner real: pnpm exec wrangler dentro de worker-api (mismo patrón del apply script). */
function runWranglerReal(args) {
  const res = spawnSync(
    'pnpm',
    ['--filter', '@kipuspay/worker-api', 'exec', 'wrangler', ...args],
    { cwd: ROOT, encoding: 'utf8' },
  );
  if (res.status !== 0) {
    throw new OnboardingError(
      'ERR_WRANGLER_FAILED',
      `wrangler ${args[0]} ${args[1]} salió con código ${res.status}: ${(res.stderr || res.stdout || '').slice(-500)}`,
    );
  }
  return { stdout: res.stdout };
}

async function writeFileReal(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
  return filePath;
}

export async function main(argv, deps = {}) {
  const log = deps.log ?? ((line) => console.log(line));
  try {
    const flags = parseArgs(argv);
    if (flags.help) { log(USAGE); return 0; }
    const cfg = validateInputs({
      tenantId: flags['tenant-id'],
      ruc: flags.ruc,
      nombre: flags.nombre,
      tradeName: flags['trade-name'],
      direccion: flags.direccion,
      taxRegime: flags['tax-regime'],
      docTypes: flags['doc-types'],
      env: flags.env,
      apply: flags.apply === true,
      kvNamespaceId: flags['kv-namespace-id'] ?? process.env.TENANT_KV_NAMESPACE_ID ?? null,
    });

    const plan = buildPlan(cfg, { apply: cfg.apply });
    for (const line of plan) log(line);

    if (!cfg.apply) {
      log('');
      log('-- SQL que aplicaría --apply (batch D1 atómico):');
      log(buildOnboardingSql(cfg));
      log(`-- Snapshot TENANT_KV: tenant:${cfg.tenantId}`);
      log(JSON.stringify(buildKvSnapshot(cfg), null, 2));
      log('');
      log('DRY-RUN: nada fue escrito. Para ejecutar añade --apply --kv-namespace-id <NS>.');
      return 0;
    }

    const summary = await applyOnboarding(cfg, {
      runWrangler: deps.runWrangler ?? runWranglerReal,
      writeFile: deps.writeFile ?? writeFileReal,
    });
    log(`[onboard-tenant] OK verificado: ${summary.sqlFile} · KV ${summary.kvKey}`);
    log('[onboard-tenant] Siguiente: cert .p12 del negocio (runbook §2.2–§2.5) antes de emitir CPE.');
    return 0;
  } catch (err) {
    const code = err instanceof OnboardingError ? err.code : 'ERR_UNEXPECTED';
    console.error(`[onboard-tenant] ${code}: ${err.message}`);
    return err instanceof OnboardingError ? 2 : 1;
  }
}

/* istanbul ignore next */
if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  const exit = await main(process.argv.slice(2));
  process.exitCode = exit;
}
