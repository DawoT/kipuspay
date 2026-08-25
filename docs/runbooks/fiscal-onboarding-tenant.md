---
doc_id: runbook-fiscal-onboarding-tenant
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Runbook — Onboarding fiscal de un negocio nuevo (emisión directa, camino A)

| Campo | Valor |
| --- | --- |
| Severidad tipica | SEV-3 (procedimiento planificado) / SEV-1 si material de firma se compromete durante el proceso |
| Owner on-call | Staff Fiscal + Staff Security |
| Ultima ensayada | 2026-08-21 (piloto Rosa Negra staging, e-beta software GREEN) |
| Relaciona | Arquitectura §5.1 · §5.2 · §5.4 · ADR-FISCAL-001 · ADR-FISCAL-002 · ADR-FISCAL-006 · ADR-FISCAL-007 · ADR-FISCAL-008 · docs/runbooks/sunat-cdt-rosa-negra-staff.md · docs/runbooks/secrets-ops-material.md · docs/ops/fl-fiscal-live-qg.md |

**Decisión del owner (camino A):** cada RUC emite con su propio certificado
digital (`pse_mode = 'TENANT_CERT'`) + credenciales SOL propias. El default de
producto sigue siendo `KIPUSPAY_PSE` (ADR-FISCAL-001); este runbook cubre el
onboarding del emisor directo. Sin contingencia como atajo (invariante 8):
el negocio no emite CPE hasta completar la sección de verificación con CDR.

## 1. Prerrequisitos del negocio (lado humano)

El dueño del RUC consigue, antes de tocar KipusPay:

1. **Certificado digital `.p12`/`.pfx`** emitido por una CA autorizada por
   SUNAT, a nombre del RUC del negocio, con **uso tributario** (los CDT de
   SUNAT ya nacen con ese uso; un certificado SSL/personal NO sirve).
   - Vigencia típica: 1–2 años. Anotar la fecha de expiración: KipusPay la
     guarda en `tenant_certificates.expires_at` y es insumo de rotación (§5).
   - La contraseña del `.p12` la conoce SOLO el dueño; nunca viaja por correo
     ni queda en disco de staff (solo sesión/tty).
2. **Usuario SOL secundario** del RUC, con perfil de facturación electrónica
   (permisos para `sendBill`/`sendSummary`). Recomendación: usuario secundario
   dedicado a la integración, no el principal del contribuyente.
3. **RUC habilitado como emisor electrónico** en SUNAT (solamente requerido
   para producción; para la validación en e-beta basta el RUC activo).
4. Datos del emisor para el alta en KipusPay: razón social, dirección,
   régimen (`tax_regime`), documentos a habilitar (`01`, `03`, `07`, `08`).

Si el negocio aún no tiene RUC activo, NO aplica este runbook: queda en
`INTERNAL_CONTROL` con Notas de Venta (matriz §5.1) hasta formalizarse.

### 1.1 Elegibilidad CDT (certificado gratuito)

Antes de que el dueño compre un certificado con una CA privada, verificar si el
RUC califica al **Certificado Digital Tributario (CDT) gratuito de SUNAT**
(fuente: cpe.sunat.gob.pe/certificado-digital). El CDT sirve exactamente para
lo que este runbook necesita: firma digital de CPE con uso tributario, y su
vigencia es de **3 años** (registrarla en `tenant_certificates.expires_at`
igual que cualquier cert, §5).

Requisitos del contribuyente **a la fecha de la solicitud** (todos obligatorios):

| # | Requisito |
| --- | --- |
| 1 | RUC con condición **ACTIVO y HABIDO** (sin domicilio fiscal no habido) |
| 2 | Afecto a renta de **3ra categoría** (RG, RER, RMYPE, Agrario) |
| 3 | Ingresos netos anuales **≤ 300 UIT** (referencia S/ 1 260 000, año 2019) |
| 4 | **No inscrito** en el Registro de PSE ni en el Registro de OSE |
| 5 | **No poseer un CDT vigente** emitido |
| 6 | No haber obtenido **más de 2 CDTs** en virtud de la norma |
| 7 | Aceptar los términos y condiciones del contrato de uso del CDT |

Trámite (lo hace el dueño del RUC, ~15 min, online): SOL → **Empresas →
Comprobantes de Pago → Certificado Digital Tributario – CDT → Solicitar**;
aceptar T&C y recoger el `.p12` desde el **Buzón electrónico**, creando la
clave privada (alfanumérica, mínimo 8 caracteres). Desde ahí continúa §2.2 de
este runbook (validación del paquete). La clave del CDT es one-shot como
cualquier `.p12`: nunca por correo ni en disco de staff.

**Ventana de autorización:** SUNAT está autorizada a emitir el CDT gratuito
hasta el **31 de diciembre de 2027** (Ley 32543, prórroga de la Ley 27269);
desde el 01-01-2028 continuará solo si acredita ante INDECOPI como EREP. Al
planificar rotaciones cerca de esa fecha, confirmar el canal vigente antes de
prometer renovación al dueño.

**Cuándo se exige certificado pagado (CA autorizada):** si el perfil NO
califica — inscrito en PSE/OSE, ingresos > 300 UIT, no afecto a 3ra categoría,
o ya usó sus 2 CDTs — el dueño compra el cert de uso tributario a una CA
autorizada por SUNAT (vigencia típica 1–2 años, §1.1 requisitos generales del
certificado). KipusPay no cambia su flujo: mismo `.p12`, misma carga §2.5,
misma rotación §5; solo cambia quién lo emitió y cuánto costó.

## 2. Provisioning técnico (lado KipusPay)

Convenciones: workdir raíz del repo; los PEM viven en `tmp-staff/`
(gitignored); ninguna contraseña por flag de CLI (siempre tty o env de
sesión). Staging usa `--env staging`; producción replicará el patrón cuando
exista entorno fiscal productivo (hoy el canal productivo está WAIT, S14).

### 2.1 Alta del tenant y series (comando staff)

**Canónico:** `scripts/staff/onboard-tenant.mjs` genera y aplica el skeleton del
emisor de forma atómica y parametrizada (cierra el gap de alta por copy-paste,
LEDGER 0472/0473). El seed del piloto
(`scripts/staff/seed-rosa-negra-staging.sql`) queda como fixture histórico de
referencia, no como plantilla.

```bash
# 1) SIEMPRE dry-run primero: imprime plan + SQL + snapshot KV, no toca nada.
node scripts/staff/onboard-tenant.mjs \
  --tenant-id tenant_stg_<negocio>_001 --ruc <11 dígitos> \
  --nombre "RAZON SOCIAL SAC" [--trade-name X] [--direccion Y] \
  [--tax-regime RG] [--doc-types 01,03,07,08]

# 2) Aplicar: preflight SELECT → batch D1 atómico (--file) → TENANT_KV →
#    post-verificación de conteos. Exige namespace explícito.
TENANT_KV_NAMESPACE_ID=<NS_TENANT_KV_STAGING> \
node scripts/staff/onboard-tenant.mjs ... --apply --kv-namespace-id "$TENANT_KV_NAMESPACE_ID"
```

Garantías del comando (tests en `scripts/staff/onboard-tenant.test.mjs`,
`pnpm test:staff`):

- **Fail-closed en entrada:** `--tenant-id` con formato `tenant_<snake_case>`,
  RUC de 11 dígitos con dígito verificador módulo 11 de SUNAT (un typo de RUC
  en `tenants.ruc` envenena la emisión fiscal), nombre no vacío, catálogo de
  documentos camino A, régimen dentro del CHECK de DDL, solo `--env staging`
  (canal productivo fiscal WAIT).
- **Idempotencia limpia:** preflight SELECT por id y por RUC; colisión → error
  tipado (`TENANT_EXISTS`, `RUC_ALREADY_REGISTERED`) sin escribir nada. El SQL
  generado usa INSERT simple: sin `INSERT OR IGNORE` ni cláusulas de conflicto.
- **Atomicidad:** un solo archivo SQL aplicado con una llamada
  (`wrangler d1 execute DB --env staging --remote --file`) = batch D1
  transaccional all-or-nothing; si una sentencia falla, no persiste ninguna.
  Post-verificación de conteos por tabla; desvío → `PARTIAL_APPLY` visible.
- **Sin secretos:** el comando no maneja PINs, certificados ni credenciales
  SOL; el usuario owner se crea por flujo de auth, no por seed.

Campos que el comando fija para emisor directo (equivalen al INSERT canónico):

| Columna | Valor camino A |
| --- | --- |
| `formalization_mode` | `'ELECTRONIC_ISSUER'` |
| `sunat_certificate_status` | `'PENDING_UPLOAD'` (pasa a `'ACTIVE'` solo tras carga del cert, §2.5) |
| `pse_mode` | `'TENANT_CERT'` |
| `enabled_document_types` | JSON con lo autorizado por régimen, default `'["01","03","07","08"]'` |

Skeleton creado: fila en `tenants`, branch `0001` "Local principal", caja
principal, series AUTHORIZED con correlativo 0 (`01→F001`, `03→B001`, `07→FC01`,
`08→FD01`) y método de pago efectivo. IDs derivados deterministas
(`<tenant_id>_branch_0001`, `<tenant_id>_series_<doc>`): re-ejecutar tras un
abort limpio es seguro porque el preflight rechaza todo alta parcial.

Verificación del schema antes de cualquier INSERT manual fuera del comando
(columnas reales):

```bash
pnpm --filter @kipuspay/worker-api exec wrangler d1 execute DB \
  --env staging --remote \
  --command "SELECT sql FROM sqlite_master WHERE name='tenant_certificates'"
pnpm --filter @kipuspay/worker-api exec wrangler d1 execute DB \
  --env staging --remote --command "PRAGMA table_info(tenant_certificates)"
```

### 2.2 Validar el `.p12` (antes de cargarlo)

Inspección del paquete (la contraseña solo por env de sesión, sin echo):

```bash
read -rs P12_PASS && export P12_PASS
openssl pkcs12 -info -in certificado.p12 -passin "env:P12_PASS" -noout
```

Validar contra los datos del negocio (patrón usado con el CDT Rosa Negra):

```bash
openssl pkcs12 -in certificado.p12 -passin "env:P12_PASS" -nokeys -clcerts \
  | openssl x509 -noout -subject -issuer -dates -fingerprint -sha256
```

Checklist de aceptación:

- `subject` contiene el **RUC del negocio** (CN = RUC o razón social según CA).
- `notAfter` (vigencia) > fecha de hoy; registrar la fecha para rotación.
- Emisor (`issuer`) es una CA autorizada por SUNAT y el certificado es de uso
  tributario (CDT). Si la CA entrega un certificado sin ese uso → rechazar.
- El fingerprint SHA-256 (64 hex) es el que quedará en D1: compararlo luego.

Si `openssl` falla al abrir el paquete, la CA usó cifrado legacy RC2: reintentar
con `-legacy` (el script del paso siguiente lo hace automáticamente).

### 2.3 Extraer clave PKCS#8 + cadena (break-glass staff)

Camino canónico es la UI del dueño (§2.5). Este camino staff es break-glass
(cuando el dueño no puede subirlo o hay que restaurar):

```bash
scripts/staff/extract-cdt-p12.sh certificado.p12 tmp-staff/<negocio>
```

El script (real, ensayado con Rosa Negra): pide la pass por tty sin eco,
extrae `leaf.pem` + `chain.pem` + `private.pem` (PKCS#8 sin passphrase),
reintenta con `-legacy` si la extracción falla, genera `cert-chain.pem`
(hoja + cadena, orden requerido por XAdES) e imprime fingerprint + endDate.
Nunca commitear `tmp-staff/` (gitignored) ni los PEM (`*.pem` gitignored).

### 2.4 Envelope de la clave privada (DEK + KMS)

La clave privada jamás se persiste en claro. El sobre AES-GCM v1 vive en
`packages/domain-fiscal-pe/src/tenant-cert-envelope.ts`: DEK de 32 bytes,
nonce de 12, `sealPkcs8WithDek`/`openPkcs8WithDek`, serialización
`{v:1, kekVersion, backupId, wrappedDekB64, nonceB64, ciphertextB64}`.
El DEK se envuelve con el KMS (`BACKUP_KMS.wrapDek`,
`backupId='tenant-cert:SUNAT'`); el ciphertext del PKCS#8 solo existe dentro
del sobre, y el sobre como valor del campo `private_key_kms_ref`.

Generación del sobre (script real `scripts/staff/wrap-tenant-cert.mjs`):

```bash
WRAP_DEK_URL="https://<worker-api-staging>/v1/internal/tenant-cert/wrap-dek" \
PLATFORM_STAFF_TOKEN="$(cat tmp-staff/platform-staff-token.txt)" \
TENANT_ID="<TENANT_ID>" BACKUP_ID="tenant-cert:SUNAT" \
node scripts/staff/wrap-tenant-cert.mjs \
  tmp-staff/<negocio>/private.pem tmp-staff/<negocio>/envelope.json
```

El endpoint `/v1/internal/tenant-cert/wrap-dek` (worker-api, guard
`x-platform-staff-token`) devuelve `{wrappedDekB64, kekVersion}` y el script
escribe el sobre completo. Sin `WRAP_DEK_URL` el script se niega a producir un
sobre placeholder (fail-closed): exige `WRAPPED_DEK_B64` + `KEK_VERSION` ya
envueltos, o aborta.

### 2.5 Registrar el certificado en D1

**Camino canónico — UI del dueño (S7):** POS → Configuración
(`/admin/configuracion`, bloque `tenant-cert-upload`) → archivo `.p12`/`.pfx`
+ contraseña one-shot. El frontend hace `POST /api/fiscal/tenant-cert` con
`{p12B64, password}` (JWT owner/admin); el Worker parsea el PKCS#12
(`parsePkcs12`, sin npm en el cliente), sella el PKCS#8 con DEK nuevo, envuelve
el DEK con KMS y ejecuta `db.batch([...])` (invariante 2) que inserta/actualiza
`tenant_certificates` y pone `tenants.sunat_certificate_status = 'ACTIVE'`.
Límite: 48 KiB por `.p12`.

**Break-glass — SQL staff** (mismo resultado, sin UI; usar el schema verificado
en §2.1; `private_key_kms_ref` lleva el sobre inline con prefijo
`envelope-v1:` — formato que el firmante resuelve en
`packages/adapters-d1/src/tenant-cert-signer.ts`):

```sql
INSERT INTO tenant_certificates (
  id, tenant_id, alias, private_key_kms_ref, cert_chain_pem,
  fingerprint_sha256, expires_at
) VALUES (
  'cert_stg_<negocio>_001', '<TENANT_ID>', 'SUNAT',
  'envelope-v1:<contenido íntegro de envelope.json>',
  '<contenido de tmp-staff/<negocio>/cert-chain.pem>',
  '<fingerprint_sha256 64 hex minúsculas>',
  'YYYY-MM-DD HH:MM:SS'
);

UPDATE tenants SET sunat_certificate_status = 'ACTIVE' WHERE id = '<TENANT_ID>';
```

Aplicar y verificar (el fingerprint debe coincidir con el del §2.2; la clave
privada NO aparece en ninguna columna):

```bash
pnpm --filter @kipuspay/worker-api exec wrangler d1 execute DB \
  --env staging --remote --file tmp-staff/<negocio>/insert-tenant-cert.sql
pnpm --filter @kipuspay/worker-api exec wrangler d1 execute DB \
  --env staging --remote \
  --command "SELECT alias, fingerprint_sha256, expires_at FROM tenant_certificates WHERE tenant_id='<TENANT_ID>'"
```

`expires_at` sale de `openssl x509 -enddate` (formato GMT) convertido a
`YYYY-MM-DD HH:MM:SS` UTC — misma normalización que aplica la ruta de upload.

### 2.6 Configurar credenciales SOL del tenant

Resolución de credenciales SOL (`selectFiscalTransport`, apps/worker-fiscal),
por precedencia: fila del tenant en `tenant_sol_credentials` (envelope KMS,
migración 0061; LEDGER 0473) > par `SUNAT_SOL_USER` / `SUNAT_SOL_PASSWORD`
del entorno del worker (fallback histórico del piloto Rosa Negra) >
fail-closed (`MISCONFIGURED` en staging, `SUNAT_PRODUCTION_SOL_MISSING` en
production; nunca mock con flags on). Este onboarding usa el par del worker
mientras la escritura de filas SOL por tenant siga manual (gap registrado
en §8).

Ubicación autoritativa CONFIRMADA (2026-08-24, GET settings de la API CF +
`wrangler secret list --env staging`): ambos son bindings `secret_text` del
Worker `kipuspay-worker-fiscal-staging`; `kipuspay-worker-api-staging` NO los
tiene (su ruta RC delega al servicio `FISCAL`). Mecanismo de actualización,
procedimiento completo de rotación y verificación: sección «Credenciales
SUNAT SOL» de docs/runbooks/secrets-ops-material.md. Aplicar así:

```bash
pnpm --filter @kipuspay/worker-fiscal exec wrangler secret put SUNAT_SOL_USER --env staging
pnpm --filter @kipuspay/worker-fiscal exec wrangler secret put SUNAT_SOL_PASSWORD --env staging
```

Notas obligatorias:

- Persistir primero ops-local (chmod 600), aplicar después, y verificar con
  1 envío e-beta con CDR código 0 (regla de rotación ciega del runbook de
  secretos). Nombres y mecanismo ya confirmados: no requiere inspección de
  dashboard previa.
- worker-api declara los mismos campos para rutas RC pero hoy NO tiene los
  bindings: su `buildRcCdrPort` delega al binding de servicio `FISCAL`
  (worker-fiscal). Solo replicar los secrets ahí si se habilita envío directo
  desde el API (canal production FL-2), siempre ANTES de encender ese camino.
- **Limitación conocida:** un par SOL por ambiente de worker ⇒ un solo emisor
  directo por ambiente mientras no exista routing SOL por tenant. No mezclar
  dos negocios en el mismo ambiente con este esquema (gap registrado en §8).
- Nunca literales SOL en git, tickets ni logs (SEC-03).

### 2.7 Flags de runtime (nunca en git)

Los flags fiscales viven en `wrangler.jsonc` en `0` y se activan solo como
variable runtime del deploy (lección S12; jamás `FEATURE_*=1` commiteado):

- `FEATURE_FISCAL_TRANSPORT_PLUGINS=1` — habilita selección real de transporte.
- `FEATURE_FISCAL_CPE=1` y `FEATURE_FISCAL_RC=1` — produce/envía CPE y RC.
- Sin SOL configurada y con plugins on, el transporte es `MISCONFIGURED`
  (503/unreachable, ADR-FISCAL-008): error visible, nunca éxito fingido.

## 3. Verificación pre-producción (e-beta ANTES de producción)

Ningún negocio pasa a producción sin esta batería verde. Canal por defecto del
código: `https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService`
(`SUNAT_BETA_BILL_SERVICE_URL`); no configurar `SUNAT_BILL_ENDPOINT_URL` en
esta fase (un override apuntaría a otro canal).

1. **Firma de prueba:** emitir una venta fixture y verificar que el XML en R2
   lleva `ds:Signature`:
   `r2 object get kipuspay-fiscal-xml-staging/fiscal-xml/<TENANT_ID>/<SALE_ID>.xml`
   y grep de `ds:Signature`. Sin material KMS el producer falla con
   `MISSING_SIGNER` (nunca XML unsigned).
2. **Envío manual a e-beta** (script staff real; corre con el runner de
   `adapters-sunat` porque importa módulos TS):

   ```bash
   pnpm --filter @kipuspay/adapters-sunat exec vitest run --no-coverage \
     ../../scripts/staff/send-beta-cpe.mjs
   # con STAFF_SEND_BETA=1 y env: SIGNED_XML=<xml firmado> DOC_KIND=01|03|07|08
   # SUNAT_SOL_USER=... SUNAT_SOL_PASSWORD=... [TENANT_ID] [SALE_ID]
   ```

   Éxito = respuesta con CDR de código `0`. **Sin CDR no hay aceptación**
   (invariante 8): un ticket SOAP o un 2xx HTTP no cuentan.
3. **Matriz mínima por negocio nuevo** (reusar la evidencia de
   docs/ops/fl-fiscal-live-qg.md como referencia de formato): factura `01`
   ACCEPTED, boleta vía RC `sendSummary` ACCEPTED, NC `07` que anula la
   factura ACCEPTED. Guardar CDRs como evidencia del gate.
4. **Estado D1 coherente:** `sunat_status='ACCEPTED'` solo con CDR; DLQ vacía
   o drenada; `GET /api/fiscal/tenant-cert` responde
   `{uploaded:true, fingerprintSha256, expiresAt}` (sin material privado).

## 4. Cutover a producción (cuando el negocio esté habilitado)

Precondiciones (equivalente T6 del piloto): RUC habilitado como emisor
electrónico, SOL de producción creada, autorización escrita para el canal
`e-factura.sunat.gob.pe`, y correlativos/series de producción definidos por el
negocio (las series de e-beta NO se reutilizan).

1. Certificado: el mismo `.p12` de uso tributario sirve para producción;
   verificar vigencia ≥ horizonte del acuerdo y repetir §2.2.
2. Secretos: aplicar `SUNAT_SOL_USER`/`SUNAT_SOL_PASSWORD` de producción en el
   worker del ambiente productivo (patrón §2.6; persistir primero ops-local).
3. Canal: configurar `SUNAT_BILL_ENDPOINT_URL` con el endpoint billService de
   producción (override explícito; el default de código permanece e-beta).
4. Checklist de validación en caliente:
   - Primera factura de producción con CDR código `0` verificado en SOL.
   - RC del día con CDR; banner de boletas sin RC desaparece.
   - Plazos vivos: factura `must_submit_by = issued_date_lima + 3 días`;
     boleta `+ 7 días` (§5.2); alertas T-24h/T-6h activas.
   - `GET /api/fiscal/tenant-cert` refleja el fingerprint esperado.
5. Declarar el negocio operativo solo con esa evidencia; sincronizar el estado
   comercial (GTM) aparte — este runbook NO cierra go-live de producto.

## Rollback

- **Canal:** quitar el override `SUNAT_BILL_ENDPOINT_URL` (vuelve e-beta) o
  apagar `FEATURE_FISCAL_CPE=0` (deja de enviar; la venta local sigue,
  offline-first). Reconciliar después con drain manual.
- **Certificado comprometido:** revocar el CDT ante SUNAT (dueño del RUC),
  poner `sunat_certificate_status='REVOKED'`, borrar el secreto del sobre y
  dejar `PENDING_UPLOAD` para re-carga (patrón del runbook Rosa Negra).
- **SOL comprometida:** rotación ciega §2.6 + invalidar sesiones derivadas.
- Nunca "rollback" = afirmar aceptación sin CDR ni re-numerar series.

## 5. Seguridad del material de firma

- La clave privada existe en: memoria del Worker durante la firma, el sobre
  cifrado en `tenant_certificates.private_key_kms_ref`, y NADA más. Jamás en
  git (`*.pem`, `*.p12`, `.dev.vars`, `tmp-staff/` gitignored), jamás en logs
  (los scripts staff imprimen fingerprints, no material), jamás en tickets.
- La contraseña del `.p12` es one-shot: tty del dueño o de la sesión staff;
  no persistirla nunca.
- Acceso: la carga es owner/admin (403 para otros roles); el wrap-dek staff
  exige `PLATFORM_STAFF_TOKEN`; la lectura del cert solo expone fingerprint y
  fechas.
- **Rotación (vigencia):** monitorear `expires_at` (índice
  `idx_tenant_certificates_expires`). Renovar con CDT nuevo ante SUNAT →
  repetir §2.2–§2.6. La ruta de upload actualiza la fila existente y estampa
  `rotated_at` (db.batch atómico). Rotar ANTES de vencer: cert vencido =
  rechazos de firma en SUNAT.
- **Revocación:** sospecha de compromiso → dueño revoca el CDT en SUNAT,
  staff marca `REVOKED`, borra el secreto del sobre y exige nueva carga
  (fail-closed: sin cert no hay firma, sin firma no hay CPE, nunca mock).

## 6. Futuro PSE homologado (qué cambiaría)

Cuando KipusPay sea PSE homologado (ADR-FISCAL-001/002):

- El default `pse_mode='KIPUSPAY_PSE'` pasa de aspiración a canal real: el
  negocio deja de necesitar certificado ni SOL propios; su `pse_mode` cambia a
  plataforma y el pipeline por-tenant (series, plazos, RC, DLQ) se mantiene.
- El certificado de firma pasa a ser del PSE (`alias='PSE_PLATFORM'`, valor ya
  previsto en el CHECK de `tenant_certificates`); los certificados
  `alias='SUNAT'` existentes quedan como histórico/rotación del emisor.
- El plugin `FiscalTransport` del PSE entra por `FEATURE_FISCAL_TRANSPORT_PLUGINS`
  sin forks por vertical; los emisores directos (camino A) pueden seguir en
  `TENANT_CERT` si así lo contratan.
- Este runbook queda entonces para el modo avanzado (emisor con cert propio).

## Escalamiento

| Condición | Escalar a |
| --- | --- |
| Certificado o SOL comprometidos | Staff Fiscal + Staff Security; revocación ante SUNAT por el dueño |
| CDR inalcanzable sostenido (breaker abierto) | Staff Principal + Staff Fiscal (ADR-FISCAL-008) |
| Vencimiento de cert inminente sin renovación | Owner del tenant + Staff Fiscal (alerta T-30d sugerida) |
| Onboarding de negocio con régimen especial (NRUS/RER) | Staff Fiscal: validar matriz §5.1 antes de habilitar `01` |

## Postmortem

- Entrada de ledger (tipo Corrección/incidente) si hubo compromiso de material,
  rotación ciega o cutover con incidente: `id: ____`
- Registrar gaps detectados del onboarding manual (§8 de este runbook) como
  backlog de automatización con sprint owner.
