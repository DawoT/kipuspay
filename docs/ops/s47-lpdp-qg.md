---
doc_id: ops-s47-lpdp-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Sprint 47 — LPDP (datos personales) — Quality Gate

**Estado software:** GREEN funcional local, con hallazgos HIGH/MEDIUM de seguridad C2/C3 abiertos; el canary 2026-09-17 es evidencia histórica, no una aprobación de exposición
**Estado claim:** **GTM-09 CONGELADO** hasta cerrar los hallazgos de seguridad y obtener revisión/firmas A/V; producción, piloto y nueva exposición de self-serve NO-GO
**Capability:** `compliance.lpdp`, default-off
**Spec:** Arquitectura §5.3 regla 32a (LPDP-01..04) · ADR-0031 · Ley N.º 29733 · Roadmap FASE 6F

El gate automatizado demuestra el contrato de software en entorno local: inventario
de PII aislado por tenant (LPDP-04), consentimientos por propósito (LPDP-01), export
del titular (LPDP-02) y erase/anonimización en un solo `db.batch` con retención fiscal
(LPDP-03), más el panel Admin → Clientes (listado sin PII, GRANT/REVOKE, export y erase
con confirmación doble). El staging Cloudflare base y su CI ya tienen evidencia técnica.
El canary técnico 2026-09-17 habilitó `FEATURE_LPDP=1` en un tenant sintético
aislado y pasó verify, consents, export, erase y rechazo del replay con el token ya
anonimizado; aún faltan QA humana independiente y aprobación PM con firmas A+V. Eso
mantiene producción y piloto NO-GO.

## Evidencia RED→GREEN

| Hito | Run ID | Commit completo | Evidencia |
|---|---|---|---|
| RED contractual (gobernanza) | `run-red-s47-lpdp-5e3bacb` | `5e3bacba3c35a6357c583ed94b5bc2ca4fc3de47` | ADR-0031, reglas LPDP-01..04, migración/down 0040, semgrep PII y registry declarados; backend, adaptador y rutas ausentes |
| GREEN backend | `run-green-s47-lpdp-093977e` | `093977e31b84e067bc3eacc36c3b6570a83caa48` | domain-customers (4 módulos, 100% cobertura), customer-repository (erase en un `db.batch` con cadena `prev_hash`/`row_hash`), rutas `/api/customers*`, 9 tests unit, 207 workerd GREEN |
| GREEN cierre (UI + regresiones) | `run-green-s47-lpdp-close` | `497173e` + commit de cierre (panel clientes, E2E 28/28) | Panel Admin → Clientes (listado sin PII, consents, export, erase doble confirmación), runbook DPO, copy GTM §5.7.2, E2E LPDP 5/5 y suite E2E completa 28/28 (regresiones s43/s44 cerradas), V-21 ampliado |

Ancestría verificada: `5e3bacb` → `093977e` → `497173e` → HEAD.

**Expected failure RED:** faltaban dominio de consentimiento/export/erase, el adaptador
D1 idempotente, las rutas y la proyección mínima del listado; los contratos de UI de
s43/s44 (membresias y pedidos) estaban rotos por el WIP `33098d9`.

## Resultado local exacto

| Suite/check | Resultado observado |
|---|---|
| Domain customers | 14 tests en 4 archivos; **100% líneas/ramas/funciones** |
| Adapters D1 (unit) | 291 tests GREEN |
| Adapters D1 (workerd integration) | 207 tests GREEN (incluye down-total DOWN_0039/0040) |
| Worker API | 664 tests GREEN (rutas LPDP incluidas) |
| POS web unit | 163 tests GREEN (client LPDP, contrato de página, features) |
| POS web E2E (Playwright + Chrome del sistema) | **28/28 GREEN** — incluye LPDP 5/5 y las regresiones s43/s44 restauradas (customer-orders 5/5, recurring-sales 5/5, price-labels, home/checkout/a11y, mobile-pwa) |
| Chaos sprints 4–9 | PASS (quality.sh) |
| POS bundle | dentro del presupuesto CAL-06 |
| `scripts/verify.sh` | `RESULT SUITE GREEN` (V-00..V-24, incluye V-21 ampliado a identificadores punteados) |
| `scripts/quality.sh` | `Quality Gate OK` |

## Cobertura contractual

| Contrato | Evidencia local |
|---|---|
| LPDP-01 consentimiento por propósito | `consent_records` (0040, `tenant_id NOT NULL`, UNIQUE por propósito), GRANT/REVOKE/NOOP idempotente; panel con toggle por propósito |
| LPDP-02 export del titular | `GET /api/customers/:id/export` con perfil + consents + comprobantes; fail-closed `CUSTOMER_ERASED`; descarga JSON desde el panel |
| LPDP-03 erase/anonimización | Un solo `db.batch`: perfil `pii_erased`, snapshots `[ANONYMIZED]`/`00000000`, consents revocados, audit `LPDP_ERASE` con cadena de hashes; UI con confirmación doble |
| LPDP-04 aislamiento | `tenant_id` siempre del JWT (nunca body/query); listado **sin PII** (solo id + documento + estado) |
| Retención fiscal SUNAT | Los snapshots de ventas se conservan anonimizados; `LPDP_ERASE_BLOCK` impide re-materialización |
| Fail-closed | Flag off ⇒ 404 `FEATURE_OFF`; cliente anonimizado ⇒ `CUSTOMER_ERASED`; sin sesión ⇒ 401/403 por rol (owner/admin/supervisor) |
| Runbook DPO | `docs/runbooks/lpdp-dpo.md` con procedimientos export/erase y simulacro |
| Copy GTM | `docs/GTM.md` §5.7.2 sin jerga; política pública pendiente de publicación post-gate |
| Regresiones s43/s44 | E2E 28/28: SW bloqueado por defecto en Playwright (los mocks `page.route` ya no se esquivan), nav RBAC de owner restaurado, touch targets 44/48px y contraste AA |

Tests de trazabilidad que resuelven en el monorepo:

- `packages/domain-customers/src/consent.test.ts`, `erase.test.ts`, `export.test.ts`, `inventory.test.ts`.
- `packages/adapters-d1/src/customer-repository.integration.test.ts`,
  `consent-records-schema.test.ts`.
- `apps/worker-api/src/customers/customer-lpdp-routes.test.ts` y
  `apps/worker-api/src/http/money-input.test.ts`.
- `apps/pos-web/src/lib/customers/customer-lpdp-client.test.ts`,
  `apps/pos-web/src/lib/customers/customer-panel.red.test.ts`,
  `apps/pos-web/src/lib/features.test.ts` y
  `apps/pos-web/tests/e2e/lpdp.spec.ts`.

## E2E local

Playwright 28/28 con Chrome del sistema (`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`):

1. LPDP 5/5: listado sin PII, owner sin controles de caja, export descarga JSON, erase
   con confirmación doble (0 llamadas antes de la segunda confirmación), cliente
   anonimizado fail-closed.
2. Regresiones s43/s44 restauradas: customer-orders 5/5 y recurring-sales 5/5 (mocks
   `page.route` efectivos con SW bloqueado), price-labels, home/checkout/a11y axe
   (contraste AA), mobile-pwa (48px touch + axe), forecasting, offline-sync.

Esto verifica navegador local con fixtures; no sustituye QA humana ni staging. El job
`e2e-pos` corre esta suite en CI (`quality.yml`) desde este gate.

## Security Review

Inventario PII proyectado mínimo en listado (defensa en profundidad), export acotado
al derecho de acceso con propósito explícito, erase limitado a owner/admin/supervisor,
`tenant_id` del JWT en toda consulta, `.prepare()`+`.bind()` sin interpolación. El
contrato del listado dejó de exponer nombre/email/teléfono/dirección (hallazgo de
auditoría del harness, F-1.1, corregido). Esta revisión no equivale a pentest ni
certificación LPDP.

### Remediación C3 — errores opacos (2026-09-16)

Una revisión posterior detectó que `mapErr()` podía devolver el mensaje bruto de
una excepción inesperada en los endpoints admin y titular. Se corrigieron ambos
handlers para responder `500 INTERNAL_ERROR` allowlisted, sin SQL ni PII; los
códigos de dominio conocidos mantienen sus respuestas específicas. El ciclo TDD
fue RED con `SQLITE_BUSY: customer Ana Perez phone ...` y GREEN tras el cambio:
`customer-lpdp-routes.test.ts` + `titular-lpdp-routes.test.ts` = **18/18 GREEN**.

### Cierre C3 — descubrimiento público del autoservicio (2026-09-16)

La política pública `/privacidad` ahora enlaza **“Ejercer tus derechos ARCO”** al
flujo `/lpdp` del POS mediante `PUBLIC_POS_ORIGIN`; el fallback apunta al dominio
de aplicación, y el build local mantiene el enlace sin activar la capability LPDP.
El contrato se cubre con `legal.test.ts` (**9/9 GREEN**) y el build/typecheck de
marketing (0 errores; 39 warnings Svelte históricos no relacionados). Esto hace
visible el acceso/exportación y anonimización del titular. La pantalla `/lpdp` también
expone el estado de la solicitud (`Identidad verificada`, `Copia lista` o
`Anonimización completada`); su E2E pasó **3/3 GREEN** el 2026-09-16. Esto no sustituye
la validación humana ni las firmas A/V.

La política se redeployó al Pages de staging el 2026-09-16 en el deployment
`https://9386780f.kipuspay-web.pages.dev/`; Playwright remoto headless observó HTTP
200, título presente y el enlace visible con destino
`https://kipuspay-pos-web-staging.pages.dev/lpdp`. El endpoint `/lpdp` respondió HTTP
200 y el canary autorizado se ejecutó sobre `https://kipuspay-app.pages.dev/lpdp`.

### Remediación local — factor OTP por correo (2026-09-17)

Por decisión explícita del usuario se adoptó OTP al correo ya registrado del
titular; el solicitante no elige destinatario. El primer endpoint ya no emite
bearer: entrega un reto opaco y una respuesta genérica; solo el segundo endpoint
puede emitir token después del consumo único del código. Reto, hash HMAC, intentos,
expiración y límites atómicos usan un Durable Object SQLite dedicado, en shards
fijos; `FEATURE_LPDP` permanece `0`. La decisión está documentada como propuesta
en [ADR-0042](../adr/ADR-0042-lpdp-email-otp.md), pendiente de aprobación.

RED→GREEN local reproducible en este worktree, todavía sin SHA de commit ni
firmas: Playwright `/lpdp` **3/3**, páginas legales marketing **3/3**, Worker
rutas **48/48**, Workerd DO **3/3**
(100 solicitudes concurrentes con exactamente 12 permitidas; consumo OTP
concurrente exactamente una vez; intentos y expiración), worker typecheck/lint,
POS feature gate público **1/1**, `svelte-check` (0 errores/advertencias), build Wrangler `--dry-run` y
`scripts/verify.sh` GREEN. Estas pruebas no prueban entrega
del proveedor, carga/abuso real ni staging.

La regresión de destinatario se validó además contra una mutación deliberada:
si el endpoint toma `email` del payload, el test falla al detectar el envío a
`attacker@example.test`; restaurado `to: row.email`, pasa. La evidencia confirma
que el segundo factor solo llega al contacto de D1.

Una revisión estática independiente detectó riesgo de agotamiento cruzado si el
límite por documento se compartía entre tenants. La llave se aisló como HMAC de
tenant + documento normalizado; la prueba de rutas confirma que cinco solicitudes
agotan solo esa cuota, que la sexta queda limitada, y que el mismo documento de
otro tenant conserva su cuota. El cambio posterior a esa revisión aún requiere
revisión final independiente.

La cuenta Cloudflare consultada no tiene el dominio de envío `kipuspay.com`
habilitado; no se envió correo real ni se configuró el secreto HMAC en staging.
El código/configuración local sí define `LPDP_OTP_FROM` y allowlist del binding;
esa configuración aún no se desplegó. TestSprite tampoco
tiene proyecto KipusPay enlazado (solo aparece Voysoft Kitchen KDS), por lo que
no se ejecutó contra un proyecto ajeno ni una versión publicada obsoleta.

Revalidación local focalizada del 2026-09-17: rutas LPDP admin/titular **24/24**,
Workerd `LpdpSecurityShard` **3/3** (rate limit concurrente, consumo OTP único,
intentos y expiración) y capability revocada/offline **3/3**. Para Workerd se
usó la configuración normal de Vitest, que activa el pool Cloudflare por el
nombre `lpdp-security.integration.test.ts`; invocarla mediante la configuración
genérica de integración Node no es válida y no se cuenta como ejecución de tests.
Estos tests son locales y no prueban entrega email, abuso en staging, replay
tardío de venta real ni firma A/V.

Como el flujo sigue congelado, retiré localmente de `/privacidad` el CTA al
autoservicio: la página indica que está en validación y ofrece
`privacidad@kipuspay.com` como canal humano. El Pages de staging conserva todavía
el enlace histórico hasta que se apruebe y despliegue su reemplazo; no se publicó
este cambio local. Además, la ruta directa `/lpdp` queda detrás de
`PUBLIC_FEATURE_LPDP=0` en Pages y presenta solo el canal humano; el formulario no
se renderiza salvo habilitación explícita de publicación. El Worker conserva su
propio `FEATURE_LPDP=0` y capability gate.

Revalidación del cierre local (2026-09-17): `playwright.lpdp-frozen.config.ts`
con flag `0` → **1/1 GREEN**; `src/lib/features.test.ts` → **3/3 GREEN**;
`scripts/verify.sh` V-00..V-31 → **SUITE GREEN**; `git diff --check` → GREEN.
La prueba congela `/api/**` para que el estado de no disponibilidad no dependa
de un Worker de sesión, y confirma que no aparecen formularios/controles de OTP
ni campos de PII, manteniéndose el enlace `mailto:` humano. Los warnings de
configuración TypeScript/SvelteKit del servidor E2E no impidieron la prueba; no
son evidencia de auditoría headed ni de staging.

## Evidencia externa pendiente

### Revisión de seguridad C2/C3 — 2026-09-17 (solo lectura; no es pentest ni firma humana)

Hallazgos de la revisión anterior a implementar OTP:

Una revisión independiente del flujo titular detectó dos hallazgos HIGH y dos
MEDIUM. En el worktree actual se cerraron localmente: (a) la anonimización ya
incluye perfil, snapshots, consentimientos, evento/cabeza de auditoría dentro de
un único `db.batch`, con un guard SQL que aborta si pierde el CAS; una prueba de
fallo del append de auditoría confirma rollback de todo; (b) todas las rutas
self-serve y admin `/api/customers` responden `Cache-Control: no-store`; (c) como
mitigación temporal, la verificación pública requería KV persistente. Esa
mitigación KV quedó sustituida por el Durable Object con contadores atómicos en
la remediación local descrita arriba.

Evidencia local reproducible en este worktree (sin commit SHA ni firmas todavía):
`pnpm --filter @kipuspay/adapters-d1 exec vitest run --config
vitest.integration.config.ts src/customer-repository.integration.test.ts` →
10/10 GREEN; con una mutación que desactiva el guard final, el caso CAS falló
porque el borrado resolvió; restaurar `changes()` devolvió GREEN.
`pnpm --filter @kipuspay/worker-api exec vitest run src/index.test.ts
-t "respuestas self-serve LPDP|rechaza la verificación pública LPDP"` → 2/2
GREEN.

`bash scripts/quality.sh` terminó `Quality Gate OK`: lint/typecheck/Prettier,
suite unitaria del monorepo, integración D1 **342/342**, chaos **132/132**, build
y bundle POS **317.07 kB gzipped / 320 kB**. `scripts/verify.sh` V-00..V-31 y
`git diff --check` también GREEN. El cambio permanece sin commit y sin despliegue;
Gitleaks/Semgrep no están instalados localmente y el gate reporta que los ejecuta CI.

Revisión independiente de solo lectura del diff local (subagente, 2026-09-17),
enfocada en rutas LPDP/OTP, aislamiento por tenant, PII, límites y gates: **sin
hallazgos**. La herramienta formal `security-review` no estaba disponible en la
sesión; este resultado no es pentest, firma humana ni revisión de configuración
en staging. QA y A/V continúan pendientes.

El hallazgo HIGH de factor independiente y el MEDIUM de rate limit KV tienen una
remediación implementada y probada localmente con OTP/email y contadores DO
atómicos. No se consideran cerrados para operación: faltan revisión Security
independiente del diff final, validación real del sender, configuración secreta,
pruebas de staging y A/V. No repetir ni ampliar canary ni usar datos reales de
titulares antes de ese cierre. El cambio actual es local y no está desplegado.

| Evidencia requerida | Estado | Condición de cierre |
|---|---|---|
| Staging/canary Cloudflare real | Evidencia histórica; repetir bloqueado hasta cierre HIGH y A/V | Canary 2026-09-17 previo a la revisión: verify/consents/export/erase 200; token post-erase 401; D1 `pii_erased=1` |
| Proveedor email / sender KipusPay | PENDIENTE / NO-GO | Preflight autenticado `wrangler email sending list` (2026-09-17) no encuentra `kipuspay.com` en la cuenta Wrangler disponible; no se envió correo ni se alteró DNS. Config local endurecida: `LPDP_OTP_FROM=privacidad@kipuspay.com`, binding `EMAIL` allowlisted solo a ese sender en base y staging; `wrangler deploy --dry-run --env staging` confirma el binding restringido y `FEATURE_LPDP=0`. Falta onboard del dominio KipusPay, secreto HMAC, entrega/rebotes observables. Cloudflare requiere dominio remitente onboarded y Email Sending está en beta para Workers Paid ([workers API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/), [requisitos de binding](https://developers.cloudflare.com/email-service/configuration/send-bindings/)). |
| Integración Workerd / abuso | GREEN local; staging pendiente | Concurrencia, replay, expiración y límite de intentos cubiertos en Workerd |
| QA humana | PENDIENTE / NO-GO | Staff QA valida flujo OTP, export/erase reales y POS ordinario intacto |
| Revisión Security independiente | Revisión estática local sin hallazgos; cierre operativo PENDIENTE / NO-GO | Revisión humana de configuración/deploy, rate limits, privacidad/logs y abuso en staging |
| Aprobación PM | PENDIENTE / NO-GO | Staff PM acepta alcance, copy §5.7.2 y residuales |
| Firma A+V independiente | PENDIENTE / NO-GO | Humanos independientes firman evidencia de staging |

Revisión estática adicional del diff C3 (subagente, solo lectura): sin hallazgos
de seguridad; detectó la ambigüedad documental anterior, ya corregida. La
inspección confirmó `EMAIL: SendEmail` tanto en las interfaces base como staging
generadas por Wrangler. No constituye firma humana A/V ni pentest.

## RACI real

| Rol | Estado |
|---|---|
| Staff Security (owner) | Gobernanza, dominio LPDP, rutas y runbook GREEN local |
| Staff Backend ACID | `db.batch` de erase, idempotencia y down-total GREEN local |
| Staff Data | Proyección mínima sin PII y export GREEN local |
| Staff Frontend | Panel Admin → Clientes + E2E 28/28 GREEN local |
| Staff QA independiente | PENDIENTE |
| Staff PM A | PENDIENTE |
| Staff Growth | Copy §5.7.2 redactado; política pública tras gate |

## Veredicto

**SOFTWARE-GREEN LOCAL; CLAIM/OPERACIÓN NO-GO.** El flujo local ya requiere OTP
enviado al correo registrado; las carreras de límites y replay se probaron en
Workerd. Siguen pendientes dominio/sender KipusPay, secreto y entrega real,
revisión Security independiente, QA humana y firmas A/V. No repetir ni ampliar el
canary titular. La suite local no cambia el veredicto externo; GTM-09, staging,
piloto, autoservicio público y producción permanecen NO-GO.
