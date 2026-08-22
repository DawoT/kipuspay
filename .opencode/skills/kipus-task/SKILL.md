---
name: kipus-task
description: Ciclo canónico de una tarea de sprint en KipusPay, de la lectura del contrato al cierre del gate. Úsalo al empezar cualquier sprint o entregable (spec o código) para no improvisar el orden ni saltarte el Ledger y el RACI.
allowed-tools: Bash(*)
---

# kipus-task — Ciclo de una tarea

El repo ya tiene doctrina (`AGENTS.md`), especificación, roadmap y gate ejecutable. Lo que este skill fija es el **orden**: qué se lee, qué se decide y en qué momento se registra. Toda tarea recorre las 8 fases; ninguna se salta "porque el cambio es chico".

## 0. Preparar entorno (una vez por clone)

```bash
scripts/bootstrap.sh   # instala el hook pre-commit y corre el gate
```

Los hooks no viajan en un `git clone`: sin esto, los commits no pasan por la batería.

## 1. Leer el contrato

`AGENTS.md` completo. Las 10 invariantes son NO-GO: violar una invalida el entregable, sin importar la calidad del resto.

## 1b. Delegar al agente staff especializado

El roster ejecutable vive en `.opencode/agents/` (registro: `.opencode/staff-ledger.md`). Antes de ejecutar, identifica el rubro y delega vía Task (o `@mención`):

| Rubro | Agente |
|---|---|
| Decisiones arquitectónicas, ADRs, desempates, firma RACI A | `kipus-principal` |
| DDL, migraciones up/down, sharding, índices | `kipus-data` |
| Motor transaccional, `db.batch`, idempotencia, reconciliación | `kipus-acid` |
| Auth/tenant, HMAC webhooks, anti-replay, PIN/lockout | `kipus-security` |
| Pipeline fiscal SUNAT, UBL/XAdES, CDR, NC/ND, DLQ | `kipus-fiscal` |
| POS offline-first (`apps/pos-web`), sync chunked, bundle | `kipus-pos` |
| Impresión/periféricos, ESC/POS, balanzas, kioskos | `kipus-hardware` |
| Modo Dueño, push accionable, PWA móvil | `kipus-owner` |
| SLO/observabilidad, runbooks, deploy staging | `kipus-sre` |
| Suites chaos, escenarios adversariales, RED→GREEN | `kipus-qa` |
| Sistema de diseño, WCAG AA, UX premium | `kipus-design` |
| Landings/SEO/CWV, claim gate, métricas de crecimiento | `kipus-growth` |
| Copy ×3 audiencias, anti-jerga, documentación narrada | `kipus-content` |
| Rollups/reporting, TTFS/NRR/K-factor, atribución | `kipus-analytics` |
| Backlog por impacto, criterios de negocio por sprint | `kipus-pm` |
| User stories de funcionamiento real (Gherkin trazable) | `kipus-stories` |

Reglas de delegación: un rubro = un agente responsable (R); las firmas de la Matriz de Calidad (`Proceso §4`) exigen los DOS agentes indicados; nunca un agente aprueba su propio entregable crítico (`Proceso §0.6`). Las historias de flujo real se producen SIEMPRE con `kipus-stories` antes de implementar el sprint.

## 2. Localizar el trabajo

`INDEX.md` es el mapa de punteros (generado, no normativo):

- capability → sprint → empaquetado GTM
- tabla DDL → sección canónica de la especificación
- regla (`SEC-`, `FIS-`, `DAT-`, …) → sección donde está definida
- puerto → adapters previstos
- package destino del monorepo

Con el sprint identificado, la fuente de verdad es su archivo de fase (`INDEX.md` → `docs/roadmap/fase-X.md`) (alcance y criterios) y la especificación para las reglas y el DDL. `INDEX.md` nunca sustituye a ninguno de los dos.

## 3. Resolver reglas antes de escribir

Cada regla que toques debe tener fila en el Registry §0.4. Si la necesitas y no existe: primero la defines **una vez** en la especificación y la registras (skill `kipus-rules-registry`). Nunca dos definiciones, nunca un ID huérfano.

Decisiones que no se improvisan en el PR: si el cambio implica una elección arquitectónica (canal fiscal, política de stock, modelo de cobro, auth/revocación), va como ADR con su fila en el Registry. Plantilla: `docs/adr/TEMPLATE.md` → archivo `docs/adr/ADR-NNNN-….md`. **El archivo ADR debe existir en el tree antes de citar `ticket_or_adr: ADR-NNNN` en el Ledger** (ADR-first; no adelantar el ID en slices previos). Procedimientos operativos: `docs/runbooks/TEMPLATE.md`.

## 4. Diseñar contra las invariantes

Antes de escribir la primera línea, resuelve en voz alta:

- **Dinero:** ¿todo en `INTEGER cents`? ¿el redondeo ocurre server-side?
- **Atomicidad:** ¿la escritura multi-tabla cabe en un solo `db.batch([...])` con guards SQL?
- **Capability:** ¿se habilita por flag, sin ramificar por vertical?
- **Offline:** ¿la venta sigue cerrando si se corta la red? ¿el servidor sigue siendo la autoridad del monto?
- **Fiscal:** ¿se respeta el CDR como única confirmación y el `must_submit_by`?
- **Aislamiento:** ¿`tenant_id NOT NULL` y FK compuesta `(tenant_id, parent_id)` en toda tabla nueva (DAT-12)?

## 5. RED antes de GREEN

Para cambios de código: test que falle primero, con el ID del test anotado (va al `test_ids` del Ledger). Para cambios de especificación: el check del gate que detecta el problema **antes** de arreglarlo — si ningún check lo detecta, el gate está incompleto y toca extenderlo (`scripts/checks/`).

## 6. Implementar donde corresponde

- Reglas de dominio en `packages/domain-*`: sin imports de Hono, D1, Svelte ni SDK SUNAT.
- Workers y apps son composition root + adapters; los puertos se implementan como adapters, no como `if` en el orquestador.
- Documentación: la regla en la especificación; `docs/PROCESS.md` y `docs/GTM.md` la **citan** con `§`.

## 7. Cerrar el gate y registrar

```bash
scripts/index.sh          # si cambiaron capabilities, DDL, reglas, puertos o packages
scripts/verify.sh         # debe terminar en RESULT SUITE GREEN
```

Luego, en este orden:

1. Entrada nueva en `docs/LEDGER.md` con `prev_hash`/`entry_hash` reales y evidencia RED→GREEN (skill `kipus-changelog`).
2. PR con la plantilla (`.github/pull_request_template.md`) completa.
3. Quality Gate de `docs/PROCESS.md` §8.1: `R` ejecuta, `A` aprueba, `V` verifica de forma independiente. Sin `A` + `V` distinto de `R`, el resultado es `NO-GO`.

## Señales de que vas mal

- Estás copiando una regla que ya existe en otro doc → viola la invariante 9; cita `§`.
- Estás por escribir `if (vertical === …)` → falta una capability.
- El gate está GREEN pero no escribiste ningún check nuevo para un problema que sí existía → el gate no cubre tu cambio.
- Quieres editar una entrada del Ledger → nunca; entrada nueva con `relacion: CORRIGE`.
