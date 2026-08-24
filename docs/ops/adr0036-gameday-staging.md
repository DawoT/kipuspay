---
doc_id: ops-adr0036-gameday-staging
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-0036 — Game day de staging: despacho push inline (INTENTO 1 — BLOQUEADO)

| Campo | Valor |
|---|---|
| Fecha | 2026-08-24 |
| Operador | Staff SRE (Kipus SRE) |
| Alcance | Solo staging (`kipuspay-worker-api-staging`) |
| Veredicto | **BLOQUEADO — Etapa 1 (deploy flag OFF) falló; secuencia detenida por guardrail** |
| ADR | `docs/adr/ADR-0036-push-dispatch-inline.md` |
| Relaciona | Arquitectura §5.12.4 · §5.12.6 · Proceso §5.2 · Proceso §9.1 · `docs/ops/push-ack-slo-baseline.md` |

## 1. Resumen ejecutivo

El game day **no pudo iniciarse**: el deploy a staging vía
`.github/workflows/deploy-staging.yml` (V-31) falló en Etapa 1 (Lint) por una
regresión preexistente en main, ajena al código de ADR-0036 pero introducida por la
línea de commits que lo precede. Consecuencia directa: **el código del ADR-0036
(commit 10a20ce) nunca ha llegado a staging** — el último deploy verde es del
2026-08-22, anterior a ese commit. Activar el flag en caliente (paso 3 del plan)
sobre el worker desplegado sería un no-op: el binario en producción ni siquiera
conoce `FEATURE_PUSH_INLINE_DISPATCH`.

Por guardrail explícito del game day («si el deploy falla, detente y reporta»), los
pasos 2–7 (baseline, activación en caliente, batería flag ON, drill de rollback,
logs, veredicto de seguridad del flag) **no se ejecutaron**.

## 2. Secuencia ejecutada y evidencia

| # | Paso planificado | Resultado |
|---|---|---|
| 0 | Lectura de contrato (ADR-0036, workflow V-31, wrangler.jsonc) | OK — respaldo de config: sha256 `dd1372401dfa8bcb04d4177e12acdde62e0a37949f8144657037a6191de06734` |
| 1a | `gh workflow run deploy-staging.yml --ref main` | Disparado 2026-08-24T20:00:51Z — run [`32771456386`](https://github.com/DawoT/kipuspay/actions/runs/32771456386) |
| 1b | Verificación del run | **FAILURE** a los 1m22s — job `gate`, step «Etapa 1 - Lint + Typecheck»; job `deploy` skipped |
| 1c | Salud de staging | `/health` → HTTP 200 `{"status":"ok"}` (nota: la ruta real es `/health`; `/status` no existe y devuelve 404) |
| 1d | Settings del worker (API Cloudflare, lectura) | 93 bindings; `FEATURE_PUSH_INLINE_DISPATCH` **ausente** (esperado: código viejo + default off). El endpoint GET/PATCH de settings responde → el mecanismo de activación en caliente del paso 3 es viable cuando el código esté desplegado |
| 2–6 | Baseline, flag ON, rollback drill, logs | **NO EJECUTADOS** (guardrail) |

Preparación descartada sin uso: JWT owner generado desde `AUTH_JWT_HS_SECRET`
(`.dev.vars`) con claims `{sub:'user_stg_owner_001', tenantId:'tenant_stg_phase0_001',
role:'owner', branchId:'branch_stg_phase0_001', exp:+3600}` — material eliminado del
tmp al bloquearse el ciclo (higiene; regenerable en segundos). Dispositivo Zebra:
`adb devices` sin equipos conectados → el tramo accepted→displayed habría requerido
dock; se salteaba según plan.

## 3. Diagnóstico raíz del fallo de deploy

```text
apps/worker-fiscal/src/fiscal-drain.ts
  231:1  warning  Async function 'processClaimedRow' has a complexity of 16.
                  Maximum allowed is 15  complexity
✖ 1 problem (0 errors, 1 warning)   ← eslint --max-warnings 0 lo vuelve fatal
```

- **Reproducido localmente en main** (10a20ce): determinístico, no flaky.
- **Origen:** commit `d558492` (2026-08-23 22:57, «feat(push): primera notificación
  REAL entregada — ADR-0035 …») tocó `fiscal-drain.ts` y dejó `processClaimedRow`
  en complejidad 16 (>15).
- **Ventana rota:** último deploy verde = run `32601235592` (2026-08-22T22:00Z).
  Todo lo mergeado desde entonces —incluido 10a20ce con T1–T5— existe solo en main,
  nunca en staging. **El pipeline de staging lleva bloqueado ~2 días** y nadie lo
  había detectado: hallazgo mayor del game day (la observabilidad del propio CI
  falló antes que la del producto).
- **No es culpa del código push:** los tests T1–T5 de ADR-0036 no llegaron a correr
  en este run (falló antes, en lint de otro paquete).

## 4. Impacto en los gates del ADR-0036

| Gate | Estado |
|---|---|
| Deploy staging V-31 con evidencia | ❌ Bloqueado por CI (Etapa 1) |
| Observabilidad M1–M5 pre-release | ⏳ No verificable hoy: el worker desplegado no emite los logs nuevos |
| Rollback ensayado en staging | ⏳ Requiere código desplegado |
| Veredicto «flag seguro para dejar activado» | ⏳ **Sin datos — no emitir veredicto** |

## 5. Plan de desbloqueo (propuesto, requiere commit — fuera de alcance de esta sesión)

1. Refactor mecánico en `apps/worker-fiscal/src/fiscal-drain.ts`: extraer una rama de
   `processClaimedRow` (p. ej. el camino `channel !== 'UNIT_XML'` de boletas/RC, C6 §5.2)
   a un helper privado para bajar complejidad 16→≤15. Sin cambio de comportamiento;
   cubierto por tests existentes de drain.
2. `pnpm --filter @kipuspay/worker-fiscal run lint` local en verde → commit → re-run
   `gh workflow run deploy-staging.yml`.
3. Re-ejecutar ESTE game day completo desde el paso 1 (deploy flag OFF → baseline ×2
   pushes → PATCH settings con `FEATURE_PUSH_INLINE_DISPATCH='1'` → batería ×3 →
   drill rollback → logs → veredicto).

## 6. Lecciones operativas

- El gate de CI de staging necesita alerta propia (run failure > X min → aviso):
  dos días de ventana rota sin detección es exactamente el modo reactivo que
  Proceso §9.1 prohíbe.
- Un warning de lint tratado como error es correcto (max-warnings 0 evita pudrición),
  pero exige que el autor del commit corra `pnpm lint` pre-push; considerar
  `pre-push` hook además del `pre-commit`.

## Ejecución exitosa (2026-08-24 22:10–22:30 UTC) — Staff Principal directo

> Intento 2 tras desbloquear el CI (LEDGER 0470). Delegación indisponible
> (rate-limit diario del modelo de subagentes); ejecución directa del
> supervisor con el mismo protocolo.

### Secuencia y resultados

| Paso | Resultado |
|---|---|
| Salud `/health` | 200 ✓ |
| Baseline flag OFF (1 push 22:10) | delivery materializada en cron 22:15:22 → queued→accepted ≈ **4–5 min** |
| Activación flag en caliente | PATCH settings vía API (multipart `settings.bindings`), 93→94 bindings, **sin redeploy** |
| Batería flag ON (3 pushes) | queued→accepted ≈ **2 s** (2.4/1.7/1.9 s) — colapso del término dominante |
| E2E con dispositivo (Zebra en dock) | accepted→displayed 3–16 s; E2E total **5 s / 8 s / 18 s** (p95<10 s en 2/3; la de 18 s incluye wake del device) |
| Drill rollback (flag off 22:23) | evento 22:23:11 con **0 deliveries tras 60 s** — comportamiento T1 exacto (espera al cron) |
| Re-activación | flag ON (veredicto: seguro) |
| Logs | **0** `push_inline_dispatch_failed`, **0** `push_send_failed`, 0 waitUntil cancelados |

### Veredicto

**El flag es SEGURO y queda ACTIVADO en staging.** El despacho inline eliminó
el término dominante (cola del cron) sin fallos observados; el backstop del
cron quedó intacto (T1 verificado en caliente). Pendiente para cierre total
del gap `fcm-vapid-real`: flota permanente + n≥20 NORMAL/24 h para el SLO
≥99% (hoy n=3, 100% DISPLAYED de las alcanzables).

### Notas técnicas

- La activación en caliente vía PATCH de settings NO requiere redeploy: el
  worker lee la binding en el próximo request (cold start).
- Cada push genera 2 deliveries (Zebra viva + suscripción headless muerta
  346db140): las ACCEPTED-sin-display son de la muerta — clasificación
  ACCEPTED-sin-ACK pendiente de implementar (baseline SLO §3).
- El JWT del game day expira en 1 h; regenerar por sesión (patrón .dev.vars).
