---
doc_id: adr-0036-push-dispatch-inline
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-0036 — Despacho push inline post-enqueue para hacer cumplible el SLO de ACK (§5.12.4)

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-24 |
| Decisores | Staff Principal |
| Consultados | Staff Mobile · Staff Security |
| Informados | Staff PM · Staff QA |
| Relaciona | Arquitectura §5.12.4 · §5.12.6 · §5.12.3 · Proceso §9.1 · `docs/ops/push-ack-slo-baseline.md` · `docs/ops/pending-batches.yaml` (gap `fcm-vapid-real`, gate `c8-fcm-vapid-real`) · ADR-0029 · ADR-0033 · ADR-0035 · Ledger 0464 · Ledger 0465 |

## Contexto

El SLO normativo (Arquitectura §5.12.4) mide la latencia desde `push_events.created_at`
hasta `push_deliveries.displayed_at` — «nunca desde la respuesta HTTP del proveedor» —
con objetivo p95 < 10 s y tasa DISPLAYED ≥ 99% en red NORMAL. El dispatcher,
en cambio, corre por cron `*/5` (compartido con ventas recurrentes y expiración de
pedidos en `apps/worker-api/src/worker.ts`, constante `RECURRING_SALES_CRON`;
Arquitectura §5.12.6). La consecuencia es aritmética, no accidental: un evento encolado
justo después de un tick espera ~300 s; con reintentos y backoff, más.

Baseline medido en staging (`docs/ops/push-ack-slo-baseline.md`, 2026-08-24, 21 filas):

| Métrica | Valor medido |
|---|---|
| queued→ACCEPTED promedio | 169.4 s |
| queued→ACCEPTED máximo | 554.1 s |
| Única muestra E2E medible (event→displayed) | 279.6 s |
| Tramo ACK de esa misma muestra (accepted→displayed) | **4.853 s** |

Lectura SRE: el 98% de la latencia end-to-end es espera de cola de cadencia, no
transporte ni dispositivo. El tramo que el SLO quiere acotar (proveedor + device +
ACK receipt) ya cumple con holgura (4.853 s < 10 s). El SLO §5.12.4 tomado al pie de
la letra es **estructuralmente incompatible** con cron `*/5`: ningún ajuste de
backoff, TTL o índice lo arregla, porque el término dominante es la cadencia misma.

Historial relevante: el drill del 2026-08-23 (gap `fcm-vapid-real`,
`drill_findings`) demostró que un envío inline post-enqueue **ya existió y fallaba en
silencio antes de invocar worker-kms** (0 invocaciones KMS en tail; delivery quedaba
`LEASED` con `attempt_count=0` sin `failure_reason`; el error se tragaba en el catch
del camino `waitUntil`). Ese camino fue deshabilitado; el TTL del evento de test subió
a 600 s para sobrevivir la cadencia. Cualquier propuesta de inline debe absorber esa
lección: errores jamás silenciosos.

Sin decisión de alcance, el gate `c8-fcm-vapid-real` (pass: «ACK DISPLAYED p95<10s
≥99%») no puede cerrarse honestamente: hoy la métrica literal mide la cadencia del
cron, no la calidad de entrega.

## Decisión (propuesta — pendiente de aceptación)

Se propone la **Opción A**: despacho inline post-enqueue vía `ctx.waitUntil`,
reutilizando el pipeline único del dispatcher acotado a `{tenantId, eventId}`, con
tope de fan-out por invocación y feature flag; el cron `*/5` queda intacto como red
de reintento/backstop. El SLO §5.12.4 **no se modifica**.

Concretamente:

1. Nueva entrada exportada en `mobile-push-dispatcher.ts`
   (`dispatchPushNow(env, { tenantId, eventId })`) que ejecuta la secuencia ya
   existente `materializeDeliveries` → `claimPushDeliveries` → `dispatchOne`. Sin SQL
   ni lógica duplicada (invariante 9, DRY de dominio).
2. `sendTestPushHttp` (y todo futuro productor HTTP de `OWNER_ALERTS` /
   `OPERATIONAL_MOBILE`) invoca `c.executionCtx.waitUntil(dispatchPushNow(...))`
   después de `appendPushEventAtomic` y responde `202` sin esperar el envío. Patrón ya
   usado en el repo (`index.ts`, rutas offline-sale/sync).
3. Feature flag `FEATURE_PUSH_INLINE_DISPATCH` (default off). Flag off ⇒ comportamiento
   idéntico al actual (solo cron): esa es además la palanca de rollback.
4. Tope de fan-out inline: `INLINE_MAX_DELIVERIES = 16` (derivado del techo de service
   bindings, ver costos). Lo que exceda el tope queda `PENDING`/`RETRY` y el discovery
   dual del cron lo toma en el siguiente tick.
5. Errores surfaced por contrato: toda excepción en el camino inline persiste
   `failure_reason` y emite `console.warn` estructurado (`push_send_failed` /
   `push_ack_receipt_failed`) — regresión directa del defecto del drill 2026-08-23.

Verificable por: tests T1–T6 (§ Tests y gates), métricas M1–M5 y alertas del baseline
configuradas ANTES del release, y rollback ensayado en staging (flag off en caliente).

## Opciones consideradas

### Opción A — Inline post-enqueue vía `waitUntil`; cron como red de seguridad/retry

**Pros**

- Elimina el término dominante (cadencia ≤ ~300 s, observado hasta 554.1 s): el p95
  E2E pasa a estar dominado por el tramo proveedor+dispositivo, medido en 4.853 s.
- Un solo pipeline de despacho: inline y cron comparten `claimPushDeliveries` (lease
  idempotente) y `dispatchOne`; cero forks (invariante 9).
- El cron conserva TODAS sus funciones actuales: reintentos con backoff+jitter,
  recuperación de leases estancados, eventos de dispositivos que recién conectan,
  expiración TTL. No se toca `worker.ts`.
- No requiere cambio de spec, registry ni claims GTM.

**Contras y costos (verificados contra documentación de plataforma, 2026-08)**

- *Vida de `waitUntil`*: extiende la ejecución hasta **30 s posteriores a la
  respuesta**, presupuesto compartido entre todos los `waitUntil` del request;
  promesas no resueltas se cancelan con warning en Workers Logs. Con envíos
  secuenciales I/O-bound (~0.2–0.5 s por delivery), 16 deliveries caben con holgura;
  es un tope real, no decorativo.
- *Service bindings*: `PUSH_KMS` es service binding a `kipuspay-worker-kms`
  (`wrangler.jsonc`). Cada llamada cuenta hacia el tope de **32 invocaciones de Worker
  por request**; `dispatchOne` hace 2 RPC KMS por delivery (receipt + send) ⇒ techo
  duro ≈ **16 deliveries inline por request**. Nota honesta: la documentación describe
  este tope «por request»; su aplicación exacta a invocaciones `scheduled` debe
  verificarse empíricamente en el game day con un fan-out controlado (el cron actual
  reclama páginas de 50×10 que excederían ese techo si aplicara igual allí).
- *Subrequests*: D1/KV/R2 cuentan como subrequests; plan pagado permite 10.000 por
  invocación por defecto. Al volumen actual no es el vínculo limitante; el vínculo es
  el techo de 32 invocaciones.
- *CPU Worker*: el trabajo inline corre dentro de la misma invocación HTTP: no añade
  latencia visible al `202` (corre post-respuesta) pero consume su presupuesto de CPU
  (default 30 s). El trabajo es I/O-bound (RPC + D1); CPU real baja.
- *Duplicación con lease*: el claim es un UPDATE condicional serializado por D1
  (`status='LEASED' WHERE lease vencido/NULL`); si cron e inline corren a la vez, solo
  uno gana el lease por fila y el perdedor lee 0 filas bajo su hash. Riesgo residual:
  crash entre send y `completeDelivery` ⇒ lease expira (60 s) ⇒ el cron reenvía ⇒
  notificación posiblemente duplicada. Mitigación: `collapse_key` ya seteado por
  evento, ventana estrecha, y §5.12.6 («dispatch concurrente no duplica
  notificaciones visibles») queda cubierto por test de contrato T2, no por esperanza.
- *Deuda histórica*: el inline anterior fallaba en silencio. Esta propuesta lo vuelve
  imposible por construcción (T3): `failure_reason` persistida + log estructurado.

**Evidencia a favor**: baseline §2 (tramo ACK 4.853 s); drill findings (la causa del
fallo del inline viejo fue un camino de código separado que tragaba errores, no el
modelo inline en sí); patrón `waitUntil` ya probado en el repo.

### Opción B — Mantener cron `*/5` y presupuesto segmentado (redefinir el SLO)

Redefinir §5.12.4 en dos presupuestos: queued→accepted como latencia de
infraestructura presupuestada aparte (p. ej. p95 ≤ 310 s documentado; hoy no existe
columna `dispatch_at` — el proxy persistido sería `accepted_at`) y accepted→displayed
< 10 s como «SLO de dispositivo».

**Pros**

- Cero cambio de código; refleja la arquitectura actual con honestidad contable.
- El tramo dispositivo ya cumple (4.853 s); la tasa DISPLAYED ≥ 99% seguiría siendo
  evaluable con los guards del baseline (n ≥ 20, clasificación ACCEPTED-sin-ACK).

**Contras**

- Cambia la regla normativa para acomodar la implementación: la alerta de cierre de
  caja con discrepancia llegaría al dueño hasta ~5+ minutos tarde, degradando el valor
  del caso de uso OWNER_ALERTS, que existe precisamente para reaccionar rápido.
- Costo documental mayor que el fix técnico: enmienda de §5.12.4, registry §0.4,
  alineación de claims GTM-26 (condicionados en FASE 6E) y re-explicación comercial.
- Precedente contrario al principio SLO-first (Proceso §9.1): doblar la métrica a la
  infraestructura en vez de la infraestructura a la métrica.
- El gate `c8-fcm-vapid-real` pasaría sin que la experiencia mejore un milisegundo:
  cierre técnicamente verde y sustancialmente débil.

**Evidencia**: la propia distribución del baseline demuestra que segmentar no arregla
nada para el usuario — solo relabeliza la espera.

### Opción C — Híbrido por propósito: inline para OWNER_ALERTS/OPERATIONAL_MOBILE, cron para batch/bulk

Inline solo cuando el propósito del evento sea OWNER_ALERTS u OPERATIONAL_MOBILE;
cualquier propósito futuro de volumen (broadcast/marketing) quedaría exclusivamente en
cron.

**Pros**

- Válvula de costos explícita: un fan-out masivo futuro nunca tocaría el techo de 16
  deliveries del inline ni el presupuesto `waitUntil` de requests legítimamente cortos.
- Hoy es funcionalmente equivalente a A: los únicos propósitos existentes SON
  OWNER_ALERTS y OPERATIONAL_MOBILE (`PURPOSES` en `mobile-push-routes.ts`).

**Contras**

- Introduce una dimensión de decisión (propósito→modo) que hoy no discrimina nada:
  complejidad y una rama condicional sin beneficio medible todavía.
- Riesgo de fork de pipeline si el «modo batch» termina con código distinto
  (invariante 9). Se mitiga solo si ambos modos comparten `dispatchPushNow`.

**Evidencia**: productores actuales = ruta HTTP de test (`sendTestPushHttp`) y
recordatorios de billing encolados desde handler `scheduled` (best-effort). Ningún
fan-out masivo medido ni reclamado.

## Recomendación

Adoptar la **Opción A** con las válvulas que motivan la C, dejando la C como evolución
natural — no como complejidad inicial:

1. Inline universal para productores HTTP, reutilizando el pipeline único del
   dispatcher, acotado a `{tenantId, eventId}` y `INLINE_MAX_DELIVERIES = 16`, tras
   flag `FEATURE_PUSH_INLINE_DISPATCH`.
2. Cron `*/5` sin cambios como backstop (reintentos, leases estancados, excedentes del
   tope, reconexiones tardías). Los productores `scheduled` (billing reminders) no se
   benefician de `waitUntil` — ya corren en cron; su cola la toma el siguiente tick.
3. Errores jamás silenciosos: `failure_reason` persistida + log estructurado (T3).

Por qué no B: viola SLO-first, su costo documental supera al fix técnico, y la
evidencia muestra que quitar la cola basta para volver el SLO cumplible. Por qué no C
ahora: la gated por propósito no excluye ningún caso real hoy; si aparece un propósito
bulk, activar la gate es un cambio pequeño sobre el mismo `dispatchPushNow` (y en ese
escenario debe evaluarse además un consumer de Queues como disparador, que elimina los
techos de `waitUntil`/service bindings — fuera de alcance aquí).

## Tests y gates que validarían la opción elegida

Ciclo RED→GREEN (skill `kipus-task`), sobre `apps/worker-api`:

- **T1 Contrato inline**: POST test-push con flag on agenda `dispatchPushNow` vía
  `executionCtx.waitUntil` (mock KMS registra exactamente 1 send) y responde `202`
  sin bloquearse en el envío.
- **T2 Exclusividad de lease**: ejecución concurrente simulada de inline+cron sobre la
  misma delivery ⇒ exactamente 1 invocación al proveedor (regresión §5.12.6).
- **T3 Surfaced failure**: KMS rechaza `issueAckReceipt`/`send` en el camino inline ⇒
  `failure_reason` persistida + `console.warn` estructurado; jamás `LEASED` con
  `attempt_count=0` sin razón (regresión directa del drill 2026-08-23).
- **T4 Flag off**: cero llamadas inline; resultado idéntico al comportamiento actual
  (condición de rollback verificada por test, no por fe).
- **T5 Tope de fan-out**: > 16 deliveries elegibles ⇒ inline procesa ≤ tope, resto
  permanece `PENDING`/`RETRY` y el discovery dual del cron lo encuentra.
- **T6 DRY**: `dispatchPushNow` ejercita las funciones exportadas existentes
  (`materializeDeliveries`, `claimPushDeliveries`, `dispatchOne`); prohibido duplicar
  SQL del dispatcher.

Gates de cierre (condición necesaria, no suficiente con SUITE GREEN):

- **Observabilidad ANTES del release**: queries M1–M5 del baseline + alertas §4
  (DISPLAYED/ACCEPTED, p95 ack_delta, p95 E2E informativo→exigible, picos de
  `push_send_failed`) configuradas como dashboard + reglas en Workers Observability,
  con guard n ≥ 20 NORMAL/24 h. Jamás reactivo.
- **Rollback ensayado en staging** (game day con dispositivo Zebra en dock): flag off
  en caliente durante un drill; artifact de evidencia; verificación empírica del techo
  de service bindings con fan-out controlado.
- **Quality gate**: CAL-05 (cobertura adapters/apps) sobre módulos tocados, CAL-03
  semgrep, `scripts/verify.sh` SUITE GREEN; deploy a staging vía
  `.github/workflows/deploy-staging.yml` (V-31).
- **Cierre de `c8-fcm-vapid-real`**: además de lo anterior, exige flota mínima
  permanente, n ≥ 20–30 muestras NORMAL y regla de clasificación ACCEPTED-sin-ACK
  (baseline §5.1–§5.3) — el ADR desbloquea la decisión 4; 1–3 son condiciones de flota
  y medición que este ADR no sustituye.

## Impacto en el gap fcm-vapid-real

- Con A, la métrica M5 (p95 E2E < 10 s) deja de ser estructuralmente imposible: el
  gate puede evaluarse con la definición literal de §5.12.4, sin redefinirla. Ese era
  el bloqueo declarado en el baseline §5.4.
- No cierra el gap por sí solo: siguen pendientes la flota permanente en staging, el
  volumen estadístico y la clasificación de ACCEPTED-sin-ACK. Lo que hace es eliminar
  la excusa estructural para que el cierre sea honesto.
- Si se eligiera B, el cierre dependería de una métrica redefinida: claim más débil
  frente a GTM-26 y frente a cualquier auditoría posterior del SLO.

## Consecuencias

- **Gana:** el SLO §5.12.4 se vuelve cumplible y auditable tal como está escrito; el
  dueño recibe alertas de caja en segundos, no minutos; un solo pipeline de despacho;
  el cron conserva íntegro su rol de retry/backstop; rollback de una sola variable.
- **Paga:** techo duro de ~16 deliveries inline por request (service bindings) y 30 s
  de ventana `waitUntil` — suficientes para el volumen actual, insuficientes para bulk
  futuro (evolución C/Queues); riesgo residual de duplicación en crash post-send
  (mitigado por collapse_key + T2); CPU inline dentro de la invocación HTTP originante.
- **Invariantes tocadas:** ninguna de AGENTS §2 de forma negativa — fail-closed ya
  vive en `authorize` (invariante 5); offline-first intacto: el push jamás bloquea la
  operación origen y degrada a polling/banner (§5.12.6, invariante 7); DRY respetado
  con pipeline único (invariante 9); cero dependencias npm nuevas (invariante 10);
  atomicidad D1 por `db.batch` en materialize/claim/complete (sin `UPSERT INTO`).
- **Activación:** sprint adyacente a FASE 6E; flag `FEATURE_PUSH_INLINE_DISPATCH`
  default off; primero staging (con dashboards/alertas pre-creadas y game day de
  rollback), producción solo con esa evidencia.

## Evidencia de cierre

- Tests / checks: T1–T6 RED→GREEN · `scripts/verify.sh` SUITE GREEN · alertas M1–M5
  activas pre-release · game day de rollback con artifact.
- Ledger: `id: ____` (al momento de la aceptación)
- Firmas RACI: `R` Staff SRE · `A` Staff Principal (pendiente) · `V` Staff Mobile + Staff QA
