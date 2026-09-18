#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OPERATIONAL_TENANTS, buildTenantCapabilitySnapshots } from './operational-seed.mjs';

export function buildSeedEvidence(stateDir, sql, generatedAt = new Date().toISOString()) {
  return {
    schemaVersion: 1,
    environment: 'local',
    application: 'pending',
    generatedAt,
    stateDir: resolve(stateDir),
    bindings: { d1: 'DB', kv: 'TENANT_KV' },
    sqlSha256: createHash('sha256').update(sql).digest('hex'),
    tenants: OPERATIONAL_TENANTS.map((tenant) => ({
      id: `seed_${tenant.key}`,
      vertical: tenant.vertical,
      roles: ['owner', 'cashier'],
      capabilities: [...tenant.capabilities].sort(),
    })),
    credentials: { format: 'argon2id', plaintextIncluded: false, pinHashIncluded: false },
  };
}

async function prepare(stateDir) {
  const root = resolve(stateDir);
  const sql = await readFile(resolve(root, 'operational-seed.sql'), 'utf8');
  const snapshotsDir = resolve(root, 'kv-snapshots');
  await mkdir(snapshotsDir, { recursive: true });
  for (const snapshot of buildTenantCapabilitySnapshots()) {
    const tenantKey = snapshot.key.slice('tenant:'.length);
    await writeFile(resolve(snapshotsDir, `${tenantKey}.json`), snapshot.value, 'utf8');
  }
  const evidence = buildSeedEvidence(root, sql);
  await writeFile(resolve(root, 'seed-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
}

async function markApplied(stateDir) {
  const evidencePath = resolve(stateDir, 'seed-evidence.json');
  const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
  evidence.application = 'applied-local-d1-and-kv';
  evidence.appliedAt = new Date().toISOString();
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const stateDir = process.argv[2];
  if (!stateDir) {
    console.error('Usage: operational-seed-artifacts.mjs <state-dir> [--mark-applied]');
    process.exitCode = 2;
  } else if (process.argv[3] === '--mark-applied') {
    await markApplied(stateDir);
  } else {
    await prepare(stateDir);
  }
}
