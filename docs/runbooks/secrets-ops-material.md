---
doc_id: runbook-secrets-ops-material
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Runbook — Material de secretos ops-local y rotación

| Campo | Valor |
| --- | --- |
| Severidad tipica | SEV-2 (rotación planificada) / SEV-1 (material comprometido o KEK perdida) |
| Owner on-call | Staff SRE |
| Ultima ensayada | 2026-08-22 (rotaciones reales AUTH_JWT_HS_SECRET y PLATFORM_STAFF_TOKEN; simulacro formal de game day pendiente) |
| Relaciona | `docs/ops/staging-bootstrap.md` · `docs/runbooks/sunat-cdt-rosa-negra-staff.md` · `docs/ops/go-live-staging-checklist.md` |

Este runbook registra UBICACIONES y PROCEDIMIENTOS del material de secretos.
**Nunca contiene valores.** El material vive solo en ubicaciones ops-local
(fuera de git, `.gitignore` cubre `.dev.vars`, `tmp-staff/` y `*.p12`).

## Impacto general

Quién pierde qué si un material se pierde o compromete: sesiones API (JWT),
backups irrecuperables (KEK), push muerto (VAPID), firma fiscal bloqueada
(SOL/CDT), CI de staging caído (API token). La venta en tienda no depende de
estos secretos (offline-first); lo que se degrada es plataforma y evidencia.

## Matriz de secretos

| Secreto | Qué controla | Dónde vive el material local | Cómo se rota | Última rotación conocida | Riesgo si se pierde |
| --- | --- | --- | --- | --- | --- |
| `AUTH_JWT_HS_SECRET` | Firma HMAC de JWTs de sesión del worker-api staging | `apps/worker-api/.dev.vars` (única copia ops-local) | Ver Rotación AUTH_JWT abajo | 2026-08-22 | Sin material local se rota a ciegas; rotar invalida todas las sesiones activas (re-login, fail-closed aceptado) |
| `PLATFORM_STAFF_TOKEN` | Break-glass staff trigger `POST /v1/internal/reports/run-rollups` (guard constant-time) en worker-api staging | `tmp-staff/platform-staff-token.txt` (chmod 600; formato observado: 64 hex + newline) | Ver Rotación PLATFORM_STAFF_TOKEN abajo | 2026-08-22 | Sin token no hay break-glass de rollups (bloquea RPO rollups en DR); filtrado = trigger interno invocable por terceros |
| Envelope cert tenant (`TENANT_CERT_ENVELOPE`) | DEK del certificado digital CDT wrappeada para backup (`backupId=tenant-cert:SUNAT`) | Copias ops: `tmp-staff/cdt-rosa-negra/envelope.json`, `envelope.kms.json`, `insert-tenant-cert.sql`; autoritativo: D1 staging tabla `tenant_certificates` | Re-upload del .p12 por camino dueño (UI POS Configuración) o break-glass con `scripts/staff/extract-cdt-p12.sh` + SQL de insert | 2026-08-20 | Sin envelope no hay restore del cert ni firma SOAP del piloto; regenerable re-subiendo el .p12 con su pass |
| KEKs backup/push (Secrets Store `kipuspay-kms-staging` id `6c5d2aff785644d39ca233efe0d0ed34`) | Wrapping AES-GCM de DEKs de backups KPBK (`backup-kek-v1/v2`) y cifrado push (`push-kek-v1/v2/v3`) | SOLO Secrets Store CF (no hay copia local; así debe ser) | Nueva versión del secreto en Secrets Store + binding en `apps/worker-kms/wrangler.jsonc` + redeploy worker-kms; NUNCA borrar la versión previa (backups viejos exigen su KEK) | Reales desde Fase 0, 2026-08-20 | Pérdida total = backups existentes irrecuperables (DR/RPO mueren); rotación mal hecha = backups antiguos ilegibles |
| VAPID keypair (`PUSH_VAPID_PRIVATE_KEY` / pública) | Web Push del canal Modo Dueño/push | Privada en Secrets Store (`push-vapid-private-v4`, binding en `apps/worker-kms/wrangler.jsonc`; copia ops-local JWK en `tmp-staff/vapid-v4.json`, chmod 600); pública como var runtime `PUSH_VAPID_PUBLIC_KEY` del worker-api Y binding `push-vapid-public-v4` del worker-kms (`push-vapid-private/public-v3` quedan en el store SOLO para rollback) | Nuevo par vN en Secrets Store + redeploy kms + var pública al API (`deploy --var PUSH_VAPID_PUBLIC_KEY:...`); ambas copias de la pública deben ser idénticas | 2026-08-23 | Dispositivos suscritos quedan inválidos (re-suscripción); sin var pública el push falla fail-closed |
| Credenciales SUNAT SOL (piloto Rosa Negra, worker-fiscal staging) | Acceso portal SOL e-beta SOAP (sendBill/sendSummary del piloto) | Bindings `secret_text` `SUNAT_SOL_USER` + `SUNAT_SOL_PASSWORD` del Worker `kipuspay-worker-fiscal-staging` (ubicación autoritativa CONFIRMADA 2026-08-24 vía API settings + `wrangler secret list`; NO existen en `kipuspay-worker-api-staging`). Fuente por-emisor desde migración 0061: filas `tenant_sol_credentials` (D1 + envelope KMS) con precedencia sobre el env; escritura de filas aún manual (SQL staff) | Ver «Rotación credenciales SUNAT SOL» más abajo: nueva clave en SUNAT → persistir ops-local → `wrangler secret put` ×2 `--env staging` → 1 envío e-beta con CDR 0 | DESCONOCIDO (ubicación confirmada 2026-08-24; primera rotación documentada = pendiente) | Sin SOL no hay SOAP e-beta (GTM-08 piloto bloqueado); compromiso = terceros emiten con el RUC del piloto |
| Certificado .p12 Rosa Negra (CDT ACTIVE) | Firma XAdES-BES de CPE del piloto (RUC 20612913251) | `certificado.p12` en raíz del repo (gitignored); extraído en `tmp-staff/cdt-rosa-negra/` (`private.pem`, `leaf.pem`, `chain.pem`, `cert-chain.pem`, `leaf-meta.json`); pass solo en sesión del dueño (nunca en disco) | Nuevo CDT ante SUNAT (proceso externo) y luego camino dueño UI o break-glass `extract-cdt-p12.sh` + `insert-tenant-cert.sql` | 2026-08-20 (ACTIVE) | Pérdida de .p12+pass = revocar y solicitar CDT nuevo a SUNAT (días); compromiso = suplantación fiscal del RUC piloto |
| SA Firebase FCM (`PUSH_FCM_SERVICE_ACCOUNT` → `push-fcm-service-account-v2`, Secrets Store `6c5d2aff…`) | Envío de pushes del Modo Dueño vía FCM HTTP v1 (worker-kms firma el JWT OAuth2 de Google) | `tmp-staff/fcm-sa-staging.json` (chmod 600; PKCS8 de firebase-adminsdk-fbsvc@kipuspay-staging) | Regenerar clave en Firebase console → Service accounts → reemplazar valor del secreto en el store (API o `wrangler secrets-store secret put`) | 2026-08-23 (stub → real; token mint HTTP 200 verificado) | Sin SA real los pushes no salen (fail-closed, jamás éxito fingido); filtrado = terceros pueden enviar push a los dispositivos suscritos |
| `CLOUDFLARE_API_TOKEN` CI | Deploy staging vía `.github/workflows/deploy-staging.yml` (Workers/Pages/D1/R2/Secrets Store, cuenta `c5b18f62cb7e73fcd2ece5822936d699`) | GitHub repo secrets (Settings, Actions) — creado/reemplazado el 2026-08-22 como API Token CF de larga duración (NO OAuth) | Dashboard CF: roll del token; luego `gh secret set CLOUDFLARE_API_TOKEN` + `gh workflow run deploy-staging.yml -f dry_run=true` | 2026-08-22 | CI Etapa 6 RED (sin deploys verificados); token filtrado = deploy arbitrario a staging |
| OAuth wrangler login | Ops manual local del operador (wrangler CLI) | Keyring local del operador (nunca CI) | `wrangler login` de nuevo (caduca solo, horas) | Caduca periódicamente (el del 2026-08-20 venció ~23:47Z) | Bajo por diseño; riesgo real es usarlo como token CI (lección bootstrap 2026-08-20/22: prohibido) |

## VAPID ↔ panel Firebase (decisión Flujo B, 2026-08-23)

El canal Web Push del Modo Dueño NO usa el flujo del SDK de Firebase
(`getToken(vapidKey)`): la PWA suscribe con `pushManager.subscribe` contra
`PUSH_VAPID_PUBLIC_KEY` (servida por `GET /api/push/privacy`) y el envío lo
firma el worker-kms (`sendWebPushVapid`; Arquitectura §5.12.3). Por eso el
certificado «Certificados push web» del panel Firebase (kipuspay-staging)
permanece vacío a propósito: **jamás importar ni generar el par ahí** — crearía
una segunda fuente de verdad criptográfica. La pública servida por el API debe
ser idéntica al binding `push-vapid-public-*` vigente del worker-kms (misma fuente:
Secrets Store). FCM HTTP v1 consume tokens nativos del host Android
(`window.__KIPUS_FCM_TOKEN__`, patrón ADR-0033) y tampoco usa ese certificado.
Estado staging 2026-08-23: par v4 active en Secrets Store (rotación ciega sobre v3,
sin material local de v3; material ops-local de v4 en `tmp-staff/vapid-v4.json`,
formato JWK — primer branch de `importEcPrivate` en worker-kms); var pública del API
desplegada idéntica al binding `push-vapid-public-v4` y flags `FEATURE_MOBILE_PUSH=1`
+ `FEATURE_OWNER_PUSH=1`. `GET /api/push/privacy` responde 403 `PUSH_SCOPE_FORBIDDEN`
mientras el tenant no tenga la capability `mobile.push` en `tenant_capabilities`
(fail-closed, pendiente del fixture piloto): la suscripción real está bloqueada por
esa capability, NO por material criptográfico.

## Rotación AUTH_JWT_HS_SECRET (exacta)

```bash
openssl rand -base64 48
# 1. Persistir PRIMERO en apps/worker-api/.dev.vars (clave AUTH_JWT_HS_SECRET)
# 2. Aplicar al worker:
pnpm --filter @kipuspay/worker-api exec wrangler secret put AUTH_JWT_HS_SECRET --env staging
# 3. Smoke: login POS staging y GET /api/auth/session debe responder 200;
#    tokens previos deben fallar 401 (fail-closed esperado).
```

Ultima rotacion real: 2026-08-22 (material en `.dev.vars`).

## Rotación PLATFORM_STAFF_TOKEN (exacta)

```bash
openssl rand -hex 32 > tmp-staff/platform-staff-token.txt
chmod 600 tmp-staff/platform-staff-token.txt
# Aplicar al consumidor (worker-api staging). Confirmar antes si vive como
# secret o como var del deploy (no está en los vars versionados):
pnpm --filter @kipuspay/worker-api exec wrangler secret put PLATFORM_STAFF_TOKEN --env staging
# Smoke: POST /v1/internal/reports/run-rollups con el token nuevo responde
# distinto de 401/403; con un token viejo responde 401/403.
```

Ultima rotacion real: 2026-08-22.

## Credenciales SUNAT SOL (ubicación autoritativa y rotación)

Cierra el Gap 6 de LEDGER 0472 («ubicación autoritativa de secrets SOL»).
Ubicación verificada el 2026-08-24 contra la cuenta CF — solo nombres/tipos,
jamás valores:

| Fuente | Ubicación | Verificación |
| --- | --- | --- |
| Fallback del worker (piloto Rosa Negra) | Bindings `secret_text` `SUNAT_SOL_USER` + `SUNAT_SOL_PASSWORD` del Worker `kipuspay-worker-fiscal-staging` | `GET /accounts/{account_id}/workers/scripts/kipuspay-worker-fiscal-staging/settings` y `wrangler secret list --env staging`: ambos listan exactamente esos dos + `TENANT_CERT_ENVELOPE` como `secret_text` |
| Por tenant (LEDGER 0473, migración 0061) | Filas `tenant_sol_credentials` en D1 staging (envelope AES-GCM, DEK wrappeada por KMS) | Puerto `loadTenantSolCredentials` (`packages/adapters-d1/src/tenant-sol-credentials.ts`); material corrupto → `TENANT_SOL_UNAVAILABLE` fail-closed (nunca emitir con el SOL de otro emisor) |

Hechos operativos verificados (no asumidos):

- Precedencia de resolución (`selectFiscalTransport`, apps/worker-fiscal):
  fila del tenant > env del worker > `MISCONFIGURED` (staging) /
  `SUNAT_PRODUCTION_SOL_MISSING` (production). Nunca mock silencioso con
  flags on.
- `kipuspay-worker-api-staging` NO tiene los secrets SOL (sus únicos
  `secret_text`: `AUTH_JWT_HS_SECRET`, `PLATFORM_STAFF_TOKEN`,
  `TENANT_CERT_ENVELOPE`). Su código RC
  (`apps/worker-api/src/fiscal/fiscal-rc-routes.ts`) consume SOL solo para
  envío directo; sin bindings delega al binding de servicio `FISCAL`
  (worker-fiscal), que sí los tiene.
- Los deploys de CI no tocan estos secretos:
  `.github/workflows/deploy-staging.yml` solo usa los GitHub secrets
  `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`; un `wrangler deploy` no
  borra bindings `secret_text` existentes.

### Mecanismo de actualización (verificado)

Canónico — wrangler. Acceso verificado operativo contra este worker el
2026-08-24 (`wrangler secret list --env staging` responde con auth vigente;
`put` usa el mismo acceso):

```bash
pnpm --filter @kipuspay/worker-fiscal exec wrangler secret put SUNAT_SOL_USER --env staging
pnpm --filter @kipuspay/worker-fiscal exec wrangler secret put SUNAT_SOL_PASSWORD --env staging
```

`wrangler secret put` crea una versión nueva del Worker y la despliega
inmediatamente (docs CF Workers); los demás bindings quedan intactos.

Alternativas equivalentes: dashboard CF (Worker → Settings → Variables and
Secrets) o el endpoint bulk de secrets de la API CF (los secretos no incluidos
en el request quedan sin cambio). **NUNCA** usar PUT del script completo para
rotar un secreto: reemplaza el metadata entero y exige re-enviar todos los
bindings.

### Rotación credenciales SUNAT SOL (procedimiento completo)

0. Identificar la fuente activa del emisor: si el tenant tiene fila en
   `tenant_sol_credentials`, la rotación es de la FILA (re-wrap del envelope,
   mismo patrón wrap-dek de la sección 2.4 de
   docs/runbooks/fiscal-onboarding-tenant.md; hoy sin ruta de escritura
   automatizada → SQL staff break-glass), no del env del worker. Sin fila →
   este procedimiento sobre el env.
1. Nueva clave en SUNAT (lado humano, dueño del RUC): portal SOL → usuario
   secundario de integración (perfil facturación electrónica) → cambio/reset
   de contraseña. Al cambiarla, SUNAT invalida la anterior.
2. Persistir PRIMERO ops-local (chmod 600, fuera de git) — regla de rotación
   ciega de este runbook.
3. Aplicar al consumidor: los dos `wrangler secret put` de arriba
   (`--env staging`). Si algún día se habilita envío directo RC/production
   desde worker-api, replicar los bindings ahí ANTES de encender ese camino
   (hoy no los tiene).
4. Verificar con 1 envío e-beta: `scripts/staff/send-beta-cpe.mjs` con las
   credenciales nuevas (`STAFF_SEND_BETA=1 SIGNED_XML=... DOC_KIND=01|03
   SUNAT_SOL_USER=... SUNAT_SOL_PASSWORD=...`) esperando CDR código 0
   (sección 3 de docs/runbooks/fiscal-onboarding-tenant.md). Sin CDR no hay
   verificación (invariante 8).
5. Registrar la fecha en la matriz de arriba; entrada de ledger si fue
   rotación ciega o incidente.

Nota ADR-FISCAL-007: su decisión enuncia «`SUNAT_SOL_USER` /
`SUNAT_SOL_PASSWORD` solo Secrets Store»; la implementación vigente usa
`secret_text` del worker (+ filas por tenant desde 0061). Migrar el material
a Secrets Store exige decisión de Staff Fiscal/Principal con ADR que corrija
la redacción — no hacerlo por iniciativa local.

## Procedimiento de rotación ciega (aprendido 2026-08-22)

Cuándo aplica: necesitas rotar un secreto cuyo material actual NO está en
disco local (rotación previa sin rastro, operador saliente, máquina perdida).

Antipatrón que motiva este procedimiento (ocurrido hoy): aplicar el secret al
worker y persistir el material después — o nunca. El valor queda sin rastro
local y la siguiente rotación se hace a ciegas.

Pasos ordenados:

1. NO intentar recuperar el valor viejo. Generar valor NUEVO fuerte
   (`openssl rand -base64 48` o `-hex 32` según formato del consumidor).
2. **Persistir primero**: escribir el material en su ubicación ops-local
   (`.dev.vars`, `tmp-staff/*.txt` con chmod 600) o bóveda (Secrets Store /
   GitHub secret) ANTES de tocar el consumidor.
3. Aplicar al consumidor: `wrangler secret put ... --env staging`; si es var,
   redeploy; si es Secrets Store, nueva versión + redeploy del worker kms.
4. Smoke de la ruta que lo consume (login/session, staff trigger, backup
   READY). Verificar también que valores viejos fallan.
5. Declarar inválidos los derivados del valor viejo (sesiones, tokens):
   fail-closed, nunca best-effort.
6. Registrar la fecha en la columna «Última rotación» de este runbook y, si
   cambia un contrato documental, entrada de ledger.

## Diagnóstico rápido (material sospechado perdido)

1. `ls -la` de la ubicación esperada (`.dev.vars`, `tmp-staff/*.txt`) — existe
   y fecha razonable?
2. Existe copia en bóveda autoritativa (Secrets Store / GitHub secret)?
3. Si ambas son NO → tratar como pérdida: rotación ciega inmediata del punto
   anterior.

## Escalamiento

| Condición | Escalar a |
| --- | --- |
| KEK backup/push perdida o rotada sin paridad | Staff Security + Staff Principal (A) inmediato; congelar backups nuevos hasta resolver |
| SOL o CDT comprometidos | Staff Fiscal + revocación ante SUNAT por el dueño del RUC |
| `CLOUDFLARE_API_TOKEN` filtrado | Roll inmediato + revisión de runs de Actions recientes |
| Cualquier rotación ciega ejecutada | Registrar en ledger como incidente |

## Rollback

La rotación de secretos no es reversible (el valor viejo se descarta). El
rollback operativo es re-aplicar el valor vigente desde su ubicación ops-local
si un consumer quedó mal apuntado.

## Postmortem

- Entrada de ledger (tipo incidente/corrección) para toda rotación no
  planificada o rotación ciega ejecutada: `id: ____`
- Acción preventiva dueña de Staff SRE: game day trimestral de rotación de
  AUTH_JWT_HS_SECRET + PLATFORM_STAFF_TOKEN simulando pérdida de material.
