import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const database = 'kipuspay-test';
const execute = (command) => {
  const output = execFileSync(
    'pnpm',
    ['exec', 'wrangler', 'd1', 'execute', database, '--local', '--command', command, '--json'],
    { cwd: new URL('..', import.meta.url), encoding: 'utf8' },
  );
  return JSON.parse(output)[0].results;
};

execFileSync('pnpm', ['exec', 'wrangler', 'd1', 'migrations', 'apply', database, '--local'], {
  cwd: new URL('..', import.meta.url),
  stdio: 'ignore',
});

const columns = execute(`
  SELECT m.name AS table_name, p.name AS column_name, p.pk AS pk_position, p.cid
  FROM sqlite_master m JOIN pragma_table_info(m.name) p
  WHERE m.type='table' AND m.name NOT LIKE 'sqlite_%' AND m.name NOT LIKE 'd1_%'
    AND m.name != '_cf_METADATA'
  ORDER BY m.name, p.cid
`);
const schemaDefinitions = execute(`
  SELECT name, sql FROM sqlite_master
  WHERE type='table' AND sql IS NOT NULL
  ORDER BY name
`);
const foreignKeys = schemaDefinitions.flatMap(({ name, sql }) =>
  [
    ...sql.matchAll(/FOREIGN KEY\s*\(([^)]+)\)\s*REFERENCES\s*"?([a-z0-9_]+)"?\s*\(([^)]+)\)/gi),
  ].flatMap((match, fk_id) => {
    const childColumns = match[1].split(',').map((column) => column.trim().replaceAll('"', ''));
    const parentColumns = match[3].split(',').map((column) => column.trim().replaceAll('"', ''));
    return childColumns.map((child_column, seq) => ({
      child: name,
      parent: match[2],
      fk_id,
      seq,
      child_column,
      parent_column: parentColumns[seq],
    }));
  }),
);

const controlSchemas = {
  data_backups:
    'id,tenant_id,idempotency_key,format_version,registry_version,schema_version,snapshot_epoch,status,global_hash,plaintext_size_bytes,ciphertext_size_bytes,chunk_count,object_count,wrapped_dek,kek_version,manifest_r2_key,multipart_upload_ref,error_code,error_ref,created_by_user_id,created_at,ready_at,expires_at,deleted_at',
  data_backup_chunks:
    'id,tenant_id,backup_id,table_name,ordinal,row_count,plaintext_size_bytes,ciphertext_size_bytes,plaintext_hash,ciphertext_hash,nonce,auth_tag,r2_key,multipart_part_ref,created_at',
  data_backup_objects:
    'id,tenant_id,backup_id,ordinal,source_r2_key,backup_r2_key,source_etag,plaintext_size_bytes,ciphertext_size_bytes,plaintext_hash,ciphertext_hash,nonce,auth_tag,created_at',
  data_backup_table_manifests:
    'id,tenant_id,backup_id,table_name,classification,pk_json,columns_json,row_count,plaintext_size_bytes,chunk_count,table_hash,created_at',
  restore_dry_runs:
    'id,tenant_id,backup_id,idempotency_key,status,source_global_hash,diff_hash,diff_r2_key,insert_count,update_count,conflict_count,missing_object_count,error_code,error_ref,requested_by_user_id,created_at,completed_at',
  tenant_data_epochs: 'tenant_id,epoch,updated_at',
};
for (const [table, names] of Object.entries(controlSchemas)) {
  if (columns.some((column) => column.table_name === table)) continue;
  names.split(',').forEach((column_name, cid) =>
    columns.push({
      table_name: table,
      column_name,
      pk_position:
        (table === 'tenant_data_epochs' && column_name === 'tenant_id') ||
        (table !== 'tenant_data_epochs' && column_name === 'id')
          ? 1
          : 0,
      cid,
    }),
  );
}

const byTable = new Map();
for (const column of columns) {
  const table = byTable.get(column.table_name) ?? { columns: [], primaryKey: [] };
  table.columns.push(column.column_name);
  if (column.pk_position > 0) {
    table.primaryKey[column.pk_position - 1] = column.column_name;
  }
  byTable.set(column.table_name, table);
}

const fkGroups = new Map();
for (const foreignKey of foreignKeys) {
  const key = `${foreignKey.child}\0${foreignKey.fk_id}`;
  const group = fkGroups.get(key) ?? {
    child: foreignKey.child,
    parent: foreignKey.parent,
    pairs: [],
  };
  group.pairs.push([foreignKey.child_column, foreignKey.parent_column]);
  fkGroups.set(key, group);
}

const paths = new Map();
for (const [name, table] of byTable) {
  if (table.columns.includes('tenant_id')) paths.set(name, []);
}
paths.set('tenants', []);
let progressed = true;
while (progressed) {
  progressed = false;
  for (const group of fkGroups.values()) {
    if (paths.has(group.child) || !paths.has(group.parent)) continue;
    paths.set(group.child, [group, ...paths.get(group.parent)]);
    progressed = true;
  }
}

const secret = new Set(['api_keys', 'authorization_tokens', 'users', 'webhook_endpoints']);
const derived = new Set(['daily_financial_rollups', 'daily_product_rollups']);
const ephemeral = new Set([
  'billing_overages',
  'data_backup_chunks',
  'data_backup_objects',
  'data_backup_table_manifests',
  'data_backups',
  'fiscal_outbox',
  'fiscal_owner_alerts',
  'growth_events',
  'loyalty_reservations',
  'pos_terminal_sessions',
  'push_subscriptions',
  'restore_dry_runs',
  'serial_terminal_leases',
  'tenant_data_epochs',
  'usage_counters',
  'usage_events',
  'webhook_deliveries',
  'webhook_events',
]);

const quote = (identifier) => `"${identifier.replaceAll('"', '""')}"`;
const registry = [];
for (const name of [...paths.keys()].sort()) {
  if (name === 'schema_meta' || name === 'atomic_guards') continue;
  const table = byTable.get(name);
  if (!table) continue;
  const classification = secret.has(name)
    ? 'SECRET'
    : derived.has(name)
      ? 'DERIVED'
      : ephemeral.has(name)
        ? 'EPHEMERAL'
        : 'BUSINESS';
  const path = paths.get(name);
  const joins = [];
  let currentAlias = 't0';
  path.forEach((edge, index) => {
    const parentAlias = `t${index + 1}`;
    joins.push(
      `JOIN ${quote(edge.parent)} AS ${parentAlias} ON ${edge.pairs
        .map(
          ([childColumn, parentColumn]) =>
            `${currentAlias}.${quote(childColumn)} = ${parentAlias}.${quote(parentColumn)}`,
        )
        .join(' AND ')}`,
    );
    currentAlias = parentAlias;
  });
  const tenantPredicate =
    name === 'tenants' ? 't0."id" = ?' : `${currentAlias}.${quote('tenant_id')} = ?`;
  const base = {
    name,
    classification,
    primaryKey: table.primaryKey,
    columns: table.columns,
    r2References: table.columns.filter((column) => column.endsWith('_r2_key')),
    tenantFrom: `${quote(name)} AS t0${joins.length ? ` ${joins.join(' ')}` : ''}`,
    tenantPredicate,
    tenantVia: path.map((edge) => edge.parent),
  };
  registry.push(
    classification === 'BUSINESS'
      ? base
      : {
          ...base,
          reason:
            classification === 'SECRET'
              ? 'contains credential or authentication material'
              : classification === 'DERIVED'
                ? 'rebuildable from authoritative business records'
                : 'operational control-plane state',
        },
  );
}

const generatedModule = `/* Generated by test/generate-data-backup-schema.mjs; do not hand edit. */
/* eslint-disable no-secrets/no-secrets -- generated schema identifiers */
import type { BackupClassification } from '@kipuspay/domain-integrations';

export interface D1BackupTableRegistryEntry {
  readonly name: string;
  readonly classification: BackupClassification;
  readonly primaryKey: readonly string[];
  readonly columns: readonly string[];
  readonly r2References: readonly string[];
  readonly tenantFrom: string;
  readonly tenantPredicate: string;
  readonly tenantVia: readonly string[];
  readonly reason?: string;
}

export const D1_BACKUP_REGISTRY_VERSION = 'registry-1';
export const D1_BACKUP_TABLES: readonly D1BackupTableRegistryEntry[] = ${JSON.stringify(registry, null, 2)};
`;
writeFileSync(
  new URL('../src/data-backup-registry.generated.ts', import.meta.url),
  generatedModule,
);

// Registry follows the latest schema, while migration 0035 must remain replayable
// before tables introduced by later sprints exist. Later migrations own their
// corresponding epoch triggers.
const introducedAfterSprint42 = new Set([
  'customer_order_fulfillments',
  'customer_order_items',
  'customer_order_notifications',
  'customer_orders',
]);
const epochTables = registry.filter(
  (entry) =>
    (entry.classification === 'BUSINESS' || entry.classification === 'DERIVED') &&
    entry.name !== 'tenants' &&
    !introducedAfterSprint42.has(entry.name),
);
const triggerTenantExpression = (entry, row) => {
  if (entry.tenantVia.length === 0) return `${row}.${quote('tenant_id')}`;
  const pkWhere = entry.primaryKey
    .map((column) => `t0.${quote(column)} = ${row}.${quote(column)}`)
    .join(' AND ');
  return `(SELECT ${entry.tenantPredicate.replace(' = ?', '')} FROM ${entry.tenantFrom} WHERE ${pkWhere})`;
};
const epochTriggers = epochTables
  .flatMap((entry) => {
    const prefix = `backup_epoch_${entry.name}`;
    const insertTenant = triggerTenantExpression(entry, 'NEW');
    const deleteTenant = triggerTenantExpression(entry, 'OLD');
    return [
      `CREATE TRIGGER ${prefix}_insert AFTER INSERT ON ${quote(entry.name)} BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ${insertTenant}; END;`,
      `CREATE TRIGGER ${prefix}_update AFTER UPDATE ON ${quote(entry.name)} BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ${insertTenant}; END;`,
      `CREATE TRIGGER ${prefix}_delete BEFORE DELETE ON ${quote(entry.name)} BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ${deleteTenant}; END;`,
    ];
  })
  .join('\n');

const up = `-- Generated canonical Sprint 42 backup schema (ADR-0026 / DAT-12).
CREATE TABLE data_backups (
  id TEXT PRIMARY KEY NOT NULL, tenant_id TEXT NOT NULL, idempotency_key TEXT NOT NULL,
  format_version TEXT NOT NULL, registry_version TEXT NOT NULL, schema_version TEXT NOT NULL,
  snapshot_epoch INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING', global_hash TEXT,
  plaintext_size_bytes INTEGER, ciphertext_size_bytes INTEGER, chunk_count INTEGER NOT NULL DEFAULT 0,
  object_count INTEGER NOT NULL DEFAULT 0, wrapped_dek BLOB, kek_version TEXT, manifest_r2_key TEXT,
  multipart_upload_ref TEXT, error_code TEXT, error_ref TEXT, created_by_user_id TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, ready_at DATETIME, expires_at DATETIME,
  deleted_at DATETIME, UNIQUE (tenant_id, id), UNIQUE (tenant_id, idempotency_key),
  CHECK (format_version = 'KPBK1'),
  CHECK (status IN ('PENDING','SNAPSHOTTING','UPLOADING','READY','FAILED','DELETING','DELETED')),
  CHECK (snapshot_epoch >= 0), CHECK (chunk_count >= 0 AND object_count >= 0),
  CHECK (plaintext_size_bytes IS NULL OR plaintext_size_bytes >= 0),
  CHECK (ciphertext_size_bytes IS NULL OR ciphertext_size_bytes >= 0),
  CHECK (global_hash IS NULL OR (length(global_hash) = 64 AND global_hash NOT GLOB '*[^0-9a-f]*')),
  CHECK ((status = 'READY' AND global_hash IS NOT NULL AND wrapped_dek IS NOT NULL AND kek_version IS NOT NULL AND manifest_r2_key IS NOT NULL AND ready_at IS NOT NULL) OR status <> 'READY'),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (tenant_id, created_by_user_id) REFERENCES users(tenant_id, id)
);
CREATE TABLE data_backup_chunks (
  id TEXT PRIMARY KEY NOT NULL, tenant_id TEXT NOT NULL, backup_id TEXT NOT NULL,
  table_name TEXT NOT NULL, ordinal INTEGER NOT NULL, row_count INTEGER NOT NULL,
  plaintext_size_bytes INTEGER NOT NULL, ciphertext_size_bytes INTEGER NOT NULL,
  plaintext_hash TEXT NOT NULL, ciphertext_hash TEXT NOT NULL, nonce BLOB NOT NULL,
  auth_tag BLOB NOT NULL, r2_key TEXT NOT NULL, multipart_part_ref TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, backup_id, table_name, ordinal), UNIQUE (tenant_id, backup_id, nonce),
  CHECK (ordinal >= 0 AND row_count >= 0), CHECK (plaintext_size_bytes BETWEEN 0 AND 4194304),
  CHECK (ciphertext_size_bytes >= 0),
  CHECK (length(plaintext_hash) = 64 AND length(ciphertext_hash) = 64),
  CHECK (length(nonce) = 12), CHECK (length(auth_tag) = 16),
  FOREIGN KEY (tenant_id, backup_id) REFERENCES data_backups(tenant_id, id)
);
CREATE TABLE data_backup_objects (
  id TEXT PRIMARY KEY NOT NULL, tenant_id TEXT NOT NULL, backup_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL, source_r2_key TEXT NOT NULL, backup_r2_key TEXT NOT NULL,
  source_etag TEXT, plaintext_size_bytes INTEGER NOT NULL, ciphertext_size_bytes INTEGER NOT NULL,
  plaintext_hash TEXT NOT NULL, ciphertext_hash TEXT NOT NULL, nonce BLOB NOT NULL,
  auth_tag BLOB NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, backup_id, ordinal),
  UNIQUE (tenant_id, backup_id, source_r2_key), UNIQUE (tenant_id, backup_id, nonce),
  CHECK (ordinal >= 0 AND plaintext_size_bytes >= 0 AND ciphertext_size_bytes >= 0),
  CHECK (length(plaintext_hash) = 64 AND length(ciphertext_hash) = 64),
  CHECK (length(nonce) = 12), CHECK (length(auth_tag) = 16),
  FOREIGN KEY (tenant_id, backup_id) REFERENCES data_backups(tenant_id, id)
);
CREATE TABLE data_backup_table_manifests (
  id TEXT PRIMARY KEY NOT NULL, tenant_id TEXT NOT NULL, backup_id TEXT NOT NULL,
  table_name TEXT NOT NULL, classification TEXT NOT NULL, pk_json TEXT NOT NULL,
  columns_json TEXT NOT NULL, row_count INTEGER NOT NULL, plaintext_size_bytes INTEGER NOT NULL,
  chunk_count INTEGER NOT NULL, table_hash TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, backup_id, table_name), CHECK (classification = 'BUSINESS'),
  CHECK (row_count >= 0 AND plaintext_size_bytes >= 0 AND chunk_count >= 0),
  CHECK (length(table_hash) = 64),
  FOREIGN KEY (tenant_id, backup_id) REFERENCES data_backups(tenant_id, id)
);
CREATE TABLE restore_dry_runs (
  id TEXT PRIMARY KEY NOT NULL, tenant_id TEXT NOT NULL, backup_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING',
  source_global_hash TEXT, diff_hash TEXT, diff_r2_key TEXT,
  insert_count INTEGER NOT NULL DEFAULT 0, update_count INTEGER NOT NULL DEFAULT 0,
  conflict_count INTEGER NOT NULL DEFAULT 0, missing_object_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT, error_ref TEXT, requested_by_user_id TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, completed_at DATETIME,
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, idempotency_key),
  CHECK (status IN ('PENDING','RUNNING','PASSED','FAILED')),
  CHECK (insert_count >= 0 AND update_count >= 0 AND conflict_count >= 0 AND missing_object_count >= 0),
  CHECK (source_global_hash IS NULL OR length(source_global_hash) = 64),
  CHECK (diff_hash IS NULL OR length(diff_hash) = 64),
  FOREIGN KEY (tenant_id, backup_id) REFERENCES data_backups(tenant_id, id),
  FOREIGN KEY (tenant_id, requested_by_user_id) REFERENCES users(tenant_id, id)
);
CREATE TABLE tenant_data_epochs (
  tenant_id TEXT PRIMARY KEY NOT NULL, epoch INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, CHECK (epoch >= 0),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE INDEX idx_data_backups_lifecycle ON data_backups(tenant_id, status, created_at);
CREATE INDEX idx_data_backups_expiry ON data_backups(status, expires_at);
CREATE INDEX idx_backup_chunks_backup ON data_backup_chunks(tenant_id, backup_id, table_name, ordinal);
CREATE INDEX idx_backup_objects_backup ON data_backup_objects(tenant_id, backup_id, ordinal);
CREATE INDEX idx_restore_dry_runs_backup ON restore_dry_runs(tenant_id, backup_id, created_at);
CREATE TRIGGER backup_epoch_tenants_insert AFTER INSERT ON tenants BEGIN
  INSERT OR IGNORE INTO tenant_data_epochs(tenant_id, epoch) VALUES (NEW.id, 0);
END;
CREATE TRIGGER backup_manifests_ready_no_update BEFORE UPDATE ON data_backup_table_manifests
WHEN EXISTS (SELECT 1 FROM data_backups b WHERE b.tenant_id = OLD.tenant_id AND b.id = OLD.backup_id AND b.status = 'READY')
BEGIN SELECT RAISE(ABORT, 'BACKUP_READY_MANIFEST_IMMUTABLE'); END;
CREATE TRIGGER backup_manifests_ready_no_delete BEFORE DELETE ON data_backup_table_manifests
WHEN EXISTS (SELECT 1 FROM data_backups b WHERE b.tenant_id = OLD.tenant_id AND b.id = OLD.backup_id AND b.status = 'READY')
BEGIN SELECT RAISE(ABORT, 'BACKUP_READY_MANIFEST_IMMUTABLE'); END;
${epochTriggers}
INSERT INTO schema_meta(key, value) VALUES ('data.backup.sprint42', '1');
`;
writeFileSync(new URL('../migrations/0035_sprint42_data_backup.sql', import.meta.url), up);

const triggerDrops = epochTables
  .flatMap((entry) =>
    ['insert', 'update', 'delete'].map(
      (kind) => `DROP TRIGGER IF EXISTS backup_epoch_${entry.name}_${kind};`,
    ),
  )
  .join('\n');
const down = `INSERT /* BACKUP_DOWN_PROTECTED: RAISE(ABORT via atomic_guards CHECK) */ INTO atomic_guards(id, ok) SELECT 'data.backup.sprint42.down', CASE WHEN EXISTS (SELECT 1 FROM data_backups WHERE status <> 'DELETED') OR EXISTS (SELECT 1 FROM restore_dry_runs) OR EXISTS (SELECT 1 FROM data_backup_chunks) OR EXISTS (SELECT 1 FROM data_backup_objects) THEN 0 ELSE 1 END;
DROP TRIGGER IF EXISTS backup_manifests_ready_no_delete;
DROP TRIGGER IF EXISTS backup_manifests_ready_no_update;
DROP TRIGGER IF EXISTS backup_epoch_tenants_insert;
${triggerDrops}
DROP INDEX IF EXISTS idx_restore_dry_runs_backup;
DROP INDEX IF EXISTS idx_backup_objects_backup;
DROP INDEX IF EXISTS idx_backup_chunks_backup;
DROP INDEX IF EXISTS idx_data_backups_expiry;
DROP INDEX IF EXISTS idx_data_backups_lifecycle;
DROP TABLE data_backup_table_manifests;
DROP TABLE restore_dry_runs;
DROP TABLE data_backup_objects;
DROP TABLE data_backup_chunks;
DROP TABLE data_backups;
DROP TABLE tenant_data_epochs;
DELETE FROM schema_meta WHERE key = 'data.backup.sprint42';
DELETE FROM atomic_guards WHERE id = 'data.backup.sprint42.down';
`;
writeFileSync(new URL('../migrations-down/0035_sprint42_data_backup.sql', import.meta.url), down);
execFileSync(
  'pnpm',
  [
    'exec',
    'prettier',
    '--write',
    'src/data-backup-registry.generated.ts',
    'test/generate-data-backup-schema.mjs',
  ],
  { cwd: new URL('..', import.meta.url), stdio: 'ignore' },
);
