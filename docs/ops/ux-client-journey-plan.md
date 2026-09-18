---
doc_id: ops-ux-client-journey-plan
alias: "—"
authority: derivada
owner: "@DawoT"
---

# Recorrido UX de cliente — onboarding y verticales

## Objetivo

Validar que una persona nueva pueda pasar de elegir su vertical a realizar su
primera operación, sin ver módulos que su tenant no tiene habilitados y sin que
la UI invente precios, impuestos o estados.

## Plan de recorrido

1. Abrir `/login` y completar el acceso del tenant.
2. Confirmar que la sesión muestra la vertical elegida y carga capabilities.
3. Abrir la caja, localizar el catálogo y completar una venta normal.
4. Repetir el camino por vertical:
   - Restaurante: salón → comanda → KDS → cuenta dividida.
   - Farmacia: inventario con lotes/BOM.
   - Retail: cotización.
   - Servicios: membresía/recurrencia.
   - Cadenas: transferencia y recepción.
   - Grifos: catálogo de combustible → despacho → cierre de isla.
5. Revocar una capability durante la sesión: el módulo desaparece o responde
   fail-closed, sin conservar acciones en cola.
6. Cortar red, encolar una venta y reconciliarla al volver online.

## Evidencia ejecutada

- Playwright local: 7/7 escenarios pasan en `kds-salon.spec.ts` y
  `vertical-capabilities.spec.ts`.
- Gate documental: `scripts/verify.sh` → `RESULT SUITE GREEN`.
- Quality gate: lint, typecheck, unitarios, integración, chaos, build y bundle
  pasan; POS 313.45 kB gzip con presupuesto 320 kB.

### Auditoría headed C1 — 2026-09-17 (parcial, staging NO-GO)

Se usó Google Chrome visible mediante `playwright-cli` con perfil dedicado
`/tmp/kipuspay-c1-headed`. CUA no reportó navegadores/apps conectados, pero la
auditoría headed sí fue reproducible por CLI; no se ingresaron credenciales ni
se creó un tenant real.

- Staging marketing `/`, `/empezar` y POS `/login`: HTTP 200; el inicio muestra
  navegación, `/empezar` presenta el paso 1 de 4 y el login presenta sus campos.
  Enviar el formulario de onboarding vacío muestra validación accesible y no
  avanza; el login no se envió.
- Las seis rutas `/para/{restaurantes,farmacias,retail,servicios,cadenas,grifos}`
  respondieron HTTP 200 con título y H1. `/para/grifos` produjo error de consola
  por `GET /media/og-grifos.png` → 404. La tarjeta de marca existente se usa como
  fallback en el código local y hay una prueba de existencia para portadas y
  tarjetas sociales; staging sigue mostrando la versión anterior.
- La revisión de texto staging encontró claims de “100% legal”, actualización
  “en tiempo real” y promesas de “5 minutos” en las verticales. La copia local
  de las seis verticales y las tres comparativas ya elimina esos claims
  universales, junto con promesas de envío fiscal automático; staging sigue con
  la versión anterior porque el cambio no se ha desplegado.
- La home local quitó la promesa “factura en automático”, claims de envío
  bloqueados por GTM-08, la presentación de Modo Dueño como tiempo real y las
  comparaciones absolutas sobre otros proveedores. También se ajustaron title,
  meta description y Twitter Card. GTM-08 permanece WAIT; no se descongela el
  claim fiscal.
- Marketing local: **413 unitarios GREEN y 3 omitidos**, lint GREEN, typecheck
  sin errores, build GREEN; E2E onboarding completo **2/2**
  (primera venta y copy/SEO de home). El bootstrap/claim/sync de primera venta
  son simulados; no equivale a login/claim real en staging.
- Clasificación SHS del cambio de claims: **R2×M** por copy legal/comercial y
  superficie de cliente. R/A/V no han firmado; por eso no se despliega el copy
  ni se modifica la autorización del claim. GTM-08/11/12 siguen bajo sus gates.

Capturas headed archivadas:

- Staging previo a la corrección: [home](evidence/c1-staging-home-2026-09-17.png)
  y [landing de Grifos con asset 404](evidence/c1-staging-grifos-404-2026-09-17.png).
- Build local corregido: [home](evidence/c1-local-home-2026-09-17.png) y
  [validación del onboarding](evidence/c1-local-onboarding-validation-2026-09-17.png).

### Re-chequeo headed — 2026-09-17

Chrome visible + Playwright CLI repitió sin interceptación `/`, `/empezar` y
`/para/grifos` en `kipuspay-web.pages.dev`, además del login en
`kipuspay-pos-web-staging.pages.dev`. Confirmó que
el deployment de marketing sigue mostrando copy anterior con promesas de emisión
automática, legalidad universal, tiempo real y primera venta en cinco minutos;
el formulario vacío de onboarding valida y no avanza. Grifos aún solicita
`/media/og-grifos.png` (404, 1 error y 2 warnings); el login renderiza, su 401 de
sesión anónima es esperado y el favicon `/favicon.png` de este hostname POS sigue
en 404. El favicon 200 previamente visto fue en `kipuspay-app.pages.dev`, no en
este hostname.

Capturas: [home](evidence/c1-staging-home-recheck-2026-09-17.png),
[validación onboarding](evidence/c1-staging-onboarding-validation-recheck-2026-09-17.png),
[Grifos](evidence/c1-staging-grifos-recheck-2026-09-17.png),
[login](evidence/c1-staging-pos-login-recheck-2026-09-17.png). No hubo credenciales,
tenant ni mutación de staging. No se desplegó el copy local por requerir firma A/V;
por ello la brecha observada sigue abierta.

### Revalidación automatizada de staging C1 — 2026-09-17 (1/9, NO-GO)

Se repitió el smoke Playwright contra los dominios publicados, sin interceptar
rutas. Solo POS `/login` y health del Worker pasaron. Fallaron home y
`/empezar` por claims antiguos, las seis landings por claims bloqueados, además
del enlace de login de marketing apuntando a un host POS distinto del proyecto
Pages activo. Grifos también devolvió 404 para
`https://kipuspay-web.pages.dev/media/og-grifos.png`. El resultado fue **1/9**;
no se autenticó ni se escribió en D1, así que no cubre los recorridos de
onboarding real, primera venta, consultas D1 ni revocación/offline.

Se archivaron capturas, trazas Playwright y registros JSON de respuestas
(métodos, URLs sin query/hash, status, tipo de recurso y content-type) en
[`evidence/c1-recheck-2026-09-17/`](evidence/c1-recheck-2026-09-17/). Esta
revalidación fue CLI automatizada en modo headless; las capturas headed humanas
anteriores están enlazadas arriba y ninguna de las dos sustituye firmas QA/A/V.
El copy local corregido y la ruta POS alineada no se desplegaron. C1 continúa
abierto hasta revisión independiente, despliegue autorizado y repetición contra
el artefacto publicado.

### Revalidación headed reproducible — 2026-09-17 (staging 1/9, NO-GO)

Se repitió la inspección con Chrome headed mediante `playwright-cli` (la sesión
CUA y `uxc` no están disponibles). Las nueve rutas navegaron y se capturaron:
home, `/empezar`, las seis verticales y POS `/login`. El smoke Playwright contra
las mismas URLs clasificó **1/9**: POS `/login` y health del Worker pasan; home,
onboarding y las seis verticales fallan por copy comercial bloqueado, además del
login de marketing que aún apunta al alias POS anterior. `/para/grifos` sigue
devolviendo 404 para `og-grifos.png`. No se usaron credenciales, ni hubo
interceptación de red o mutación de datos.

La inspección visual de la home confirma que el staging servido aún afirma
“factura en automático”, emisión y modo dueño “en tiempo real”, “100% legal” y
primera venta “en 5 minutos”; por tanto no es solo una diferencia del detector
automático. Las capturas headed de las nueve rutas y la traza/red del recorrido
están en [`evidence/c1-headed-recheck-2026-09-17/`](evidence/c1-headed-recheck-2026-09-17/)
(`headed-*.png`, `headed-all.trace`, `headed-all.network`). Los artefactos
detallados del smoke (screenshots, traces y JSON de respuestas) también están en
esa carpeta. No se desplegó el copy local: el bloqueo requiere revisión y
autorización A/V. C1 sigue NO-GO para publicación hasta deploy autorizado y
repetición headed con todas las aserciones aprobadas.

El mismo smoke, esta vez contra el build local actualizado y con POS/API de
staging solo en lectura, pasó **9/9** (home, onboarding, seis verticales, POS
login y health). El primer intento local había sido 8/9 porque `env.example`
seguía apuntando al alias POS viejo aunque `wrangler.jsonc` y el script de
deploy ya usaban `kipuspay-app.pages.dev`; se añadió la aserción a
`features.test.ts`, se observó RED y se actualizó `env.example`, quedando 4/4
unitarios GREEN. La repetición 9/9 y la captura headed de la home local se
archivaron en [`evidence/c1-local-preview-2026-09-17/`](evidence/c1-local-preview-2026-09-17/).
Esto valida el artefacto local, no reemplaza desplegarlo en staging ni cambia el
resultado 1/9 del sitio publicado.

### Revisión ampliada de claims C1 — 2026-09-17 (local GREEN, staging NO-GO)

Una segunda lectura de las superficies públicas encontró y corrigió claims
adicionales: compatibilidad universal de periféricos y exportaciones,
resultados/tiempos presentados como garantizados en Grifos y Servicios, frescura
implícita de Modo Dueño, y estados fiscales o `EN VIVO` en mockups. Las pantallas
verticales ahora se identifican como ilustrativas con datos de muestra; los
mockups de cadena y servicios etiquetan sus métricas/documentos como ejemplo y
no enviado. Ayuda y seguridad ya no anuncian como disponibles la activación
fiscal general, el autoservicio LPDP, compatibilidad contable garantizada ni
disponibilidad contractual no acreditada. La página de casos muestra estado
vacío y metadatos que dicen explícitamente que aún no hay casos publicados.

Regresión local posterior: **421 unitarios pasan, 3 omitidos**; lint GREEN;
typecheck sin errores (40 warnings Svelte existentes); build GREEN; E2E de
comparativas, casos y verticales **4/4**; `scripts/verify.sh` →
`RESULT SUITE GREEN` (V-00..V-31). Un test de búsqueda se actualizó para buscar
por la categoría “impresora” en vez de una marca cuya compatibilidad ya no se
promete.

Esto cierra solo la corrección local de copy identificada hasta ahora. No hubo
despliegue ni validación visual final en staging; faltan recorrer redirects y
enlaces reales, correlacionar warnings de consola y obtener aprobaciones A/V.
La revisión independiente de agente no equivale a firma humana. La auditoría
de contenido tampoco sustituye evidencia externa de cada capacidad; C1 sigue
parcial y GTM-08/11/12 permanecen bajo sus gates.

## Gaps UX detectados / pendientes

| Prioridad | Gap | Impacto | Criterio de cierre |
|---|---|---|---|
| P0 | No hay recorrido headed contra staging desde `/login` hasta una cuenta real; el E2E local existente simula bootstrap, claim y sync. | La UX y el contrato del deployment real todavía no están validados de extremo a extremo. | Cuenta/tenant sintético aprobado, login y claim reales, primera venta y evidencia sin secretos. |
| P0 | Los deployments de staging siguen mostrando copy retirado en local: emisión automática/“100% legal”, tiempo real y primera venta en cinco minutos. | Claim fiscal y promesa temporal contradictorios con GTM y con el estado real del producto. | Aprobación A/V del copy, despliegue del artefacto aprobado y re-chequeo headed de todas las superficies públicas. |
| P1 | `/para/grifos` en marketing devuelve 404 para `/media/og-grifos.png`; el 404 de `/favicon.png` se limitó al alias legacy `kipuspay-pos-web-staging.pages.dev`, no al proyecto Pages `kipuspay-app` desplegado por workflow. | OG de Grifos ausente en el deployment actual; configuración local de redirects aún apuntaba POS al alias equivocado. | Smoke ahora usa `kipuspay-app.pages.dev`; verificados `/login` y su SVG con HTTP 200. Marketing `PUBLIC_POS_ORIGIN` y Worker `POS_APP_ORIGIN` se alinearon localmente al proyecto activo; falta deploy autorizado y verificar redirect de onboarding sin exponer tokens. El OG 404 continúa abierto. |
| P1 | `staging-browser-smoke.mjs` dio 2/2 GREEN aunque la auditoría headed observó claims antiguos y errores 404 de assets. | El runner anterior filtraba “Failed to load resource”, no visitaba Grifos y validaba solo shells/health. | Smoke actualizado: descubre y recorre home, `/empezar`, las seis verticales y POS/login; falla ante claims bloqueados visibles, assets 4xx/5xx y enlace `/login` a un host POS distinto del deployment. Staging actual queda **1/9 (NO-GO)**: pasa POS/login y API; fallan home, onboarding y las seis verticales por claims antiguos; Grifos también tiene `og-grifos.png` 404. Preview local de marketing con POS/API staging pasa **9/9**. Al configurar `STAGING_EVIDENCE_DIR`, cada recorrido genera screenshot, trace Playwright y JSON de requests/responses sin query strings; el workflow los adjunta al artifact existente `deploy-staging-evidence`. Falta ejecutar el workflow tras revisión/autorización, revalidar el deployment y obtener A/V. |
| P1 | Falta E2E de factura empresarial emitida desde una orden de Restaurante. | El flujo principal de mesa funciona, pero no se prueba el último paso fiscal. | Orden → datos RUC → emisión → estado CDR visible, sin cálculo fiscal en cliente. |
| P1 | Grifos no tiene recorrido browser de isla/surtidor, pago y reporte de turno. | El bundle existe en dominio/API, pero la experiencia operativa no está validada con usuario. | E2E de despacho idempotente, offline-reconciliable y handoff de isla. |
| P2 | No hay sesión CUA/MCP conectada; `playwright-cli` con Chrome headed sí está disponible. | La auditoría de staging puede repetirse por CLI, pero no existe evidencia MCP independiente ni validación humana A/V. | Mantener el runner CLI reproducible y obtener revisión QA/A+V sobre los artefactos. |

## Próxima tanda recomendada

Cerrar P0 primero; luego P1 por vertical. No promover claims comerciales de Grifos
ni de emisión fiscal desde orden hasta disponer de esas evidencias.
