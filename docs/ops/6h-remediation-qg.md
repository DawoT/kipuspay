---
doc_id: ops-6h-remediation-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Fase 6H — Remediación y Sello QA — Quality Gate final

**Estado software:** GREEN local (sprouts 54–58 cerrados)  
**Estado claim:** hallazgos F-1..F-13 cerrados; features congeladas reflejadas en su
estado real; **producción/piloto NO-GO** (sin staging Cloudflare real ni QA humana
independiente)  
**Alcance:** `docs/ops/browser-functional-audit.md` (hallazgos F-1..F-13, §4
congelados) · gate nuevo V-30 · sprints 54–59 de la Fase 6H  
**Spec:** Proceso §8.1/§8.3 · Arquitectura §13 (CAL-01..08) · ledger 0407–0417

## Evidencia RED→GREEN por sprint

| Sprint | Run ID | RED (commit) | GREEN (commit) | Evidencia |
|---|---|---|---|---|
| 54 | `run-red-6h-s54` / `run-green-6h-s54` | `827e9d7` (contrato F-1..F-8) | `278772c` | F-1 rol en 6 rutas Dueño; F-2 `x-tenant-id`; F-3 plan-gate fail-closed; ledger 0407/0408 |
| 55 | `run-red-6h-s55` | `827e9d7` | `278772c` | F-6 IDs demo fuera de `chargeOnline`; F-7 ticket imprime payable; F-8 RUC opcional; ledger 0408 |
| 56 | `run-red-6h-f4f5-s56` | `827e9d7` | `ede3366` | F-4 claim persistido en localStorage; F-5 backups con sesión real; e2e 2/2; ledger 0409 |
| 57 | `run-red-6h-s57-f9f13` | `b3552cf` | `dac2d72` | F-9 flags en wrangler.jsonc; F-10 runbook; F-11 badges /ayuda; F-12 legal/seguridad; F-13 resumen Dueño server-side; gate V-30 (9 hallazgos → 0); ledger 0413 |
| 58 | `run-red-6h-s58` | `818f8ef` | `08c63a6` | **e2e completo 81/81**: emerald on-dark AA, skip-link 48px, Pedidos retiro en chrome cashier, confirmación de reserva, proxy fail-fast 502 (navegación client-side), smoke D1 F-10 (reclamaciones 201 + 364 triggers epoch), spec frozen-features; ledgers 0414/0415/0416 |

Ancestría verificada: cada `red_commit_sha`/`green_commit_sha` es ancestro de HEAD
(V-20), con `expected_failure` y run ids reales.

## Resultado local exacto

| Suite/check | Resultado observado |
|---|---|
| POS web unit | 389 tests en 79 archivos; GREEN |
| Marketing web unit | 153 tests en 32 archivos; GREEN (help/legal/security F-11/F-12) |
| Worker API unit | 1163 tests; GREEN; `tsc` 0 errores |
| POS web E2E (Playwright + Chrome) | **81/81 GREEN** — a11y axe (contraste AA, targets ≥48px), customer-orders 5/5, forecasting, onboarding-claim-reload, backups, owner-day-summary, frozen-features 3/3, modal/mobile-pwa, LPDP, KDS/salón |
| Smoke D1 (runbook F-10) | Estado fresco: apply 0054/0055 → `platform_reclamaciones` presente, 364 triggers epoch (V-29), `POST /v1/reclamaciones` 201 con acuse `REC-20260815-79C59D` persistido (antes 503), `/api/catalog/sellable` 401 fail-closed |
| Chaos sprints 4–9 + bench | PASS (quality.sh); hot-path p95=0.0016 ms |
| POS bundle (CAL-06) | 259.77 kB gz < 300 kB |
| `scripts/verify.sh` | `RESULT SUITE GREEN` (V-00..V-30) |
| `scripts/quality.sh` | `Quality Gate OK` (lint/format/typecheck/unit/integration/security/build/bundle) |

## Cobertura contractual (hallazgos → evidencia)

| Hallazgo | Cierre | Evidencia |
|---|---|---|
| F-1/F-2/F-3 | CORREGIDO | e2e owner-day-summary/owner-alertas/briefing-plan-gate; unit worker-api |
| F-4/F-5 | CORREGIDO | e2e onboarding-claim-reload/backups; unit onboarding-claim |
| F-6 + V-30 | CORREGIDO | gate nuevo `pos_demo_ids.py` (150 archivos limpios; baseline 9 hallazgos); semgrep/unit |
| F-7/F-8 | CORREGIDO | ticket-contract red tests; ticket imprime payable y RUC real |
| F-9 | CORREGIDO | flags declarados en wrangler.jsonc vars + `wrangler types` regenerado |
| F-10 | DOCUMENTADO | runbook `docs/runbooks/local-bootstrap.md` **ensayado en estado fresco** (smoke D1 arriba) |
| F-11/F-12 | CORREGIDO | /ayuda 6 badges "En preparación"; /terminos Ley 29571 + Distrito Judicial Lima Centro; /privacidad Ley 29733 + D.S. 003-2013-JUS; /seguridad SEV-1/2/3; footer facturacion@kipuspay.com; tests help/legal/security 18/18 |
| F-13 | RESUELTO | /owner consulta `/api/owner/day-summary` (server-side, "no en vivo"); e2e owner-day-summary |
| Congelados (§4) | REFLEJADOS | KDS/Salón desactivados, Anular boleta "en preparación", SUNAT/LPDP/Membresías coherentes — bajo contrato e2e (`frozen-features.spec.ts`) |

## Security review

Ciclo RED→GREEN con evidencia runtime por sprint (CAL-07), cero literales demo en el
código fuente del POS (V-30), copy de marketing y POS sin jerga técnica (V-26/V-27),
proxy dev/CI fail-fast 502 (fail-closed ante worker caído), contraste WCAG AA y
targets táctiles ≥48px en superficies críticas (S15-H1). Esta revisión no equivale a
pentest ni certificación.

## Evidencia externa pendiente

| Evidencia requerida | Estado | Condición de cierre |
|---|---|---|
| Staging/canary Cloudflare real | PENDIENTE / NO-GO | Flags y rutas en bindings reales; migraciones `--remote` |
| QA humana independiente | PENDIENTE / NO-GO | Staff QA valida flujos reales con worker + D1 remoto |
| Push + CI (verify/quality/security/codeql) | PENDIENTE | Se cierra con el push de esta rama |

## RACI real (Proceso §8.1)

| Rol | Estado |
|---|---|
| Staff Frontend (R) | Sprints 54–58 ejecutados: fixes, specs y gates GREEN |
| Staff QA (R) | Ciclos RED→GREEN honestos, smoke D1, suite e2e 81/81 |
| @DawoT — humano (A) | Aprobación firmada (decisor) |
| Staff Verifier (V) | V independiente: verificación con evidencia adjunta (distinto de R) |

## Veredicto

**SOFTWARE-GREEN-CLAIM-LIVE.** El software y el gate automatizado quedan **GREEN
local**: hallazgos F-1..F-13 cerrados con evidencia RED→GREEN, gate V-30 activo,
suite e2e completa 81/81, smoke D1 del runbook F-10 exitoso y features congeladas
bajo contrato de regresión. **Producción y piloto siguen NO-GO** hasta staging
Cloudflare real, QA humana independiente y verificación en CI tras el push.
