---
doc_id: runbook-push-kill-switch
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Runbook — Kill-switch push inline + rotación VAPID + `push_slo_violation`

| Campo | Valor |
|---|---|
| Severidad típica | SEV-2 si p95 degradado o tasa <99%; SEV-1 si PII/secreto, cruce tenant, ACK replay, o venta bloqueada por push |
| Owner on-call | Kipus SRE (Staff SRE) + Staff Mobile |
| Última ensayada | 2026-08-24 game day E2E staging (flag `FEATURE_PUSH_INLINE_DISPATCH` toggle en caliente) · rotación VAPID v3→v4 2026-08-23 |
| Relaciona | Arquitectura §5.12.3 · Arquitectura §5.12.4 · Arquitectura §5.12.6 · Arquitectura §5.12.7 · Arquitectura §12 · Arquitectura §8.1 · Proceso §9.1 · Proceso §5.2 · ADR-0036 · `docs/ops/push-ack-slo-baseline.md` · `docs/ops/adr0036-gameday-staging.md` · `docs/runbooks/mobile-push-incident.md` · `docs/runbooks/secrets-ops-material.md` |

## Síntomas

Qué ve el operador o el dashboard (métrica, log, HTTP, notificación):

- `GET /health` OK pero `push_slo_violation` en Workers Observability (`console.warn` de `apps/worker-api/src/push/push-slo-observer.ts`) con `reasons: ["P95_AT_OR_ABOVE_10S"]` o `["DISPLAYED_BELOW_99"]` y `normalSamples ≥20`.
- Panel P95-breaker ( `docs/ops/dashboards/p95-breaker-dashboard.md` ): P95 ack_delta ≥10 s (warning ≥8 s sostenido 30 min) o tasa `DISPLAYED/ACCEPTED (NORMAL)` <99% (warning) / <95% (critical) en 24 h (M3/M4 de `docs/ops/push-ack-slo-baseline.md`).
- Alertas disparadas `HotPathP95Burn` o `BreakerOpen` correlacionadas con spike `push_send_failed` / `push_inline_dispatch_failed` (error surfaced en camino inline `waitUntil` — regresión del drill 2026-08-23).
- `push_deliveries` D1: acumulación `LEASED` sin `accepted_at`, `attempt_count` sin `failure_reason`, o backlog `PENDING` que no drena (TTL vs cron `*/5`).
- Síntoma inverso (kill-switch roto): con `FEATURE_PUSH_INLINE_DISPATCH=0` un `push_events.created_at` tarda <30 s en `accepted_at` (debería esperar al cron ≤300 s) → flag no está off.

## Impacto

Quién pierde qué (caja, CPE, Modo Dueño, billing). ¿La venta sigue abierta?

- **Caja / venta:** nunca bloqueada por push. `processOfflineSaleAtomic` es ACID por `db.batch` (Arquitectura §6) y el productor push solo agrega intención durable idempotente (`push_events`/`push_deliveries`) con `appendPushEventAtomic`. Un fallo de push no revierte stock, CPE, cierre de caja ni sincronización (§5.12.1, invariante 7).
- **Alertas Dueño:** con degradación push el dueño ve `REDACTED` vía polling/banner autenticado con backoff (Arquitectura §5.12.6 degradación). La ventana de reacción pasa de <10 s a ~5 min (cadencia cron `*/5`) cuando inline está off — pérdida de valor pero no de dinero.
- **Fiscal/billing:** breaker fiscal (§8.1) y sobregiro `usage_counters` viven en otro plano; no son afectados por este kill-switch.
- **Privacidad:** si el incidente es PII/secreto o cruce tenant, la severidad es SEV-1 y aplica `docs/runbooks/mobile-push-incident.md` § Incidente de PII (kill-switch global + LPDP), no solo este inline.

**¿La venta sigue abierta? Sí — siempre.** Apagar inline solo mueve la entrega al cron backstop; el checkout degrada a polling y la cola IndexedDB nunca se pierde.

## Diagnóstico rápido (<5 min)

1. **Ver flag inline actual (fuente de verdad staging/prod):**

   ```bash
   # API Cloudflare — settings del worker (viejo code no tenía la var, nuevo sí)
   curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
     "https://api.cloudflare.com/client/v4/accounts/c5b18f62cb7e73fcd2ece5822936d699/workers/scripts/kipuspay-worker-api-staging/settings" \
     | jq '.result.bindings[] | select(.name=="FEATURE_PUSH_INLINE_DISPATCH")'

   # Fallback local (repo): debe ser "0" por defecto; staging con guard anti-deriva --keep-vars puede tener "1"
   grep -n FEATURE_PUSH_INLINE_DISPATCH apps/worker-api/wrangler.jsonc
   ```

   Esperado repo: ausente o `"0"` (ADR-0036 default off). Esperado staging tras game day 2026-08-24: `"1"` (seguro en caliente). Si `0`, el worker solo usa cron `*/5`.

2. **Chequear observer D1 (24h rodante, idx_push_deliveries_slo):**

   ```sql
   -- Reproduce el snapshot del observer (apps/worker-api/src/push/push-slo-observer.ts)
   SELECT substr(d.id,1,8) AS id8, d.status, d.display_context AS ctx,
          e.created_at AS event_created_at, d.accepted_at, d.displayed_at,
          ROUND((julianday(d.displayed_at)-julianday(d.accepted_at))*86400,3) AS ack_delta_s,
          ROUND((julianday(d.displayed_at)-julianday(e.created_at))*86400,3) AS slo_latency_s
   FROM push_deliveries d JOIN push_events e ON e.tenant_id=d.tenant_id AND e.id=d.event_id
   WHERE d.created_at >= datetime('now','-1 day')
   ORDER BY d.created_at DESC LIMIT 10;

   -- Agregado M2-M5 (guard n<20 → no alertar, como hace pushDeliveryObservation)
   SELECT count(*) AS total,
          sum(CASE WHEN d.display_context='NORMAL' THEN 1 ELSE 0 END) AS normalSamples,
          sum(CASE WHEN d.displayed_at IS NOT NULL AND d.display_context='NORMAL' THEN 1 ELSE 0 END) AS displayed,
          1.0*sum(CASE WHEN d.displayed_at IS NOT NULL AND d.display_context='NORMAL' THEN 1 ELSE 0 END)
           / nullif(sum(CASE WHEN d.display_context='NORMAL' THEN 1 ELSE 0 END),0) AS displayed_rate,
          sum(CASE WHEN d.display_context='OFFLINE' THEN 1 ELSE 0 END) AS offline,
          sum(CASE WHEN d.display_context='DOZE' THEN 1 ELSE 0 END) AS doze
   FROM push_deliveries d WHERE d.created_at >= datetime('now','-1 day');
   ```

   Si `normalSamples <20`, el observer **no alerta** (guard anti-ruido — `docs/ops/push-ack-slo-baseline.md` §3). Ese es el comportamiento correcto, no un bug.

3. **Ver logs Workers Observability (15 min ventana):**

   ```bash
   # Todo snapshot (siempre)
   wrangler tail kipuspay-worker-api-staging --format json | jq 'select(.message | contains("push_slo_snapshot"))'
   # Solo violaciones (requiere normalSamples>=20 Y (rate<0.99 O p95>=10000ms))
   wrangler tail kipuspay-worker-api-staging --format json | jq 'select(.message | contains("push_slo_violation"))'
   ```

   Guard: `pushDeliveryObservation` (usado por `evaluatePushSloSnapshot`) dispara `DISPLAYED_BELOW_99` si `<0.99` y `P95_AT_OR_ABOVE_10S` si `≥10000 ms`.

4. **VAPID vigente vs var pública:**

   ```bash
   grep -n PUSH_VAPID_PUBLIC_KEY apps/worker-api/wrangler.jsonc
   # staging esperado: "BKIPWeAjjzcKM9C_dl2-EqC-5vVPt93xyB06pkn7GfbLcDzfpZNsj6sLakEyDl8bGaVjC_kZdC8a2BUnNd4uabs" (v4 B*, 87c)
   # antigua v3 intacta en Secrets Store 6c5d2aff785644d39ca233efe0d0ed34 (id 58e38775…) para rollback
   ```

   La pública servida por `GET /api/push/privacy` debe ser idéntica al binding `push-vapid-public-v4` del worker-kms (Flujo B §5.12.3 — jamás importar desde panel Firebase).

## Mitigación (pasos ordenados y reversibles — preferir flag antes que deploy)

> Principio 7 Proceso: reversibilidad primero. El kill-switch de ADR-0036 es var en caliente sin redeploy.

1. **Si `push_slo_violation` con p95 ≥10 s o rate <99% (n≥20) y degradación de latencia/ACK:**
   - No hacer deploy. Flanquear vía kill-switch inline:

     ```bash
     # Opción A (recomendada): Dashboard CF → Workers & Pages → kipuspay-worker-api-staging → Settings → Variables and Secrets
     # FEATURE_PUSH_INLINE_DISPATCH = "0"  → Save → se propaga en <30s, próximo request lee el nuevo valor (cold start)

     # Opción B (API, misma semántica que el game day que hizo 93→94 bindings sin redeploy):
     # PATCH vía API CF Workers scripts/settings con multipart bindings (ver docs/ops/adr0036-gameday-staging.md paso 22:23)
     # Nota: wrangler deploy --keep-vars NO toca FEATURE_PUSH_INLINE_DISPATCH si ya es secreto/var runtime; usar PATCH o dashboard.
     ```

   - Verificar mitigación (2–3 min):
     - Nuevo `push_events.created_at` → `push_deliveries.accepted_at` vuelve a `≈ cron */5` (4–5 min, no 2 s) — verificado en game day baseline flag OFF 22:10.
     - `wrangler tail` muestra solo `push_slo_snapshot` sin nueva `push_slo_violation` que mencione `P95_AT_OR_ABOVE_10S` por causa inline (el cron conserva backstop).
     - `HotPathP95Burn` y `BreakerOpen` del dashboard deben bajar si la causa era inline; `DoReadHerd` debe permanecer verde (cache aislado absorbe).
   - Si la mitigación no alivia en 10 min, escalar (ver § Escalamiento): el problema no es inline sino KMS, D1, o dispositivo/doze (consultar panel excluir OFFLINE/DOZE).

2. **Si PII/secreto, cruce tenant, ACK replay/falso, o dispositivo revocado recibe push:**

   Aplicar `docs/runbooks/mobile-push-incident.md` § Revocación masiva y rotación — no este runbook. Kill-switch global de dispatcher + polling/banner + revocación masiva por propósito (`OWNER_ALERTS`/`OPERATIONAL_MOBILE`) auditada. SEV-1.

3. **Si backlog LEASED sin `failure_reason` o `push_inline_dispatch_failed` silencioso:**

   Es la regresión del drill 2026-08-23 (inline tragaba error antes de invocar worker-kms). Con ADR-0036 el error **siempre** persiste `failure_reason` y `console.warn push_send_failed`. Si ves `LEASED attempt_count=0 sin failure_reason` en worker viejo, kill-switch a 0 y redeploy del worker nuevo (`./github/workflows/deploy-staging.yml` V-31) antes de reactivar.

## Rollback

Cómo volver al estado anterior y cómo verificar que volvió.

### Rollback A — `FEATURE_PUSH_INLINE_DISPATCH` → `0` (sin redeploy, inmediato)

1. Setear `FEATURE_PUSH_INLINE_DISPATCH="0"` en Cloudflare dashboard (Worker → Settings → Variables) o vía PATCH API CF `workers/scripts/.../settings` (mecanismo del game day 2026-08-24 22:23 que logró 93→94 bindings sin redeploy).
2. No tocar DDL 0038, `push_events`/`push_deliveries`, ni código. El artefacto anterior sigue siendo el mismo; solo cambia la var (OLA C4 anti-deriva — `docs/ops/flag-drift-audit-staging.md`).
3. Verificación:
   - `curl /health` → 200 `{"status":"ok"}` (staging `f23d7b8b-be71-483b-9489-2c7c4ebd73df`).
   - Crear 1 push de test (ruta `/mobile` o `sendTestPushHttp` con JWT `user_stg_owner_001` / `tenant_stg_phase0_001`): `POST /api/push/test` → 202 con `eventId`. D1: `SELECT status FROM push_deliveries WHERE event_id=?` debe quedar `PENDING`/`LEASED` tras 60 s (no `ACCEPTED` en 2 s) — T1 exacto del game day.
   - Logs: `push_slo_snapshot` con `alert:false` (o sin `push_slo_violation`) si n≥20; `0 push_inline_dispatch_failed` y `0 push_send_failed`.
   - `scripts/verify.sh` sigue `RESULT SUITE GREEN`; `pnpm --filter @kipuspay/worker-api test -- push-slo-observer 3/3` verde.
   - Cola offline intacta: `await queue.listPending()` mismo length (offline-first).

### Rollback B — Rotación VAPID v4 → v3 (si el push falla por VAPID)

Estado vigente (Flujo B §5.12.3, `docs/runbooks/secrets-ops-material.md`): par v4 active en Secrets Store `6c5d2aff785644d39ca233efe0d0ed34` (`push-vapid-private-v4` + binding `push-vapid-public-v4` en `apps/worker-kms/wrangler.jsonc`), var `PUSH_VAPID_PUBLIC_KEY` del API idéntica (`BKIPWeAj...abs`), JWK ops-local `tmp-staff/vapid-v4.json`. **v3 intacta en store solo para rollback** (`push-vapid-private-v3` id `58e38775…`, `push-vapid-public-v3`).

1. Cambiar `apps/worker-kms/wrangler.jsonc` binding `push-vapid-private-v4` → `push-vapid-private-v3` (o `secret_name` → v3) y `apps/worker-api/wrangler.jsonc` `PUSH_VAPID_PUBLIC_KEY` → pública de v3 (formato B*, 87c) o `""` si v3 no tiene material local y se quiere fail-closed hasta regenerar.
2. Redeploy `worker-kms` luego `worker-api` (orden §13.7 workers → Pages, `docs/ops/staging-bootstrap.md` § Deploy commands, Workflow `.github/workflows/deploy-staging.yml` `workflow_dispatch` con `dry_run:false`):
   ```bash
   pnpm --filter @kipuspay/worker-kms run deploy:staging
   pnpm --filter @kipuspay/worker-api run deploy:staging
   ```
   Con `--keep-vars` el deploy no pisa otras vars runtime; sin keep-vars re-pasar `PUSH_VAPID_PUBLIC_KEY` de v3.
3. Verificación:
   - `GET /api/push/privacy` sigue 403 `PUSH_SCOPE_FORBIDDEN` si capability `mobile.push` no concedida (fail-closed), o 200 con `vapidPublicKey` de v3 si el tenant tiene capability.
   - Crear suscripción Web Push en PWA staging (`/mobile`) con nuevo VAPID → 201 `push_subscriptions` con `endpoint_token_fingerprint` nuevo y `encryption_key_version=v3`.
   - Suscripciones v4 quedan `STALE`/`INVALID` en próximo envío 404/410 y se invalidan sin borrar (Arquitectura §5.12.6). Dispositivos re-suscriben en foreground.
   - Si KMS o Secrets Store no disponibles → 503 fail-closed (nunca mock ACCEPTED).

### Rollforward — Re-activación canaria `1` (solo tras staging verde ≥1 release)

1. Setear `FEATURE_PUSH_INLINE_DISPATCH="1"` en dashboard prod (o staging canary). `worker-api` empieza a hacer `dispatchPushNow` vía `ctx.waitUntil` acotado a `{tenantId,eventId}` y `INLINE_MAX_DELIVERIES=16` (ADR-0036 — techo 32 invocations Worker/request).
2. Observar 30 min + 500 txs críticas (Proceso §9.1) con `push_slo_snapshot` sin `push_slo_violation`, P95 E2E <10 s en 2/3 pushes (game day 5/8/18 s) y `0 push_inline_dispatch_failed`. Si viola SLO 10 min → rollback inmediato a `0`.

## `push_slo_violation` — runbook específico (Arquitectura §5.12.4)

El observer (`apps/worker-api/src/push/push-slo-observer.ts`) corre en el cron `scheduled` del `worker-api` con `windowHours:24` y `nowMs:Date.now()`:

- Lee D1 `push_deliveries ⋈ push_events` (índice `idx_push_deliveries_slo` sobre `(tenant_id, display_context, created_at, displayed_at)`) hasta 1000 filas con `created_at >= window`.
- Calcula `evaluatePushSloSnapshot(rows)` puro: `normalSamples` (`display_context=NORMAL`), `displayed`, `offline`/`doze` excluidos, `m4p95` (accepted→displayed) y `m5p95` (event→displayed), combinados como `max(m4p95,m5p95)`; `m2Rate` (ACCEPTED/terminal) informativo.
- Delega a `pushDeliveryObservation` (M2–M5): `DISPLAYED_BELOW_99` si `<0.99`, `P95_AT_OR_ABOVE_10S` si `≥10000 ms`, guard `normalSamples<20 → no alert`.
- Siempre `console.log push_slo_snapshot` (totalRows, displayedRate, m2Rate, p50Ms/p95Ms, m4/m5); si alerta → `console.warn push_slo_violation` con reasons.

**Acción por reason:**

| Reason | Significado | Acción |
|---|---|---|
| `DISPLAYED_BELOW_99` | Tasa NORMAL <99% | Auditar `RETRY`/`FAILED`/`EXPIRED` por provider (WEB_PUSH vs FCM_HTTP_V1), TTL vs cron `*/5` (evento 60s expiraba antes del tick — root cause del drill), y clasificación ACCEPTED-sin-ACK (flota sin dispositivo en dock) |
| `P95_AT_OR_ABOVE_10S` | p95 ≥10 s | Medir `ack_delta_s` vs `slo_latency_s` del diagnóstico SQL §2: si ack_delta <10 s pero E2E >10 s, la cola es la causa (inline debe estar ON); si ambos >10 s, dispositivo/doze o `Retry-After`/backoff |
| `OFFLINE`/`DOZE` excluidos | Solo si etiquetados | Verificar `display_context` tagging del SW — sin etiqueta no se excluyen (§5.12.4) |

**Backlog y leases si alerta persiste:**

1. Congelar nuevos claims y medir backlog por `TTL/provider/tenant` (query § Métricas segura de `mobile-push-incident.md`).
2. Esperar expiración natural de leases stale (60 s); takeover solo por CAS idempotente (no borrar `lease_owner_hash`).
3. Reanudar páginas pequeñas con `Retry-After`+jitter; 404/410 invalida suscripción, 429/5xx reintenta mientras TTL vigente. `EXPIRED` sin display es terminal — no convertir `ACCEPTED→DISPLAYED` sin ACK one-shot 300 s.

## Escalamiento

| Condición | Escalar a |
|---|---|
| `push_slo_violation` persiste >30 min tras kill-switch `0` o re-aparece en <1 h | Staff SRE + Staff Mobile + Staff QA (SLO) |
| PII/secreto, cruce tenant, credencial comprometida, ACK replay/falso | SEV-1: Staff Security + Staff Privacy + Staff Principal |
| Venta/cola perdida, duplicado visible, checkout bloqueado (SYN-06 violado) | SEV-1: Staff Mobile + Staff Offline + Staff Backend ACID |
| KMS/Secrets Store/DAO breaker no disponible (503 fail-closed) | Staff Security + owner `PUSH_KMS` + Staff SRE |
| VAPID v3 rollback fallido o `PUSH_VAPID_PUBLIC_KEY` vacío sin var deployada | Staff Security + Staff SRE (rotación ciega — `docs/runbooks/secrets-ops-material.md`) |
| Backlog que no drena >2 h o leases que no expiran | Staff SRE + owner Worker + owner provider (Web Push/FCM) |

## Postmortem

- Registrar timeline, switches (`FEATURE_PUSH_INLINE_DISPATCH` 1→0→1), provider/versiones (`WEB_PUSH`/`FCM_HTTP_V1`), agregados M2–M5, revocación/rotación VAPID v4↔v3, backlog y recuperación de leases, validación y residuales **sin secretos ni PII** (solo fingerprints opacos).
- Añadir entrada append-only al ledger (`tipo: Incidente` o `Corrección` con `referencias_entradas` al ledger que introdujo el flag) para toda corrección o incidente que requiera rollback.
- No descongelar `go-live-fcm` (GTM-26) / `c8-fcm-vapid-real` hasta staging real con Zebra Z2466, P95 <10 s y `DISPLAYED` ≥99% validados y firmas A+V ( `docs/ops/pending-batches.yaml` gate `fcm-vapid-real` ).
- Entrada de ledger propuesta: `id: ____` con `relacion: CORRIGE` si el flag causó el incidente; `estado_gov: EN REVISION` hasta A+V.

## Checklist pre-prod (R/A/V) — reproducido aquí y en dashboard

| Gate | R | A | V | Evidencia | Decisión | Fecha |
|---|---|---|---|---|---|---|
| Kill-switch inline `FEATURE_PUSH_INLINE_DISPATCH=0` ensayado | Kipus SRE | Staff Principal | Staff QA/Chaos + Staff Mobile | Game day 2026-08-24 22:23: evento 22:23:11 con 0 deliveries tras 60 s (T1 exacto) — `docs/ops/adr0036-gameday-staging.md` |  |  |
| `push_slo_violation` runbook validado | Kipus SRE | Staff Principal | Staff SRE (2º SRE) | `push_slo_observer.ts` snapshot + violation con guard n≥20, reasons `DISPLAYED_BELOW_99`/`P95_AT_OR_ABOVE_10S` trazados a M3/M4 baseline |  |  |
| Rotación VAPID v3→v4 (y rollback v4→v3) | Staff Security + Kipus SRE | Staff Principal | Staff Security (2º) | Secrets Store `6c5d2aff…` v4 active + v3 intacta; `PUSH_VAPID_PUBLIC_KEY` v4 `BKIPWeAj…` en var; JWK `tmp-staff/vapid-v4.json`; rollback steps § Rollback B probados en staging |  |  |
| Dashboards P95 + 6 panels AE + 4 alertas | Kipus SRE | Staff Principal | Staff SRE + Staff Security | `docs/ops/dashboards/p95-breaker-dashboard.md` + capturas CF + alertas `HotPathP95Burn`/`DoReadHerd`/`BreakerOpen`/`TaxonomyInversion` |  |  |
| `scripts/verify.sh` V-18/V-19 GREEN | Kipus SRE | — | — | `RESULT SUITE GREEN` ( `pnpm quality` verde ) |  |  |

Game day ensayado: 2026-08-24 22:10 baseline flag OFF (4–5 min) → activación caliente 93→94 bindings → 3 pushes 2 s → rollback 0 OK → re-activación seguro.

## Referencias

- `docs/ops/push-ack-slo-baseline.md` — M1 queued→ACCEPTED 169.4 s promedio con cron `*/5`, M4 ack_delta 4.853 s, guard n≥20, TTL vs cron.
- `docs/ops/adr0036-gameday-staging.md` — intento 1 bloqueado por CI lint `processClaimedRow` complejidad 16>15 (LEAD 0470) y lección observabilidad CI; intento 2 verde con flag caliente.
- `docs/runbooks/capabilities-dynamic-kill-switch.md` — patrón kill-switch `FEATURE_*=0` sin redeploy (modelo OLA 5) con `FEATURE_TENANT_CAPABILITIES_DYNAMIC`.
- `docs/ops/staging-bootstrap.md` — D1 `f23d7b8b-be71-483b-9489-2c7c4ebd73df`, `kipuspay-app.pages.dev`, cuenta `c5b18f62cb7e73fcd2ece5822936d699`.
- `docs/ops/flag-drift-audit-staging.md` — anti-deriva `--keep-vars`, FIXED `PUSH_VAPID_PUBLIC_KEY` v4.
- `docs/runbooks/secrets-ops-material.md` — matriz KEK/VAPID/SA Firebase/FCM, rotación ciega aprendida 2026-08-22.
- `docs/runbooks/mobile-push-incident.md` — incidente push distinguido por PII/tenant/ACK replay/duplicado.
