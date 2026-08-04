---
doc_id: agents-contract
alias: AGENTS
authority: normativa
owner: "@DawoT"
---

# KipusPay — Manual de Operación para Agentes IA (Staff)

> Biblia de trabajo del escuadrón. **Léelo completo antes de tocar cualquier documento.**
> Este archivo es auto-cargado por opencode al iniciar; los documentos maestros son la doctrina.

## Ruta de lectura (empieza aquí)

Este archivo es lo único que se lee completo. Todo lo demás se abre **por puntero**:
`INDEX.md` traduce capability, regla, tabla, puerto y sprint a su archivo y línea.

**Prohibido cargar la especificación completa.** Es un corpus de miles de líneas: leerlo
entero gasta el contexto que necesitas para razonar y trae reglas que no aplican a tu
tarea. Si no sabes dónde vive algo, la respuesta es `INDEX.md`, no un `grep` a ciegas.

| Tarea | Lee | No leas |
|---|---|---|
| Implementar un sprint | `INDEX.md` (sprint → archivo) → una sola `docs/roadmap/fase-*.md` → los capítulos que esa fase cite | Las otras 14 fases; la especificación completa |
| Regla de caja, descuento, crédito, comandas | `INDEX.md` (regla → archivo) → `docs/architecture/05-3-commercial-ops.md` | Los otros 17 capítulos |
| Crear o cambiar una tabla | `INDEX.md` (tabla → archivo + línea) → ese capítulo → `docs/architecture/05-ddl-conventions.md` | `docs/architecture/05-5-ddl-base.md` completo |
| Emisión fiscal / SUNAT | `docs/architecture/05-2-fiscal-pipeline.md` + `docs/architecture/08-credit-notes-dlq.md` | `docs/architecture/05-3-commercial-ops.md` |
| Motor transaccional / atomicidad D1 | `docs/architecture/06-acid-engine.md` | El DDL completo |
| Claim comercial o pricing | `docs/GTM.md` + el Quality Gate del sprint que lo libera (`docs/ROADMAP.md`) | La especificación técnica |
| Gate, DoD, RACI, CI/CD | `Proceso §3`, `§5.2`, `§8.1` | El roadmap |
| Registrar un cambio | Skill `kipus-changelog` → **solo la última entrada** de `docs/LEDGER.md` (para `prev_hash`) | El resto del ledger (append-only) |
| Decisión no trivial | `docs/adr/TEMPLATE.md` → ADR numerado en `docs/adr/` | Re-escribir la regla en el PR sin ADR |
| Incidente / procedimiento | `docs/runbooks/TEMPLATE.md` → runbook en `docs/runbooks/` | Improvisar mitigación sin registro |
| Cambiar el gate | `scripts/verify.sh` + `scripts/checks/` | Los documentos normativos |

Los alias de la tabla (`Arquitectura §N`, `Proceso §N`, `Roadmap`, `GTM §N`) resuelven a
archivos según §3; el mapa ejecutable vive en `scripts/checks/paths.py` y el check V-18
falla si una cita apunta a una sección que no existe. Los mapas navegables son
`docs/ARCHITECTURE.md` (capítulo → archivo) y `docs/ROADMAP.md` (fase → archivo).

## 1. Identidad

- **Producto:** KipusPay — POS & Facturación Electrónica multitenant edge-native (SUNAT Perú).
- **Repo:** `github.com/DawoT/kipuspay`
- **Marca:** "KipusPay" en todo el contenido normativo. El **ledger histórico** (`docs/LEDGER.md`, entradas 0143–0176) conserva "Atlas" como término histórico — declarado en la entrada 0177. Nunca re-escribir el ledger.
- **Rutas:** todo path versionado es ASCII, sin espacios y en inglés (`docs/ARCHITECTURE.md`, no el nombre largo con acentos). Las entradas 0143–0181 del ledger citan los paths previos: son históricas y válidas, la equivalencia se declara en 0182.

## 2. Invariantes no negociables (violar uno = NO-GO)

1. **Dinero:** solo `INTEGER cents` (`*_cents`). Cero `REAL`/`float` para columnas monetarias; `REAL` solo ratios/cantidades.
2. **D1:** atomicidad con `db.batch([...])`. **No existe `db.transaction(callback)`** en la API D1. Prohibido `UPSERT INTO`.
3. **ADR-ARCH-002 (Capability Model):** prohibido `switch(vertical)` y forks por vertical; las capabilities se habilitan por flags.
4. **Ledger append-only:** nunca editar ni borrar entradas (0143+). Toda corrección = entrada nueva con `relacion: CORRIGE`.
5. **Revocación fail-closed:** sin verificación de revocación disponible → `503`, nunca acceso por omisión.
6. **Webhooks:** firma HMAC verificada + ventana anti-replay ≤ 300 s.
7. **Offline-first:** la venta nunca se cae; reconciliación autoritativa server-side (la UI nunca es fuente de verdad de montos).
8. **Fiscal SUNAT:** sin "contingencia" como atajo; `PSE KipusPay` default; nunca afirmar aceptación antes del CDR.
9. **DRY de dominio:** cada regla vive UNA vez en la especificación; sprints y GTM la **referencian** (§), no la re-escriben.
10. **Zero-dependency cliente:** el Edge no renderiza tickets/QR/PDF con librerías npm; Web Platform APIs + código vendorizado.

## 3. Contrato de documentos (autoridad)

| Documento | Alias en prosa | Rol | Autoridad sobre |
|---|---|---|---|
| `docs/ARCHITECTURE.md` + `docs/architecture/*.md` | `Arquitectura §N` | Especificación | DDL, reglas de negocio, motor transaccional, seguridad, fiscal |
| `docs/PROCESS.md` | `Proceso §N` | Proceso | Roles, DoD, Quality Gates, CI/CD, gobernanza, métricas |
| `docs/ROADMAP.md` + `docs/roadmap/*.md` | `Roadmap FASE N` | Roadmap | Alcance, entregables y gate de cada sprint |
| `docs/LEDGER.md` | `Ledger NNNN` | Registro | Changelog append-only (0143+) — **inmutable** |
| `docs/GTM.md` | `GTM §N` | Comercial | Claims, pricing, gates GTM-01..18 |
| `docs/adr/` | ADR-NNNN | Decisiones | ADRs aceptados (plantilla `docs/adr/TEMPLATE.md`) |
| `docs/runbooks/` | — | Operación | Runbooks de incidente (plantilla `docs/runbooks/TEMPLATE.md`) |
| `AGENTS.md` | `AGENTS §N` | Contrato raíz | Invariantes + autoridad + router de lectura (este archivo) |
| `INDEX.md` | — | Índice **generado** | Punteros capability/DDL/regla/puerto/package — sin autoridad normativa |

Regla de oro: si una regla existe en la especificación, **no** se repite en el proceso ni en GTM; se referencia con `§`.

## 4. Registry de reglas

- Tabla canónica **ID → sección → doc** en `docs/ARCHITECTURE.md` §0.4 (SEC-, FIS-, COM-, DAT-, PERF-, SYN-, ADR-, LPDP).
- Toda referencia a una regla en cualquier doc debe existir en el registry con **un solo** puntero canónico.
- Crear una regla = actualizar el registry + definirla UNA vez en la especificación. Nunca IDs huérfanos.

## 5. Verificación

**Primer paso en un clone nuevo** (los hooks no viajan en el clone; sin esto los commits no se verifican):

```bash
scripts/bootstrap.sh   # fija core.hooksPath y corre el gate
```

Gate documental, exigido por el hook `pre-commit` y por CI:

```bash
scripts/verify.sh                                    # veredicto completo
scripts/verify.sh | awk '$1=="RESULT" && $3=="RED"'  # solo lo que falla
```

Cada check emite `RESULT <ID> GREEN|RED` y la última línea es `RESULT SUITE GREEN|RED`:

| ID | Verifica |
|---|---|
| V-00 | Autotest de los detectores del gate (un gate sin test es cómo nació el falso GREEN) |
| V-01 | Fences pares |
| V-02 | Cero `UPSERT INTO` |
| V-03 | Cero literales `http://` / `ws://` |
| V-04 | Cero `db.transaction(` en código |
| V-05 | `tenant_id NOT NULL` en toda tabla multitenant (DAT-12) |
| V-06 | Dinero en `INTEGER` cents; `*_cents` nunca `REAL` |
| V-07 | Cero `switch(vertical)` / `vertical ===` en código |
| V-08 | Registry §0.4 sin huérfanos, duplicados ni prefijos inválidos |
| V-09 | Sin placeholders `![][imageN]` (los números son texto) |
| V-10 | Sin escapes de exportación (backslash antes de `_`, `=`, `-`, …) |
| V-11 | Todo `CREATE TABLE` dentro de un fence etiquetado |
| V-12 | Toda referencia `§` resuelve a una sección existente |
| V-13 | Cadena `prev_hash`/`entry_hash` del ledger |
| V-14 | Ratchet DAT-12: la deuda de FKs simples no crece |
| V-15 | `INDEX.md` sincronizado (`scripts/index.sh`) |
| V-16 | Entradas del ledger append-only (hook `pre-commit` y CI, mismo código; la cabecera sí se corrige) |
| V-17 | Higiene de rutas: sin espacios, sin no-ASCII, sin colisiones case-insensitive |
| V-18 | Front-matter válido, alias `X §N` resuelve dentro de los archivos de ese alias, y todo `*.md` citado existe |
| V-19 | Presupuesto de tamaño: ningún archivo de doctrina pasa de 1000 líneas |
| V-20 | Contrato TDD del ledger: entradas de código con `red/green_run_id`, SHAs reales, `ancestry_verified`, `expected_failure` y `test_ids` que resuelven en un test del monorepo (CAL-07, §13.9) |
| V-21 | Dinero en código: cero `toFixed`/`parseFloat`/`Number` sobre montos y nombres de dinero tipados `number` sin `_cents` (CAL-01, §13.3) |
| V-22 | Cero `UPSERT INTO` / `db.transaction(` en `*.sql`/`*.ts`/`*.svelte` (refuerza V-02/V-04 en el monorepo) |
| V-23 | Cero fork por vertical en componentes Svelte (amplía V-07, ADR-ARCH-002) |
| V-24 | Presupuesto de bundle del POS y zero-dependencia runtime contra `bundle_deps_baseline.json` (CAL-06, §13.8) |

Un `SUITE GREEN` es condición **necesaria pero no suficiente**: los Quality Gates de implementación (Proceso §8.1) exigen además evidencia runtime.

## 6. Skills del proyecto

| Skill | Uso |
|---|---|
| `kipus-task` | Ciclo canónico de una tarea de sprint: contrato → índice → reglas → RED/GREEN → gate → Ledger |
| `kipus-changelog` | Escribir una entrada nueva en `docs/LEDGER.md` (schema v2 + `prev_hash`/`entry_hash` reales) |
| `kipus-rules-registry` | Crear/mover reglas sin huérfanos ni punteros duplicados (validado por V-08) |
| `kipus-verify` | Gate documental completo (V-00..V-24) |
| `kipus-quality-gate` | Quality Gate de implementación: correr `scripts/quality.sh`, umbrales CAL-05 (dominio 95%, adaptadores/apps 70%), size-limit CAL-06 y semgrep CAL-03 sobre el monorepo (§13) |

## 7. Estado de gobernanza

- **`GOV-APROBADO`** (milestone de especificación, entrada 0176; renombre en 0177).
- Los **Quality Gates de implementación** (Proceso §8.1) cierran por sprint con evidencia runtime (RED→GREEN, migración D1, benchmarks) y firma RACI de `A` + `V` independiente; sin evidencia, el gate es `NO-GO`.
- `GOV-APROBADO` no exime los gates runtime.
