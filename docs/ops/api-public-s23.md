---
doc_id: ops-api-public-s23
alias: "—"
authority: normativa
owner: "@DawoT"
---

# API pública KipusPay — Sprint 23 (interno)

Soft-launch detrás de `FEATURE_INTEGRATIONS_API` / `FEATURE_ACCOUNTING_EXPORT` (default off).
Plan: **Cadena+** (`plan_id` in `cadena` or `enterprise`). Rutas API fuera de plan → **403 `PLAN_REQUIRES_CADENA`** (semántico, nunca 402 — el cobro/caja nunca es barrera).

## Auth

- Admin (JWT tenant): `/api/integrations/accounting/export`, `/api/integrations/api-keys`, `/api/integrations/webhooks`
- Pública (API key): `Authorization: Bearer kp_live_…` en `/v1/sales`, `/v1/documents`
- Hash: HMAC-SHA256(pepper, `salt:token`); revocación D1 + KV `api_key_revoked:{tenant}:{prefix}`
- **Pepper fail-closed (C6):** sin `API_KEY_PEPPER` (ausente/vacío) las rutas de API keys responden `503 PEPPER_UNAVAILABLE`; jamás se usa pepper conocido de desarrollo.

## Export contable

`POST /api/integrations/accounting/export`

```json
{ "fromDate": "2026-08-01", "toDate": "2026-08-05", "branchId": "…", "target": "contasis" | "concar" }
```

- Contasis → CSV; Concar → XML
- Solo lectura sobre ventas/CxC; bit-reproducible en el mismo rango
- **Alcance (C5):** solo `NV`/`01`/`03`/`12`; NC/ND (`07`/`08`) **fuera de alcance por diseño**
- **Desglose por método (C4):** el débito se reparte por `sale_payments` → `payment_methods.code`; no-crédito suma a `1011`, crédito/remanente a `1212`
- Diario `journal_*` = Sprint 32 (debe bit-consistir con este contrato)

## Webhooks salientes

Eventos mínimos: `sale.created`, `cpe.accepted`, `cpe.rejected`

- URL solo HTTPS + deny-list (§4.0) **incluye** IPv4-mapped IPv6 (`::ffff:…`), trailing dot y anti DNS-rebinding (C3)
- Header `x-kipuspay-signature`: HMAC-SHA256(secret, body)
- **Sin secreto (C8):** si el secret no existe en KV al entregar → la entrega se marca **fallida** (`SECRET_MISSING`), nunca se firma con `''`
- Reintentos ≤ 3, timeout 5 s, auto-disable tras 5 fallos
- Drain: `POST /api/integrations/webhooks/drain` — **solo admin/owner** (C7, `403 FORBIDDEN_ADMIN`)
- `sale.created` se encola al commit de venta offline; CPE accepted/rejected vía `enqueuePublicEventForTenant` en transiciones fiscales
- **Best-effort post-commit (M3):** un fallo del enqueue del evento nunca revierte la venta commiteada (200 garantizado)

## Stripe

`/v1/webhooks/stripe` = **billing SaaS**, no es caja ni API pública POS.
