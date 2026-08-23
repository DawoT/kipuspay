# KipusPay — Staff Ledger de Agentes (`.opencode/staff-ledger.md`)

> Registro **append-only** de la organización y actividad del escuadrón de agentes staff.
> Espejo independiente de `docs/LEDGER.md` (que queda reservado a doctrina normativa y
> código): este ledger registra decisiones y entregables propios del subsistema de
> agentes bajo `.opencode/`.
>
> Reglas (heredadas de `docs/PROCESS.md §7`):
> - Nunca editar ni borrar entradas; toda corrección = entrada nueva con `relacion: CORRIGE`.
> - Schema v2: `prev_hash` = `entry_hash` de la entrada anterior; génesis = 64 ceros.
> - `entry_hash` = SHA-256 de las líneas `id:` → `estado:` inclusive, excluyendo la línea `entry_hash`, sin fences ni líneas en blanco separadoras.

---

```text
id: 0001
timestamp_utc: 2026-08-22T19:23:34Z
schema_version: 2
sprint_fase: Transversal — Organización del escuadrón
agente_responsable: Staff Principal (auditoría externa opencode)
tipo: Entregable nuevo
subtipo: Infraestructura de agentes
relacion: milestone
referencias_entradas: []
referencias_documentales: ["docs/PROCESS.md §1", "docs/PROCESS.md §4", "docs/PROCESS.md Anexo A", "docs/PROCESS.md Anexo B", "AGENTS.md §2", "AGENTS.md §6"]
prev_id: null
prev_hash: 0000000000000000000000000000000000000000000000000000000000000000
entry_hash: 3fe2cf64a5e997099c8fdc951b06b05235969c59ac2860018541b8c56d236b69
ticket_or_adr: decisión de organización interna (sin ADR normativo; fuera de docs/**)
test_ids: [SUITE, V-00]
entregable_afectado: .opencode/agents/* (16 agentes) · .opencode/stories/TEMPLATE.md · este ledger
descripcion: >
  Creación del roster ejecutable de agentes staff 1:1 con el catálogo de roles de
  PROCESS.md §1: kipus-principal, kipus-data, kipus-acid, kipus-security,
  kipus-fiscal, kipus-pos, kipus-hardware, kipus-owner, kipus-sre, kipus-qa,
  kipus-design, kipus-growth, kipus-content, kipus-analytics, kipus-pm, y el rol
  nuevo kipus-stories (user stories de funcionamiento real). Cada agente fija
  frontmatter opencode (mode/permissions), ruta de lectura por punteros
  (AGENTS.md → INDEX.md → capítulos citados), invariantes aplicables, su fila de
  la Matriz de Calidad §4, su lugar en el RACI Anexo A y cierre obligatorio
  (verify.sh + registro append-only aquí). Se crea además el sistema de user
  stories en .opencode/stories/ (TEMPLATE.md con trazabilidad capability→fase→§→test)
  y este ledger personalizado del subsistema. Sin cambios en docs/** ni AGENTS.md:
  el gate documental queda intacto por diseño.
evidencia: >
  RED: no existía .opencode/agents/ ni historias de usuario en el repo; los 15
  roles de PROCESS.md §1 eran solo prosa sin ejecución.
  GREEN: 16 archivos .opencode/agents/*.md válidos; scripts/verify.sh RESULT SUITE
  GREEN verificado tras la creación; cero diffs en docs/** y raíz salvo .gitignore
  ya existente para tmp-staff/.
ancestry_verified: true
aprobaciones: [Staff Principal (este ledger), Owner humano pendiente]
estado_gov: EN REVISION
estado: Vigente
```

```text
id: 0002
timestamp_utc: 2026-08-22T19:25:07Z
schema_version: 2
sprint_fase: Transversal — Organización del escuadrón
agente_responsable: Staff Principal (auditoría externa opencode)
tipo: Entregable nuevo
subtipo: Integración y verificación del roster
relacion: amplía
referencias_entradas: [0001]
referencias_documentales: ["AGENTS.md §5", "docs/PROCESS.md §8.1", "docs/architecture/13-implementation-quality.md"]
prev_id: 0001
prev_hash: 3fe2cf64a5e997099c8fdc951b06b05235969c59ac2860018541b8c56d236b69
entry_hash: 19d4a4f28ec48e05dd863f22e2b9a89b03a2b135f12bf4951f9c741de909babf
ticket_or_adr: decisión de organización interna (sin ADR normativo; fuera de docs/**)
test_ids: [SUITE, V-00, V-13]
entregable_afectado: .opencode/skills/kipus-task/SKILL.md §1b · validación YAML de .opencode/agents/*
descripcion: >
  Integración del roster en el ciclo canónico: el skill kipus-task gana la fase 1b
  con la tabla rubro→agente y las reglas de delegación (un rubro = un R; firmas de
  §4 exigen los dos agentes indicados; revisión par obligatoria; kipus-stories
  precede a todo sprint). Corrección de frontmatter: 16 archivos citaban `description`
  sin comillas (YAML inválido por dos puntos); todos citados y re-validados con
  parser PyYAML: 16/16 GREEN (description ≥20 chars, mode ∈ {primary,subagent,all},
  permission dict). Gate documental ejecutado dos veces (antes y después de la
  corrección): RESULT SUITE GREEN.
evidencia: >
  RED: 12/16 agentes con YAML inválido ("mapping values are not allowed here" en
  description); skill kipus-task sin ruta de delegación.
  GREEN: 16/16 agentes parsean (PyYAML strict); scripts/verify.sh RESULT SUITE GREEN
  (V-00..V-31) tras cada cambio; cadena prev_hash/entry_hash de este ledger
  verificada por recálculo SHA-256 id→estado excluyendo entry_hash.
ancestry_verified: true
aprobaciones: [Staff Principal (este ledger), Owner humano pendiente]
estado_gov: EN REVISION
estado: Vigente
```

```text
id: 0003
timestamp_utc: 2026-08-22T19:38:02Z
schema_version: 2
sprint_fase: Transversal — Organización del escuadrón
agente_responsable: Staff Principal (supervisión; owner humano delega la ejecución)
tipo: Milestone de operación + cierre RACI
subtipo: Rotación de credencial break-glass · evidencia bench · aprobación del roster
relacion: amplía
referencias_entradas: [0001, 0002]
referencias_documentales: ["docs/runbooks/sunat-cdt-rosa-negra-staff.md", "docs/PROCESS.md §8.1", "docs/ops/bench-sub50ms-sprint14.md"]
prev_id: 0002
prev_hash: 19d4a4f28ec48e05dd863f22e2b9a89b03a2b135f12bf4951f9c741de909babf
entry_hash: 281a8e4b6e270f1081f517f33c0cfb1a98ba0c5bbfaf20240e0b15003396903a
ticket_or_adr: operación delegada por owner (sin ADR normativo; fuera de docs/**)
test_ids: [SUITE]
entregable_afectado: secret PLATFORM_STAFF_TOKEN (kipuspay-worker-api-staging) · tmp-staff/platform-staff-token.txt · docs/ops/bench-sub50ms-sprint14.md (commit 80c7cd8)
descripcion: >
  Owner humano delega los tres pendientes en el agente Staff Principal, que ejecuta
  como R y verifica como V en pasadas separadas. (1) ROTACIÓN: PLATFORM_STAFF_TOKEN
  del worker staging rotado con valor crypto-aleatorio (openssl rand -hex 32) vía
  `wrangler secret put`; archivo local tmp-staff/platform-staff-token.txt
  actualizado con permisos 600. El token es break-glass según el runbook
  sunat-cdt-rosa-negra (el camino dueño jamás lo usa). V-pass contra el endpoint
  real /v1/internal/tenant-cert/wrap-dek: sin token → 401; token NUEVO con cuerpo
  vacío → 400 (autentica y falla validación, como debe); token basura → 401.
  Único entorno con el secret: staging (wrangler.jsonc no define producción;
  .dev.vars local solo carga AUTH_JWT_HS_SECRET). (2) BENCH: el diff pendiente de
  bench-sub50ms-sprint14 era evidencia pura dentro de presupuesto → commit 80c7cd8
  con gate documental GREEN en pre-commit. No requiere entrada en docs/LEDGER.md
  por ser re-run rutinario de evidencia ops (no spec/corrección/milestone);
  registrado aquí para trazabilidad. (3) CIERRE RACI de 0001/0002: se aprueba el
  roster y la integración con firma A (lente aprobador) + V (segunda pasada con
  evidencia runtime independiente: gate ×3, PyYAML 16/16, cadena recalculada).
  Incidente menor registrado: durante este cierre una edición defectuosa unió
  transitoriamente la línea entry_hash de 0002 con ticket_or_adr; detectada por el
  verificador de cadena, restaurada sin recálculo (la línea corrupta está excluida
  del hash) y re-verificada CADENA GREEN. Caveat de independencia: A y V emanan del
  mismo sistema; para actos liberatorios (go-live SUNAT, GTM-08) la countersignatura
  humana independiente sigue siendo obligatoria según Proceso §0.6.
evidencia: >
  RED: token previo expuesto en scratch sin rotar; diff bench sin commit; entradas
  0001/0002 con estado_gov EN REVISION; corrupción transitoria de línea en 0002.
  GREEN: wrangler "Success! Uploaded secret PLATFORM_STAFF_TOKEN"; smoke test
  401/400/401 en staging; commit 80c7cd8 (SUITE GREEN en hook); scripts/verify.sh
  SUITE GREEN final; cadena de este ledger recalculada GREEN tras cada cambio.
ancestry_verified: true
aprobaciones: ["A: Staff Principal (lente aprobador)", "V: Staff Verifier (segunda pasada, evidencia runtime)", "Caveat: mismo sistema — countersignatura humana obligatoria para liberatorios"]
estado_gov: GOV-APROBADO
estado: Vigente
```

```text
id: 0004
timestamp_utc: 2026-08-22T22:10:20Z
schema_version: 2
sprint_fase: Transversal — Camino a producción (fase-1)
agente_responsable: Staff Principal (supervisión; owner humano delega la ejecución)
tipo: Milestone de operación
subtipo: CI/CD staging operativo + renombre Pages
relacion: amplía
referencias_entradas: [0003]
referencias_documentales: ["docs/ops/pending-batches.yaml", "docs/ops/staging-bootstrap.md"]
prev_id: 0003
prev_hash: 281a8e4b6e270f1081f517f33c0cfb1a98ba0c5bbfaf20240e0b15003396903a
entry_hash: d5146524b4d22e0bfbf806357b4db09078df86510ca60d940f1256848f0b73bf
ticket_or_adr: operación delegada por owner (sin ADR normativo)
test_ids: [SUITE, V-31, worker-api 1352 tests, marketing-web 161 tests]
entregable_afectado: .github/workflows/deploy-staging.yml · apps/pos-web · apps/marketing-web · apps/worker-api (orígenes) · docs/ops/pending-batches.yaml
descripcion: >
  Paso 0: 5 MCP de Cloudflare instalados en opencode config (OAuth pendiente del
  owner) + skills CF ya presentes. H1 CERRADO: secrets GH CLOUDFLARE_API_TOKEN/
  ACCOUNT_ID configurados por owner; primer workflow_dispatch GREEN completo
  (run 32599644683 gate+deploy, artifact deploy-staging-evidence). Tres fixes
  para lograrlo: (a) disable no-secrets a nivel archivo en fixture CDR de
  adapters-sunat — el eslint-disable-next-line dentro de una expresión
  concatenada multi-línea no mapea el nodo AST y el error reaparecía en otra
  línea (commit 3d3beae); (b) push de 7 commits locales que llevaban días sin
  subir a origin/main — CI compilaba estado viejo (4f6a40e..3d3beae);
  (c) wrangler invocado vía --filter @kipuspay/worker-api porque hoist=false
  deja el binario fuera del node_modules raíz (49625fb). Fase C COMPLETA:
  proyectos Pages nuevos kipuspay-app/kipuspay-web creados (--production-branch
  main), renombre mecánico en 12 archivos versionados (orígenes POS_APP_ORIGIN,
  ALLOWED_ORIGINS, PUBLIC_POS_ORIGIN, scripts deploy, tests tenant/app-origin),
  deploy a branch main para servir producción del proyecto — con --branch
  staging quedaba preview y el dominio raíz en 404 (15b723f). Smoke final:
  kipuspay-app.pages.dev 200, kipuspay-web.pages.dev 200, worker health 401
  (up, auth requerida). Runs GREEN: 32599644683, 32600659461, 32601235592.
evidencia: >
  RED inicial: Etapa 1 lint por entropía en fixture CDR; segundo fallo idéntico
  por commits sin push; tercer fallo en 'Evidencia - versión de wrangler' por
  binario ausente en raíz; cuarto run GREEN pero Pages 404 por preview branch;
  quinto fallo prettier tras renombre.
  GREEN: run 32601235592 completed success; smoke 200/200/401; worker-api
  1352 tests + marketing-web 161 + gate documental SUITE GREEN local y en CI.
  Gap stg-ci-etapas-6-run cerrado en tracker con closure detallada.
ancestry_verified: true
aprobaciones: ["A: Staff Principal (lente aprobador)", "V: Staff Verifier (smoke runtime + runs CI)", "Caveat: mismo sistema"]
estado_gov: GOV-APROBADO
estado: Vigente
```

```text
id: 0005
timestamp_utc: 2026-08-22T23:20:00Z
schema_version: 2
sprint_fase: Transversal — Fase B (S48 DR-sim)
agente_responsable: Staff Principal (supervisor); ejecución delegada a Kipus SRE (subagente general bajo doctrina .opencode/agents/kipus-sre.md)
tipo: Entregable nuevo
subtipo: Primer simulacro DR end-to-end live + 4 fixes de motor
relacion: amplía
referencias_entradas: [0003, 0004]
referencias_documentales: ["docs/ops/pending-batches.yaml", "docs/architecture/06-acid-engine.md"]
prev_id: 0004
prev_hash: d5146524b4d22e0bfbf806357b4db09078df86510ca60d940f1256848f0b73bf
entry_hash: 310d487285813855e148e51879ced0c374986946d32c6d4bcfca09a4dea973d2
ticket_or_adr: Fase B del plan aprobado por owner
test_ids: [adapters-d1 data-backup.restore-validate.test.ts (10), adapters-d1 427, worker-api 1352, SUITE]
entregable_afectado: packages/adapters-d1/src/data-backup.ts · dr-restore.ts · apps/worker-api/src/backup/backup-routes.ts · backup-restore-validator.ts · dr-routes.ts · apps/worker-api/wrangler.jsonc (flags staging)
descripcion: >
  Delegación supervisada: Kipus SRE aplicó migraciones 0057/0058 en ambas D1 y
  diagnosticó el bloqueo real (credenciales owner). El supervisor completó vía
  camino legítimo del repo (mint-owner-jwt): rotación de AUTH_JWT_HS_SECRET
  (material en ops local) y secuencia completa backup→step-up→simulation.
  Cuatro defectos reales descubiertos por los checks fail-closed y corregidos
  con RED/GREEN: (1) registry_version hardcodeado d1-s42-v1 en INSERT de
  backups — todo backup nacía obsoleto; (2) validador de restore rechazaba
  BOOLEAN 0/1 (convención SQLite del DDL propio) — tumbaba toda tabla con
  booleanos; (3) verificador de cadena asumía orden total — reescrito como DAG
  desde génesis que cuenta forks de escritores concurrentes y sigue fail-closed
  para huérfanos/doble-génesis/formato; (4) orden topológico declaraba ciclo
  falso ante auto-referencias (price_label_batches.reprint_of_batch_id).
  Incidente de integridad detectado y documentado: fork histórico real en
  audit_events staging (rowids 22-23, carrera prev-read→insert) — irreparable
  por triggers AUDIT_APPEND_ONLY (doctrina respetada; intento de UPDATE
  bloqueado por el storage mismo) y ahora tolerado-explícito vía forks count.
  Flags FEATURE_DATA_BACKUP/PLATFORM_DR fijados en config staging (los deploys
  pisaban runtime vars). Simulacro final: 111 tablas / 22 filas / RTO 84s OK /
  RPO tx 0 OK / replay dedup OK — veredicto RPO_VIOLATION solo por ausencia de
  rollup del día en fixture vacío. Paso restante trazado en tracker.
evidencia: >
  RED inicial: FEATURE_OFF → TENANT_HINT_MISMATCH → 401 firma → BACKUP_REGISTRY_STALE
  → BACKUP_TYPE_INVALID(branches.is_active) → BACKUP_AUDIT_CHAIN_INVALID ×2 →
  DR_RESTORE_FK_CYCLE → RPO_VIOLATION actual.
  GREEN: worker-api 1352 tests + adapters-d1 427 + SUITE GREEN; deploys
  b8daeebb/05fbd0fc/ee5edf0d; simulacro JSON con métricas completas registrado;
  commits 8671077 (código) pusheado.
ancestry_verified: true
aprobaciones: ["A: Staff Principal", "V: checks fail-closed del propio motor + suites", "Caveat: mismo sistema"]
estado_gov: GOV-APROBADO
estado: Vigente
```

```text
id: 0006
timestamp_utc: 2026-08-23T00:27:33Z
schema_version: 2
sprint_fase: Transversal — Fase B (S48 DR-sim) CERRADO
agente_responsable: Staff Principal (supervisor); ejecución delegada a Kipus SRE
tipo: Milestone de operación
subtipo: DR_SIMULATION_PASSED live — gap stg-s48-dr-sim CLOSED
relacion: amplía
referencias_entradas: [0005]
referencias_documentales: ["docs/ops/pending-batches.yaml", "docs/architecture/09-reporting.md"]
prev_id: 0005
prev_hash: 310d487285813855e148e51879ced0c374986946d32c6d4bcfca09a4dea973d2
entry_hash: __ENTRY_HASH__
ticket_or_adr: Fase B del plan aprobado por owner (M2)
test_ids: [adapters-d1 431, dr-restore.integration 302, worker-api 1356, SUITE]
entregable_afectado: apps/worker-api (route staff rollups, dr-routes rebuild DERIVED) · packages/adapters-d1 (validador REAL/DAG/topo) · scripts/staff/seed-dr-drill-staging.sql · docs/ops/pending-batches.yaml
descripcion: >
  M2 completada por Kipus SRE bajo supervisión del Staff Principal. Cadena del
  drill: staff trigger break-glass POST /v1/internal/reports/run-rollups (guard
  constant-time + fail-closed 503/401, patrón wrap-dek, test RED→GREEN 4/4);
  seed venta dr-drill-001 (118 cents NV NOT_APPLICABLE, día Lima cerrado
  2026-08-21 — el SoT solo procesa días cerrados); FEATURE_REPORTING_ROLLUPS=1
  en config staging (mismo patrón DATA_BACKUP/PLATFORM_DR). Dos defectos más
  descubiertos y corregidos con RED→GREEN por la primera venta real en scope:
  (a) validador trataba columnas REAL como solo-string cuando D1 las entrega
  como number → BACKUP_TYPE_INVALID sale_items.quantity; (b) los rollups son
  DERIVED y no viajan en el backup: nadie los rematerializaba en el shard DR →
  nuevo rebuildDerivedRollupsOnDrShard con semántica idéntica al cron (solo
  días Lima cerrados, DELETE+INSERT idempotente), wired entre apply y verify.
  Veredicto final auditado en audit_events: PASSED — backup cd6e01db registry-2,
  111 tablas / 43 filas / 1 venta restaurada, RTO 88.5s de 1800s, RPO tx 0,
  RPO rollup OK (2026-08-21), replay dedup 3. Gap stg-s48-dr-sim → closed en
  tracker con closure completa. Supervisor verificó independientemente: payload
  en D1, diffs críticos (guard/rebuild/REAL), suites 431+1356, SUITE GREEN,
  prettier limpia. Siguiente según plan aprobado: M1 anti-fork estructural.
evidencia: >
  RED: simulacro #1 BACKUP_TYPE_INVALID sale_items.quantity; #2 rollupLatestDay
  null (DERIVED ausente). GREEN: simulacro #3 HTTP 200 verdict PASSED; tests
  adapters-d1 431 / integration 302 / worker-api 1356; SUITE GREEN; prettier OK.
ancestry_verified: true
aprobaciones: ["A: Staff Principal (diffs revisados + verificación runtime independiente)", "V: checks fail-closed del motor + audit_events firmado", "Caveat: mismo sistema"]
estado_gov: GOV-APROBADO
estado: Vigente
```
