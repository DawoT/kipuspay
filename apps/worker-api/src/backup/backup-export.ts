import {
  KPBK1_CHUNK_LIMIT_BYTES,
  canonicalJson,
  encryptKpbk1Unit,
  type BackupRow,
  type EncryptedKpbk1Unit,
  type Kpbk1Manifest,
} from '@kipuspay/domain-integrations';
import type { BackupMultipartCheckpoint, BackupR2PutInput } from './backup-r2.js';

interface RegistryBusinessEntry {
  readonly name: string;
  readonly classification: 'BUSINESS';
  readonly primaryKey: readonly string[];
  readonly columns: readonly string[];
  readonly r2References: readonly string[];
  readonly tenantVia: readonly string[];
}

interface TablePage {
  readonly rows: readonly BackupRow[];
  readonly next: Readonly<Record<string, unknown>> | null;
  readonly objectDescriptors: readonly {
    readonly table: string;
    readonly column: string;
    readonly sourceR2Key: string;
  }[];
}

interface StoredUnit {
  readonly key: string;
  readonly etag: string;
  readonly plaintextHash: string;
  readonly ciphertextHash: string;
  readonly plaintextSize: number;
  readonly ciphertextSize: number;
  readonly nonce: Uint8Array;
  readonly authTag: Uint8Array;
}

export interface BackupExportTable {
  readonly name: string;
  readonly rowCount: number;
  readonly plaintextSize: number;
  readonly hash: string;
  readonly chunks: readonly (StoredUnit & {
    readonly ordinal: number;
    readonly rowCount: number;
  })[];
}

export interface BackupExportObject extends StoredUnit {
  readonly ordinal: number;
  readonly sourceR2Key: string;
  readonly sourceEtag: string;
}

export interface BackupExportResult {
  readonly epoch: number;
  readonly tables: readonly BackupExportTable[];
  readonly objects: readonly BackupExportObject[];
  readonly rowCount: number;
  readonly chunkCount: number;
  readonly globalHash: string;
  readonly manifest: Kpbk1Manifest;
}

interface ExportDestination {
  putEncrypted(
    input: BackupR2PutInput,
    checkpoint?: BackupMultipartCheckpoint,
  ): Promise<{ readonly etag: string; readonly multipart: boolean }>;
}

interface SourceObject {
  arrayBuffer(): Promise<ArrayBuffer>;
}

interface SourceHead {
  readonly etag: string;
  readonly size: number;
}

const encoder = new TextEncoder();

function concat(values: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(values.reduce((total, value) => total + value.byteLength, 0));
  let offset = 0;
  for (const value of values) {
    output.set(value, offset);
    offset += value.byteLength;
  }
  return output;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer)),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
}

function fromHex(value: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/.test(value)) throw new Error('BACKUP_HASH_INVALID');
  return Uint8Array.from(value.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
}

function u64be(value: number): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(value));
  return bytes;
}

async function stableNonce(
  dek: Uint8Array,
  plaintext: Uint8Array,
  identity: string,
): Promise<Uint8Array> {
  const material = concat([
    Uint8Array.from(dek),
    encoder.encode(identity),
    new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(plaintext).buffer)),
  ]);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', material)).slice(0, 12);
}

function sealed(unit: EncryptedKpbk1Unit): Uint8Array {
  return concat([unit.ciphertext, unit.authTag]);
}

async function uploadUnit(
  destination: ExportDestination,
  key: string,
  plaintext: Uint8Array,
  unit: EncryptedKpbk1Unit,
  metadata: Readonly<Record<string, string>>,
): Promise<StoredUnit> {
  const bytes = sealed(unit);
  const ciphertextHash = await sha256(bytes);
  const uploaded = await destination.putEncrypted({
    key,
    bytes,
    sha256: ciphertextHash,
    metadata: { ...metadata, ciphertextHash, plaintextHash: unit.plaintextHash },
  });
  return {
    key,
    etag: uploaded.etag,
    plaintextHash: unit.plaintextHash,
    ciphertextHash,
    plaintextSize: plaintext.byteLength,
    ciphertextSize: bytes.byteLength,
    nonce: unit.nonce,
    authTag: unit.authTag,
  };
}

async function exportTable(input: {
  readonly tenantId: string;
  readonly backupId: string;
  readonly entry: RegistryBusinessEntry;
  readonly dek: Uint8Array;
  readonly readTablePage: (input: {
    readonly tenantId: string;
    readonly tableName: string;
    readonly after: Readonly<Record<string, unknown>> | null;
    readonly limit: number;
  }) => Promise<TablePage>;
  readonly destination: ExportDestination;
  readonly descriptors: Map<string, TablePage['objectDescriptors'][number]>;
}): Promise<BackupExportTable> {
  const chunks: (StoredUnit & { ordinal: number; rowCount: number })[] = [];
  let after: Readonly<Record<string, unknown>> | null = null;
  let rowCount = 0;
  let plaintextSize = 0;
  do {
    const page = await input.readTablePage({
      tenantId: input.tenantId,
      tableName: input.entry.name,
      after,
      limit: 500,
    });
    for (const descriptor of page.objectDescriptors) {
      input.descriptors.set(descriptor.sourceR2Key, descriptor);
    }
    let pending: Uint8Array[] = [];
    let pendingRows = 0;
    let pendingBytes = 0;
    const flush = async (): Promise<void> => {
      if (pendingRows === 0) return;
      const plaintext = concat(pending);
      const ordinal = chunks.length;
      const aad = {
        tenant_id: input.tenantId,
        backup_id: input.backupId,
        format: 'KPBK1' as const,
        kind: 'TABLE' as const,
        ordinal,
      };
      const encrypted = await encryptKpbk1Unit(
        plaintext,
        input.dek,
        aad,
        await stableNonce(
          input.dek,
          plaintext,
          `${input.tenantId}\0${input.backupId}\0TABLE\0${input.entry.name}\0${ordinal}`,
        ),
      );
      const stored = await uploadUnit(
        input.destination,
        `staging/${input.tenantId}/${input.backupId}/tables/${input.entry.name}/${ordinal}.bin`,
        plaintext,
        encrypted,
        { backupId: input.backupId, kind: 'table', table: input.entry.name },
      );
      chunks.push({ ...stored, ordinal, rowCount: pendingRows });
      plaintextSize += plaintext.byteLength;
      pending = [];
      pendingRows = 0;
      pendingBytes = 0;
    };
    for (const row of page.rows) {
      const line = encoder.encode(`${canonicalJson(row)}\n`);
      if (line.byteLength > KPBK1_CHUNK_LIMIT_BYTES)
        throw new Error('BACKUP_ROW_EXCEEDS_CHUNK_LIMIT');
      if (pendingBytes + line.byteLength > KPBK1_CHUNK_LIMIT_BYTES) await flush();
      pending.push(line);
      pendingRows += 1;
      pendingBytes += line.byteLength;
      rowCount += 1;
    }
    await flush();
    after = page.next;
  } while (after);
  const hash = await sha256(
    concat([
      encoder.encode('KPBK1-TABLE\0'),
      encoder.encode(input.entry.name),
      encoder.encode('\0'),
      ...chunks.flatMap((chunk) => [
        u64be(chunk.ordinal),
        fromHex(chunk.plaintextHash),
        u64be(chunk.plaintextSize),
      ]),
    ]),
  );
  return { name: input.entry.name, rowCount, plaintextSize, hash, chunks };
}

export async function runBackupExportAttempt(input: {
  readonly tenantId: string;
  readonly backupId: string;
  readonly epoch: number;
  readonly schemaVersion?: string;
  readonly registryVersion?: string;
  readonly exclusions?: Kpbk1Manifest['exclusions'];
  readonly registry: readonly RegistryBusinessEntry[];
  readonly dek: Uint8Array;
  readonly readTablePage: (input: {
    readonly tenantId: string;
    readonly tableName: string;
    readonly after: Readonly<Record<string, unknown>> | null;
    readonly limit: number;
  }) => Promise<TablePage>;
  readonly source: {
    head(key: string): Promise<SourceHead | null>;
    get(key: string): Promise<SourceObject | null>;
  };
  readonly destination: ExportDestination;
}): Promise<BackupExportResult> {
  const descriptors = new Map<string, TablePage['objectDescriptors'][number]>();
  const tables: BackupExportTable[] = [];
  for (const entry of [...input.registry].sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    tables.push(await exportTable({ ...input, entry, descriptors }));
  }
  const objects: BackupExportObject[] = [];
  const sortedDescriptors = [...descriptors.values()].sort((left, right) =>
    left.sourceR2Key.localeCompare(right.sourceR2Key),
  );
  for (const [ordinal, descriptor] of sortedDescriptors.entries()) {
    const before = await input.source.head(descriptor.sourceR2Key);
    const source = await input.source.get(descriptor.sourceR2Key);
    if (!before || !source) throw new Error('BACKUP_SOURCE_OBJECT_MISSING');
    const plaintext = new Uint8Array(await source.arrayBuffer());
    const after = await input.source.head(descriptor.sourceR2Key);
    if (
      !after ||
      before.etag !== after.etag ||
      before.size !== after.size ||
      before.size !== plaintext.byteLength
    ) {
      throw new Error('BACKUP_SOURCE_OBJECT_CHANGED');
    }
    const aad = {
      tenant_id: input.tenantId,
      backup_id: input.backupId,
      format: 'KPBK1' as const,
      kind: 'OBJECT' as const,
      ordinal,
    };
    const encrypted = await encryptKpbk1Unit(
      plaintext,
      input.dek,
      aad,
      await stableNonce(
        input.dek,
        plaintext,
        `${input.tenantId}\0${input.backupId}\0OBJECT\0${descriptor.sourceR2Key}\0${ordinal}`,
      ),
    );
    const stored = await uploadUnit(
      input.destination,
      `staging/${input.tenantId}/${input.backupId}/objects/${ordinal}.bin`,
      plaintext,
      encrypted,
      { backupId: input.backupId, kind: 'object', sourceEtag: before.etag },
    );
    objects.push({
      ...stored,
      ordinal,
      sourceR2Key: descriptor.sourceR2Key,
      sourceEtag: before.etag,
    });
  }
  const rowCount = tables.reduce((total, table) => total + table.rowCount, 0);
  const chunkCount = tables.reduce((total, table) => total + table.chunks.length, 0);
  const content = {
    epoch: input.epoch,
    exclusions: input.exclusions ?? [],
    format_version: 'KPBK1' as const,
    objects: objects.map((object) => ({
      logical_key: object.sourceR2Key,
      source_r2_key: object.sourceR2Key,
      plaintext_size_bytes: object.plaintextSize,
      hash: object.plaintextHash,
    })),
    registry_version: input.registryVersion ?? 'registry-3',
    schema_version: input.schemaVersion ?? '0035',
    tables: tables.map((table) => ({
      name: table.name,
      row_count: table.rowCount,
      plaintext_size_bytes: table.plaintextSize,
      hash: table.hash,
      chunks: table.chunks.map((chunk) => ({
        ordinal: chunk.ordinal,
        row_count: chunk.rowCount,
        plaintext_size_bytes: chunk.plaintextSize,
        hash: chunk.plaintextHash,
      })),
    })),
    tenant_id: input.tenantId,
  };
  const globalHash = await sha256(
    concat([encoder.encode('KPBK1-GLOBAL\0'), encoder.encode(canonicalJson(content))]),
  );
  const manifest: Kpbk1Manifest = {
    backup_id: input.backupId,
    ...content,
    global_hash: globalHash,
  };
  return { epoch: input.epoch, tables, objects, rowCount, chunkCount, globalHash, manifest };
}
