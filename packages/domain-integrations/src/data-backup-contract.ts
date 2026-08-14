export const KPBK1_CHUNK_LIMIT_BYTES = 4 * 1024 * 1024;

export type BackupClassification = 'BUSINESS' | 'DERIVED' | 'EPHEMERAL' | 'SECRET' | 'SENSITIVE';
export type JsonPrimitive = string | number | boolean | null;
export type BackupRow = Readonly<Record<string, JsonPrimitive>>;

export interface BusinessTableRegistryEntry {
  readonly name: string;
  readonly classification: 'BUSINESS';
  readonly primaryKey: readonly string[];
  readonly columns: readonly string[];
  readonly r2References: readonly string[];
  readonly tenantVia?: readonly string[];
}

export interface ExcludedTableRegistryEntry {
  readonly name: string;
  readonly classification: Exclude<BackupClassification, 'BUSINESS'>;
  readonly reason: string;
  readonly tenantVia?: readonly string[];
}

export type BackupRegistryEntry = BusinessTableRegistryEntry | ExcludedTableRegistryEntry;

export interface BackupRegistry {
  readonly version: string;
  readonly tables: readonly BackupRegistryEntry[];
}

export interface Kpbk1SourceObject {
  readonly logicalKey: string;
  readonly sourceR2Key: string;
  readonly bytes: Uint8Array;
  readonly etag?: string;
}

export interface Kpbk1Source {
  readonly tenantId: string;
  readonly backupId: string;
  readonly schemaVersion: string;
  readonly epoch: number;
  readonly createdAt: string;
  readonly actorId: string;
  readonly registry: BackupRegistry;
  readonly tables: Readonly<Record<string, readonly BackupRow[]>>;
  readonly objects: readonly Kpbk1SourceObject[];
}

export interface BackupKeyWrapPort {
  wrapDek(input: { readonly dek: Uint8Array; readonly kekVersion: string }): Promise<Uint8Array>;
  unwrapDek(input: {
    readonly wrappedDek: Uint8Array;
    readonly kekVersion: string;
  }): Promise<Uint8Array>;
}

export interface Kpbk1Aad {
  readonly tenant_id: string;
  readonly backup_id: string;
  readonly format: 'KPBK1';
  readonly kind: 'TABLE' | 'OBJECT' | 'MANIFEST';
  readonly ordinal: number;
}

export interface EncryptedKpbk1Unit {
  readonly ciphertext: Uint8Array;
  readonly nonce: Uint8Array;
  readonly nonceHex: string;
  readonly authTag: Uint8Array;
  readonly aad: Kpbk1Aad;
  readonly plaintextHash: string;
}

export interface Kpbk1Chunk {
  readonly ordinal: number;
  readonly rowCount: number;
  readonly plaintextSizeBytes: number;
  readonly hash: string;
  readonly bytes: Uint8Array;
}

export interface Kpbk1Table {
  readonly name: string;
  readonly plaintextBytes: Uint8Array;
  readonly plaintextSizeBytes: number;
  readonly rowCount: number;
  readonly hash: string;
  readonly chunks: readonly Kpbk1Chunk[];
}

export interface Kpbk1Object {
  readonly logicalKey: string;
  readonly sourceR2Key: string;
  readonly etag?: string;
  readonly plaintextSizeBytes: number;
  readonly hash: string;
  readonly bytes: Uint8Array;
}

export interface Kpbk1Manifest {
  readonly backup_id: string;
  readonly epoch: number;
  readonly exclusions: readonly {
    readonly name: string;
    readonly classification: Exclude<BackupClassification, 'BUSINESS'>;
    readonly reason: string;
    readonly known_count: number | null;
  }[];
  readonly format_version: 'KPBK1';
  readonly global_hash: string;
  readonly objects: readonly {
    readonly logical_key: string;
    readonly source_r2_key: string;
    readonly plaintext_size_bytes: number;
    readonly hash: string;
  }[];
  readonly registry_version: string;
  readonly schema_version: string;
  readonly tables: readonly {
    readonly name: string;
    readonly row_count: number;
    readonly plaintext_size_bytes: number;
    readonly hash: string;
    readonly chunks: readonly {
      readonly ordinal: number;
      readonly row_count: number;
      readonly plaintext_size_bytes: number;
      readonly hash: string;
    }[];
  }[];
  readonly tenant_id: string;
}

export interface EncryptedKpbk1Backup {
  readonly tenantId: string;
  readonly backupId: string;
  readonly manifest: Kpbk1Manifest;
  readonly wrappedDek: Uint8Array;
  readonly kekVersion: string;
  readonly chunks: EncryptedKpbk1Unit[];
  readonly objects: EncryptedKpbk1Unit[];
  readonly encryptedManifest: EncryptedKpbk1Unit;
  readonly keyWrap: BackupKeyWrapPort | undefined;
}

export interface Kpbk1PlaintextBackup {
  readonly manifest: Kpbk1Manifest;
  readonly tables: readonly Kpbk1Table[];
  readonly objects: readonly Kpbk1Object[];
  readonly globalHash: string;
  readonly canonicalContentBytes: Uint8Array;
  readonly encrypted: EncryptedKpbk1Backup;
  encrypt(): Promise<EncryptedKpbk1Backup>;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });
const inMemoryDeks = new WeakMap<EncryptedKpbk1Backup, Uint8Array>();

function backupError(code: string): Error {
  const error = new Error(code);
  error.name = 'BackupContractError';
  return error;
}

function normalizeJson(value: unknown): unknown {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.normalize('NFC');
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw backupError('BACKUP_JSON_NUMBER_INVALID');
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => compareUtf8(left, right))
        .map(([key, child]) => [key.normalize('NFC'), normalizeJson(child)]),
    );
  }
  throw backupError('BACKUP_JSON_VALUE_INVALID');
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeJson(value));
}

function compareBytes(left: Uint8Array, right: Uint8Array): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

function compareUtf8(left: string, right: string): number {
  return compareBytes(
    encoder.encode(left.normalize('NFC')),
    encoder.encode(right.normalize('NFC')),
  );
}

function comparePk(left: BackupRow, right: BackupRow, primaryKey: readonly string[]): number {
  for (const column of primaryKey) {
    const leftValue = left[column];
    const rightValue = right[column];
    if (leftValue === rightValue) continue;
    if (leftValue === null || leftValue === undefined) return -1;
    if (rightValue === null || rightValue === undefined) return 1;
    const comparison = compareUtf8(String(leftValue), String(rightValue));
    if (comparison !== 0) return comparison;
  }
  return 0;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fromHex(value: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/.test(value)) throw backupError('BACKUP_HASH_INVALID');
  return Uint8Array.from(value.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
}

async function sha256(bytes: Uint8Array): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', toArrayBuffer(bytes))));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

function concatBytes(...values: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(values.reduce((sum, value) => sum + value.length, 0));
  let offset = 0;
  for (const value of values) {
    result.set(value, offset);
    offset += value.length;
  }
  return result;
}

function u64be(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0) throw backupError('BACKUP_SIZE_INVALID');
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(value));
  return bytes;
}

async function tableHash(name: string, chunks: readonly Kpbk1Chunk[]): Promise<string> {
  return sha256(
    concatBytes(
      encoder.encode('KPBK1-TABLE\0'),
      encoder.encode(name),
      encoder.encode('\0'),
      ...chunks.flatMap((chunk) => [
        u64be(chunk.ordinal),
        fromHex(chunk.hash),
        u64be(chunk.plaintextSizeBytes),
      ]),
    ),
  );
}

function projectRow(row: BackupRow, columns: readonly string[]): BackupRow {
  const projected: Record<string, JsonPrimitive> = {};
  for (const column of columns) {
    if (!(column in row)) throw backupError('BACKUP_ROW_COLUMN_MISSING');
    projected[column] = row[column] ?? null;
  }
  for (const column of Object.keys(row)) {
    if (!columns.includes(column)) throw backupError('BACKUP_ROW_COLUMN_UNREGISTERED');
  }
  return projected;
}

async function buildTable(
  entry: BusinessTableRegistryEntry,
  rows: readonly BackupRow[],
): Promise<Kpbk1Table> {
  if (entry.primaryKey.length === 0) throw backupError('BACKUP_REGISTRY_PK_REQUIRED');
  const lines = [...rows]
    .sort((left, right) => comparePk(left, right, entry.primaryKey))
    .map((row) => encoder.encode(`${canonicalJson(projectRow(row, entry.columns))}\n`));
  const chunks: Kpbk1Chunk[] = [];
  let pending: Uint8Array[] = [];
  let pendingBytes = 0;
  let pendingRows = 0;
  const flush = async (): Promise<void> => {
    if (pendingRows === 0) return;
    const bytes = concatBytes(...pending);
    chunks.push({
      ordinal: chunks.length,
      rowCount: pendingRows,
      plaintextSizeBytes: bytes.length,
      hash: await sha256(bytes),
      bytes,
    });
    pending = [];
    pendingBytes = 0;
    pendingRows = 0;
  };
  for (const line of lines) {
    if (line.length > KPBK1_CHUNK_LIMIT_BYTES) {
      throw backupError('BACKUP_ROW_EXCEEDS_CHUNK_LIMIT');
    }
    if (pendingBytes + line.length > KPBK1_CHUNK_LIMIT_BYTES) await flush();
    pending.push(line);
    pendingBytes += line.length;
    pendingRows += 1;
  }
  await flush();
  const plaintextBytes = concatBytes(...lines);
  return {
    name: entry.name,
    plaintextBytes,
    plaintextSizeBytes: plaintextBytes.length,
    rowCount: rows.length,
    hash: await tableHash(entry.name, chunks),
    chunks,
  };
}

function aadBytes(aad: Kpbk1Aad): Uint8Array {
  return encoder.encode(canonicalJson(aad));
}

export async function encryptKpbk1Unit(
  plaintext: Uint8Array,
  dek: Uint8Array,
  aad: Kpbk1Aad,
  nonceOverride?: Uint8Array,
): Promise<EncryptedKpbk1Unit> {
  if (dek.length !== 32) throw backupError('BACKUP_DEK_INVALID');
  const nonce = nonceOverride
    ? Uint8Array.from(nonceOverride)
    : crypto.getRandomValues(new Uint8Array(12));
  if (nonce.byteLength !== 12) throw backupError('BACKUP_NONCE_INVALID');
  const key = await crypto.subtle.importKey('raw', toArrayBuffer(dek), { name: 'AES-GCM' }, false, [
    'encrypt',
  ]);
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(nonce),
        additionalData: toArrayBuffer(aadBytes(aad)),
        tagLength: 128,
      },
      key,
      toArrayBuffer(plaintext),
    ),
  );
  return {
    ciphertext: sealed.slice(0, -16),
    nonce,
    nonceHex: hex(nonce),
    authTag: sealed.slice(-16),
    aad,
    plaintextHash: await sha256(plaintext),
  };
}

export async function decryptKpbk1Unit(
  unit: EncryptedKpbk1Unit,
  dek: Uint8Array,
  aad: Kpbk1Aad,
): Promise<Uint8Array> {
  if (canonicalJson(unit.aad) !== canonicalJson(aad)) throw backupError('BACKUP_AAD_MISMATCH');
  const key = await crypto.subtle.importKey('raw', toArrayBuffer(dek), { name: 'AES-GCM' }, false, [
    'decrypt',
  ]);
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: toArrayBuffer(unit.nonce),
          additionalData: toArrayBuffer(aadBytes(aad)),
          tagLength: 128,
        },
        key,
        toArrayBuffer(concatBytes(unit.ciphertext, unit.authTag)),
      ),
    );
  } catch {
    throw backupError('BACKUP_CHUNK_TAMPERED');
  }
}

async function encryptBackup(
  source: Kpbk1Source,
  manifest: Kpbk1Manifest,
  tables: readonly Kpbk1Table[],
  objects: readonly Kpbk1Object[],
  options: {
    readonly keyWrap: BackupKeyWrapPort | undefined;
    readonly kekVersion: string;
  },
): Promise<EncryptedKpbk1Backup> {
  const dek = crypto.getRandomValues(new Uint8Array(32));
  const wrappedDek = options.keyWrap
    ? await options.keyWrap.wrapDek({ dek, kekVersion: options.kekVersion })
    : crypto.getRandomValues(new Uint8Array(48));
  const chunks: EncryptedKpbk1Unit[] = [];
  let ordinal = 0;
  for (const table of tables) {
    for (const chunk of table.chunks) {
      chunks.push(
        await encryptKpbk1Unit(chunk.bytes, dek, {
          tenant_id: source.tenantId,
          backup_id: source.backupId,
          format: 'KPBK1',
          kind: 'TABLE',
          ordinal,
        }),
      );
      ordinal += 1;
    }
  }
  const encryptedObjects = await Promise.all(
    objects.map((object, objectOrdinal) =>
      encryptKpbk1Unit(object.bytes, dek, {
        tenant_id: source.tenantId,
        backup_id: source.backupId,
        format: 'KPBK1',
        kind: 'OBJECT',
        ordinal: objectOrdinal,
      }),
    ),
  );
  const encryptedManifest = await encryptKpbk1Unit(encoder.encode(canonicalJson(manifest)), dek, {
    tenant_id: source.tenantId,
    backup_id: source.backupId,
    format: 'KPBK1',
    kind: 'MANIFEST',
    ordinal: 0,
  });
  const encrypted: EncryptedKpbk1Backup = {
    tenantId: source.tenantId,
    backupId: source.backupId,
    manifest,
    wrappedDek,
    kekVersion: options.kekVersion,
    chunks,
    objects: encryptedObjects,
    encryptedManifest,
    keyWrap: options.keyWrap,
  };
  inMemoryDeks.set(encrypted, dek);
  return encrypted;
}

export async function buildKpbk1Plaintext(
  source: Kpbk1Source,
  options: { readonly keyWrap?: BackupKeyWrapPort; readonly kekVersion?: string } = {},
): Promise<Kpbk1PlaintextBackup> {
  const businessEntries = source.registry.tables
    .filter((entry): entry is BusinessTableRegistryEntry => entry.classification === 'BUSINESS')
    .filter((entry) => Object.hasOwn(source.tables, entry.name))
    .sort((left, right) => compareUtf8(left.name, right.name));
  const tables = await Promise.all(
    businessEntries.map((entry) => buildTable(entry, source.tables[entry.name]!)),
  );
  const objects = await Promise.all(
    [...source.objects]
      .sort((left, right) => compareUtf8(left.logicalKey, right.logicalKey))
      .map(async (object) => ({
        ...object,
        plaintextSizeBytes: object.bytes.length,
        hash: await sha256(object.bytes),
      })),
  );
  const exclusions = [
    ...source.registry.tables
      .filter((entry): entry is ExcludedTableRegistryEntry => entry.classification !== 'BUSINESS')
      .map((entry) => ({
        name: entry.name,
        classification: entry.classification,
        reason: entry.reason,
        known_count: null,
      })),
    {
      name: 'unsynced_indexeddb',
      classification: 'EPHEMERAL' as const,
      reason: 'client state not synchronized to authoritative storage',
      known_count: null,
    },
  ].sort((left, right) => compareUtf8(left.name, right.name));
  const tableManifest = tables.map((table) => ({
    name: table.name,
    row_count: table.rowCount,
    plaintext_size_bytes: table.plaintextSizeBytes,
    hash: table.hash,
    chunks: table.chunks.map((chunk) => ({
      ordinal: chunk.ordinal,
      row_count: chunk.rowCount,
      plaintext_size_bytes: chunk.plaintextSizeBytes,
      hash: chunk.hash,
    })),
  }));
  const objectManifest = objects.map((object) => ({
    logical_key: object.logicalKey,
    source_r2_key: object.sourceR2Key,
    plaintext_size_bytes: object.plaintextSizeBytes,
    hash: object.hash,
  }));
  const content = {
    epoch: source.epoch,
    exclusions,
    format_version: 'KPBK1',
    objects: objectManifest,
    registry_version: source.registry.version,
    schema_version: source.schemaVersion,
    tables: tableManifest,
    tenant_id: source.tenantId,
  };
  const canonicalContentBytes = encoder.encode(canonicalJson(content));
  const globalHash = await sha256(
    concatBytes(encoder.encode('KPBK1-GLOBAL\0'), canonicalContentBytes),
  );
  const manifest: Kpbk1Manifest = {
    backup_id: source.backupId,
    ...content,
    format_version: 'KPBK1',
    global_hash: globalHash,
  };
  const encryptionOptions = {
    keyWrap: options.keyWrap,
    kekVersion: options.kekVersion ?? 'local-ephemeral',
  };
  const encrypted = await encryptBackup(source, manifest, tables, objects, encryptionOptions);
  return {
    manifest,
    tables,
    objects,
    globalHash,
    canonicalContentBytes,
    encrypted,
    encrypt: () => encryptBackup(source, manifest, tables, objects, encryptionOptions),
  };
}

export function parseKpbk1Jsonl(bytes: Uint8Array): readonly BackupRow[] {
  let text: string;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw backupError('BACKUP_JSONL_INVALID');
  }
  try {
    text = decoder.decode(bytes);
  } catch {
    throw backupError('BACKUP_JSONL_INVALID');
  }
  if (
    text.startsWith('\uFEFF') ||
    text.includes('\r') ||
    (text.length > 0 && !text.endsWith('\n'))
  ) {
    throw backupError('BACKUP_JSONL_INVALID');
  }
  if (text.length === 0) return [];
  try {
    return text
      .slice(0, -1)
      .split('\n')
      .map((line) => {
        const parsed = JSON.parse(line) as unknown;
        if (
          parsed === null ||
          Array.isArray(parsed) ||
          typeof parsed !== 'object' ||
          canonicalJson(parsed) !== line
        ) {
          throw backupError('BACKUP_JSONL_INVALID');
        }
        return parsed as BackupRow;
      });
  } catch {
    throw backupError('BACKUP_JSONL_INVALID');
  }
}

export function parseKpbk1Manifest(input: string | Uint8Array): Kpbk1Manifest {
  let text: string;
  try {
    text = typeof input === 'string' ? input : decoder.decode(input);
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const required = [
      'backup_id',
      'epoch',
      'exclusions',
      'format_version',
      'global_hash',
      'objects',
      'registry_version',
      'schema_version',
      'tables',
      'tenant_id',
    ];
    if (
      parsed === null ||
      Array.isArray(parsed) ||
      parsed.format_version !== 'KPBK1' ||
      Object.keys(parsed).some((key) => !required.includes(key)) ||
      required.some((key) => !(key in parsed)) ||
      canonicalJson(parsed) !== text
    ) {
      throw backupError('BACKUP_MANIFEST_INVALID');
    }
    return parsed as unknown as Kpbk1Manifest;
  } catch {
    throw backupError('BACKUP_MANIFEST_INVALID');
  }
}

export async function verifyKpbk1Backup(
  encrypted: EncryptedKpbk1Backup,
  options: {
    readonly expectedTenantId: string;
    readonly readObject: (sourceR2Key: string) => Promise<Uint8Array>;
  },
): Promise<void> {
  if (encrypted.manifest.tenant_id !== options.expectedTenantId) {
    throw backupError('BACKUP_TENANT_MISMATCH');
  }
  const dek =
    inMemoryDeks.get(encrypted) ??
    (encrypted.keyWrap
      ? await encrypted.keyWrap.unwrapDek({
          wrappedDek: encrypted.wrappedDek,
          kekVersion: encrypted.kekVersion,
        })
      : undefined);
  if (!dek) throw backupError('BACKUP_KMS_UNAVAILABLE');
  for (const chunk of encrypted.chunks) {
    const plaintext = await decryptKpbk1Unit(chunk, dek, chunk.aad);
    if ((await sha256(plaintext)) !== chunk.plaintextHash) {
      throw backupError('BACKUP_CHUNK_TAMPERED');
    }
    parseKpbk1Jsonl(plaintext);
  }
  for (const object of encrypted.manifest.objects) {
    const bytes = await options.readObject(object.source_r2_key);
    if (bytes.length !== object.plaintext_size_bytes || (await sha256(bytes)) !== object.hash) {
      throw backupError('BACKUP_SOURCE_OBJECT_CHANGED');
    }
  }
}

export function classifyTenantSchema(
  schema: {
    readonly tenantTables: readonly string[];
    readonly foreignKeys: readonly { readonly child: string; readonly parent: string }[];
    readonly columns: Readonly<Record<string, readonly string[]>>;
  },
  registry: BackupRegistry,
): {
  readonly ok: boolean;
  readonly unclassifiedTables: readonly string[];
  readonly unclassifiedColumns: readonly {
    readonly table: string;
    readonly columns: readonly string[];
  }[];
} {
  const tenantOwned = new Set(schema.tenantTables);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of schema.foreignKeys) {
      if (tenantOwned.has(edge.parent) && !tenantOwned.has(edge.child)) {
        tenantOwned.add(edge.child);
        changed = true;
      }
    }
  }
  const entries = new Map(registry.tables.map((entry) => [entry.name, entry]));
  const unclassifiedTables = [...tenantOwned]
    .filter((table) => !entries.has(table))
    .sort(compareUtf8);
  const unclassifiedColumns = [...tenantOwned]
    .flatMap((table) => {
      const entry = entries.get(table);
      if (!entry || entry.classification !== 'BUSINESS') return [];
      const columns = (schema.columns[table] ?? [])
        .filter((column) => !entry.columns.includes(column))
        .sort(compareUtf8);
      return columns.length > 0 ? [{ table, columns }] : [];
    })
    .sort((left, right) => compareUtf8(left.table, right.table));
  return {
    ok: unclassifiedTables.length === 0 && unclassifiedColumns.length === 0,
    unclassifiedTables,
    unclassifiedColumns,
  };
}

export function validateRestoreDryRun(input: {
  readonly expectedTenantId: string;
  readonly manifestTenantId: string;
  readonly schemaVersion: string;
  readonly supportedSchemaVersions: readonly string[];
  readonly differences: readonly {
    readonly table: string;
    readonly key: string;
    readonly action: 'INSERT' | 'UPDATE' | 'CONFLICT' | 'MISSING';
  }[];
  readonly maxDifferences: number;
}): {
  readonly status: 'PASSED';
  readonly differences: readonly {
    readonly table: string;
    readonly key: string;
    readonly action: 'INSERT' | 'UPDATE' | 'CONFLICT' | 'MISSING';
  }[];
  readonly truncated: boolean;
} {
  if (input.manifestTenantId !== input.expectedTenantId) {
    throw backupError('BACKUP_TENANT_MISMATCH');
  }
  if (!input.supportedSchemaVersions.includes(input.schemaVersion)) {
    throw backupError('BACKUP_SCHEMA_UNSUPPORTED');
  }
  if (!Number.isSafeInteger(input.maxDifferences) || input.maxDifferences < 0) {
    throw backupError('BACKUP_DIFF_LIMIT_INVALID');
  }
  return {
    status: 'PASSED',
    differences: input.differences.slice(0, input.maxDifferences),
    truncated: input.differences.length > input.maxDifferences,
  };
}
