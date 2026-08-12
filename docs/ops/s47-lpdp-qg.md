---
doc_id: ops-s47-lpdp-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Sprint 47 — LPDP (datos personales) — Quality Gate

**Estado software:** GREEN local  
**Estado claim:** GTM-09 (Export/LPDP) descongelado con copy acotado (§5.7.2); producción/piloto NO-GO  
**Capability:** `compliance.lpdp`, default-off  
**Spec:** Arquitectura §5.3 regla 32a (LPDP-01..04) · ADR-0031 · Ley N.º 29733 · Roadmap FASE 6F

El gate automatizado demuestra el contrato de software en entorno local: inventario
de PII aislado por tenant (LPDP-04), consentimientos por propósito (LPDP-01), export
del titular (LPDP-02) y erase/anonimización en un solo `db.batch` con retención fiscal
(LPDP-03), más el panel Admin → Clientes (listado sin PII, GRANT/REVOKE, export y erase
con confirmación doble). No existe staging Cloudflare real, QA humana independiente ni
aprobación PM con firmas A+V: eso mantiene producción y piloto NO-GO.

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

## Evidencia externa pendiente

| Evidencia requerida | Estado | Condición de cierre |
|---|---|---|
| Staging/canary Cloudflare real | PENDIENTE / NO-GO | Flags, rutas y workerd en bindings reales; política de privacidad publicada (Staff Growth) |
| QA humana | PENDIENTE / NO-GO | Staff QA valida panel, export/erase reales y POS ordinario intacto |
| Aprobación PM | PENDIENTE / NO-GO | Staff PM acepta alcance, copy §5.7.2 y residuales |
| Firma A+V independiente | PENDIENTE / NO-GO | Humanos independientes firman evidencia de staging |

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

**SOFTWARE-GREEN-CLAIM-LIVE.** El software y el gate automatizado quedan GREEN local y
la claim **GTM-09 (exportación, privacidad y conservación) se descongela** conforme al
gate del Sprint 47 (Roadmap FASE 6F), con el copy acotado de GTM §5.7.2, sin prometer
borrado "cuando quieras" y con la capability default-off. Producción y piloto siguen
NO-GO hasta staging Cloudflare real, QA humana, aprobación PM y firmas A+V
independientes. El simulacro de solicitud LPDP (export + erase con datos reales en
local) quedó ejecutado y documentado en `docs/runbooks/lpdp-dpo.md`.
