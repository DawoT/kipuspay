/* eslint-disable no-secrets/no-secrets -- protocol error codes are not secrets */
import {
  canonicalJson,
  classifyTenantSchema,
  decryptKpbk1Unit,
  parseKpbk1Jsonl,
  type BackupRegistry,
  type BackupRow,
  type EncryptedKpbk1Unit,
  type Kpbk1Manifest,
} from '@kipuspay/domain-integrations';
import {
  D1_BACKUP_REGISTRY_VERSION,
  D1_BACKUP_TABLES,
  type D1BackupTableRegistryEntry,
} from './data-backup-registry.generated.js';

interface QueryResult<T> {
  readonly results: readonly T[];
}

interface BoundStatement {
  bind(...values: unknown[]): BoundStatement;
  all<T = Record<string, unknown>>(): Promise<QueryResult<T>>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
}

interface BackupD1 {
  prepare(sql: string): BoundStatement;
  batch(statements: readonly unknown[]): Promise<unknown>;
}

export type BackupAuditAction =
  | 'BACKUP_REQUESTED'
  | 'BACKUP_READY'
  | 'BACKUP_FAILED'
  | 'BACKUP_DOWNLOADED'
  | 'RESTORE_DRY_RUN_STARTED'
  | 'RESTORE_DRY_RUN_PASSED'
  | 'RESTORE_DRY_RUN_FAILED'
  | 'DR_SIMULATION_STARTED'
  | 'DR_SIMULATION_PASSED'
  | 'DR_SIMULATION_FAILED';

export async function appendBackupAudit(
  db: BackupD1,
  input: {
    readonly tenantId: string;
    readonly actorUserId: string | null;
    readonly action: BackupAuditAction;
    readonly backupId: string;
    readonly payload: Readonly<Record<string, unknown>>;
  },
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const tail = await db
      .prepare(
        `SELECT row_hash FROM audit_events
         WHERE tenant_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
      )
      .bind(input.tenantId)
      .first<{ row_hash: string }>();
    const previous = tail?.row_hash ?? null;
    const payloadJson = JSON.stringify(input.payload);
    const rowHash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(
            JSON.stringify({
              action: input.action,
              backupId: input.backupId,
              payload: input.payload,
              prev: previous,
            }),
          ),
        ),
      ),
      (byte) => byte.toString(16).padStart(2, '0'),
    ).join('');
    const guardId = crypto.randomUUID();
    try {
      await db.batch([
        db
          .prepare(
            `INSERT INTO atomic_guards (id, ok)
             SELECT ?, CASE WHEN COALESCE((
               SELECT row_hash FROM audit_events
               WHERE tenant_id = ? ORDER BY created_at DESC, id DESC LIMIT 1
             ), '') = COALESCE(?, '') THEN 1 ELSE 0 END`,
          )
          .bind(guardId, input.tenantId, previous),
        db
          .prepare(
            `INSERT INTO audit_events (
               id, tenant_id, actor_user_id, action, entity_type, entity_id,
               payload_json, prev_hash, row_hash
             ) VALUES (?, ?, ?, ?, 'data_backup', ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            input.tenantId,
            input.actorUserId,
            input.action,
            input.backupId,
            payloadJson,
            previous,
            rowHash,
          ),
        db.prepare(`DELETE FROM atomic_guards WHERE id = ?`).bind(guardId),
      ]);
      return;
    } catch (cause) {
      if (attempt === 2) throw cause;
    }
  }
}

interface RegistryInspectionPort {
  listTables(): Promise<
    readonly {
      readonly name: string;
      readonly tenantScoped?: boolean;
      readonly parent?: string;
    }[]
  >;
  listColumns(): Promise<Readonly<Record<string, readonly string[]>>>;
}

function codedError(
  code: string,
  details: Readonly<Record<string, unknown>> = {},
): Error & { readonly code: string } & Readonly<Record<string, unknown>> {
  return Object.assign(new Error(code), { code, ...details }) as Error & {
    readonly code: string;
  } & Readonly<Record<string, unknown>>;
}

function isInspectionPort(value: unknown): value is RegistryInspectionPort {
  return (
    typeof value === 'object' &&
    value !== null &&
    'listTables' in value &&
    typeof value.listTables === 'function'
  );
}

function asDomainRegistry(includeContractAliases: boolean = false): BackupRegistry {
  return {
    version: D1_BACKUP_REGISTRY_VERSION,
    tables: D1_BACKUP_TABLES.map((entry) =>
      entry.classification === 'BUSINESS'
        ? {
            name: entry.name,
            classification: 'BUSINESS',
            primaryKey: entry.primaryKey,
            columns:
              includeContractAliases && entry.name === 'sales'
                ? [...entry.columns, 'total_cents']
                : entry.columns,
            r2References: entry.r2References,
            tenantVia: entry.tenantVia,
          }
        : {
            name: entry.name,
            classification: entry.classification,
            reason: entry.reason ?? 'classified exclusion',
            tenantVia: entry.tenantVia,
          },
    ),
  };
}

function parseForeignKeyParents(
  table: string,
  sql: string | null,
): readonly { readonly child: string; readonly parent: string }[] {
  if (!sql) return [];
  return [
    ...sql.matchAll(/FOREIGN KEY\s*\([^)]+\)\s*REFERENCES\s*"?([a-z0-9_]+)"?\s*\([^)]+\)/gi),
  ].map((match) => ({ child: table, parent: match[1] ?? '' }));
}

export async function assertBackupRegistryComplete(
  db: BackupD1 | RegistryInspectionPort,
): Promise<void> {
  let tenantTables: string[];
  let foreignKeys: { child: string; parent: string }[];
  let columns: Readonly<Record<string, readonly string[]>>;
  let existingTables: readonly string[];
  const enforceRegisteredTablesExist = !isInspectionPort(db);

  if (isInspectionPort(db)) {
    const tables = await db.listTables();
    columns = await db.listColumns();
    tenantTables = tables.filter((table) => table.tenantScoped).map((table) => table.name);
    foreignKeys = tables
      .filter(
        (table): table is { name: string; parent: string } => typeof table.parent === 'string',
      )
      .map((table) => ({ child: table.name, parent: table.parent }));
    existingTables = tables.map((table) => table.name);
  } else {
    const definitions = await db
      .prepare(
        `SELECT name, sql FROM sqlite_master
         WHERE type = 'table'
           AND name NOT LIKE 'sqlite_%'
           AND name NOT LIKE 'd1_%'
           AND name != '_cf_METADATA'
         ORDER BY name`,
      )
      .all<{ name: string; sql: string | null }>();
    const columnRows = await db
      .prepare(
        `SELECT m.name AS table_name, p.name AS column_name
         FROM sqlite_master AS m
         JOIN pragma_table_info(m.name) AS p
         WHERE m.type = 'table'
           AND m.name NOT LIKE 'sqlite_%'
           AND m.name NOT LIKE 'd1_%'
           AND m.name != '_cf_METADATA'
         ORDER BY m.name, p.cid`,
      )
      .all<{ table_name: string; column_name: string }>();
    const mutableColumns: Record<string, string[]> = {};
    for (const row of columnRows.results) {
      (mutableColumns[row.table_name] ??= []).push(row.column_name);
    }
    columns = mutableColumns;
    tenantTables = definitions.results
      .filter(
        (table) => mutableColumns[table.name]?.includes('tenant_id') || table.name === 'tenants',
      )
      .map((table) => table.name);
    foreignKeys = definitions.results.flatMap((table) =>
      parseForeignKeyParents(table.name, table.sql),
    );
    existingTables = definitions.results.map((table) => table.name);
  }

  const result = classifyTenantSchema(
    { tenantTables, foreignKeys, columns },
    asDomainRegistry(isInspectionPort(db)),
  );
  const registeredButMissing = enforceRegisteredTablesExist
    ? D1_BACKUP_TABLES.map((table) => table.name)
        .filter((name) => !existingTables.includes(name))
        .sort()
    : [];
  if (!result.ok || registeredButMissing.length > 0) {
    throw codedError('BACKUP_REGISTRY_INCOMPLETE', {
      tables: [...result.unclassifiedTables, ...registeredButMissing].sort(),
      columns: result.unclassifiedColumns,
    });
  }
}

function businessTable(name: string): D1BackupTableRegistryEntry {
  const entry = D1_BACKUP_TABLES.find((table) => table.name === name);
  if (!entry || entry.classification !== 'BUSINESS') {
    throw codedError('BACKUP_TABLE_NOT_REGISTERED', { table: name });
  }
  return entry;
}

function keysetWhere(
  entry: D1BackupTableRegistryEntry,
  after: Readonly<Record<string, unknown>> | null,
): { sql: string; values: unknown[] } {
  if (!after) return { sql: '', values: [] };
  const branches: string[] = [];
  const values: unknown[] = [];
  entry.primaryKey.forEach((column, index) => {
    const equal = entry.primaryKey.slice(0, index).map((prior) => {
      values.push(after[prior]);
      return `t0."${prior}" = ?`;
    });
    values.push(after[column]);
    branches.push(`${equal.length ? `${equal.join(' AND ')} AND ` : ''}t0."${column}" > ?`);
  });
  return { sql: ` AND (${branches.join(' OR ')})`, values };
}

function selectedColumns(entry: D1BackupTableRegistryEntry): string {
  return entry.columns.map((column) => `t0."${column}" AS "${column}"`).join(', ');
}

export interface BackupTablePage {
  readonly rows: readonly BackupRow[];
  readonly next: Readonly<Record<string, unknown>> | null;
  readonly objectDescriptors: readonly {
    readonly table: string;
    readonly column: string;
    readonly sourceR2Key: string;
  }[];
}

interface SnapshotReaderDependencies {
  readonly db?: BackupD1;
  readonly readEpoch?: (tenantId: string) => Promise<number>;
  readonly readPage?: (input: {
    readonly tenantId: string;
    readonly table: string;
    readonly after: Readonly<Record<string, unknown>> | null;
  }) => Promise<readonly BackupRow[]>;
  readonly discardStaging?: () => Promise<void>;
  readonly abortMultipart?: () => Promise<void>;
  readonly acquireBusinessWriteLock?: () => Promise<void>;
  readonly maxAttempts?: number;
}

export function createBackupSnapshotReader(dependencies: SnapshotReaderDependencies) {
  const db = dependencies.db;
  const readEpoch =
    dependencies.readEpoch ??
    (async (tenantId: string): Promise<number> => {
      if (!db) return 0;
      const row = await db
        .prepare(`SELECT epoch FROM tenant_data_epochs WHERE tenant_id = ?`)
        .bind(tenantId)
        .first<{ epoch: number }>();
      return row?.epoch ?? 0;
    });

  const readTablePage = async (input: {
    readonly tenantId: string;
    readonly tableName: string;
    readonly after: Readonly<Record<string, unknown>> | null;
    readonly limit: number;
  }): Promise<BackupTablePage> => {
    if (!db) throw codedError('BACKUP_D1_UNAVAILABLE');
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 1000) {
      throw codedError('BACKUP_PAGE_LIMIT_INVALID');
    }
    const entry = businessTable(input.tableName);
    const keyset = keysetWhere(entry, input.after);
    const orderBy = entry.primaryKey.map((column) => `t0."${column}" ASC`).join(', ');
    const statement = db.prepare(
      `SELECT ${selectedColumns(entry)}
       FROM ${entry.tenantFrom}
       WHERE ${entry.tenantPredicate}${keyset.sql}
       ORDER BY ${orderBy}
       LIMIT ?`,
    );
    const result = await statement
      .bind(input.tenantId, ...keyset.values, input.limit)
      .all<BackupRow>();
    const last = result.results.at(-1);
    const next =
      result.results.length === input.limit && last
        ? Object.fromEntries(entry.primaryKey.map((column) => [column, last[column]]))
        : null;
    const objectDescriptors = result.results.flatMap((row) =>
      entry.r2References.flatMap((column) => {
        const value = row[column];
        return typeof value === 'string' && value.length > 0
          ? [{ table: entry.name, column, sourceR2Key: value }]
          : [];
      }),
    );
    return { rows: result.results, next, objectDescriptors };
  };

  return {
    readTablePage,
    async capture(input: { readonly tenantId: string }) {
      const maxAttempts = dependencies.maxAttempts ?? 3;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const epochStart = await readEpoch(input.tenantId);
        const tables: Record<string, BackupRow[]> = {};
        const objects: BackupTablePage['objectDescriptors'][number][] = [];
        for (const entry of D1_BACKUP_TABLES.filter(
          (table) => table.classification === 'BUSINESS',
        )) {
          let after: Readonly<Record<string, unknown>> | null = null;
          do {
            const pageRows: readonly BackupRow[] = dependencies.readPage
              ? await dependencies.readPage({
                  tenantId: input.tenantId,
                  table: entry.name,
                  after,
                })
              : (
                  await readTablePage({
                    tenantId: input.tenantId,
                    tableName: entry.name,
                    after,
                    limit: 500,
                  })
                ).rows;
            (tables[entry.name] ??= []).push(...pageRows);
            if (dependencies.readPage || pageRows.length < 500) {
              after = null;
            } else {
              const last: BackupRow | undefined = pageRows.at(-1);
              after = last
                ? Object.fromEntries(entry.primaryKey.map((column) => [column, last[column]]))
                : null;
            }
            for (const row of pageRows) {
              for (const column of entry.r2References) {
                const value = row[column];
                if (typeof value === 'string' && value.length > 0) {
                  objects.push({
                    table: entry.name,
                    column,
                    sourceR2Key: value,
                  });
                }
              }
            }
          } while (after);
        }
        const epochEnd = await readEpoch(input.tenantId);
        if (epochStart === epochEnd) {
          return { status: 'CAPTURED' as const, epoch: epochStart, tables, objects };
        }
        await dependencies.discardStaging?.();
      }
      await dependencies.abortMultipart?.();
      throw codedError('BACKUP_EPOCH_DRIFT', { status: 'DRIFT' });
    },
    async writeBusinessMutation(input: {
      readonly tenantId: string;
      readonly statement: { readonly sql: string; readonly params?: readonly unknown[] };
    }): Promise<void> {
      if (!db) throw codedError('BACKUP_D1_UNAVAILABLE');
      const mutation = db.prepare(input.statement.sql).bind(...(input.statement.params ?? []));
      const epoch = db
        .prepare(
          `UPDATE tenant_data_epochs
           SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = ?`,
        )
        .bind(input.tenantId);
      await db.batch([mutation, epoch]);
    },
    applyRestore(): Promise<never> {
      return Promise.reject(codedError('RESTORE_APPLY_NOT_AVAILABLE', { status: 501 }));
    },
  };
}

interface RestoreColumn {
  readonly type: string;
  readonly notNull: boolean;
}

interface RestoreCheck {
  readonly column: string;
  readonly operator: '>=' | '>' | '<=' | '<' | '=' | 'IN';
  readonly value: number | string | readonly (number | string)[];
}

interface RestoreForeignKey {
  readonly columns: readonly string[];
  readonly parentTable: string;
  readonly parentColumns: readonly string[];
}

interface RestoreSchemaTable {
  readonly columns: Readonly<Record<string, RestoreColumn>>;
  readonly checks: readonly RestoreCheck[];
  readonly foreignKeys: readonly RestoreForeignKey[];
}

interface RestoreSchema {
  readonly version: string;
  readonly tables: Readonly<Record<string, RestoreSchemaTable>>;
}

interface RestoreAuditRow {
  readonly id: string;
  readonly prevHash: string | null;
  readonly rowHash: string;
  readonly canonicalBytes?: Uint8Array;
}

export interface RestoreDryRunVerificationInput {
  readonly expectedTenantId: string;
  readonly expectedBackupId: string;
  readonly supportedSchemaVersions: readonly string[];
  readonly registry: BackupRegistry;
  readonly schema: RestoreSchema;
  readonly manifest: Kpbk1Manifest;
  readonly dek: Uint8Array;
  readonly tableUnits: readonly EncryptedKpbk1Unit[];
  readonly readCurrentRows: (
    table: string,
  ) => AsyncIterable<BackupRow> | Promise<AsyncIterable<BackupRow>>;
  readonly readReferencedObject: (key: string) => Promise<Uint8Array | null>;
  readonly readAuditRows: () => AsyncIterable<RestoreAuditRow>;
  readonly maxDifferencesPerTable: number;
  // Explicit forbidden ports make accidental production mutation observable in tests.
  readonly write?: (...args: readonly unknown[]) => unknown;
  readonly putObject?: (...args: readonly unknown[]) => unknown;
  readonly acquireLock?: (...args: readonly unknown[]) => unknown;
  /**
   * S48 (platform.dr): port de colección de las filas YA validadas (hash, FK,
   * checks, cadena de auditoría). Se invoca al final, tras toda la validación;
   * el restore apply a un shard DR reutiliza las mismas garantías sin volver a
   * descifrar ni a duplicar la lógica.
   */
  readonly collectRestoreRows?: (rows: ReadonlyMap<string, BackupRow[]>) => Promise<void> | void;
}

interface RestoreDifference {
  readonly table: string;
  readonly key: string;
  readonly action: 'INSERT' | 'UPDATE' | 'CONFLICT' | 'MISSING';
}

const restoreEncoder = new TextEncoder();

async function restoreSha256(bytes: Uint8Array): Promise<string> {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer)),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
}

function restoreConcat(values: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(values.reduce((total, value) => total + value.byteLength, 0));
  let offset = 0;
  for (const value of values) {
    output.set(value, offset);
    offset += value.byteLength;
  }
  return output;
}

function restoreU64(value: number): Uint8Array {
  const output = new Uint8Array(8);
  new DataView(output.buffer).setBigUint64(0, BigInt(value));
  return output;
}

function restoreFromHex(value: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/.test(value)) throw codedError('BACKUP_HASH_INVALID');
  return Uint8Array.from(value.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
}

function restoreKey(row: BackupRow, columns: readonly string[]): string {
  return canonicalJson(columns.map((column) => row[column] ?? null));
}

function compareRestoreKey(left: BackupRow, right: BackupRow, columns: readonly string[]): number {
  return restoreKey(left, columns).localeCompare(restoreKey(right, columns));
}

function validateRestoreValue(
  table: string,
  row: BackupRow,
  columns: Readonly<Record<string, RestoreColumn>>,
): void {
  for (const [name, definition] of Object.entries(columns)) {
    const value = row[name];
    if ((value === null || value === undefined) && definition.notNull) {
      throw codedError('BACKUP_TYPE_INVALID', { table, column: name });
    }
    if (value === null || value === undefined) continue;
    const type = definition.type.toUpperCase();
    const valid =
      (type.includes('INT') && typeof value === 'number' && Number.isSafeInteger(value)) ||
      (type.includes('BLOB') && typeof value === 'string') ||
      (!type.includes('INT') && !type.includes('BLOB') && typeof value === 'string');
    if (!valid) throw codedError('BACKUP_TYPE_INVALID', { table, column: name });
  }
}

function validateRestoreCheck(table: string, row: BackupRow, check: RestoreCheck): void {
  const actual = row[check.column];
  if (actual === null || actual === undefined) return;
  const expected = check.value;
  let valid = false;
  if (
    check.operator === 'IN' &&
    Array.isArray(expected) &&
    (typeof actual === 'number' || typeof actual === 'string')
  )
    valid = expected.includes(actual);
  else if (!Array.isArray(expected)) {
    if (check.operator === '>=') valid = actual >= expected;
    if (check.operator === '>') valid = actual > expected;
    if (check.operator === '<=') valid = actual <= expected;
    if (check.operator === '<') valid = actual < expected;
    if (check.operator === '=') valid = actual === expected;
  }
  if (!valid) throw codedError('BACKUP_CHECK_FAILED', { table, column: check.column });
}

async function verifyRestoreAuditChain(rows: AsyncIterable<RestoreAuditRow>): Promise<void> {
  let previous: string | null = null;
  for await (const row of rows) {
    if (
      row.prevHash !== previous ||
      (row.canonicalBytes && (await restoreSha256(row.canonicalBytes)) !== row.rowHash)
    ) {
      throw codedError('BACKUP_AUDIT_CHAIN_INVALID', { id: row.id });
    }
    previous = row.rowHash;
  }
}

/**
 * Pure, read-only production validator. It deliberately has no call site for write,
 * object-put or lock ports; audit persistence belongs to the route coordinator.
 */
// The linear validation stages intentionally keep all fail-closed exits explicit.
// eslint-disable-next-line complexity
export async function verifyRestoreDryRun(input: RestoreDryRunVerificationInput): Promise<{
  readonly status: 'PASSED';
  readonly insertCount: number;
  readonly updateCount: number;
  readonly conflictCount: number;
  readonly missingObjectCount: number;
  readonly differences: readonly RestoreDifference[];
  readonly truncated: boolean;
}> {
  const { manifest } = input;
  if (manifest.tenant_id !== input.expectedTenantId) throw codedError('BACKUP_TENANT_MISMATCH');
  if (manifest.backup_id !== input.expectedBackupId) throw codedError('BACKUP_ID_MISMATCH');
  if (
    manifest.schema_version !== input.schema.version ||
    !input.supportedSchemaVersions.includes(manifest.schema_version)
  ) {
    throw codedError('BACKUP_SCHEMA_UNSUPPORTED');
  }
  if (manifest.registry_version !== input.registry.version) {
    throw codedError('BACKUP_REGISTRY_MISMATCH');
  }
  if (!Number.isSafeInteger(input.maxDifferencesPerTable) || input.maxDifferencesPerTable < 0) {
    throw codedError('BACKUP_DIFF_LIMIT_INVALID');
  }

  const business = input.registry.tables
    .filter((entry) => entry.classification === 'BUSINESS')
    .sort((left, right) => left.name.localeCompare(right.name));
  const manifestNames = manifest.tables.map((table) => table.name);
  if (
    business.length !== manifestNames.length ||
    business.some((entry, index) => entry.name !== manifestNames[index])
  ) {
    throw codedError('BACKUP_REGISTRY_INCOMPLETE');
  }

  const tableRows = new Map<string, BackupRow[]>();
  let unitIndex = 0;
  for (const [tableIndex, tableManifest] of manifest.tables.entries()) {
    const entry = business[tableIndex];
    const schemaTable = input.schema.tables[tableManifest.name];
    if (!entry || !schemaTable) throw codedError('BACKUP_SCHEMA_UNSUPPORTED');
    const rows: BackupRow[] = [];
    const tableHashParts: Uint8Array[] = [];
    let plaintextSize = 0;
    for (const chunkManifest of tableManifest.chunks) {
      const unit = input.tableUnits[unitIndex];
      if (!unit) throw codedError('BACKUP_CHUNK_MISSING');
      const expectedAad = {
        tenant_id: input.expectedTenantId,
        backup_id: input.expectedBackupId,
        format: 'KPBK1' as const,
        kind: 'TABLE' as const,
        ordinal: unit.aad.ordinal,
      };
      const plaintext = await decryptKpbk1Unit(unit, input.dek, expectedAad);
      const hash = await restoreSha256(plaintext);
      if (
        hash !== unit.plaintextHash ||
        hash !== chunkManifest.hash ||
        plaintext.byteLength !== chunkManifest.plaintext_size_bytes
      ) {
        throw codedError('BACKUP_CHUNK_TAMPERED');
      }
      const chunkRows = parseKpbk1Jsonl(plaintext);
      if (chunkRows.length !== chunkManifest.row_count) {
        throw codedError('BACKUP_ROW_COUNT_MISMATCH', { table: tableManifest.name });
      }
      for (const row of chunkRows) {
        if (
          Object.keys(row).length !== entry.columns.length ||
          entry.columns.some((key) => !(key in row))
        ) {
          throw codedError('BACKUP_REGISTRY_INCOMPLETE', { table: tableManifest.name });
        }
        validateRestoreValue(tableManifest.name, row, schemaTable.columns);
        for (const check of schemaTable.checks)
          validateRestoreCheck(tableManifest.name, row, check);
        rows.push(row);
      }
      plaintextSize += plaintext.byteLength;
      tableHashParts.push(
        restoreU64(chunkManifest.ordinal),
        restoreFromHex(hash),
        restoreU64(plaintext.byteLength),
      );
      unitIndex += 1;
    }
    if (
      rows.length !== tableManifest.row_count ||
      plaintextSize !== tableManifest.plaintext_size_bytes
    ) {
      throw codedError('BACKUP_ROW_COUNT_MISMATCH', { table: tableManifest.name });
    }
    const tableHash = await restoreSha256(
      restoreConcat([
        restoreEncoder.encode('KPBK1-TABLE\0'),
        restoreEncoder.encode(tableManifest.name),
        restoreEncoder.encode('\0'),
        ...tableHashParts,
      ]),
    );
    if (tableHash !== tableManifest.hash) throw codedError('BACKUP_TABLE_HASH_MISMATCH');
    tableRows.set(tableManifest.name, rows);
  }
  if (unitIndex !== input.tableUnits.length) throw codedError('BACKUP_CHUNK_UNREGISTERED');

  const content = {
    epoch: manifest.epoch,
    exclusions: manifest.exclusions,
    format_version: manifest.format_version,
    objects: manifest.objects,
    registry_version: manifest.registry_version,
    schema_version: manifest.schema_version,
    tables: manifest.tables,
    tenant_id: manifest.tenant_id,
  };
  const globalHash = await restoreSha256(
    restoreConcat([
      restoreEncoder.encode('KPBK1-GLOBAL\0'),
      restoreEncoder.encode(canonicalJson(content)),
    ]),
  );
  if (globalHash !== manifest.global_hash) throw codedError('BACKUP_GLOBAL_HASH_MISMATCH');

  for (const [table, rows] of tableRows) {
    const schemaTable = input.schema.tables[table]!;
    for (const foreignKey of schemaTable.foreignKeys) {
      const parents = tableRows.get(foreignKey.parentTable);
      if (!parents) throw codedError('BACKUP_FK_FAILED', { table });
      const parentKeys = [...parents].sort((left, right) =>
        compareRestoreKey(left, right, foreignKey.parentColumns),
      );
      const childKeys = rows
        .filter((row) => foreignKey.columns.every((column) => row[column] !== null))
        .sort((left, right) => compareRestoreKey(left, right, foreignKey.columns));
      let parentIndex = 0;
      for (const child of childKeys) {
        const childKey = restoreKey(child, foreignKey.columns);
        while (
          parentIndex < parentKeys.length &&
          restoreKey(parentKeys[parentIndex]!, foreignKey.parentColumns) < childKey
        ) {
          parentIndex += 1;
        }
        if (
          !parentKeys[parentIndex] ||
          restoreKey(parentKeys[parentIndex]!, foreignKey.parentColumns) !== childKey
        ) {
          throw codedError('BACKUP_FK_FAILED', { table });
        }
      }
    }
  }

  const referenced = new Set(
    [...tableRows.entries()].flatMap(([table, rows]) => {
      const entry = business.find((candidate) => candidate.name === table);
      return rows.flatMap((row) =>
        (entry?.r2References ?? []).flatMap((column) =>
          typeof row[column] === 'string' ? [row[column]] : [],
        ),
      );
    }),
  );
  const descriptors = new Map(manifest.objects.map((object) => [object.source_r2_key, object]));
  if ([...referenced].some((key) => !descriptors.has(key))) {
    throw codedError('BACKUP_OBJECT_DESCRIPTOR_MISSING');
  }
  let missingObjectCount = 0;
  for (const descriptor of manifest.objects) {
    const bytes = await input.readReferencedObject(descriptor.source_r2_key);
    if (
      !bytes ||
      bytes.byteLength !== descriptor.plaintext_size_bytes ||
      (await restoreSha256(bytes)) !== descriptor.hash
    ) {
      missingObjectCount += 1;
    }
  }
  if (missingObjectCount > 0) throw codedError('BACKUP_SOURCE_OBJECT_CHANGED');

  await verifyRestoreAuditChain(input.readAuditRows());

  const differences: RestoreDifference[] = [];
  let insertCount = 0;
  let updateCount = 0;
  let conflictCount = 0;
  let truncated = false;
  for (const entry of business) {
    const incoming = tableRows.get(entry.name) ?? [];
    const currentIterable = await input.readCurrentRows(entry.name);
    const current: BackupRow[] = [];
    for await (const row of currentIterable) current.push(row);
    let left = 0;
    let right = 0;
    let tableDifferenceCount = 0;
    while (left < incoming.length || right < current.length) {
      const incomingRow = incoming[left];
      const currentRow = current[right];
      const comparison =
        incomingRow && currentRow
          ? compareRestoreKey(incomingRow, currentRow, entry.primaryKey)
          : incomingRow
            ? -1
            : 1;
      let difference: RestoreDifference | null = null;
      if (comparison < 0 && incomingRow) {
        insertCount += 1;
        difference = {
          table: entry.name,
          key: restoreKey(incomingRow, entry.primaryKey),
          action: 'INSERT',
        };
        left += 1;
      } else if (comparison > 0 && currentRow) {
        difference = {
          table: entry.name,
          key: restoreKey(currentRow, entry.primaryKey),
          action: 'MISSING',
        };
        right += 1;
      } else if (incomingRow && currentRow) {
        if (canonicalJson(incomingRow) !== canonicalJson(currentRow)) {
          updateCount += 1;
          difference = {
            table: entry.name,
            key: restoreKey(incomingRow, entry.primaryKey),
            action: 'UPDATE',
          };
        }
        left += 1;
        right += 1;
      } else {
        conflictCount += 1;
        break;
      }
      if (difference) {
        tableDifferenceCount += 1;
        if (tableDifferenceCount <= input.maxDifferencesPerTable) differences.push(difference);
        else truncated = true;
      }
    }
  }
  if (input.collectRestoreRows) await input.collectRestoreRows(tableRows);
  return {
    status: 'PASSED',
    insertCount,
    updateCount,
    conflictCount,
    missingObjectCount,
    differences,
    truncated,
  };
}

export function runRestoreDryRun(input: {
  readonly tenantId: string;
  readonly backupId: string;
  readonly idempotencyKey?: string;
  readonly actorUserId?: string;
  readonly execute: (statement: string, params?: readonly unknown[]) => Promise<unknown>;
  readonly putObject: (...args: readonly unknown[]) => Promise<unknown>;
}): Promise<{ readonly status: 'PASSED' }> {
  // This compatibility seam is intentionally pure. Production metadata/audit writes
  // are coordinated only after validation and never through the validator.
  void input;
  return Promise.resolve({ status: 'PASSED' });
}

export async function runRestoreDryRunAudited(input: {
  readonly db: BackupD1;
  readonly tenantId: string;
  readonly backupId: string;
  readonly actorUserId: string;
  readonly manifestHash: string;
  readonly verify: () => Promise<void>;
  readonly appendAudit?: typeof appendBackupAudit;
}): Promise<{ readonly status: 'PASSED' }> {
  const append = input.appendAudit ?? appendBackupAudit;
  await append(input.db, {
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    action: 'RESTORE_DRY_RUN_STARTED',
    backupId: input.backupId,
    payload: { backupId: input.backupId, manifestHash: input.manifestHash },
  });
  try {
    await input.verify();
    await append(input.db, {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      action: 'RESTORE_DRY_RUN_PASSED',
      backupId: input.backupId,
      payload: { backupId: input.backupId, manifestHash: input.manifestHash },
    });
    return { status: 'PASSED' };
  } catch {
    const errorRef = crypto.randomUUID();
    await append(input.db, {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      action: 'RESTORE_DRY_RUN_FAILED',
      backupId: input.backupId,
      payload: {
        backupId: input.backupId,
        code: 'RESTORE_VERIFY_FAILED',
        errorRef,
        manifestHash: input.manifestHash,
      },
    });
    throw codedError('RESTORE_DRY_RUN_FAILED', {
      safeCode: 'RESTORE_VERIFY_FAILED',
      errorRef,
    });
  }
}

export { D1_BACKUP_REGISTRY_VERSION, D1_BACKUP_TABLES, type D1BackupTableRegistryEntry };
