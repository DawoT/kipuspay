---
doc_id: adr-0037-sol-credentials-architecture
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-0037 — Arquitectura autoritativa de credenciales SOL SUNAT (fila por tenant canónica, fallback de piloto deprecado, Secrets Store excluido)

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-24 |
| Decisores | Staff Principal |
| Consultados | Staff Fiscal · Staff SRE |
| Informados | Escuadrón |
| Relaciona | Arquitectura §5.2 · §5.4 · Registry §0.4 (SEC-03) · ADR-FISCAL-007 (**corrige**) · ADR-FISCAL-008 · ADR-0036 · Ledger 0473 · Ledger 0474 · `docs/runbooks/fiscal-onboarding-tenant.md` · `docs/runbooks/secrets-ops-material.md` |

## Contexto

**Lo que ADR-FISCAL-007 decidió (2026-08-21).** Para homologar el piloto Rosa
Negra (`pse_mode=TENANT_CERT`, RUC 20612913251) contra SUNAT beta, el 007 creó
el modo `sunat_bill_beta` (SOAP `sendBill`/`sendSummary`) y fijó la ubicación
de las credenciales SOL en tres cláusulas: punto 1 «(`SUNAT_SOL_USER` /
`SUNAT_SOL_PASSWORD` solo Secrets Store)», punto 5 «SOL de producción en
Secrets Store» y consecuencias «SEC-03 (SOL nunca en D1/git)». La mecánica
SOAP, el breaker, el opt-in T6 y el rollback (`FEATURE_FISCAL_CPE=0`) de ese
ADR siguen vigentes; lo que derivó es exclusivamente la cláusula de ubicación.

**La evolución operativa real (piloto → multi-emisor).** El producto exigió
emisión directa por negocio (multi-emisor), no un solo emisor piloto. LEDGER
0473 implementó el camino canónico: migración 0061 crea `tenant_sol_credentials`
(envelope AES-GCM con DEK envuelta por KMS, patrón `tenant_certificates` 0056),
puerto `loadTenantSolCredentials` y routing de transporte por tenant en el
drain fiscal. LEDGER 0474 confirmó la ubicación real del material contra la
cuenta Cloudflare (GET settings de la API + `wrangler secret list --env
staging`): los secretos SOL viven como bindings `secret_text`
(`SUNAT_SOL_USER`/`SUNAT_SOL_PASSWORD`) del Worker
`kipuspay-worker-fiscal-staging`; `kipuspay-worker-api-staging` NO los tiene;
y el Secrets Store de Cloudflare **no guarda nada de SOL** (ahí vive material
de plataforma del worker-kms: KEKs backup/push, VAPID, service account FCM).
Resultado: tres cláusulas del 007 falsas en operación — deriva documental pura,
registrada como hallazgo en LEDGER 0474 con mandato de ADR corrector.

**La precedencia ya implementada (código test-fijado).** La resolución real de
credenciales SOL es una cadena de tres tramos:

1. **Fila del tenant primero.** `loadTenantSolCredentials`
   (`packages/adapters-d1/src/tenant-sol-credentials.ts`) lee
   `tenant_sol_credentials` (PK `(tenant_id, alias='SUNAT')`, migración 0061),
   desenvelopa `'envelope-v1:{json}'` con `unwrapDek` KMS (`backupId
   'tenant-sol:SUNAT'`) y parsea `{"solUser","solPassword"}`. Sin fila →
   `null` (fallback legítimo); material corrupto o KMS caído → throw tipado:
   NUNCA `null` ni credenciales parciales.
2. **Env del worker como fallback.** `selectFiscalTransport` /
   `createTenantSolRoutingTransport`
   (`apps/worker-fiscal/src/select-transport.ts`) convierte `null` en el
   transporte base del entorno (staging: bill beta con las SOL del worker;
   production: transporte base si existe, si no `SunatChannelError
   SUNAT_PRODUCTION_SOL_MISSING`). Material corrupto → `TenantSolChannelError`
   (`TENANT_SOL_UNAVAILABLE`), fail-closed visible: jamás emitir con el SOL de
   otro emisor. Caché por invocación: un drain de N filas del mismo tenant
   desenvelopa una sola vez.
3. **Fail-closed terminal.** Sin fila y sin env → `MISCONFIGURED` en staging
   (Arquitectura §5.2d / ADR-FISCAL-008) o `SUNAT_PRODUCTION_SOL_MISSING` en
   production. Nunca mock silencioso con plugins on.

Esta precedencia **fila > env > fail-closed** es idéntica en código, tests
(LEDGER 0473: adapters-d1 449/449 unit + 313/313 integración, worker-fiscal
72/72) y runbooks (`docs/runbooks/fiscal-onboarding-tenant.md` §2.6;
«Credenciales SUNAT SOL» en `docs/runbooks/secrets-ops-material.md`). La única
pieza que contradice la realidad es la cláusula de ubicación del 007: sin ADR
corrector, cada auditoría, onboarding o incidente SOL tendría que re-resolver
la contradicción a mano.

## Decisión (propuesta — pendiente de aceptación)

Arquitectura autoritativa de credenciales SOL con tres ubicaciones de estado
explícito:

1. **Canónica por tenant — `tenant_sol_credentials` (migración 0061).** Todo
   negocio emisor nuevo provisiona su SOL aquí: fila `(tenant_id,
   alias='SUNAT')` cuyo `sol_credentials_envelope` es `'envelope-v1:{json}'`
   AES-GCM con plaintext `{"solUser","solPassword"}` y DEK (32B) envuelta por
   KMS (`backupId 'tenant-sol:SUNAT'`). Es el único camino multi-emisor: el
   drain resuelve transporte por fila, con cuarentena por error de canal que no
   aborta el drain de otros emisores. Escritura hoy manual (SQL staff; gap
   registrado en el runbook de onboarding §8). Mismo patrón criptográfico de
   `tenant_certificates` (0056): cero forks.
2. **Fallback del piloto — bindings `secret_text` del worker.**
   `SUNAT_SOL_USER`/`SUNAT_SOL_PASSWORD` en `kipuspay-worker-fiscal-staging`
   quedan **DEPRECATED para nuevos tenants**: se conservan backward-compatible
   únicamente mientras el piloto Rosa Negra emita sin fila propia. Condición de
   retiro: piloto migrado a fila Y cero tenants legítimos dependiendo del env ⇒
   borrar ambos bindings (`wrangler secret delete` ×2) y verificar que staging
   resuelve por fila. Los deploys de CI no tocan estos bindings
   (`.github/workflows/deploy-staging.yml` no borra `secret_text` existentes).
3. **Secrets Store de Cloudflare — explícitamente NO para SOL (corrección al
   007).** El store queda reservado a material de plataforma del worker-kms
   (KEKs backup/push, VAPID, service account FCM). No alberga credenciales SOL
   ni las albergará: son credenciales por emisor que escalan con el número de
   negocios, y su modelo natural es una fila cifrada con DEK KMS, no un secreto
   de plataforma con binding por deploy.

**Rotación por ubicación** (procedimientos completos en
`docs/runbooks/secrets-ops-material.md`):

- Env del worker: nueva clave en el portal SOL → persistir ops-local chmod 600
  → `wrangler secret put SUNAT_SOL_USER` + `wrangler secret put
  SUNAT_SOL_PASSWORD --env staging` → verificación con 1 envío e-beta esperando
  CDR código 0 (jamás dar por buena una rotación sin CDR — invariante 8).
- Fila por tenant: re-wrap — generar DEK nueva, `wrapDek` KMS (`backupId
  'tenant-sol:SUNAT'`), UPDATE de `sol_credentials_envelope` (hoy SQL staff).
  Cada ubicación rota independientemente: rotar la fila no toca el env y
  viceversa.

Queda intacto del 007: mecánica SOAP/breaker/cuarentena, opt-in T6 de
producción, allowlist de endpoints y rollback `FEATURE_FISCAL_CPE=0`.

## Alternativas consideradas

### A — Migrar todo a Secrets Store (cumplir el 007 al pie de la letra)

**Pros:** el texto del 007 quedaría literalmente cierto; un solo lugar para
«secretos».

**Contras:** rompe el patrón envelope ya operativo (0061 + `tenant_certificates`
0056) para sustituirlo por criptografía equivalente gestionada por la plataforma
— el envelope ya da cifrado en reposo AES-GCM con DEK envuelta por KMS, así que
el beneficio de seguridad es nulo. Costos concretos: sin modelo por-tenant (N
negocios = N secretos + N bindings + redeploy por onboarding), pérdida de
revocación por fila (DELETE + triggers de epoch) y un segundo patrón
criptográfico paralelo al de certificados = fork del modelo de secretos
fiscales (invariante 9 aplicado a criptografía).

**Evidencia:** la matriz de secretos del runbook muestra que el store ya cumple
su rol (material de plataforma); mover SOL no cierra ningún riesgo abierto.

### B — Mantener solo worker-level (retroceder el multi-emisor)

**Pros:** cero filas y cero KMS por tenant; el piloto sigue igual.

**Contras:** bloquea multi-emisor — un par SOL por ambiente = un solo emisor
directo por ambiente (limitación conocida, registrada en el runbook de
onboarding §2.6); mezclar dos negocios en un ambiente queda prohibido.
Contradice la decisión del owner aprobada en LEDGER 0473 (routing SOL por
tenant con fail-closed por emisor) y estrangula el claim comercial de emisión
directa por negocio.

**Evidencia:** el drain multi-tenant ya corre en staging con esta arquitectura;
B sería revertir código test-fijado.

### C — Status quo sin ADR corrector

**Pros:** cero esfuerzo documental inmediato.

**Contras:** la deriva persiste — el 007 seguiría diciendo «solo Secrets Store»
mientras código y runbooks dicen otra cosa; los checks del gate (V-*) validan
estructura documental, no semántica, así que la contradicción nunca se
detectaría sola y se heredaría a cada cita futura del 007.

**Evidencia:** LEDGER 0474 («HALLAZGO DOCUMENTAL … requiere ADR corrector»).

## Consecuencias

- **Gana:** una sola historia autoritativa de credenciales SOL, coherente con
  el código test-fijado; onboarding sin ambigüedad (todo negocio nuevo → fila;
  el runbook de onboarding §2.6 ya documenta la precedencia y el comando
  canónico `scripts/staff/onboard-tenant.mjs`); rotación con procedimiento por
  ubicación; corrección quirúrgica del 007 sin tocar su mecánica de transporte.
- **Paga:** dualidad temporal de ubicaciones mientras el piloto no migre (dos
  procedimientos de rotación vivos); deuda de retiro del fallback (condición
  explícita en la decisión); `kipuspay-worker-api-staging` sigue SIN bindings
  SOL — latente, no roto: su ruta RC delega al servicio `FISCAL`. Si algún día
  se habilita envío directo desde el API (canal production FL-2), replicar los
  secrets ahí ANTES de encender ese camino (nota ya obligatoria en el runbook
  §2.6).
- **Invariantes tocadas:** SEC-03 (Registry §0.4 → Arquitectura §3): el
  plaintext SOL jamás en D1/git — el envelope cifrado en D1 ES la «envoltura
  KMS» que la propia regla admite, mismo tratamiento que la clave privada .p12
  en `tenant_certificates`; invariante 8: verificación post-rotación exige CDR
  0, nunca aceptación afirmada sin CDR; espíritu del invariante 5
  (fail-closed): material corrupto → `TENANT_SOL_UNAVAILABLE`, jamás fallback
  silencioso al SOL de otro emisor; invariante 9: una sola precedencia,
  definida en código, referenciada por runbooks y este ADR.
- **Activación:** doctrina inmediata al aceptarse — sin cambio de código, este
  ADR codifica lo existente; retiro del fallback = tarea futura gated por la
  migración del piloto a fila; automatización de escritura de filas SOL (hoy
  manual) queda como gap registrado en el runbook de onboarding §8.

## Evidencia de cierre

- Tests / checks: precedencia test-fijada
  (`packages/adapters-d1/src/tenant-sol-credentials.test.ts`; suites LEDGER
  0473: adapters-d1 449/449 unit + 313/313 integración, worker-fiscal 72/72) ·
  `scripts/verify.sh` RESULT SUITE GREEN (incluye V-18 front-matter y V-12
  refs de este documento) · V-25 espejo up↔down de la migración 0061.
- Ledger: `id: ____` (al momento de la aceptación)
- Firmas RACI: `R` Staff Security · `A` Staff Principal (pendiente) · `V`
  Staff Fiscal + Staff SRE
