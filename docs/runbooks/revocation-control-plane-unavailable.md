---
doc_id: runbook-revocation-unavailable
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Runbook — Plano de revocación de tenant no disponible (503)

| Campo | Valor |
|---|---|
| Severidad tipica | SEV-1 (auth fail-closed bloquea rutas protegidas) |
| Owner on-call | Staff SRE |
| Ultima ensayada | 2026-08-04 (control-plane.test.ts: DO down → 503) |
| Relaciona | Arquitectura §3 · ADR-0003 · AGENTS invariante 5 · Proceso §9.1 |

## Sintomas

- API responde **503** con `code: REVOCATION_CHECK_UNAVAILABLE` en rutas `/api/*`.
- `/health` sigue en 200 (no pasa por el middleware de auth).
- Métricas: sube tasa 503; no aparecen 200 en cobro autenticado.

## Impacto

- Rutas protegidas (incl. cobro online autenticado) no autorizan — fail-closed
  correcto: no se concede acceso sin poder comprobar revocación.
- La venta offline-first en el cliente puede seguir encolando; la sync server-side
  fallará hasta recuperar el plano de control.

## Diagnóstico rápido (<5 min)

1. Confirmar código `REVOCATION_CHECK_UNAVAILABLE` (no confundir con 401 JWT).
2. Estado de `TENANT_KV` y Durable Object `TENANT_STATE_DO` (binding / región).
3. Revisar logs del middleware: excepciones en `checkRevocation`.
4. Verificar que no se desplegó un deps default fail-closed en producción por error.

## Mitigación

1. Restaurar lectura del DO de revocación (prioridad) y KV como acelerador positivo.
2. No conmutar a fail-open ni cachear `revoked=false` indefinido.
3. Si solo KV falla pero DO responde: el diseño continúa al DO (no mitigar
   forzando bypass).
4. Comunicar a Staff PM: caja online autenticada degradada; offline local intacto.

## Rollback

- Revertir deploy del worker-api solo si el 503 lo introdujo un bug de cableado
  de deps (verify con `tenant-auth-middleware.test.ts`).
- Tras restaurar DO/KV: smoke `POST /api/pos/totals` con JWT de staging → 200.

## Escalamiento

| Condición | Escalar a |
|---|---|
| 503 > 5 min en producción | Staff Principal + Staff Security |
| Sospecha de compromiso / revocaciones masivas | Staff Security (SEV-1 seguridad) |

## Postmortem

- Entrada de ledger (tipo Corrección / incidente): pendiente al cierre del incidente
- Acción preventiva: chaos acotado de caída DO/KV en Sprint 2 (Arquitectura §13.5)
