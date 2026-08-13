---
doc_id: s53-hardware-diagnostics-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Sprint 53 — Troubleshooter de hardware — Quality Gate

**Estado software:** GREEN local
**Estado claim:** "asistente de impresora" descongelado-condicionado (GTM §4.1)
**Estado producción/piloto:** NO-GO hasta staging real + firmas A/V independientes
**Capability:** `hardware.diagnostics`, default-off
**Spec:** Arquitectura §5.3 regla 37b · ADR-0033 · Roadmap FASE 6G Sprint 53

El gate automatizado demuestra el contrato de software en entorno local:
asistente visual en Admin → Configuración con los 4 botones normativos
(impresora USB / impresoras en red / balanza / vitrina), estados ✓/✗ con causa
comprensible y "paso siguiente" sin jerga técnica (validado por copy y por E2E),
autodetección de ancho 58/80 mm, prueba de impresión <30 s y log `HARDWARE_DIAG`
en `audit_events` (cadena de hashes, lectura admin para soporte remoto). No
existe staging Cloudflare real, impresora/balanza físicas en QA humana ni
firmas A+V independientes: producción y piloto NO-GO.

## Evidencia RED→GREEN

| Hito | Run ID | Evidencia |
|---|---|---|
| RED dominio | `run-red-s53-domain` | domain-hardware inexistente (tests fallaron por import) |
| GREEN dominio | `run-green-s53-domain` | domain-hardware 19/19 (97.7% stmts, 96.9% branches, 100% funcs, 100% lines) |
| GREEN cliente | `run-green-s53-client` | pos-web diagnostics 10/10 + features/capabilities 3/3 + vitrina 2/2 (probe vitrina real BroadcastChannel) |
| GREEN rutas | `run-green-s53-routes` | hardware-diagnostics-routes 7/7 + protected-routes (matriz con POST/GET `/api/hardware/diagnostics`) |
| GREEN E2E | `run-green-s53-e2e` | hardware-diagnostics.spec 3/3 + suite E2E completa 41/41 (incluye fix CSP+route del harness offline-sync y dismiss del tour en quick-sale) |
| GREEN integración | `run-green-s53-integ` | adapters-d1 239/239 (29 files); fix determinista del edge handoff (`opened_at` fijo + tiebreaker `ended_at IS NULL`) |
| GREEN gate | `run-green-s53-gate` | unit adapters 338 · worker-api 952 · pos-web 212 · worker-fiscal 7 · domain-fiscal-pe 55 · lint/typecheck/format 0 · verify.sh SUITE GREEN (V-08/V-13/V-15/V-25) · Quality Gate OK (203.81 kB gzipped ≤ 300 kB) |

## Resultado local exacto

| Suite/check | Resultado observado |
|---|---|
| Domain hardware (nuevo) | **19 tests, 97.7% stmts / 96.9% branches / 100% funcs / 100% lines** (report canónico, causas con paso siguiente, papel 58/80, payload audit, validador de jerga) |
| Adapters D1 | **338 unit + 239 workerd** GREEN (29 files; handoff determinista) |
| Worker API | **952 unit** GREEN (rutas hardware 7/7, matriz protegida, fiscal-rc/worker-fiscal legacy fijados) |
| POS web | **212 unit** GREEN + **E2E 41/41** (hardware-diagnostics 3/3; tour/offline-sync specs reparados) |
| Lint / Typecheck / Format | 0 errores (incluye refactor complexity CAL-08 de `assertWellFormedXml` 30→≤12) |
| `scripts/verify.sh` | `RESULT SUITE GREEN` (V-08 con fila FASE 6G/HARDWARE_DIAG, V-13 cadena ledger, V-15 INDEX, V-18 ADR-0033, V-25 espejo) |
| `scripts/quality.sh` | `Quality Gate OK` — CAL-03 (semgrep/gitleaks), CAL-05 (cobertura), CAL-06 (bundle 203.81 kB gzipped) |

## Cobertura contractual

| Contrato | Evidencia local |
|---|---|
| 4 botones normativos (USB / red / balanza / vitrina) | UI `#hardware` en `admin/configuracion` + E2E `hw-probe-*` (3/3) |
| Estados ✓/✗ con causa + paso siguiente | `DIAGNOSTIC_CAUSES` en domain-hardware; report canónico en UI con `causeLabel`/`nextStepFor` |
| 0 conceptos técnicos (WebUSB/WSS/IP) en el flujo principal | `validateDiagnosticsCopy`/`findJargonViolations` + E2E aserta ausencia de jerga en el DOM |
| Autodetección 58/80 mm + reimpresión de prueba <30 s | `resolvePaperWidth` (preferencia > probe > null) + `runPrintTest` con `PRINT_TEST_TIMEOUT_MS`; E2E mide duración |
| Log `HARDWARE_DIAG` con timestamp para soporte remoto | `POST /api/hardware/diagnostics` (cadena `prev_hash`/`row_hash`, payload con `testedAtIso`) + `GET` admin (limit ≤ 50) |
| Capability default-off (ADR-ARCH-002) | `PUBLIC_FEATURE_HARDWARE_DIAGNOSTICS` + `FEATURE_HARDWARE_DIAGNOSTICS` (ambos 0 en config) + `tenant_capabilities.hardware.diagnostics` fail-closed |

## E2E local

1. `hardware-diagnostics.spec.ts` (3): todo-OK con ancho 58 mm detectado y POST persistido; impresora ausente → causa + paso siguiente y DOM sin jerga; prueba de impresión con duración <30 s.
2. Suite completa 41/41 (regresiones): onboarding tour, quick-sale (tour dismiss), offline-sync (harness con route mock same-origin por CSP), shift-handoff, price-labels, insights, LPDP, accesibilidad.
3. No sustituye QA humana ni staging real.

## Security Review

- Rutas admin-only (rol `admin`/`owner`) + flag + capability: triple gate fail-closed; sin lista no hay acceso por omisión (invariante 5).
- El report del cliente se re-valida en el servidor (shape fail-closed) y se persiste en la cadena de hashes de `audit_events` (append-only por triggers).
- Zero-dependency cliente (invariante 10): probes con Web Platform APIs (navigator.usb, BroadcastChannel, WebSocket) — sin librerías npm nuevas; el seam `__KIPUS_TEST_HARDWARE__` solo existe con el flag activo y responde causas del catálogo canónico.
- Semgrep + gitleaks GREEN (CAL-03).

## Evidencia externa pendiente

| Evidencia requerida | Estado | Condición de cierre |
|---|---|---|
| Staging Cloudflare real (workers + D1) | NO-GO | Despliegue real con flag off y pruebas de humo |
| Impresora térmica 58/80 física + balanza USB | NO-GO | QA humana con hardware real (≥90% de casos resueltos sin chat) |
| Firmas A+V independientes | NO-GO | Staff QA/Chaos + Staff Principal firman el veredicto |

## RACI real

| Rol | Estado |
|---|---|
| Staff Hardware (owner) | R — ejecutó (dominio, probes, UI, rutas, E2E) |
| Staff Frontend (Admin) | C — consultado (patrones UI de Admin → Configuración) |
| Staff QA/Chaos | V — verifica (E2E 41/41, integración 239/239, chaos harness intacto) |
| Staff Design | C — consultado (copy no-técnico validado por `findJargonViolations`) |
| Staff PM | C — consultado (GTM §4.1 condicionado) |
| Staff Principal | A — aprueba el cierre según RACI (Proceso §8.1) |

## Veredicto

**SOFTWARE-GREEN-CLAIM-LIVE (condicionado).** El software del Sprint 53 cumple la
regla 37b y los criterios de aceptación del roadmap en entorno local con evidencia
automatizada (unit, integración, E2E, gate documental y Quality Gate). El claim
"asistente de impresora" queda descongelado-condicionado (GTM §4.1): no se vende
hasta staging real + QA humana con hardware físico + firmas A+V independientes.
Este QG cierra la FASE 6G y el roadmap completo de especificación.
