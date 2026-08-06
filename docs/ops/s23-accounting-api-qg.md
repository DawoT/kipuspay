---
doc_id: ops-s23-accounting-api-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Sprint 23 — Contador + API pública — Quality Gate

**Estado:** GOV-APROBADO (firma A+V)  
**Capabilities:** `integrations.accounting_export`, `integrations.api`  
**Spec:** Arquitectura §5.4 reglas 3–4; SEC-04 outbound; GTM Cadena “API de integraciones”

## Evidencia

| Check | Resultado |
|---|---|
| Export Contasis/Concar bit-reproducible (mismo rango) | GREEN — `adapters-accounting` golden + sort estable |
| Offline/API: export no muta ledger | GREEN — solo SELECT reader |
| API key revoke inmediata (D1 + KV) | GREEN — `api_key_revoked:{tenant}:{prefix}` |
| Webhook HTTPS deny-list + HMAC + retries ≤3 + auto-disable | GREEN — domain + delivery atomic |
| Plan Guard Cadena+; cobro nunca 402 | GREEN — premium prefixes + `PLAN_REQUIRES_CADENA` |
| Flags default off | GREEN — `FEATURE_ACCOUNTING_EXPORT` / `FEATURE_INTEGRATIONS_API` |
| Docs internas | GREEN — `docs/ops/api-public-s23.md` |
| Chaos / unit | GREEN — domain-integrations, adapters-d1, worker-api |
| `scripts/verify.sh` | SUITE GREEN |
| `scripts/quality.sh` | Quality Gate OK |

## RACI

| Rol | Quién | Firma |
|---|---|---|
| R | Backend Datos + Security + SRE | OK |
| A | Staff Principal | OK |
| V | Security + Principal + Growth (claim Cadena) | OK |

## Copy Growth (descongelado)

- Cadena: **API de integraciones** live tras este QG
- FAQ Contasis/Concar: export asientos por rango/sucursal
- Objeción playbook alineada

## Residuales

- Diario `journal_*` / GTM-14 → Sprint 32 (bit-consistencia con contrato S23)
- Siigo nativo → backlog v10
- WhatsApp / loyalty → Sprint 24
- Hook CPE `cpe.accepted` / `cpe.rejected` en el path CDR live: seam `enqueuePublicEventForTenant` listo; cableado fino en poller fiscal = follow-up ops (sale.created ya encola post offline-sale)
- Credenciales prod API pepper / KV secrets onboarding

## Hallazgos de revisión — cerrados (Ledger 0278/0279)

| Hallazgo | Fix | Evidencia |
|---|---|---|
| C1 | `enqueueWebhookDeliveryAtomic` idempotente ante race de doble enqueue (INSERT condicional `WHERE NOT EXISTS` + UNIQUE) | D1 real: 2 enqueues concurrentes → 1 fila, ambos 200 |
| C2 | `claimWebhookDeliveryAtomic` ok derivado del guard atómico | D1 real: doble claim → 1 `ok`, attempt_count=1 |
| C3 | SSRF: `assertSafeWebhookUrl` — IPv4-mapped IPv6 (`::ffff:`), trailing dot, anti DNS-rebinding (DoH) | domain-integrations 12/12 |
| C4 | Export reparte débito por método (`sale_payments`): no-crédito → 1011, crédito/remanente → 1212 | golden reader + domain |
| C5 | Alcance export `NV/01/03/12` documentado (NC/ND fuera por diseño) | §5.4 regla 3 + ops |
| C6 | Pepper fail-closed: sin `API_KEY_PEPPER` → `503 PEPPER_UNAVAILABLE` | worker-api test |
| C7 | Drain **solo admin/owner** → `403 FORBIDDEN_ADMIN` | worker-api test |
| C8 | Sin secret HMAC al entregar → delivery `FAILED` (`SECRET_MISSING`), nunca firma con `''` | worker-api test |
| M3 | Enqueue `sale.created` post-commit best-effort: fallo no revierte la venta (200 garantizado) | worker-api test |
| M4 | Tests de flags fail-closed (`FEATURE_*` off → 404; falsy → disabled) | worker-api test |
| M5 | Spec §5.4 regla 4 corregida a **403 `PLAN_REQUIRES_CADENA`** semántico (402 era incorrecto) | docs |
| A3 | Quitados excludes de coverage (`integration-routes`, `payment-routes`) — 71.45% global ≥ 70 | vitest --coverage |
