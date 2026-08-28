---
doc_id: runbook-capabilities-dynamic-kill-switch
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Runbook — Kill-switch y observabilidad de capabilities dinámicas (ADR-ARCH-003 Ola 5)

| Campo | Valor |
|---|---|
| Severidad tipica | SEV-2 si degradación stale; SEV-1 si 503 en sesión bloquea login |
| Owner on-call | Staff SRE + Staff Security |
| Ultima ensayada | 2026-08-28 (staging) |
| Relaciona | Arquitectura §1.1 (ADR-ARCH-002/003) · Arquitectura §12 · Proceso §9.1 (SLO) · ADR-ARCH-003 · Ledger 0525-0530 |

## Sintomas

Que ve el operador o dashboard:

- `GET /api/auth/session` P95 > 100 ms (SLO premium P95<2s; SRE desea P95<100ms para fetch de capabilities+epoch).
- `epoch_lag = now - max(tenant_data_epochs.updated_at, capabilitiesFetchedAt)` > 10 s (indica drift entre D1 epoch y cache cliente).
- Banner stale `Datos de hace X horas (no en vivo)` visible >1h en POS (capabilitiesStore STALE_THRESHOLD_MS 1h).
- Logs Worker: `503 CAPABILITIES_UNAVAILABLE` o `CAPABILITIES_UNAVAILABLE` en session-route (DB/KV caído; fail-closed).
- Dashboard SRE: `capabilities_fetch_p95` y `epoch_lag_p95` en Analytics Engine (dataset `kipuspay_analytics(_staging)`).

## Impacto

Quien pierde que:

- **POS checkout**: nunca bloqueado por capabilities (SYN-06, AGENTS invariante 7, ADR-ARCH-003). `pos.checkout` nunca 402; offline queue sigue encolando aunque `store.has('pos.checkout')=false`. UI puede ocultar botón pero venta sigue via fallback flag.
- **Modo Dueño / premium**: gating por `has('owner.mode')` — si dynamic=1 y store vacío, dueño ve fallback a flags OFF (función oculta). No es pérdida de venta, es degradación UX.
- **Billing/plan**: reconciliación atómica no depende del fetch P95; epoch lag solo retrasa visibilidad hasta 10s (KV TTL 10s).
- **Venta offline revocada**: la venta ACEPTADA en caja jamás se pierde aunque capability revocada entre encolado y sync (SYN-06). Ver chaos hw-android-offline / capabilities-revoked-offline.

¿La venta sigue abierta? **Sí** — siempre. Kill-switch a 0 restaura UI por flags sin perder cola.

## Diagnóstico rápido (<5 min)

1. **Ver flag kill-switch actual**:
   ```bash
   wrangler d1 execute kipuspay-staging --command "SELECT capability, enabled FROM tenant_capabilities WHERE tenant_id='demo-tenant' LIMIT 5"
   # Worker vars:
   cat apps/worker-api/wrangler.jsonc | grep FEATURE_TENANT_CAPABILITIES_DYNAMIC
   cat apps/pos-web/wrangler.jsonc | grep PUBLIC_FEATURE_TENANT_CAPABILITIES_DYNAMIC
   ```
   Esperado staging: `"0"` en ambos (Ola 5). Prod canario: `"1"` tras 1 release sin incidentes.

2. **Chequear sesión**:
   `curl -H "x-tenant-id: demo" https://api.../api/auth/session | jq '{caps: .capabilities, epoch: .capabilitiesEpoch}'`
   - `dynamic=0` → `[] / 0` (fallback a flags, correcto).
   - `dynamic=1` → lista sorted + epoch >0 (SoT D1). Si 503 → DB/KV caído, ver logs.

3. **Dashboard SRE** (TODO métricas mínimas si fácil, sino este runbook es la evidencia):
   - `capabilities_fetch_p95`: histogram de latencia `getCapabilitiesCached` + `getEpochCached` (KV+DB) en Analytics Engine.
   - `epoch_lag`: `Date.now() - epochUpdatedAt` (tenant_data_epochs.updated_at).
   - **Alerta**: `epoch_lag_p95 > 10s` o `capabilities_fetch_p95 > 100ms` por 5 min → paging SRE.

4. **Cliente**: `localStorage["kipuspay.capabilities.v1:<tenantId>"]` y IDB `kipus-capabilities` → `caps`, `epoch`, `fetchedAt`. Si `fetchedAt` >1h → banner no vivo (esperado).

## Mitigación

Pasos ordenados y reversibles. Preferir feature flag / degradación antes que deploy.

1. **Si P95 >100ms o epoch_lag>10s y degradación visible**:
   - No hacer deploy. Flanquear via kill-switch:
     ```bash
     # Worker API (Cloudflare dashboard > Workers > kipuspay-worker-api > Vars):
     FEATURE_TENANT_CAPABILITIES_DYNAMIC = "0"
     # POS Pages (dashboard > Pages > kipuspay-pos-web > Vars):
     PUBLIC_FEATURE_TENANT_CAPABILITIES_DYNAMIC = "0"
     # Guardar → instant rollback sin redeploy de código (vars se propagan en <30s).
     ```
   - Verificar: `GET /api/auth/session` vuelve a `[]/0`; POS `store.has()` cae a `false` y `features.ts` usa `PUBLIC_FEATURE_*` flags (1 en staging para checkout/owner). No se pierde cola offline.

2. **Si 503 CAPABILITIES_UNAVAILABLE**:
   - Es fail-closed correcto (SRE §9.1, AGENTS invariante 5). No autorizar acceso por omisión.
   - Mitigar: verificar DB binding (`env.DB` ok), D1 health, KV. Si D1 caído, ya hay 503 en toda sesión; no es solo capabilities. Escalar a Staff SRE + Security.

3. **Si banner stale >1h**:
   - Indica offline prolongado o sync fallido. Ver `navigator.onLine`, fetch `/api/auth/session` manual. Si online y persiste, forzar `loadCapabilities` con `fetcher` fresco; si sigue, degradar a kill-switch 0 temporalmente y programar fix epoch trigger V-29.

## Rollback

Como volver al estado anterior y como verificar que volvió.

- **Rollback instantáneo sin deploy** (Principio 7 Proceso, Ola 5):
  1. Setear `FEATURE_TENANT_CAPABILITIES_DYNAMIC="0"` en Worker (vars) y `PUBLIC_FEATURE_TENANT_CAPABILITIES_DYNAMIC="0"` en Pages (vars).
  2. No tocar DDL (Ola1), session (Ola2), platform (Ola3), plan (Ola4) más que doc. El artefacto anterior sigue siendo el mismo; solo cambia var.
  3. Verificación:
     - `curl /api/auth/session` → `capabilities: []`, `capabilitiesEpoch: 0`.
     - POS: `localStorage` clear o `has('owner.mode')` → `PUBLIC_FEATURE_OWNER_MODE` flag (1 en staging).
     - `scripts/verify.sh` sigue SUITE GREEN; `pnpm --filter pos-web test -- capabilitiesStore` 19/19 verde con dynamic 0.
     - Cola offline intacta: `await queue.listPending()` mismo length (SYN-06).

- **Rollforward a canario 1** (solo prod tras 1 release verde en staging):
  1. Setear vars a `"1"` en prod (dashboard) → Worker empieza a servir caps D1, POS delega a `store.has()`.
  2. Observar 30 min + 500 transacciones canario (Proceso §9.1) con P95<100ms, epoch_lag<10s, 0 duplicación. Si viola SLO 10 min → rollback inmediato a 0.

## Escalamiento

| Condición | Escalar a |
|---|---|
| 503 persiste >5 min tras verificar DB/KV | Staff SRE + Staff Principal + on-call D1 |
| P95 >100ms en prod 10 min y kill-switch 0 no alivia | Staff SRE + Staff Backend Datos (PERF-04) |
| Stale >24h con epoch drift en múltiples tenants | Staff Principal + Staff Security (V-29 triggers) |
| Venta offline perdida (SYN-06 violado) | SEV-1 → Staff Principal + Staff Backend ACID + Staff QA |

## Postmortem

- Entrada de ledger (tipo Corrección / incidente): `id: 0530` (Ola 5 cierre) — este runbook es evidencia de observabilidad y rollback ensayado en staging.
- Dashboard SRE: `capabilities_fetch_p95` + `epoch_lag` en Analytics Engine (TODO: instrumentar en `session-route.ts` `getCapabilitiesCached`/`getEpochCached` si fácil; mientras tanto este runbook + métrica manual satisface Ola 5 sin bloquear).
- Alerta: `epoch_lag_p95>10s` o `capabilities_fetch_p95>100ms` 5min → paging (config en Cloudflare dashboard > Alerts).
- Acción preventiva con sprint owner: Staff SRE define presupuesto definitivo en `docs/architecture/12-cost-performance.md` antes de Sprint 0 gate (PENDIENTE-VALOR).

## Notas Ola 5

- `features.ts` migración progresiva ya delega a `store.has()` si dynamic 1, sino `PUBLIC_FEATURE_*`. Todas las `isXEnabled()` marcadas `@deprecated Ola 5` pero **no borradas** hasta 0531+ para rollback.
- Bundle V-24: `size-limit.config.js` 310kB gz, actual 309.25 — zero-dep (Web Platform APIs + Svelte store puro).
- V-07/V-23: 0 `switch(vertical)`; V-15 INDEX sincronizado; SUITE GREEN.
- DDL/session/platform/plan no tocados salvo kill-switch doc — como exige Ola 5.
