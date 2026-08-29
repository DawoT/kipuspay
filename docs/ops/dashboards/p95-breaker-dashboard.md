---
doc_id: ops-p95-breaker-dashboard
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Dashboard P95 + Breaker — SLO 50ms/2s + Observabilidad de costos (E3)

| Campo | Valor |
|---|---|
| Tipo | Ops · SRE Dashboard + Alerting E3 |
| Estado | Diseño E3 listo para CF dashboard — no deploy, solo docs |
| Owner | Kipus SRE (Staff SRE) |
| Relaciona | Arquitectura §12 · Arquitectura §6 · Arquitectura §8.1 · Arquitectura §9 · Arquitectura §5.12.4 · Proceso §9.1 · Proceso §5.2 · Proceso §5.3 · ADR-0036 |
| Fuentes | `apps/worker-api/src/push/push-slo-observer.ts` · `packages/adapters-d1/src/process-offline-sale-atomic.ts` · `apps/worker-fiscal/src/fiscal-circuit-breaker.ts` |
| SLO vinculante | Hot path cobro P95 < 50 ms (ventana 5 min) — Proceso §9.1; SSE premium P95 < 2 s |
| Dataset AE | `ANALYTICS_ENGINE` binding (`kipuspay_analytics` prod / `kipuspay_analytics_staging` staging) |
| Breaker | FiscalCircuitBreaker DO por `(transport, endpoint)` — §8.1; KV `kipuspay-fiscal-breaker-kv-staging` solo cache; DO autoritativo |
| Costo | Arquitectura §12 — presupuesto declarado por Staff SRE antes de gate Sprint 0 |

## 0. Principios SLO-first del dashboard

1. **Presupuesto defendido antes que presión de negocio.** Todo panel tiene SLO explícito y burn visible. Sin dashboard P95 + alerting ANTES del release, el gate es NO-GO (Proceso §9.1).
2. **AE muestreado = dashboard, D1 = verdad.** `daily_financial_rollups` es SoT exacto (Arquitectura §9). AE nunca factura ni autoriza conteo de cupo; solo métricas globales.
3. **Breaker contado en DO, leído desde aislado/KV.** El dashboard no consulta el DO en hot path; observa escrituras coalescidas y publicación KV (Arquitectura §8.1 sampling ~5s, no 1:1 por fallo).
4. **Taxonomía estricta 4xx vs 5xx.** 5xx/timeout/red abren breaker con backoff+jitter; 4xx negocio → DLQ `QUARANTINED` jamás abre breaker. Una inversión es incidente.
5. **Costo observado.** Cada panel declara writes D1 y subrequests; el presupuesto §12 (`≈$10-20/mes por 1k comercios`, `≈$25+/mes por 1M comp/día`, P95 desde 12ms, P95 SLO 50ms) se grafica contra burn real.

## 1. Instrumentación requerida (qué debe emitir el Worker)

> Estas `writeDataPoint` son precondición del dashboard. Si no existen, crearlas es tarea P0 del sprint de cierre — el dashboard no puede ser reactivo.

### 1.1 Hot path de cobro (SLO 50 ms)

Cada `POST /api/sales` y `POST /api/offline-sync` (que termina en `processOfflineSaleAtomic` vía `db.batch`) emite:

```typescript
env.ANALYTICS_ENGINE?.writeDataPoint({
  blobs: [tenantId, branchId, accountId, "hot_path", route, httpStatusClass, shardId],
  // blobs[1]=tenant, blobs[2]=branch, blobs[3]=account, blobs[4]=kind, blobs[5]=route, blobs[6]=status_class, blobs[7]=shard
  doubles: [latencyMs, dbBatchStatements, isError ? 1 : 0],
  indexes: [tenantShardIdx],
});
// route: "POST /api/sales" | "POST /api/offline-sync" | "POST /v1/sales/:id/credit-note"
// status_class: "2xx" | "4xx" | "5xx"
// latencyMs: wall time Worker start→response (sin waitUntil), medida con performance.now()
```

Writers de `process-offline-sale-atomic.ts` no hacen I/O dentro del `db.batch` (PERF-01): el `doubles[2]` cuenta statements del plan atómico (observado 15–16 en game day) para detectar regresión de costo.

### 1.2 SSE / premium (SLO 2 s)

Stream SSE del POS y `GET /api/auth/session` con `capabilities` (OLA 5) emiten:

```typescript
env.ANALYTICS_ENGINE?.writeDataPoint({
  blobs: [tenantId, "sse", route, transport],
  doubles: [ttfbMs, p95WindowMs, isTimeout ? 1 : 0],
  indexes: [tenantShardIdx],
});
// route: "GET /api/auth/session" | "GET /sse/pos"
// ttfbMs: time-to-first-byte del chunk SSE; p95WindowMs: latencia de ventana 5 min
```

### 1.3 Breaker fiscal (§8.1)

Cada transición del DO `FiscalCircuitBreaker` emite tanto log estructurado (Workers Observability) como punto AE:

```typescript
// En publish() y cada POST /increment|/probe-*
console.log(JSON.stringify({ event: "fiscal_breaker_transition", transport, endpoint, prevState, nextState, openedAtMs, failureCount, windowMs }));
env.ANALYTICS_ENGINE?.writeDataPoint({
  blobs: [transport, endpoint, nextState, prevState],
  // blobs[1]=KIPUSPAY_PSE_DIRECT|ose_*|pse_third_party, blobs[2]=submit|cdr_query|rc_submit, blobs[3]=closed|open|half_open
  doubles: [failureCount, stateNumeric, isOpen ? 1 : 0, windowSeconds],
  indexes: [transportIdx],
});
// stateNumeric: closed=0, half_open=0.5, open=1  → permite avg() como fracción de tiempo en open
```

KV es solo cache TTL ~60 s: el dashboard nunca infiere estado desde lecturas KV; solo desde transiciones del DO.

### 1.4 Taxonomía fiscal (5xx infra vs 4xx negocio)

Cada intento de `FiscalTransport` emite:

```typescript
env.ANALYTICS_ENGINE?.writeDataPoint({
  blobs: [transport, endpoint, taxonomy, httpStatusClass, quarantineReason],
  // taxonomy: "infra" (5xx/timeout/DNS/reset) o "business" (4xx XML/RUC/CDR) — Arquitectura §8.1 tabla
  doubles: [didIncrementDo ? 1 : 0, isQuarantined ? 1 : 0, retryCount],
  indexes: [transportIdx],
});
// infra SIEMPRE does didIncrementDo + backoff+jitter muestreado (~1 incremento/5s coalescido)
// business NUNCA didIncrementDo; va a QUARANTINED sin tocar breaker (FIS-12 guard)
```

## 2. Seis panels — AE SQL listo para CF dashboard

> En Cloudflare Analytics Engine SQL el `timestamp` es la hora de ingesta. Todas las queries usan ventana relativa `NOW() - INTERVAL 'X'`. Ajustar `accountId` y `dataset` al entorno staging/prod.

### Panel 1 — Hot path P95 50 ms (SLO crítico Proceso §9.1)

**Objetivo:** P95 < 50 ms en ventana móvil 5 min; superar 10 min bloquea rollout (Proceso §9.1). P50 informativo < 12 ms baseline §12.

```sql
-- Panel 1: Hot path P95 / P50 / burn vs 50ms (ventana 5m, evaluación cada 1m)
-- Dataset: kipuspay_analytics_staging (staging) | kipuspay_analytics (prod)
SELECT
  toStartOfInterval(timestamp, INTERVAL '1' MINUTE) AS t,
  quantile(0.50)(double1) AS p50_ms,
  quantile(0.95)(double1) AS p95_ms,
  quantile(0.99)(double1) AS p99_ms,
  avg(double1) AS avg_ms,
  count() AS req,
  countIf(double3 = 1) AS err_5xx,
  -- burn: fracción de ventana por encima del SLO (1.0 = toda la ventana violando)
  countIf(double1 > 50) / count() AS burn_ratio_50ms,
  max(double1) AS max_ms
FROM kipuspay_analytics_staging
WHERE blob4 = 'hot_path'
  AND timestamp >= NOW() - INTERVAL '6' HOUR
GROUP BY t
ORDER BY t DESC
LIMIT 360
```

Visual: línea P95 (rojo SLO 50 ms), P50 (verde), área `burn_ratio_50ms` (0–1). Alerta HotPathP95Burn usa esta query en regla §4.1.

**Thresholds:** Warning P95 ≥ 40 ms sostenido 5 min; Critical P95 ≥ 50 ms sostenido 10 min → rollback.

### Panel 2 — Volumen y composición del hot path (costo §12)

```sql
-- Panel 2: Volumen por ruta y shard, writes D1, y error rate (5 min buckets, 24h)
SELECT
  toStartOfInterval(timestamp, INTERVAL '5' MINUTE) AS t,
  blob5 AS route,
  blob7 AS shard,
  count() AS req,
  uniq(blob1) AS tenants,
  sum(double2) AS d1_statements_total,
  avg(double2) AS avg_statements_per_tx,
  countIf(blob6 = '5xx') AS err_5xx,
  countIf(blob6 = '4xx') AS err_4xx,
  countIf(blob6 = '2xx') AS ok_2xx
FROM kipuspay_analytics_staging
WHERE blob4 = 'hot_path'
  AND timestamp >= NOW() - INTERVAL '24' HOUR
GROUP BY t, route, shard
ORDER BY t DESC, req DESC
LIMIT 500
```

Visual: stacked bars req por route, overlay tenants únicos, y `avg_statements_per_tx` (invariante ACID §6: una sola batch; regresión >16 statements dispara investigación de costo §12).

### Panel 3 — SSE premium P95 2 s (SLO separado Proceso §9.1)

**SLO explícito:** P95 < 2 s (2000 ms). Distinto del hot path 50 ms; mismo mecanismo de burn.

```sql
-- Panel 3: SSE / session premium P95 <2s (15 min ventana para estabilidad)
SELECT
  toStartOfInterval(timestamp, INTERVAL '1' MINUTE) AS t,
  blob3 AS route,
  blob4 AS transport,
  quantile(0.50)(double1) AS p50_ttfb_ms,
  quantile(0.95)(double1) AS p95_ttfb_ms,
  quantile(0.95)(double2) AS p95_window_ms,
  count() AS req,
  countIf(double3 = 1) AS timeouts,
  countIf(double1 > 2000) / count() AS burn_ratio_2s
FROM kipuspay_analytics_staging
WHERE blob2 = 'sse'
  AND timestamp >= NOW() - INTERVAL '6' HOUR
GROUP BY t, route, transport
ORDER BY t DESC
LIMIT 360
```

Visual: P95 TTFB vs linha 2000 ms, timeouts como spikes. Si el SSE degrada, el POS cae a polling/banner (no bloquea cobro) pero burn >0 activa HotPathP95Burn como correlato.

### Panel 4 — Breaker state (DO autoritativo §8.1)

```sql
-- Panel 4: Estado del breaker por (transport, endpoint) — fracción de tiempo en open
SELECT
  toStartOfInterval(timestamp, INTERVAL '1' MINUTE) AS t,
  blob1 AS transport,
  blob2 AS endpoint,
  blob3 AS state,
  count() AS transitions,
  avg(double3) AS open_fraction, -- double3=1 si open, 0.5 half_open, 0 closed
  max(double1) AS failure_count_at_transition,
  uniq(blob3) AS distinct_states
FROM kipuspay_analytics_staging
WHERE blob1 != '' -- solo puntos de breaker
  AND timestamp >= NOW() - INTERVAL '6' HOUR
GROUP BY t, transport, endpoint, state
ORDER BY t DESC, transport, endpoint
LIMIT 500
```

Visual: timeline por `(transport,endpoint)` con color: closed verde, half_open amarillo, open rojo. Tooltip muestra `failure_count` (umbral ejemplo §8.1: 10 infra en ventana → open ~2h). Probe `alarm()` del DO (half_open → 1 request) visible como transición `open → half_open`.

### Panel 5 — Taxonomía 5xx/4xx (anti-inversión de breaker)

```sql
-- Panel 5: Taxonomía infra vs negocio — valida que solo infra abre breaker
SELECT
  toStartOfInterval(timestamp, INTERVAL '5' MINUTE) AS t,
  blob1 AS transport,
  blob2 AS endpoint,
  blob3 AS taxonomy, -- infra | business
  blob4 AS http_class, -- 5xx | 4xx | timeout | dns
  count() AS attempts,
  sum(double1) AS do_increments, -- double1=1 si incrementó DO
  sum(double2) AS quarantined,   -- double2=1 si QUARANTINED
  avg(double3) AS avg_retry
FROM kipuspay_analytics_staging
WHERE blob3 IN ('infra', 'business')
  AND timestamp >= NOW() - INTERVAL '6' HOUR
GROUP BY t, transport, endpoint, taxonomy, http_class
ORDER BY t DESC
LIMIT 500
```

Visual: dos series apiladas: `infra` (naranja) con `do_increments` solidario vs `business` (azul) con `quarantined`. Inversión = `business` con `do_increments>0` o `infra` con `do_increments=0` → alerta TaxonomyInversion.

Queries de verificación rápida (infierno/perfecto):

```sql
-- Debe ser 0 siempre: negocio que abrió breaker (INVERSIÓN)
SELECT count() AS violations_4xx_opened_breaker
FROM kipuspay_analytics_staging
WHERE blob3 = 'business' AND double1 = 1 AND timestamp >= NOW() - INTERVAL '1' HOUR;

-- Debe ser 0: infra que NO abrió breaker (pérdida de protección)
SELECT count() AS violations_5xx_not_opened
FROM kipuspay_analytics_staging
WHERE blob3 = 'infra' AND double1 = 0 AND blob4 = '5xx' AND timestamp >= NOW() - INTERVAL '1' HOUR;
```

### Panel 6 — Burn y error budget (Proceso §9.1)

**Presupuestos:** Hot path 50 ms (§9.1) + disponibilidad 99.9% mensual (`error rate <1%/5 min`, rollback si dos ventanas). Breaker reads 10/s por DO window 60 s (dos ventanas sobre X bloquean rollout).

```sql
-- Panel 6: Burn agregado — latencia + disponibilidad por shard y global
WITH per_min AS (
  SELECT
    toStartOfInterval(timestamp, INTERVAL '1' MINUTE) AS t,
    blob7 AS shard,
    countIf(double1 > 50) / count() AS latency_burn, -- fracción >SLO
    countIf(double3 = 1) / count() AS error_rate,    -- double3=1 es 5xx
    quantile(0.95)(double1) AS p95_ms,
    count() AS req
  FROM kipuspay_analytics_staging
  WHERE blob4 = 'hot_path' AND timestamp >= NOW() - INTERVAL '6' HOUR
  GROUP BY t, shard
)
SELECT
  t,
  shard,
  p95_ms,
  latency_burn,
  error_rate,
  -- error budget mensual: 0.1% = 43.2 min/mes; burn_rate = error_rate / 0.001
  error_rate / 0.001 AS burn_rate_99_9,
  req,
  -- ventana que bloquea rollout: 10 min sobre SLO o 2 ventanas error_rate>1%
  if(latency_burn > 0.5 AND p95_ms > 50, 1, 0) AS would_block_rollout_latency,
  if(error_rate > 0.01, 1, 0) AS would_block_rollout_error
FROM per_min
ORDER BY t DESC
LIMIT 360
```

Visual: gauge burn_rate (multi-burn), barras latency_burn, y marcadores `would_block_rollout_*` (Proceso §9.1: observación canario 30 min + 500 txs críticas).

**Nota de costo §12:** superponer `req * avg_statements_per_tx` (del panel 2) vs costo estimado D1 writes ($/1M comp) para detectar drift del modelo `≈$25+/mes por 1M`.

---

## 3. Alertas Workers Observability (log-based) — las 4 obligatorias

> Workers Observability lee `console.log` JSON de los Workers. Las alertas son **log-based** (no métrica derivada) con ventana y guard anti-ruido. Todas deben existir ANTES del release; jamás reactivo. Ver `apps/worker-api/src/push/push-slo-observer.ts` para `push_slo_violation` y `apps/worker-fiscal/src/fiscal-circuit-breaker.ts` para `fiscal_breaker_transition`.

### Alerta 1 — HotPathP95Burn (SLO 50 ms + burn)

| Campo | Valor |
|---|---|
| Nombre | `HotPathP95Burn` |
| Señal | P95 hot path > 50 ms + burn + error rate |
| Severidad | Warning P95 ≥ 40 ms 5 min · Critical P95 ≥ 50 ms 10 min o error_rate >1% en 2 ventanas |
| Ventana | 5 min (warning) / 10 min (critical) evaluado cada 1 min |
| Acción | Warning → paging SRE; Critical 10 min → bloquea rollout y activa rollback del flag (Proceso §9.1) |
| Runbook | `docs/ops/dashboards/p95-breaker-dashboard.md` §3 + `docs/runbooks/push-kill-switch.md` si inline push es causa |

**Filtros Workers Observability (logs del worker `kipuspay-worker-api`):**

```json
{
  "dataset": "cloudflare-workers",
  "filters": [
    {"key": "$metadata.service", "operation": "eq", "type": "string", "value": "kipuspay-worker-api"},
    {"key": "route", "operation": "in", "type": "string", "value": "POST /api/sales,POST /api/offline-sync,POST /v1/sales/:id/credit-note"},
    {"key": "p95_ms", "operation": "gte", "type": "number", "value": 50},
    {"key": "burn_ratio_50ms", "operation": "gt", "type": "number", "value": 0.5}
  ],
  "timeWindow": "10m",
  "threshold": "count > 0 in 10m",
  "notification": "pagerduty-sre + slack #sre-alerts"
}
```

Complemento AE (si el log no trae P95 agregado, derivar de `double1`):

- Evaluación: `SELECT quantile(0.95)(double1) FROM kipuspay_analytics_staging WHERE blob4='hot_path' AND timestamp >= NOW() - INTERVAL '5' MINUTE` → si >50, alerta.
- Burn: `countIf(double1 >50)/count() >0.5` en 5 min → warning; 10 min → critical.

### Alerta 2 — DoReadHerd (anti thundering herd §8.1 + Proceso §9.1 X=10/s)

| Campo | Valor |
|---|---|
| Nombre | `DoReadHerd` |
| Señal | Lecturas al DO breaker >10/s por DO en ventana 60 s |
| Severidad | Warning >10/s en 1 ventana · Critical >10/s en 2 ventanas (bloquea rollout — Proceso §9.1) |
| Ventana | 60 s sliding, evaluado cada 30 s |
| Acción | Critical → investigar cache aislado TTL 5–10 s y KV 60 s; si persiste, kill-switch temporal del breaker publisher y revisión de sampling coalescido (~1 inc/5s) |
| Runbook | Arquitectura §8.1 lectura 2 niveles |

**Instrumentación:** cada Worker emite `console.log(JSON.stringify({event:"breaker_read", transport, endpoint, source:"isolate"|"kv"|"do", hit: boolean}))` en el hot path de lectura (lease del dispatcher/fiscal). AE lo agrega:

```sql
SELECT toStartOfSecond(timestamp) AS s, blob1 AS transport, blob2 AS endpoint, blob3 AS source, count() AS reads_per_sec
FROM kipuspay_analytics_staging
WHERE blob4 = 'breaker_read' AND timestamp >= NOW() - INTERVAL '5' MINUTE
GROUP BY s, transport, endpoint, source
HAVING reads_per_sec > 10
ORDER BY reads_per_sec DESC
```

Workers Observability filter alternativo:

```json
{
  "filters": [
    {"key": "$metadata.service", "operation": "eq", "type": "string", "value": "kipuspay-worker-api"},
    {"key": "event", "operation": "eq", "type": "string", "value": "breaker_read"},
    {"key": "source", "operation": "eq", "type": "string", "value": "do"}
  ],
  "threshold": "count > 600 in 1m (10/s *60s) per (transport,endpoint)",
  "groupBy": ["transport","endpoint"],
  "window": "60s"
}
```

Nota: el dashboard no debe mostrar lecturas DO en hot path — si `source=do` con alta frecuencia, la cache aislado/KV está rota.

### Alerta 3 — BreakerOpen (estado DO §8.1)

| Campo | Valor |
|---|---|
| Nombre | `BreakerOpen` |
| Señal | `state=open` en cualquier `(transport,endpoint)` o transición `closed→open` |
| Severidad | Warning `half_open` >1 ventana · Critical `open` inmediato |
| Ventana | Inmediata sobre `fiscal_breaker_transition` |
| Acción | Warning → backpressure: cola fiscal a R2 + walk por `must_submit_by` (Arquitectura §8.1) · Critical → encolar localmente sin tocar KV/DO, jitter/backoff, y panel Modo Dueño "represados" visible |
| Runbook | `docs/runbooks/fiscal-deadlines-rc.md` + `docs/ops/s26-fiscal-breaker-qg.md` |

**Workers Observability filter:**

```json
{
  "filters": [
    {"key": "$metadata.service", "operation": "in", "type": "string", "value": "kipuspay-worker-api,kipuspay-worker-fiscal"},
    {"key": "event", "operation": "eq", "type": "string", "value": "fiscal_breaker_transition"},
    {"key": "nextState", "operation": "eq", "type": "string", "value": "open"}
  ],
  "threshold": "count >=1",
  "notification": "pagerduty-sre + slack #fiscal"
}
```

Para distinguir `submit` vs `cdr_query` vs `rc_submit`: `groupBy: transport,endpoint`. Cada endpoint es un breaker distinto (no global único — §8.1).

### Alerta 4 — TaxonomyInversion (4xx abre breaker o 5xx no lo abre)

| Campo | Valor |
|---|---|
| Nombre | `TaxonomyInversion` |
| Señal | `taxonomy=business` con `didIncrementDo=1` O `taxonomy=infra` con `didIncrementDo=0` en 5 min |
| Severidad | Critical inmediata (viola §8.1; 5xx deben abrir, 4xx jamás) |
| Ventana | 5 min, evaluado cada 1 min |
| Acción | Critical → freeze de deploys fiscales, auditoría del transport + DLQ; si inversión persiste >10 min, rollback del transport plugin y encolar en R2 con `QUARANTINED` sin breaker |
| Runbook | Arquitectura §8.1 taxonomía + `docs/runbooks/fiscal-deadlines-rc.md` |

**Workers Observability filters (dos condiciones OR):**

```json
{
  "name": "TaxonomyInversion-businessOpenedBreaker",
  "filters": [
    {"key": "event", "operation": "eq", "type": "string", "value": "fiscal_transport_attempt"},
    {"key": "taxonomy", "operation": "eq", "type": "string", "value": "business"},
    {"key": "didIncrementDo", "operation": "eq", "type": "number", "value": 1}
  ],
  "threshold": "count >=1 in 5m"
}
```

```json
{
  "name": "TaxonomyInversion-infraDidNotOpenBreaker",
  "filters": [
    {"key": "event", "operation": "eq", "type": "string", "value": "fiscal_transport_attempt"},
    {"key": "taxonomy", "operation": "eq", "type": "string", "value": "infra"},
    {"key": "http_status_class", "operation": "eq", "type": "string", "value": "5xx"},
    {"key": "didIncrementDo", "operation": "eq", "type": "number", "value": 0}
  ],
  "threshold": "count >=1 in 5m"
}
```

AE equivalente (ya en §2 panel 5) debe ser 0/0h. Cualquier `>0` es SEV-2 inmediato.

---

## 4. Cómo desplegar el dashboard en CF (E3 ready)

1. **Precondición:** los `writeDataPoint` §1 están desplegados en `kipuspay-worker-api-staging` y `kipuspay-worker-fiscal-staging` con flags reales (`FEATURE_PUSH_INLINE_DISPATCH` y `FEATURE_FISCAL_CIRCUIT_BREAKER`) — ver `docs/ops/staging-bootstrap.md` § Recursos y `docs/ops/flag-drift-audit-staging.md` (anti-deriva `--keep-vars`).
2. En Cloudflare Dashboard → Analytics Engine → `kipuspay_analytics_staging` → Create dashboard:
   - Importar las 6 queries SQL de §2 como panels (tipo TimeSeries para P95, Stacked Bar para volumen, State Timeline para breaker, Table para taxonomía, Gauge para burn).
   - Intervalo mínimo `1m` para hot path, `5m` para fiscal.
   - Filtro `accountId = c5b18f62cb7e73fcd2ece5822936d699` (staging).
3. Crear las 4 alertas §3 en Workers Observability (Logs → Alerts) con los filtros JSON; destino PagerDuty + Slack `#sre-alerts` / `#fiscal`.
4. Verificar que `scripts/verify.sh` es `RESULT SUITE GREEN` (V-18/V-19) y que el artifact `deploy-staging-evidence` (Proceso §5.2 Etapa 6) contiene el smoke del dashboard.
5. Game day obligatorio: inyectar 5xx (chaos `scripts/chaos/`) → breaker debe abrir, panel 4 rojo, alerta BreakerOpen dispara, panel 5 infra incrementa, y DoReadHerd permanece verde (cache aislado absorbe). Luego 4xx XML inválido → DLQ `QUARANTINED`, breaker permanece cerrado, TaxonomyInversion no dispara.

## 5. Checklist pre-prod R/A/V (gate — sin esto es NO-GO)

| Gate | R (ejecuta) | A (decide cierre) | V (verifica independiente) | Evidencia | Decisión | Fecha |
|---|---|---|---|---|---|---|
| Dashboards P95 (6 panels AE SQL) | Kipus SRE | Staff Principal | Staff QA/Chaos + Staff Security | `docs/ops/dashboards/p95-breaker-dashboard.md` + captura CF dashboard staging + `ANALYTICS_ENGINE.writeDataPoint` en `worker-api`/`worker-fiscal` |  |  |
| Alertas Workers Observability (4) | Kipus SRE | Staff Principal | Staff SRE (segundo SRE independiente) | Reglas `HotPathP95Burn` `DoReadHerd` `BreakerOpen` `TaxonomyInversion` creadas en CF (IDs/screenshots) + test de disparo (5xx/4xx chaos) |  |  |
| Agregador AE + costo §12 | Kipus SRE + Staff Data | Staff Principal | Staff SRE | `daily_financial_rollups` SoT D1 intacto + AE solo dashboards; `avg_statements_per_tx` y costo `≈$25+/mes por 1M` dentro de presupuesto |  |  |
| Circuit breaker §8.1 | Staff Fiscal + Kipus SRE | Staff Principal | Staff Security + Staff QA/Chaos | `FiscalCircuitBreaker` DO por `(transport,endpoint)`; KV solo cache; sampling coalescido; taxonomía 4xx no abre / 5xx abre; half_open probe vía `alarm()` |  |  |
| Rollback probado en staging | Kipus SRE | Staff Principal | Staff QA/Chaos | `push-kill-switch` rollback `FEATURE_PUSH_INLINE_DISPATCH=0` en caliente sin redeploy + rotación VAPID v3 + `push_slo_violation` game day (flag-drift-audit anti-deriva) |  |  |
| Runbooks firmados | Kipus SRE | Staff Principal | Staff SRE + Staff Security | `docs/runbooks/push-kill-switch.md` + `docs/runbooks/mobile-push-incident.md` firmados; `push-kill-switch` ensayado en staging real (Zebra Z2466) |  |  |
| `scripts/verify.sh` | Kipus SRE | — | — | `RESULT SUITE GREEN` con V-18/V-19 GREEN; `pnpm quality` verde |  |  |

Sin `A` + `V` independiente el resultado es NO-GO (Proceso §8.1). `C`/`I` nunca cuentan como aprobación.

## 6. Referencias cruzadas

- `docs/ops/push-ack-slo-baseline.md` M1–M5 (queued→ACCEPTED, ACCEPTED/queued, DISPLAYED/ACCEPTED, p95 ack_delta, p95 E2E) — guard n≥20 NORMAL/24h, p95 <10s, rate ≥99%.
- `docs/adr/ADR-0036-push-dispatch-inline.md` — inline `waitUntil` con tope 16 deliveries/request y flag `FEATURE_PUSH_INLINE_DISPATCH` (rollback instantáneo).
- `docs/ops/adr0036-gameday-staging.md` — ejecución 2026-08-24: inline reduce queued→ACCEPTED 4–5 min→2 s; rollback `0` en caliente verificado (0 deliveries tras 60 s).
- `docs/ops/staging-bootstrap.md` — recursos staging `f23d7b8b-be71-483b-9489-2c7c4ebd73df` (D1) / `03383ac3ee4646bb961bdfd4c9eb147b` (KV breaker) / cuenta `c5b18f62cb7e73fcd2ece5822936d699`.
- `docs/ops/flag-drift-audit-staging.md` — `--keep-vars` anti-deriva; `FEATURE_DATA_BACKUP=1` `FEATURE_PLATFORM_DR=1` `PUSH_VAPID_PUBLIC_KEY` v4 fija.
- `docs/runbooks/secrets-ops-material.md` — matriz secreta VAPID v4 active / v3 rollback.
- `docs/runbooks/capabilities-dynamic-kill-switch.md` — patrón de kill-switch `FEATURE_*=0` sin redeploy (modelo para `FEATURE_PUSH_INLINE_DISPATCH`).
