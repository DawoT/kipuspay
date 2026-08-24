---
doc_id: ops-push-ack-slo-baseline
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Push ACK SLO — Baseline staging y recomendación FCM_HTTP_V1 nativo

| Campo | Valor |
|---|---|
| Fecha | 2026-08-24 |
| Autor | Staff SRE |
| Alcance | Staging únicamente (`kipuspay-staging`, D1 `f23d7b8b-be71-483b-9489-2c7c4ebd73df`) |
| SLO normativo | Arquitectura §5.12.4 — latencia `push_events.created_at → push_deliveries.displayed_at`, p95 < 10 s y tasa DISPLAYED ≥ 99% en red NORMAL |
| Relaciona | Ledger 0464 · `docs/ops/pending-batches.yaml` (gap `fcm-vapid-real`, gate `c8-fcm-vapid-real`) · ADR-0035 · Arquitectura §5.12.3/§5.12.6/§5.12.7 |

## 1. Método

Consultas D1 remotas de solo lectura (`npx wrangler d1 execute kipuspay-staging
--remote --env staging --json -y`) más Workers Observability del worker
`kipuspay-worker-api-staging`. **No se enviaron pushes de test** (presupuesto 5):
los datos son frescos del mismo día (2026-08-24) y un push sin dispositivo
adjunto solo agrega filas ACCEPTED-sin-ACK que contaminan el denominador.

## 2. Baseline — últimas 10 deliveries

Query reproducible:

```sql
SELECT substr(d.id, 1, 8) AS id8, d.provider, d.status, d.display_context AS ctx,
       d.attempt_count AS att, e.created_at AS event_created_at,
       d.accepted_at, d.displayed_at,
       CASE WHEN d.accepted_at IS NOT NULL AND d.displayed_at IS NOT NULL
            THEN ROUND((julianday(d.displayed_at) - julianday(d.accepted_at)) * 86400, 3)
       END AS ack_delta_s,
       CASE WHEN e.created_at IS NOT NULL AND d.displayed_at IS NOT NULL
            THEN ROUND((julianday(d.displayed_at) - julianday(e.created_at)) * 86400, 3)
       END AS slo_latency_s
FROM push_deliveries d
JOIN push_events e ON e.tenant_id = d.tenant_id AND e.id = d.event_id
ORDER BY d.created_at DESC LIMIT 10;
```

Resultado (2026-08-24, todas WEB_PUSH):

| id8 | status | ctx | att | event_created_at (UTC) | accepted_at (UTC) | displayed_at (UTC) | ack_delta_s | slo_latency_s |
|---|---|---|---|---|---|---|---|---|
| b901c65a | ACCEPTED | — | 1 | 14:50:47.229 | 14:55:22.000 | — | — | — |
| 48eb1c50 | DISPLAYED | NORMAL | 1 | 14:50:47.229 | 14:55:22.000 | 14:55:26.853 | **4.853** | **279.624** |
| f1250ac7 | ACCEPTED | — | 1 | 14:30:16.292 | 14:30:22.000 | — | — | — |
| e6a45a32 | ACCEPTED | — | 1 | 14:30:16.292 | 14:30:22.000 | — | — | — |
| f1922f0f | ACCEPTED | — | 1 | 13:59:25.323 | 14:00:22.000 | — | — | — |
| a54fbfd0 | ACCEPTED | — | 1 | 13:15:50.979 | 13:20:22.000 | — | — | — |
| 5f29bf5a | ACCEPTED | — | 1 | 13:19:29.697 | 13:20:22.000 | — | — | — |
| b828541a | ACCEPTED | — | 1 | 13:14:48.147 | 13:15:22.000 | — | — | — |
| 35e57360 | ACCEPTED | — | 1 | 12:30:09.754 | 12:30:22.000 | — | — | — |
| 63e931c5 | ACCEPTED | — | 1 | 05:03:30.587 | 05:05:22.000 | — | — | — |

Snapshot agregado de la tabla completa (21 filas):

| Métrica | Valor |
|---|---|
| Total deliveries | 21 (14 ACCEPTED · 5 EXPIRED · 1 FAILED · 1 DISPLAYED) |
| Con `accepted_at` | 15 |
| Con `displayed_at` / `ack_consumed_at` | 1 / 1 |
| queued→ACCEPTED promedio | 169.4 s |
| queued→ACCEPTED máximo | 554.1 s |

### Lectura SRE

1. **El tramo ACK cumple en su única muestra medible**: `48eb1c50` es la delivery
   del dispositivo real Zebra Z2466 del drill H4 (Ledger 0464): accepted→displayed
   = 4.853 s < 10 s, `display_context=NORMAL`, receipt KMS consumido atómicamente.
2. **End-to-end NO cumple hoy**: medido desde `push_events.created_at` (como exige
   §5.12.4), la única muestra da 279.6 s. Causa estructural: el dispatcher corre
   por cron `*/5` (Arquitectura §5.12.6); el tramo queued→ACCEPTED absorbe hasta
   ~300 s de espera de cadencia (promedio 169.4 s, max 554.1 s). El envío inline
   post-enqueue quedó deshabilitado tras el drill del 2026-08-23 (fallaba en
   silencio antes de invocar worker-kms).
3. **La tasa DISPLAYED ≥ 99% no es medible hoy**: 1/15 sobre aceptadas. Las 14
   ACCEPTED-sin-ACK corresponden a pushes enviados sin dispositivo conectado en
   ese momento (sesiones de drill terminadas). No es un defecto de transporte:
   es ausencia de flota.

## 3. Metodología de medición continua

Fuente primaria: **query D1 periódica** sobre `push_deliveries` ⋈ `push_events`
(determinística, con el índice `idx_push_deliveries_slo` ya creado para esto).
Fuente secundaria: Workers Observability (resúmenes `mobile_push_dispatch`,
warnings `push_send_failed`, invocaciones `scheduled` del cron — verificadas).

Métricas server-side:

| ID | Métrica | Definición SQL | Presupuesto propuesto |
|---|---|---|---|
| M1 | queued→ACCEPTED | `julianday(accepted_at) - julianday(push_events.created_at)` | Segmento infra; ver §5 decisión de alcance |
| M2 | tasa ACCEPTED/queued | filas con `accepted_at NOT NULL` / filas en estado terminal (`ACCEPTED`,`DISPLAYED`,`FAILED`,`EXPIRED`) | ≥ 99% |
| M3 | tasa DISPLAYED/ACCEPTED | `displayed_at NOT NULL` / `accepted_at NOT NULL`, denominador solo `display_context='NORMAL'` (OFFLINE/DOZE excluidos solo si etiquetados, §5.12.4) | ≥ 99% |
| M4 | p95 ack_delta | percentil 95 de M1-tramo `accepted→displayed` sobre NORMAL | < 10 s |
| M5 | p95 end-to-end | percentil 95 de `event→displayed` sobre NORMAL | < 10 s (hoy estructuralmente imposible con cron `*/5`) |

Implementación recomendada: paso nuevo en el cron existente de `worker-api` que
evalúe los agregados M2–M5 con la función ya existente `pushDeliveryObservation`
(`apps/worker-api/src/push/mobile-push-dispatcher.ts`, umbrales
`DISPLAYED_BELOW_99` en < 0.99 y `P95_AT_OR_ABOVE_10S` en ≥ 10000 ms) y emita
`console.warn` estructurado → alerta log-based en Workers Observability. Guard
anti-ruido: no alertar con menos de N=20 muestras NORMAL en la ventana rodante
de 24 h. Cadencia de evaluación: cada 15 min.

## 4. Umbrales de alerta propuestos (pre-producción)

| Alerta | Warning | Critical | Fuente |
|---|---|---|---|
| DISPLAYED/ACCEPTED (NORMAL, 24 h, n≥20) | < 99% | < 95% | D1 M3 |
| p95 ack_delta (NORMAL) | ≥ 8 s sostenido 30 min | ≥ 10 s | D1 M4 |
| p95 end-to-end (NORMAL) | informativo hasta decidir alcance §5 | — | D1 M5 |
| ACCEPTED/queued terminal (24 h) | < 99% | < 97% | D1 M2 |
| `push_send_failed` / suscripciones INVALIDADAS | pico > 3 en 1 h | > 10 en 1 h | Observability |

Ninguna de estas alertas existe aún como regla configurada: crearlas es
condición previa a cualquier release que declare el SLO (dashboards y alerting
antes de producción, jamás reactivo).

## 5. Qué falta para declarar SLO ≥ 99% medible

1. **Flota mínima permanente**: al menos 1 dispositivo Zebra en dock con el POS
   activo en staging, para que el denominador NORMAL no sea ~0. Hoy la flota son
   sesiones de drill puntuales.
2. **Volumen estadístico**: n ≥ 20–30 muestras NORMAL en ventana rodante para que
   p95 y tasa tengan significado (guard de la §3).
3. **Clasificación de ACCEPTED-sin-ACK**: los pushes entregados a dispositivos
   apagados cuentan hoy como "no displayed". Regla propuesta: ventana de gracia =
   TTL del evento (600 s); vencida, clasificar como sin-flota (excluido
   documentado) o DOZE según heartbeat futuro del dispositivo. Sin esta regla la
   métrica mide presencia de flota, no calidad de entrega.
4. **Decisión de alcance del SLO (requiere ADR)**: end-to-end (§5.12.4 literal)
   exige despacho inline post-enqueue con cron `*/5` como backstop; la alternativa
   es presupuesto segmentado (queued→accepted presupuestado aparte como latencia
   de infraestructura + accepted→displayed < 10 s como SLO de dispositivo). La
   muestra actual (279.6 s E2E vs 4.853 s ACK) demuestra que sin esta decisión el
   gate `c8-fcm-vapid-real` no puede cerrarse honestamente.
5. **Dashboard + alertas creados antes del release** (§4) y rollback ensayado en
   staging para cualquier cambio de dispatcher que habiliten la decisión 4.

## 6. Recomendación FCM_HTTP_V1 nativo

Criterios evaluados:

- **Alcance actual**: Web Push RFC8291 (Flujo B, VAPID v4 propia, Arquitectura
  §5.12.3) funciona E2E en dispositivo real — Ledger 0464: server→Google→Zebra
  Z2466→SW→showNotification→receipt KMS→DISPLAYED con ack_delta 4.853 s. El caso
  de uso OWNER_ALERTS está cubierto sin app nativa.
- **Costo de mantenimiento del canal nativo**: el lado servidor YA existe
  (`sendFcm` en el binding PUSH_KMS, SA real en Secrets Store con mint OAuth2
  verificado, routing FCM_HTTP_V1 en el dispatcher). Lo que falta es todo el lado
  dispositivo: un host Android/WebView nuevo (no existe ningún artefacto así en
  `apps/`) que obtenga el token vía Play services, lo inyecte por el seam
  `window.__KIPUS_FCM_TOKEN__` (patrón ADR-0033) y reenvíe
  `FCM_BACKGROUND_MESSAGE` al SW único (Arquitectura §5.12.7) — el handler ya
  está implementado en `apps/pos-web/static/offline-sync-sw.js` pero nadie real
  lo invoca. Eso implica pipeline Gradle/firma/release, ciclo de vida de token
  FCM y matriz de pruebas duplicada (WEB_PUSH × FCM_HTTP_V1) en cada drill.
- **Dependencia de Google Play services en Zebra Z2466**: el loop Web Push
  verificado en esa unidad transita internamente por FCM de Google (Web Push en
  Android/Chrome se entrega vía FCM), lo que evidencia Play services operativos
  en el dispositivo. El canal nativo no reduce esa dependencia: la profundiza
  (GMS explícito + SDK Firebase en el host).

### Veredicto: APLAZAR (no descartar)

El bloqueo real del SLO es flota + medición + alcance de la métrica, no
transporte: construir el host Android ahora no mueve el gate
`c8-fcm-vapid-real` y añade superficie de mantenimiento sin demanda medida.
Re-evaluar implementación si aparecen (a) tasa Web Push < 99% sostenida por
doze/SW muerto, (b) requisito de notificar con navegador cerrado sin SW vivo,
o (c) flota sin navegador confiable. El trabajo server-side de FCM_HTTP_V1 ya
está pagado: activarlo será solo registrar suscripciones FCM_HTTP_V1 cuando
exista host que suministre tokens reales (jamás inventados, §5.12.3).

## 7. Próximos pasos

1. ADR de alcance del SLO (inline dispatch vs presupuesto segmentado) — bloquea
   el cierre honesto de `c8-fcm-vapid-real`.
2. Paso de cron que evalúe M2–M5 vía `pushDeliveryObservation` + alertas §4.
3. Fixture de flota: dispositivo Zebra permanente en staging (denominador
   continuo) y regla de clasificación ACCEPTED-sin-ACK (§5.3).
