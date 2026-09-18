import { readFile } from 'node:fs/promises';
import { OPERATIONAL_TENANTS } from './operational-seed.mjs';

export function validateOperationalSeedSql(source) {
  const errors = [];
  if (/UPSERT INTO|db\.transaction\(/i.test(source)) errors.push('forbidden transaction syntax');
  for (const tenant of OPERATIONAL_TENANTS) {
    const id = `seed_${tenant.key}`;
    const required = [`INSERT OR IGNORE INTO tenants`, `'${id}'`, `'${id}_nv'`, `'${id}_product'`, `'${id}_batch'`, `'${id}_sale'`, `'${id}', 'pos.checkout'`];
    for (const marker of required) if (!source.includes(marker)) errors.push(`${id}: missing ${marker}`);
  }
  if (!source.includes('fuel_catalog')) errors.push('missing fuel catalog scenario');
  if (!source.includes('fuel_dispatches')) errors.push('missing fuel dispatch scenario');
  return { ok: errors.length === 0, errors };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2] ?? 'tmp-staff/operational-seed.sql';
  const result = validateOperationalSeedSql(await readFile(file, 'utf8'));
  if (!result.ok) { console.error(result.errors.join('\n')); process.exitCode = 1; }
  else console.log(`operational seed valid: ${file}`);
}
