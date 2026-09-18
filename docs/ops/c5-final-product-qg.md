---
doc_id: ops-c5-final-product-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Sprint C5 — Cierre interno del software (no liberatorio)

**Estado:** CERRADO con **calificación** (ledger 0439; CORRIGE en 0441) · go-live externo
**AGENDADO_AL_FINAL** (`pending-batches.yaml` bloque `go-live-*`)

## Alcance

El catálogo contractual de `legal_and_sales_guide.md` queda **implementado en
software local** (suites internas). Eso **no** es go-live de producción ni sello
liberatorio “producto completo v1.0” frente a claims externos.

Los claims se alinearon al producto final (Sprint C1). Capabilities congeladas
pendientes se implementaron en código: KDS/comandas/salón/split (C2) y LPDP ARCO
self-serve del titular (C3). DR/BCP tiene contrato y suites de restore/failover
locales (C4); el intento de `DR_SIMULATION` en Cloudflare staging observó
restore/RPO, pero la medición RTO quedó invalidada porque detenía el cronómetro
antes de `verifyDrReplay`. `stg-s48-dr-sim` está reabierto hasta desplegar la
corrección y repetir el ensayo; la firma A+V y el gate externo también siguen
abiertos. GTM-09 permanece congelado por los hallazgos de identidad y limitación
de abuso descritos en el QG S47. El staging externo (Cloudflare real, sandbox SUNAT, Android físico,
FCM/VAPID, impresoras) cierra los gates de producción NO-GO y permanece agendado.

## Evidencia del cierre interno (Sprint C5) — conteos del repo

| Suite | Resultado (conteo en árbol / claim honesto) |
|---|---|
| e2e pos-web | **120** `test(` bajo `apps/pos-web/tests/e2e` (incl. KDS/salón/LPDP; mayormente mocks de contrato) |
| e2e marketing-web | **15** `test(` bajo `apps/marketing-web/tests/e2e` |
| unit / integration / chaos | Ver evidencia de CI/local del sprint; no re-afirmar totales históricos sin re-corrida citada |
| Bench Sub-50ms | Microbench CPU de dominio (no Edge/D1 end-to-end) |
| verify.sh | Condición necesaria documental (V-00..V-30) |

## Evidencia reproducible C1 — stack local Worker+D1

Ejecución del runner aislado `pnpm --filter @kipuspay/pos-web e2e:local-stack
-- --state-dir <tmp>` (2026-09-16): **8/8 GREEN**.

Los recorridos cubiertos fueron cadena (transferencia/recepción/3-way), grifos
(precio servidor, venta/caja, retry idempotente y turno), onboarding + primera
venta, farmacia FEFO, restaurante KDS + split, seguridad (aislamiento y
revocación), venta sembrada + reconciliación idempotente y servicios recurrentes.
El `ExpiredBatchError` emitido durante el caso de lote vencido es la respuesta
negativa esperada y no una falla del runner.

Esta evidencia es local y reproducible; no acredita staging Cloudflare, hardware
físico, FCM/VAPID real ni aceptación SUNAT.

## Evidencia C1 — smoke externo reproducible

El 2026-09-16 (Lima), `apps/pos-web/scripts/staging-browser-smoke.mjs` pasó **2/2**
contra `https://9386780f.kipuspay-web.pages.dev/` (deployment Pages de marketing)
y `https://kipuspay-pos-web-staging.pages.dev/` (POS), verificando HTTP 200,
shell visible, API `/health` 200 desde el navegador y cero errores fatales de consola.
La validación directa del deployment confirmó HTTP 200 y contenido activo en `/`,
`/privacidad`, `/terminos`, `/reclamaciones` y `/empezar`; el alias estable
`https://kipuspay-web.pages.dev/` queda como hostname de acceso del mismo proyecto.
Se corrigió el target del smoke, que apuntaba a un hostname Pages distinto del
proyecto `kipuspay-web` desplegado por el workflow. Esto es smoke headless remoto,
no la auditoría headed humana de C1.

La auditoría de navegación sobre el mismo deployment cubrió **17 rutas públicas**
(home, precios, seguridad, ayuda, legales, `/empezar`, blog y las seis verticales):
HTTP 200, títulos presentes, ninguna pantalla “en preparación”, **24 enlaces
internos** comprobados y **0 enlaces rotos**. Sigue siendo evidencia headless; la
inspección headed visible y la validación humana permanecen pendientes.

La comprobación de continuidad posterior al redeploy (2026-09-16) devolvió HTTP
200 para `/privacidad` en Pages, `/lpdp` en POS y `/health` en Worker API. Es una
verificación de disponibilidad y enlace, no una activación de `FEATURE_LPDP` ni
una sustitución de la auditoría headed.

El 2026-09-17 se endureció `staging-browser-smoke.mjs`: ahora recorre home,
`/empezar`, `/para/grifos` y POS/login; permite overrides de URL para validar
previews locales y falla si una imagen, hoja de estilo, script, fuente o asset
con extensión estática responde 4xx/5xx. También bloquea en el texto visible los
claims prohibidos de activación universal, legalidad/facturación, tiempo real y
envío fiscal, respetando la aclaración explícita “sin promesas de tiempo real”.
Contra staging pasan POS/login y API `/health`, pero home, onboarding y Grifos
fallan: home/onboarding/Grifos mantienen claims retirados localmente y el home
publicado aún enlaza `/login` al alias legacy en vez del proyecto POS activo;
Grifos además devuelve
`GET /media/og-grifos.png` → 404 (**1/4**, NO-GO). La investigación del favicon
identificó que el smoke anterior apuntaba al alias legacy
`kipuspay-pos-web-staging.pages.dev`, mientras el workflow despliega el proyecto
`kipuspay-app`. En el alias correcto `https://kipuspay-app.pages.dev/login` y
`/icons/kipuspay-pos-192.svg` ambos responden 200. Se alinearon localmente los
destinos de POS en marketing, Worker y smoke; no se desplegó. El build local de
marketing, configurado con `PUBLIC_POS_ORIGIN` y probado contra POS/API staging,
pasó **4/4**, incluido el enlace `/login` al host activo. Los claims, el asset OG
y la revisión A/V de la nueva configuración de origen siguen bloqueando promoción.
Una lectura estática independiente del cambio de origen no encontró hallazgos
accionables y confirmó que no se amplían las allowlists; no fue la herramienta
formal `security-review`, no ejecutó el handoff y no sustituye A/V.

El 2026-09-17 se añadió evidencia headed técnica con Chrome/Playwright real:
landing, `/empezar` y login POS renderizaron sin interceptación; la corrección del
favicon del POS fue desplegada en `kipuspay-app.pages.dev` y verificada con HTTP
200. La respuesta `401` de sesión anónima es esperada. La revisión humana de UX,
hardware físico y firmas A/V permanece pendiente.

### Re-chequeo headed de staging — 2026-09-17

Repetición visible con Chrome y `playwright-cli` (sin rutas interceptadas, sin
credenciales y sin crear tenant): `/`, `/empezar` y `/para/grifos` del hostname
`kipuspay-web.pages.dev`, más `/login` de `kipuspay-pos-web-staging.pages.dev`,
respondieron y renderizaron. El home y el onboarding todavía presentan claims locales ya
retirados: emisión automática/“100% legal”, datos “en tiempo real” y primera
venta en cinco minutos. El envío vacío de onboarding mostró validación accesible
y permaneció en el paso 1/4. En Grifos se repitió `GET /media/og-grifos.png` →
404 (1 error, 2 warnings de consola). El login del alias legacy mostrado en la
captura tenía `/favicon.png` → 404; una verificación posterior confirmó que el
hostname Pages del workflow (`kipuspay-app.pages.dev`) sirve el login y su SVG
de marca con HTTP 200. `GET /api/auth/session` → 401 anónimo sigue siendo esperado.

Capturas de esta repetición: [home con claims anteriores](evidence/c1-staging-home-recheck-2026-09-17.png),
[onboarding vacío](evidence/c1-staging-onboarding-validation-recheck-2026-09-17.png),
[Grifos con asset 404](evidence/c1-staging-grifos-recheck-2026-09-17.png) y
[login con shell visible](evidence/c1-staging-pos-login-recheck-2026-09-17.png).
Los artefactos demuestran el estado de esos deployments en esa corrida, no el
contenido local actual ni aceptación humana. No se desplegaron cambios: el
copy requiere gate A/V y el árbol sigue teniendo cambios ajenos sin aislar.

La misma revalidación ejecutó `node apps/pos-web/scripts/staging-browser-smoke.mjs`
y devolvió **2/2 GREEN** (marketing y login POS, ambos HTTP 200; API `/health`
200). Ese smoke solo valida shell/consola fatal/API: filtra `Failed to load
resource`, no navega a Grifos ni falla por assets estáticos rotos. Por eso dio
GREEN mientras esta inspección encontró los 404 y claims desfasados; es cobertura
insuficiente del gate, no evidencia de que C1 esté limpio.

El código local sí contiene las correcciones revisadas: la home/onboarding y los
claims de verticales tienen pruebas de copy; Grifos usa la tarjeta social de
marca existente como poster/OG fallback. `content.test.ts` + `seo.test.ts`
pasaron **35/35** y `pnpm --filter @kipuspay/marketing-web run build` terminó
GREEN. Esto acredita solo el árbol local; no cambia el deployment actual. Un
warning Svelte de `CheckoutMock` se revisó: ese mock es fallback para slugs no
reconocidos y la home usa un estado de entrada estático; las seis verticales
renderizan mocks especializados, así que no se encontró un flujo que arrastre
ese estado entre rubros. Se deja sin remediar hasta que haya evidencia de impacto.

## Evidencia C2 — controles negativos y seguridad automatizada

La batería local ejecutada el 2026-09-16 pasó sin fallos funcionales:

| Área | Tests | Alcance |
|---|---:|---|
| Auth y autorización | 490 | JWT, middleware tenant, rutas protegidas y control plane |
| Offline, sync, pagos y pedidos | 58 | replay, cross-tenant, doble efecto e idempotencia |
| D1 ACID/caos | 62 | concurrencia, auditoría, rollback y customer orders |
| Push, backup/DR y LPDP titular | 22 | scopes, fail-closed, restore/simulación y derechos del titular |

Total: **632 tests GREEN**. Esta ejecución cubre la parte automatizable del
sprint C2; no reemplaza segunda revisión humana de seguridad ni firmas R/A/V.

### Revisión independiente C2/C3 — 2026-09-16

La segunda revisión de seguridad encontró y se remediaron cuatro hallazgos:

- HIGH: un token LPDP emitido antes de anonimizar ya no puede conceder
  consentimiento; la ruta verifica `pii_erased = 0` en D1.
- MEDIUM: una entrega Stripe en `PROCESSING` ya no se vuelve a reclamar
  concurrentemente; se deduplica hasta quedar `FAILED` o `PROCESSED`.
- MEDIUM: el consentimiento usa guardas de estado en el `ON CONFLICT` y reintento
  acotado ante carrera.
- LOW: errores de proveedor Push se reducen a códigos operativos allowlisted;
  no se persisten mensajes arbitrarios.

La batería específica posterior pasó **49/49** (`titular-lpdp-routes`, webhook
Stripe y dispatcher Push). La revisión humana y las firmas A/V siguen siendo
requisito de go-live, no se infieren de esta ejecución.

### Revalidación automatizada C2 — 2026-09-17

La corrida ampliada de superficies sensibles pasó **706/706 tests en 29 archivos**:
auth/autorización, backup/DR, LPDP titular/admin, webhooks, push, recurrencia,
pedidos, ventas offline y sincronización. Esta revalidación confirma el estado
automatizado de esa corrida; no sustituye una revisión independiente humana
posterior ni las firmas R/A/V. El cierre de código no certifica el estado vigente
de cada capability ni reemplaza los QG específicos actualizados después de esa
fecha.

### Segunda revisión independiente de seguridad — 2026-09-17

La revisión independiente encontró dos hallazgos adicionales, ambos remediados
con RED→GREEN:

- **HIGH** `apps/worker-api/src/webhooks/handle-stripe-webhook.ts`: el reclaim de
  eventos `FAILED` no tenía guardia CAS ni verificaba `changes`; ahora actualiza
  únicamente desde `FAILED` y solo el ganador ejecuta efectos.
- **MEDIUM** `apps/worker-api/src/customers/titular-lpdp-routes.ts`: el token
  titular podía declarar un `customerId` distinto de `sub`; ahora ambos claims
  deben coincidir antes de exportar, consentir o anonimizar.

La regresión enfocada pasó **32/32 tests** (webhook Stripe y LPDP titular). La
revisión de esos dos hallazgos quedó atendida en ese corte. Una revisión
posterior del flujo LPDP (QG S47, 2026-09-17) encontró residuales distintos:
verificación titular sin factor independiente (HIGH) y rate limit KV no atómico
(MEDIUM). La remediación local con OTP/email y límites SQLite DO está descrita
en QG S47; falta sender KipusPay, revisión Security final, staging, QA y A/V.
GTM-09 y cualquier nueva exposición del autoservicio siguen en NO-GO.

### Revisión independiente C2 posterior al hardening — 2026-09-17

La revisión independiente encontró cinco hallazgos adicionales: login de caja
para roles administrativos, handoff sin vínculo estricto a operador/sucursal,
invitación cross-branch y listado de growth events sin autorización/allowlist.
Se remediaron con RED→GREEN en rutas y adaptador D1. La segunda pasada encontró
tres residuales de branch binding; se corrigieron exigiendo
`branchId === session.branch_id` en ambos métodos atómicos y limitando también a
admins con sucursal asignada. La regresión final pasó **26/26** en el adaptador,
**60/60** en worker routes y **13/13** en team routes.

El canary staging en `e06fee6b-32a6-4bd9-a7bd-af6f7d412e5e` confirmó los
negativos: segunda sucursal **403 `SHIFT_BRANCH_MISMATCH`**, admin cross-branch
**403 `BRANCH_FORBIDDEN`**, owner como entrante **403**, cashier en métricas
**403** y growth event sin llave **422**. C2 queda GREEN técnico; QA humana y
firmas R/A/V siguen siendo requisito de go-live.

> CORRIGE 0439: los totales “121/121” y “19/19” no coincidían con el árbol; se
> sustituyen por conteos verificables arriba.

### Reconciliación de evidencia C1 — 2026-09-17

La cobertura vigente del runner amplía la corrida histórica descrita arriba:
descubre en home y valida las seis rutas `/para/*`, además de `/empezar` y
POS/login, en **9 checks**. La corrida del deployment publicado quedó **1/9**:
solo POS/login y health pasan; home, onboarding y las seis verticales fallan por
claims visibles aún publicados, y Grifos conserva `og-grifos.png` → 404. El
preview local de marketing, con los destinos POS/API de staging, pasó **9/9**.

El runner headless puede guardar por recorrido screenshot de viewport, trace de
Playwright y metadatos JSON de requests/responses (URLs sin query ni fragmento).
Esto es evidencia técnica automatizada, no inspección headed humana. El workflow
configura esa salida bajo `deploy-logs/browser` y el paso existente archiva el
directorio como `deploy-staging-evidence`. El runner/workflow modificado aún no
se ha ejecutado en CI ni se desplegaron cambios; los artefactos locales fueron
temporales. Las claims y el OG roto permanecen NO-GO, y la inspección/firma A/V
humana sigue pendiente. TestSprite no se ejecutó: la cuenta no tiene un proyecto
KipusPay enlazado (el único proyecto listado es de otro producto); no se usó ese
target ajeno.

## Capacidades implementadas localmente durante el cierre

- FEFO/lotes y merma entre locales (GTM-16/GTM-13): live en guía, pricing y
  `PUBLIC_CLAIMS`.
- Comandas/KDS + salón + split: UI sobre motor existente (replay kds-pending,
  split con correlativo, catálogo, mappers F-5).
- LPDP ARCO self-serve del titular (GTM-09): verify + OTP por correo registrado +
  token `lpdp_titular` + export/consents/erase (confirmación UI). La política
  pública enlazó `/lpdp` en staging el 2026-09-16; el CTA ya se retiró del estado
  local y el Pages de staging queda pendiente de actualización. OTP y límites
  SQLite DO están GREEN local; falta sender KipusPay, validación externa,
  revisión Security final, QA humana y firmas A/V. La ruta directa también está
  protegida por `PUBLIC_FEATURE_LPDP=0`; el Worker mantiene `FEATURE_LPDP=0`.
  GTM-09 sigue **CONGELADO**: no ampliar ni promover el canary (QG S47).
- DR/BCP (GTM-18): suites locales GREEN; restore y RPO fueron observados en
  staging, pero el RTO histórico no califica. La nueva corrida con cronómetro
  corregido está pendiente de despliegue; cutover/rollback, QA humana y firmas A/V
  también siguen pendientes.

## Go-live externo (agendado al final)

| Bloque | Requiere | Gate |
|---|---|---|
| `go-live-staging` | Cloudflare real (R2/Workflow/Secrets/KMS, cron/canary) | s41–s49 |
| `go-live-sunat` | Certificación SUNAT/OSE real | GTM-08 |
| `go-live-hardware` | Android físico gama baja + impresoras | GTM-26, S41 |
| `go-live-fcm` | Web Push VAPID + FCM HTTP v1 staging | GTM-26 |

Matriz: `docs/ops/claims-go-live.md`.

### Revalidación focalizada C2 — 2026-09-17

Una revisión independiente de solo lectura del diff local, enfocada en LPDP/OTP,
aislamiento por tenant, PII, cuotas/rate limits y gates, no reportó hallazgos.
Fue revisión automatizada por subagente (la herramienta formal `security-review`
no está disponible en esta sesión); no equivale a pentest ni firma humana.

La batería focalizada C2 pasó **135/135 tests** en seis comandos de prueba:
LPDP admin/titular 24/24, Durable Object LPDP en Workerd 3/3, revocación/offline
3/3, pedidos y pagos 42/42, D1 cross-tenant/doble fulfill/venta offline 56/56,
y cola de fulfill offline 7/7. Cubre referencias cross-tenant, replay de
fulfillment/captura, doble efecto, retención de cola ante fallo y expiración de
lease. Las corridas son locales y no certifican canary, proveedor email ni
comportamiento bajo hardware/red física; QA y firmas R/A/V siguen pendientes.

## Cierre

El tracker `docs/ops/pending-batches.yaml` marca A–J y C1–C5 como CERRADO en
software; el bloque `go-live-*` permanece **AGENDADO_AL_FINAL**. No usar este
documento como evidencia de aceptación en producción.

### Reconciliación de claims C5 — 2026-09-17

GTM-01 (analítica predictiva) y GTM-10 (briefing/insights) permanecen
**CONGELADOS** y solo se presentan como roadmap en preparación. La evidencia
local/canary no autoriza claims comerciales: para S46 falta MAPE medido contra
un objetivo aprobado por Data+PM y validación externa con QA/A+V; para S49 falta
generación válida con facts no triviales, SLO general, cron/KV real y QA/A+V.
La reconciliación está reflejada en `docs/GTM.md`, `docs/ROADMAP.md`,
`docs/roadmap/fase-6f.md`, `docs/ops/claims-go-live.md` y los QGs S46/S49.
La actualización de pricing/plan-matrix se verificó con 22/22 tests unitarios y
4/4 E2E de claims. No implica despliegue, aprobación humana ni desbloqueo GTM.
