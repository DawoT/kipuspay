---
doc_id: arch-05-9-data-backup
alias: Arquitectura
authority: normativa
owner: "@DawoT"
section: "5.9"
---

### **5.9 Backup total, formato KPBK1 y restore dry-run**

#### Regla 27 — Export/restore total del negocio (`data.backup`, ADR-0026)

Sprint 42 entrega el contrato y el **restore dry-run**. No aplica datos restaurados:
`apply` pertenece a Sprint 48 y hasta entonces toda ruta de apply debe estar ausente o
responder `501 RESTORE_APPLY_NOT_AVAILABLE`. La capability y sus rutas Worker/POS
permanecen default-off. No se cierra Sprint 42 ni se habilita ningún claim GTM por
publicar este contrato o sus tests RED.

El backup incluye datos BUSINESS del tenant en D1 y cada objeto R2 BUSINESS
referenciado por esos datos. No es una copia del shard ni de todo el bucket. Excluye
SECRET (secretos, credenciales y material de claves), EPHEMERAL (sesiones y tokens),
DERIVED regenerable y el IndexedDB local aún no sincronizado. Cada inclusión y
exclusión aparece explícitamente en el manifest; una exclusión indica clasificación,
razón y conteo conocido, sin revelar valores secretos. El POS advierte que cambios
locales pendientes de sincronizar no están incluidos y ofrece sincronizar, pero
exportar, reintentar o fallar un backup nunca bloquea venta, cobro, sync ni cierre Z.

##### Registry exhaustivo

Un registry versionado, revisable en código, clasifica cada tabla tenant-scoped como
exactamente `BUSINESS`, `DERIVED`, `EPHEMERAL` o `SECRET`. Para `BUSINESS` declara
columnas permitidas, PK compuesta, orden de columnas, relaciones R2 y estrategia de
lectura. Para las demás declara una razón estable. El gate compara el registry con
`sqlite_master` y falla ante una tabla tenant sin clasificar, una columna BUSINESS no
declarada o una entrada inexistente. La completitud recorre también hijos legacy cuya
identidad tenant se obtiene por una cadena de FK; no puede omitirlos porque carezcan de
`tenant_id` físico. Tablas de control de backup se clasifican `EPHEMERAL`.

Solo BUSINESS entra como filas. DERIVED se manifiesta para regeneración; EPHEMERAL y
SECRET se manifiestan como exclusiones. En particular quedan excluidos credenciales,
certificados y secretos fiscales, API/webhook keys, PIN/password hashes, tokens de
autorización/refresh/reset, sesiones efímeras y material KMS/DEK/KEK.

##### KPBK1: representación canónica exacta

`KPBK1` es un contenedor lógico, no una promesa de ciphertext reproducible:

1. `manifest.json` es UTF-8, sin BOM, JSON canónico versionado `KPBK1` con claves
   lexicográficas, enteros decimales, strings NFC y sin whitespace insignificante.
   Arrays conservan el orden definido aquí; timestamps se normalizan a UTC RFC3339 con
   milisegundos. `format_version`, `registry_version`, `schema_version`,
   `tenant_id`, `backup_id`, `epoch`, tablas, objetos, exclusiones y hashes son
   obligatorios. Campos volátiles (`created_at`, actor e idempotency) viven en metadata
   de control y no participan del hash de contenido.
2. Tablas siguen el orden lexicográfico de nombre del registry; columnas siguen el
   orden fijo declarado; filas se ordenan por todos los componentes de PK, con
   comparación binaria UTF-8 y `NULL` antes de no-`NULL`. Una tabla sin PK declarada
   invalida el registry.
3. Cada fila es un objeto JSON canónico en una línea JSONL UTF-8 terminada por LF.
   Números D1 INTEGER son enteros JSON; BLOB es base64url sin padding; DATETIME usa la
   normalización anterior. No se admite CRLF, BOM, `NaN`, infinito ni float monetario.
4. El chunker acumula filas completas hasta un máximo fijo de 4 MiB de plaintext
   (`4 * 1024 * 1024` bytes). Una fila mayor se rechaza con
   `BACKUP_ROW_EXCEEDS_CHUNK_LIMIT`; nunca se parte una fila. Ordinales comienzan en
   cero por tabla. El mismo dataset y registry producen los mismos límites.
5. SHA-256 opera sobre bytes decrypted. `chunk_hash` hashea los bytes JSONL exactos.
   `table_hash = SHA256("KPBK1-TABLE\0" || table_name || "\0" ||
   concat(ordinal_u64be || chunk_hash_bytes || plaintext_size_u64be))`.
   `object_hash` es SHA-256 de bytes R2 originales.
   `global_hash = SHA256("KPBK1-GLOBAL\0" || canonical_content_manifest_bytes)`, donde
   el content manifest contiene únicamente versión/schema/registry/epoch y listas
   ordenadas de nombres, tamaños y hashes de tablas, chunks, objetos y exclusiones.
6. Objetos referenciados se ordenan por clave lógica, registran source key, tamaño y
   SHA-256 y se leen con verificación antes y después. Ausencia, cambio de ETag/tamaño
   o hash distinto aborta con `BACKUP_SOURCE_OBJECT_CHANGED`; jamás se publica READY.

Dos capturas del mismo `tenant_id + epoch + registry_version + schema_version` deben
producir el mismo `global_hash` y los mismos bytes decrypted, aunque `backup_id`,
tiempo, DEK, nonces y ciphertext sean distintos. Comparar ciphertext bit-a-bit es un
test inválido.

##### Snapshot por `tenant_data_epoch`

Toda mutación BUSINESS server-side incrementa `tenant_data_epochs.epoch` en el mismo
`db.batch([...])` que la mutación. El reader toma `epoch_start`, lee tablas y objetos
en páginas deterministas y vuelve a leer `epoch_end`. Si difieren, descarta staging y
reintenta desde cero; máximo tres intentos. Al tercer drift marca
`FAILED/BACKUP_EPOCH_DRIFT`, aborta multipart y conserva cero artefactos publicables.
El retry es background/Workflow y no adquiere un lock que pueda bloquear el POS.

##### Cifrado de envoltura y storage

Cada backup genera con CSPRNG un DEK aleatorio de 256 bits. Cada chunk y objeto usa
AES-256-GCM con nonce aleatorio **único de 96 bits dentro del backup** y tag de 128
bits. Reusar nonce es fallo terminal. El AAD son bytes UTF-8 de la serialización
canónica de:
`{"tenant_id":...,"backup_id":...,"format":"KPBK1","kind":"TABLE|OBJECT|MANIFEST","ordinal":...}`.
El manifest cifrado usa `kind=MANIFEST, ordinal=0`.

El DEK solo se envuelve/desenvuelve mediante el service binding `BACKUP_KMS`, con
`kek_version` explícita. Rotar KEK afecta backups nuevos; backups existentes se
desenvuelven con su versión o se reenvuelven sin descifrar payload. D1/R2 guardan solo
`wrapped_dek`, `kek_version`, nonce, tag, ciphertext y hashes; nunca DEK/KEK ni claves
en claro. KMS no disponible falla cerrado con `BACKUP_KMS_UNAVAILABLE`, no publica
READY y no expone detalles del proveedor.

Uploads R2 multipart persisten upload/part checkpoints opacos para resume idempotente.
Un retry reusa únicamente partes confirmadas cuyo ciphertext hash coincide; conflicto
aborta el multipart y reinicia con nonces nuevos. Error terminal, epoch drift o
cancelación ejecuta abort. Ninguna key staging puede descargarse.

##### API, autorización y restore dry-run

Create/list/status/download/delete/dry-run derivan tenant y actor solo del JWT
verificado. `tenant_id`, R2 key, KEK version o backup ID cross-tenant enviados por el
cliente no otorgan autoridad. Crear y listar requiere Owner/Admin; descargar, borrar y
dry-run requieren Owner con step-up reciente y auditan la acción. IDs ajenos responden
404 opaco. Errores persistidos son códigos allowlisted y `error_ref` opaco, nunca
mensajes KMS/R2/SQL, claves o PII.

Download solo sirve backups READY, descifra en streaming con memoria acotada, verifica
GCM y hashes antes de emitir cada unidad y responde
`Cache-Control: private, no-store`, `Pragma: no-cache`,
`X-Content-Type-Options: nosniff` y attachment seguro. No crea un buffer total.

Dry-run autentica y verifica formato, schema soportado, AEAD, hashes global/tabla/chunk/
objeto, registry y pertenencia tenant. Produce un diff acotado por tabla y objetos
(`insert/update/conflict/missing`) y lo persiste, pero ejecuta **cero INSERT/UPDATE/
DELETE de tablas BUSINESS** y cero put/delete de objetos. KMS unavailable, tamper,
schema desconocido o tenant distinto falla cerrado. No existe restore apply en S42.

##### Restore apply y DR (Sprint 48)

`platform.dr` (regla 32b) añade la restauración **aplicada** a un shard DR aislado:
`applyRestoreRowsToShard` reutiliza las filas YA validadas por `verifyRestoreDryRun`
(port `collectRestoreRows` — nunca vuelve a descifrar), aplica en orden topológico
(FKs) con `INSERT OR IGNORE` (idempotente por PK, sin `UPSERT INTO`) y verifica
RPO=0 tx, RPO≤1d rollups y replay de colas sin duplicados (`verifyDrReplay`).
El simulacro (`POST /api/dr/simulation`, owner + step-up, flag `FEATURE_PLATFORM_DR`)
mide `rto_ms` contra el objetivo de 30 min y registra `DR_SIMULATION_*` en el audit.

##### Claim y criterios de activación

“Tus datos son tuyos” no significa “incluye secretos”, “incluye cambios offline aún no
sincronizados”, “ciphertext reproducible” ni “restore aplicado”. “Exporta todo tu
historial” permanece bloqueado hasta GREEN, evidencia runtime, firma Staff Security +
Staff SRE y Quality Gate. Sprint 42 solo puede afirmar export cifrado verificable y
dry-run cuando ese gate cierre; la restauración aplicada a shard DR y el RTO se
entregan en el Sprint 48 (regla 32b).

#### DDL objetivo de migración 0035 (no implementada en Sprint 42 baseline)

```sql
CREATE TABLE data_backups (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    format_version TEXT NOT NULL,
    registry_version TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    snapshot_epoch INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    global_hash TEXT,
    plaintext_size_bytes INTEGER,
    ciphertext_size_bytes INTEGER,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    object_count INTEGER NOT NULL DEFAULT 0,
    wrapped_dek BLOB,
    kek_version TEXT,
    manifest_r2_key TEXT,
    multipart_upload_ref TEXT,
    error_code TEXT,
    error_ref TEXT,
    created_by_user_id TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ready_at DATETIME,
    expires_at DATETIME,
    deleted_at DATETIME,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, idempotency_key),
    CHECK (format_version = 'KPBK1'),
    CHECK (status IN ('PENDING','SNAPSHOTTING','UPLOADING','READY','FAILED','DELETING','DELETED')),
    CHECK (snapshot_epoch >= 0),
    CHECK (plaintext_size_bytes IS NULL OR plaintext_size_bytes >= 0),
    CHECK (ciphertext_size_bytes IS NULL OR ciphertext_size_bytes >= 0),
    CHECK (length(global_hash) = 64 OR global_hash IS NULL),
    CHECK ((status = 'READY' AND global_hash IS NOT NULL AND wrapped_dek IS NOT NULL
            AND kek_version IS NOT NULL AND manifest_r2_key IS NOT NULL AND ready_at IS NOT NULL)
           OR status <> 'READY'),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (tenant_id, created_by_user_id) REFERENCES users(tenant_id, id)
);

CREATE TABLE data_backup_chunks (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    backup_id TEXT NOT NULL,
    table_name TEXT NOT NULL,
    ordinal INTEGER NOT NULL,
    row_count INTEGER NOT NULL,
    plaintext_size_bytes INTEGER NOT NULL,
    ciphertext_size_bytes INTEGER NOT NULL,
    plaintext_hash TEXT NOT NULL,
    ciphertext_hash TEXT NOT NULL,
    nonce BLOB NOT NULL,
    auth_tag BLOB NOT NULL,
    r2_key TEXT NOT NULL,
    multipart_part_ref TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, backup_id, table_name, ordinal),
    UNIQUE (tenant_id, backup_id, nonce),
    CHECK (ordinal >= 0 AND row_count >= 0),
    CHECK (plaintext_size_bytes BETWEEN 0 AND 4194304),
    CHECK (ciphertext_size_bytes >= 0),
    CHECK (length(plaintext_hash) = 64 AND length(ciphertext_hash) = 64),
    CHECK (length(nonce) = 12 AND length(auth_tag) = 16),
    FOREIGN KEY (tenant_id, backup_id) REFERENCES data_backups(tenant_id, id)
);

CREATE TABLE data_backup_objects (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    backup_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL,
    source_r2_key TEXT NOT NULL,
    backup_r2_key TEXT NOT NULL,
    source_etag TEXT,
    plaintext_size_bytes INTEGER NOT NULL,
    ciphertext_size_bytes INTEGER NOT NULL,
    plaintext_hash TEXT NOT NULL,
    ciphertext_hash TEXT NOT NULL,
    nonce BLOB NOT NULL,
    auth_tag BLOB NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, backup_id, ordinal),
    UNIQUE (tenant_id, backup_id, source_r2_key),
    UNIQUE (tenant_id, backup_id, nonce),
    CHECK (ordinal >= 0 AND plaintext_size_bytes >= 0 AND ciphertext_size_bytes >= 0),
    CHECK (length(plaintext_hash) = 64 AND length(ciphertext_hash) = 64),
    CHECK (length(nonce) = 12 AND length(auth_tag) = 16),
    FOREIGN KEY (tenant_id, backup_id) REFERENCES data_backups(tenant_id, id)
);

CREATE TABLE data_backup_table_manifests (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    backup_id TEXT NOT NULL,
    table_name TEXT NOT NULL,
    classification TEXT NOT NULL,
    pk_json TEXT NOT NULL,
    columns_json TEXT NOT NULL,
    row_count INTEGER NOT NULL,
    plaintext_size_bytes INTEGER NOT NULL,
    chunk_count INTEGER NOT NULL,
    table_hash TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, backup_id, table_name),
    CHECK (classification = 'BUSINESS'),
    CHECK (row_count >= 0 AND plaintext_size_bytes >= 0 AND chunk_count >= 0),
    CHECK (length(table_hash) = 64),
    FOREIGN KEY (tenant_id, backup_id) REFERENCES data_backups(tenant_id, id)
);

CREATE TABLE restore_dry_runs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    backup_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    source_global_hash TEXT,
    diff_hash TEXT,
    diff_r2_key TEXT,
    insert_count INTEGER NOT NULL DEFAULT 0,
    update_count INTEGER NOT NULL DEFAULT 0,
    conflict_count INTEGER NOT NULL DEFAULT 0,
    missing_object_count INTEGER NOT NULL DEFAULT 0,
    error_code TEXT,
    error_ref TEXT,
    requested_by_user_id TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, idempotency_key),
    CHECK (status IN ('PENDING','RUNNING','PASSED','FAILED')),
    CHECK (insert_count >= 0 AND update_count >= 0 AND conflict_count >= 0
           AND missing_object_count >= 0),
    CHECK (length(source_global_hash) = 64 OR source_global_hash IS NULL),
    CHECK (length(diff_hash) = 64 OR diff_hash IS NULL),
    FOREIGN KEY (tenant_id, backup_id) REFERENCES data_backups(tenant_id, id),
    FOREIGN KEY (tenant_id, requested_by_user_id) REFERENCES users(tenant_id, id)
);

CREATE TABLE tenant_data_epochs (
    tenant_id TEXT NOT NULL PRIMARY KEY,
    epoch INTEGER NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (epoch >= 0),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
```

La migración 0035 deberá crear índices de lifecycle/tenant, triggers de inmutabilidad
de manifests READY y `schema_meta['data.backup.sprint42']='1'`. Su down es protegido:
aborta si existe un backup no `DELETED`, un dry-run o cualquier objeto/chunk
registrado; solo entonces elimina hijos antes que padres y el marker. Este DDL es
objetivo contractual, no autoriza crear la migración durante el baseline RED.
