---
doc_id: runbook-offline-sync-chunked
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Runbook — Offline sync chunked / cuota IndexedDB

| Campo | Valor |
|---|---|
| Severidad tipica | SEV-2 (cola crece) / SEV-1 (bloqueo 100% cuota en hora punta) |
| Owner on-call | Staff Frontend Offline-First |
| Ultima ensayada | 2026-08-04 (local quality) |
| Relaciona | Arquitectura §7 (SYN-07/SYN-08/SYN-11) · §9 edge D · §13.5 chaos · GTM §6.5 |

## Sintomas

- Cola offline no baja tras recuperar red.
- `POST /api/v1/sync/sales` → 404 con `FEATURE_OFF`.
- Cajero ve alerta ≥80% o bloqueo al 100% ("libera espacio o reconéctate…").
- Chaos `network-adversarial` / `quota-exceeded` RED en quality.

## Impacto

Ventas offline quedan en IndexedDB; cobro online sigue. Al 100% cuota, **nuevas** ventas offline se bloquean (fail-closed). Reportes del día cerrado pueden quedar desfasados hasta rematerialize (edge D).

## Diagnóstico rápido (<5 min)

1. Flag: `FEATURE_OFFLINE_SYNC` en Worker (`wrangler.jsonc` / dashboard). Default `0` → 404.
2. Auth: ruta bajo `/api/*` exige JWT; 401/403 no es bug de sync.
3. Cola cliente: DevTools → Application → IndexedDB claves `offline/{offlineSaleId}`.
4. Acks: respuesta per-sale `SUCCESS | ALREADY_SYNCED | FAILED` — un FAILED no tumba el chunk.
5. Edge D: tras sync de día cerrado, fila en `daily_financial_rollups` + KV `insights:{tenant}:{fecha}` invalidada.

## Mitigación

1. Activar flag solo en tenants/canary: `FEATURE_OFFLINE_SYNC=1`.
2. Forzar flush SW / dispatcher (`CHUNK_SIZE=30`) cuando haya red.
3. Si cuota BLOCKED: pedir sync o liberar storage del dispositivo; no borrar cola a ciegas.
4. Reintentos con mismo `offlineSaleId` deben ack `ALREADY_SYNCED` (idempotencia).
5. Si rollup inconsistente: re-ejecutar rematerialize idempotente por `(tenant, branch, report_date)`.

## Rollback

1. `FEATURE_OFFLINE_SYNC=0` → endpoint batch 404; single-sale S4 (`FEATURE_ACID_OFFLINE_SALE`) permanece independiente.
2. Desregistrar Service Worker `offline-sync-sw.js` en clientes afectados.
3. Verificar: `scripts/verify.sh` + `scripts/quality.sh` (steps 4d chaos).

## Escalamiento

| Condición | Escalar a |
|---|---|
| Pérdida/duplicación en chaos 500 ciclos | Staff QA/Chaos + Staff Backend ACID |
| Corrupción IDB / QuotaExceeded no capturado | Staff Frontend Offline-First |
| Rollup/insights incorrectos post sync | Staff Reporting (§9) |

## Postmortem

- Entrada de ledger (cierre QG): `id: 0219`
- Acción preventiva: no reintroducir `UPSERT INTO` en LWW CRM; mantener INSERT+UPDATE WHERE.
