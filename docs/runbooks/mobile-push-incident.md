---
doc_id: runbook-mobile-push-incident
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Runbook — Incidente de push móvil y caja PWA

| Campo | Valor |
|---|---|
| Severidad típica | SEV-1 si hay PII/secreto, cruce tenant o ventas perdidas; SEV-2 si hay duplicados, ACK falso o backlog; SEV-3 si solo hay degradación acotada |
| Owner on-call | Staff Mobile + Staff SRE |
| Última ensayada | 2026-08-08 (suite local/chaos y dispositivo emulado; staging y Android físico pendientes) |
| Relaciona | Arquitectura §5.12 · ADR-0029 · Proceso §9.1 |

## Síntomas

- Push visible sin consentimiento vigente, después de revocación o para tenant,
  usuario, branch, terminal o dispositivo incorrectos.
- Lockscreen contiene PII, dato fiscal, endpoint, token, secreto o monto sin política
  tenant y opt-in Owner.
- `ACCEPTED` contado como `DISPLAYED`, ACK inválido/replay/tardío aceptado, o dos
  notificaciones visibles para el mismo evento y dispositivo.
- Aumento de `RETRY`/`FAILED`, 404/410, 429/5xx, leases vencidos, backlog o p95
  evento→display; divergencia entre Web Push y FCM HTTP v1.
- Upgrade del Service Worker pierde caché, registro push o entradas de la cola
  IndexedDB; caja móvil no inicia, no vende offline o duplica al reconciliar.

## Impacto y contención inicial

Push es auxiliar: la venta, CPE, caja, stock, pedidos, recurrencia y sincronización
continúan. Ante duda, activar polling/banner y contener push; nunca apagar checkout.

1. Preservar timestamps, IDs opacos, provider, versión de clave, estado, lease hash,
   códigos allowlisted y versión de Service Worker. No copiar payload, endpoint,
   ciphertext, receipt, token ni credencial.
2. Si hay PII/secreto, cruce tenant, ACK falso o revocación fallida, activar de
   inmediato el kill switch global del dispatcher y declarar SEV-1.
3. Si el incidente está aislado y demostrado, deshabilitar solo Web Push o solo FCM
   mediante su switch de provider. Mantener el otro transporte únicamente si
   consentimiento, revocación, KMS y scope siguen fail-closed.
4. Forzar polling/banner autenticado con backoff; mostrar que las alertas push están
   degradadas. La operación origen y la cola offline no esperan al provider.

## Diagnóstico rápido (<5 min)

1. Acotar tenant, provider, versión de clave, versión SW, device fingerprint opaco y
   ventana UTC. Separar contexto `NORMAL`, `OFFLINE` y `DOZE`.
2. Confirmar grant vigente, propósito, policy version, sesión/terminal activa y
   capability de deploy y tenant. Cualquier fallo de revocación o `PUSH_KMS` es 503.
3. Verificar la cadena `PENDING` → `LEASED` → `ACCEPTED` → `DISPLAYED`; este último
   exige ACK one-shot válido dentro de 300 s después de `showNotification`.
4. Revisar TTL, collapse key, `Retry-After`, intentos, lease owner/expiry y
   invalidación 404/410/stale. No reactivar una suscripción inválida.
5. En PWA, comprobar un único registro SW, versión activa/waiting, allowlist de caché,
   página offline y conteo de IndexedDB antes de recargar o actualizar.

## Métricas y consulta segura

Alertar por provider y tenant sobre backlog due, leases vencidos, 404/410, 429/5xx,
tasa `DISPLAYED`, p50/p95 evento→display y exclusiones `OFFLINE`/`DOZE`. La consulta
operacional usa agregados y códigos opacos:

```sql
SELECT provider, status, display_context, provider_response_code,
       COUNT(*) AS delivery_count,
       MIN(created_at) AS oldest_created_at,
       MAX(attempt_count) AS max_attempt_count
FROM push_deliveries
WHERE tenant_id = ? AND created_at >= ?
GROUP BY provider, status, display_context, provider_response_code;
```

Para SLO de red normal, calcular sobre `display_context = 'NORMAL'` desde
`push_events.created_at` hasta `push_deliveries.displayed_at`; excluir
`OFFLINE`/`DOZE` solo si están etiquetados. Nunca medir desde la aceptación provider
ni consultar/exportar ciphertext, endpoints, receipts o payloads sensibles.

## Revocación masiva y rotación

1. Mantener push globalmente apagado y polling activo.
2. Para compromiso de usuario/dispositivo, revocar consentimientos y todas sus
   suscripciones por propósito. Para compromiso amplio, ejecutar revocación masiva
   tenant por tenant con actor, motivo, lote e idempotency key auditados.
3. Invalidar sesiones/terminales comprometidos. No borrar filas ni reutilizar
   fingerprints; las entregas pendientes deben expirar o quedar fallidas.
4. Rotar VAPID o credencial FCM solo mediante `PUSH_KMS`/Secrets Store: crear nueva
   versión, publicar el identificador no secreto, verificar dual-read acotado,
   migrar suscripciones y revocar la versión anterior.
5. Si KMS, Secrets Store o verificación de revocación no están disponibles, mantener
   fail-closed. Nunca pegar claves VAPID, service account o tokens en SQL, logs, chat
   o variables temporales.
6. Reactivar primero un tenant canary y un provider; exigir consentimiento vigente,
   cero entrega con versión revocada y ACK válido antes de ampliar.

## Recuperación de backlog y leases

1. Congelar nuevos claims y medir backlog por TTL/provider/tenant.
2. Esperar expiración natural de leases stale; no borrar owner hash, anticipar expiry
   ni fabricar leases. Un takeover usa el flujo CAS idempotente.
3. Reanudar páginas pequeñas con límites por tenant, respetando `Retry-After`,
   backoff+jitter, TTL y collapse key. 404/410/stale invalida; 429/5xx reintenta.
4. Priorizar eventos no expirados; marcar `EXPIRED` sin display a los vencidos. No
   convertir `ACCEPTED` en `DISPLAYED`.
5. Comparar evento×usuario×dispositivo y ACK antes/después; detener si aparece un
   duplicado visible, cruce tenant, pérdida de cola o bloqueo de la operación origen.

## Rollback del Service Worker y recuperación de caché

1. Detener rollout y fijar el último artefacto SW conocido como sano. No registrar un
   segundo SW ni llamar `skipWaiting` durante ventas/cola pendiente.
2. Conservar IndexedDB y la cola offline; el rollback solo reemplaza assets
   allowlisted. Nunca usar `Clear-Site-Data`, borrar storage o desregistrar el SW como
   mitigación automática.
3. Si una caché está corrupta, versionar una caché nueva, precachear shell/offline,
   activar en ventana segura y eliminar únicamente cachés de assets conocidas.
4. Validar F5, cierre/apertura, offline, upgrade y reconnect. Reconciliar IDs
   server-side de forma idempotente y comprobar conteo exacto antes de vaciar cola.
5. Si no puede garantizarse preservación, mantener el artefacto anterior y polling;
   escalar a Staff Mobile + Staff Offline antes de cualquier acción destructiva.

## Incidente de PII

1. Kill switch global, preservar evidencia mínima y activar el procedimiento LPDP.
2. Bloquear el tipo de evento/deep link afectado; revocar material si pudo exponerse.
3. Determinar campos, tenants, receptores, contexto de lockscreen, ventana y versión
   sin volver a renderizar ni redistribuir el dato.
4. Staff Security + Staff Privacy deciden notificación y retención. No afirmar
   contención hasta probar cero PII/secreto en payload, log, provider y lockscreen.

## Escalamiento

| Condición | Escalar a |
|---|---|
| PII/secreto, cruce tenant o credencial comprometida | SEV-1: Staff Security + Staff Privacy + Staff Principal |
| Venta/cola perdida, duplicada o checkout afectado | SEV-1: Staff Mobile + Staff Offline + Staff Backend ACID |
| ACK falso/replay, revocación o KMS fail-open | Staff Security + owner `PUSH_KMS` |
| Backlog, leases, 429/5xx o SLO degradado | Staff SRE + owner Worker + owner provider |
| SW/caché/IndexedDB/instalación PWA | Staff Mobile + Staff Frontend + Staff Offline |
| Android físico, doze, storage o background | Staff Mobile + Staff Hardware + Staff QA |

## Validación antes de reactivar

- Kill switches global/provider funcionan y polling mantiene alertas sin bloquear
  ventas; capability sigue default-off fuera del canary aprobado.
- Cero push sin consentimiento, PII/secreto, cruce tenant, dispositivo revocado,
  ACK falso/replay/tardío, duplicado visible, venta/cola perdida o bloqueo origen.
- Rotación acepta solo versiones vigentes; KMS/revocación no disponible devuelve 503.
- Leases recuperan un único ganador; backlog respeta TTL, retry y fairness tenant.
- SW rollback/upgrade conserva cola exacta tras F5, offline y reconnect.
- En staging real, Web Push y FCM cumplen p95 <10 s y `DISPLAYED` >=99% en red normal.
  Android físico valida doze/storage/background y 500 ventas antes de producción.
- Staff Mobile + Staff QA + Staff Security aportan A+V independientes. Las suites
  locales o emuladas no son certificación externa.

## Postmortem

- Registrar timeline, switches, provider/versiones, agregados, revocación/rotación,
  backlog, recuperación SW/cola, validación y residuales sin secretos ni PII.
- Añadir entrada append-only al ledger para toda corrección o incidente.
- No descongelar GTM-26 hasta staging real, Android físico y firmas A+V.
