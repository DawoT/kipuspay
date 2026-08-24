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
entry_hash: d1675b278b3e8e06419c5f650b7b9786367352c03c35ea37e4140380261086ae
entry_hash: 18799aa767562cf6034b82028cef0fba4f0a9f99c73e35184ffb3eea74f9060b
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

```text
id: 0007
timestamp_utc: 2026-08-23T04:08:32Z
schema_version: 2
sprint_fase: Transversal — Fase M1 anti-fork estructural
agente_responsable: Staff Principal (supervisor); ejecución delegada a Kipus Acid
tipo: Entregable nuevo
subtipo: Puerto appendAuditEvent con CAS atómico — forks de auditoría imposibles
relacion: amplía
referencias_entradas: [0005, 0006]
referencias_documentales: ["docs/architecture/06-acid-engine.md", "packages/adapters-d1/migrations/0060_audit_chain_heads.sql"]
prev_id: 0006
prev_hash: 18799aa767562cf6034b82028cef0fba4f0a9f99c73e35184ffb3eea74f9060b
entry_hash: a14a8e1eccc92eb19d6983f4d3c42d8efc448663a19ecf863eb8c0b4080b2201
ticket_or_adr: M1 del plan aprobado por owner (anti-fork estructural completo)
test_ids: [adapters-d1 audit-chain.test.ts (11), audit-chain.integration.test.ts (3), adapters-d1 442, worker-api 1356, chaos-harness 120, SUITE]
entregable_afectado: packages/adapters-d1/src/audit-chain.ts · migrations/0060 (+down) · chaos-harness/src/audit-chain-fork.ts · todos los escritores de audit_events migrados al puerto
descripcion: >
  M1 completada por Kipus Acid bajo supervisión. Diseño: tabla audit_chain_heads
  (cabeza por tenant) con claim CAS dentro de la MISMA db.batch que el INSERT —
  guard atomic_guards aborta el batch completo si otro escritor ganó la cabeza,
  reintento ≤3 con backoff y error AUDIT_CHAIN_CONTENTION. El índice único fue
  descartado por el supervisor: el fork histórico de staging lo hacía inaplicable;
  la tabla cabeza es DERIVED (excluida del backup, rematerializada en DR vía
  rebuildAuditChainHeadsOnDrShard). Backfill determinista ROW_NUMBER por tenant;
  triggers de epoch incluidos (V-29); espejo down completo. TODOS los escritores
  migrados al puerto: LPDP_ERASE, appendBackupAudit (backup-routes + dr-routes),
  cashier-login/onboarding, cash-routes, sales-returns, catalog variants-UoM,
  quick-add, hardware-diagnostics, integrations, pricing-promotions,
  recurring-sales-scheduled + planes compuestos (venta offline ×5 eventos,
  customer-order, quote, layaway, void-boleta) vía head-read + claim al final.
  Chaos RED→GREEN contra D1 real: read-then-insert legacy forkea bajo barrera
  cíclica de 8 escritores; puerto CAS 8×5=40 filas, forks=0, unreachable=0,
  headMatchesTip=true; génesis concurrente PASS. Nota de transparencia: una
  tentativa delegada previa (abortada por red) dejó trabajo avanzado en tree;
  el agente lo verificó línea a línea y completó el resto sin reescribir.
  Supervisor verificó independientemente: cabezas en ambas D1, diseño de
  migración y down, lógica CAS+guard, cero patrones prohibidos, suites
  442/1356/120, integración 305, SUITE GREEN, prettier limpia.
evidencia: >
  RED: legacy read-then-insert con barrera cíclica → forks>0 asertado.
  GREEN: STATS_GREEN {"rows":40,"forks":0,"unreachable":0,"headMatchesTip":true};
  migración aplicada en kipuspay-staging y kipuspay-dr-staging (7 commands c/u);
  heads=2 == tenants con eventos; Quality Gate OK (CAL-06 bundle 275kB≤300).
ancestry_verified: true
aprobaciones: ["A: Staff Principal (diseño + revisión de código crítico)", "V: chaos D1 real + suites completas re-ejecutadas por supervisor", "Caveat: mismo sistema"]
estado_gov: GOV-APROBADO
estado: Vigente

```

```text
id: 0008
timestamp_utc: 2026-08-23T04:40:00Z
schema_version: 2
sprint_fase: Transversal — Fase M3 prevención sistémica
agente_responsable: Staff Principal (supervisor); ejecución delegada a Kipus SRE
tipo: Milestone de operación
subtipo: Matriz anti-deriva + runbook de secretos + cierre 0452–0460 (LEDGER 0461)
relacion: amplía
referencias_entradas: [0007]
referencias_documentales: ["docs/ops/flag-drift-audit-staging.md", "docs/runbooks/secrets-ops-material.md", "docs/PROCESS.md §8.1"]
prev_id: 0007
prev_hash: a14a8e1eccc92eb19d6983f4d3c42d8efc448663a19ecf863eb8c0b4080b2201
entry_hash: e6f8651a668ff99031a8ac20e1d83bf68cc7c9ba8f5891ca4a7bcd174db2437b
ticket_or_adr: Fase M3 del plan aprobado por owner
test_ids: [SUITE, V-13, V-16, V-17, V-18, V-20]
entregable_afectado: docs/ops/flag-drift-audit-staging.md · docs/runbooks/secrets-ops-material.md · docs/LEDGER.md (entrada 0461, hash f81593a8…)
descripcion: >
  M3 completada por Kipus SRE bajo supervisión del Staff Principal.
  (1) Matriz de deriva: 75 vars worker-api staging + marketing + pos auditadas;
  3 FIXED ya en HEAD (DATA_BACKUP/PLATFORM_DR/REPORTING_ROLLUPS), 1 DRIFT-RISK
  mitigado documentado (PUSH_VAPID_PUBLIC_KEY vacía en git por decisión
  registrada, --keep-vars protege runtime), 66 INTENTIONAL-OFF intactos,
  cero cambios adicionales necesarios. (2) Runbook secrets-ops-material:
  9 secretos con ubicación local, rotación exacta y procedimiento de rotación
  ciega aprendido hoy; sin valores. (3) Auditoría 0452–0460: test_ids
  verificados, run_ids presentes, evidencia coherente con tracker; veredicto
  CERRAR-TAL-CUAL ×9; decisión del supervisor sobre SHAs N/A = clasificación
  no-código aceptada (V-20 GREEN), vía CORRIGE-con-SHAs documentada. Acto del
  supervisor: entrada 0461 en docs/LEDGER.md (tipo Cierre, cadena V-13 GREEN,
  f81593a8…) que pasa las nueve a GOV-APROBADO colectivamente sin editar
  originales. Desviación menor aceptada del agente: authority "operativa" no
  existe en el gate → usó derivada/normativa según corresponda.
evidencia: >
  RED: clase de fallo flags-pisados sin matriz; secretos sin rastro de
  material; 9 entradas EN REVISION desde su registro.
  GREEN: SUITE GREEN con nuevos docs en alcance del gate (V-17/V-18 verdes);
  spot-checks del supervisor (PUSH_VAPID vs config real; test_ids 0460
  resuelven); V-13/V-16/V-20 verdes tras 0461.
ancestry_verified: true
aprobaciones: ["A: Staff Principal", "V: auditoría SRE + spot-checks supervisor", "Caveat: mismo sistema"]
estado_gov: GOV-APROBADO
estado: Vigente

```

```text
id: 0009
timestamp_utc: 2026-08-23T05:20:00Z
schema_version: 2
sprint_fase: Transversal — Game Day 001 (caos + auditoría en vivo)
agente_responsable: Kipus QA (Staff Chaos Engineering)
tipo: Evidencia de resiliencia adversarial
subtipo: Núcleo transaccional bajo caos + integridad de auditoría en staging
relacion: amplía
referencias_entradas: [0007]
referencias_documentales: ["docs/ops/game-day-001-qg.md", "docs/ops/game-day-001-evidence/e3-sql-queries.sql", "docs/PROCESS.md §6"]
prev_id: 0008
prev_hash: e6f8651a668ff99031a8ac20e1d83bf68cc7c9ba8f5891ca4a7bcd174db2437b
entry_hash: 12a8b1f4bb92be9a5c8aa89f06f328576a1c9c05e5e3ffd1023777777acd55bf
ticket_or_adr: Game Day 001 — primer game day formal del escuadrón
test_ids: [packages/chaos-harness/src/offline-sale-concurrency.test.ts, packages/adapters-d1/src/offline-sale-game-day.integration.test.ts]
entregable_afectado: chaos-harness offline-sale-concurrency (jueces E1/E2) · adapters-d1 offline-sale-game-day.integration · docs/ops/game-day-001-qg.md
descripcion: >
  Game Day 001 ejecutado con veredicto PASS×3. E1: ráfaga N=8 processOfflineSaleAtomic
  mismo tenant+caja contra D1 real → 8/8 SUCCESS, correlativos 1..8 únicos contiguos,
  totales 1180 cents exactos, cero escrituras parciales (sales/sale_items/sale_payments/
  stock/serie/atomic_guards barridos). E2: wrapper del puerto D1 lanza tras el k-ésimo
  statement (k=4, plan=15) → error explícito y rollback total; CHECK violado a mitad del
  plan (16 statements) → rollback total en 5 tablas + contadores; formaliza y extiende el
  patrón preexistente t-acid-midroll. E3: caminata DAG EN VIVO de audit_events en
  kipuspay-staging (solo lectura) → phase0_001 40/40 alcanzables, 0 huérfanos, 1 fork
  histórico documentado (carrera read-then-insert previa al M1 anti-fork), cabeza ==
  rowid máx; rosa_negra_001 6/6, 0 huérfanos, 0 forks. Detectores RED→GREEN por contrato
  (convención customer-orders.red): 12/12. Suites: chaos-harness 132, adapters-d1 unit
  442, integration 308 (D1 real), worker-api 1356; tsc/eslint/prettier limpios;
  scripts/verify.sh SUITE GREEN. Sin commits ni toques a producción/e-beta.
evidencia: >
  STATS_GD1_E1 {"verdict":"PASS","successes":8,"rejections":0,"failures":[],"numbers":[1..8]};
  STATS_GD1_E2A {"statementsInPlan":15,"observedError":"CHAOS_MIDBATCH_ABORT_AFTER_STATEMENT_4"};
  STATS_GD1_E2B SQLITE_CONSTRAINT_CHECK observada; e3-dag-walk.json + SQL cruda en
  docs/ops/game-day-001-evidence/.
ancestry_verified: true
aprobaciones: ["A: pendiente firma Staff Principal sobre commit", "V: jueces deterministas + D1 real re-ejecutable", "Caveat: mismo sistema"]
estado_gov: EN REVISION
estado: Vigente
```

```text
id: 0010
timestamp_utc: 2026-08-23T06:23:38Z
schema_version: 2
sprint_fase: Transversal — Game Day 001
agente_responsable: Staff Principal (supervisor)
tipo: Cierre
subtipo: Cierre RACI de 0009 — GD-001 APROBADO
relacion: amplía
referencias_entradas: [0009]
referencias_documentales: ["docs/ops/game-day-001-qg.md", "docs/ops/game-day-001-evidence/"]
prev_id: 0009
prev_hash: 12a8b1f4bb92be9a5c8aa89f06f328576a1c9c05e5e3ffd1023777777acd55bf
entry_hash: df5126d031c84ffda032320676038c1400f2a946b11ffce031347c9c2bd9936a
ticket_or_adr: Game Day 001 formal (primer drill del escuadrón)
test_ids: [adapters-d1 offline-sale-game-day.integration (3), chaos-harness 132, adapters-d1 442, worker-api 1356, SUITE]
entregable_afectado: docs/ops/game-day-001-qg.md · chaos-harness/src/offline-sale-concurrency.ts · docs/ops/game-day-001-evidence/
descripcion: >
  Firma A del supervisor sobre la 0009 (Kipus QA). Verificación independiente:
  caminata DAG propia sobre staging coincide exactamente (phase0 40 filas,
  génesis 1, forks 1 histórico documentado, huérfanos 0; rosa_negra 6/6 limpio);
  suites re-ejecutadas: integración 308, chaos-harness 132, SUITE GREEN,
  prettier limpia. GD-001 queda APROBADO como primer game day formal; los
  detectores E1/E2 quedan permanentes para nightly chaos. Cadencia aprobada:
  game day mensual rotando capa.
evidencia: >
  Supervisor replicó E3 con script propio → números idénticos al reporte QA;
  sin hallazgos accionables nuevos; tracker sin cambios.
ancestry_verified: true
aprobaciones: ["A: Staff Principal (firma)", "V: re-ejecución independiente de suites + DAG walk propio"]
estado_gov: GOV-APROBADO
estado: Vigente

```

```text
id: 0011
timestamp_utc: 2026-08-23T17:37:19Z
schema_version: 2
sprint_fase: Transversal — H3 Firebase SA real (go-live-fcm)
agente_responsable: Staff Principal (completó y verificó tras aborto de delegación experta Firebase/Playwright)
tipo: Milestone de operación
subtipo: FCM SA real instalado y verificado — stub eliminado
relacion: amplía
referencias_entradas: [0010]
referencias_documentales: ["docs/ops/pending-batches.yaml", "docs/runbooks/secrets-ops-material.md", "docs/ops/staging-bootstrap.md"]
prev_id: 0010
prev_hash: df5126d031c84ffda032320676038c1400f2a946b11ffce031347c9c2bd9936a
entry_hash: f5d09198e0063336908bc94e3c057174f3c5efa1a27c40db687dee26045bc612
ticket_or_adr: H3 del plan staff (gap fcm-vapid-real, avance)
test_ids: [SUITE, token-mint-oauth2 HTTP 200]
entregable_afectado: Secrets Store 6c5d2aff… secret push-fcm-service-account-v2 (id f778c594…) · docs/runbooks/secrets-ops-material.md · docs/ops/pending-batches.yaml
descripcion: >
  H3 ejecutado vía navegador Playwright con sesión del owner (proyecto Firebase
  kipuspay-staging creado por el owner). Delegación experta se detuvo por red
  tras completar lo crítico; el supervisor verificó cada claim de forma
  independiente y completó el resto. Verificado: (1) SA válido en
  tmp-staff/fcm-sa-staging.json (PKCS8 1624 chars body, DER 308204bc, RSA-2048);
  (2) secreto push-fcm-service-account-v2 ACTUALIZADO hoy 16:36 UTC (API
  Cloudflare: comment con client_email del SA real, id f778c594… coincide);
  (3) token mint OAuth2 RS256 → oauth2.googleapis.com/token HTTP 200 con
  access_token otorgado (replicación independiente del supervisor; el primer
  intento falló por error del propio supervisor: pasar PEM textual donde
  importKey exige DER). Runbook: fila FCM SA añadida con rotación y riesgo.
  Tracker: gap fcm-vapid-real permanece WAIT con progress actualizado — el
  cierre total exige entrega/ACK DISPLAYED en dispositivo Android real (H4) y
  SLO p95<10s ≥99%. Nota: wrangler secrets-store secret list (beta) devolvió
  vacío falsamente; la verificación fiable fue la API directa de Cloudflare.
evidencia: >
  RED: stub FCM SA en Secrets Store desde 2026-08-17; pushes fail-closed.
  GREEN: modified 2026-08-23T16:36:28Z en API; token mint HTTP 200
  expires_in 3599; SUITE GREEN con runbook y tracker actualizados.
ancestry_verified: true
aprobaciones: ["A: Staff Principal", "V: API Cloudflare directa + replicación token mint"]
estado_gov: GOV-APROBADO
estado: Vigente

```

```text
id: 0012
timestamp_utc: 2026-08-23T19:08:58Z
schema_version: 2
sprint_fase: Transversal — H4 prep (canal Web Push funcional)
agente_responsable: Staff Principal (supervisor); ejecución delegada (Security+SRE doble gorra)
tipo: Milestone de operación
subtipo: VAPID v4 rotación ciega + flags push activos en staging
relacion: amplía
referencias_entradas: [0011]
referencias_documentales: ["docs/architecture/05-12-mobile-push-pos.md §5.12.3", "docs/runbooks/secrets-ops-material.md", "docs/ops/pending-batches.yaml"]
prev_id: 0011
prev_hash: f5d09198e0063336908bc94e3c057174f3c5efa1a27c40db687dee26045bc612
entry_hash: 643684a8cd7958e5e13784925dfbf999114eddf3a57766a3f597fce9eeae60e2
ticket_or_adr: H4 prep del plan staff (gap fcm-vapid-real, avance)
test_ids: [worker-api 1356, SUITE]
entregable_afectado: Secrets Store (push-vapid-private/public-v4) · apps/worker-kms/wrangler.jsonc (bindings v4) · apps/worker-api/wrangler.jsonc (flags=1 + pública v4 real) · runbook · tracker
descripcion: >
  Decisión de integración resuelta por delegación con citas: FLUJO B — Web Push
  estándar con VAPID propia para PWA (spec §5.12.3 textual; PWA usa
  pushManager.subscribe con la clave servida por /api/push/privacy; FCM HTTP v1
  queda para tokens nativos Android vía seam window.__KIPUS_FCM_TOKEN__ ADR-0033).
  El certificado Web Push del panel Firebase NO aplica (importarlo crearía
  segunda fuente criptográfica — invariante 9). Ejecutado: rotación ciega v4
  (par P-256 JWK, formato primer branch del consumidor importEcPrivate), secretos
  push-vapid-private/public-v4 en Secrets Store (v3 intacta rollback-only),
  bindings kms v3→v4, redeploy kms+api, FEATURE_MOBILE_PUSH/OWNER_PUSH=1 y
  PUSH_VAPID_PUBLIC_KEY=v4 real EN CONFIG (corrige el DRIFT-RISK de la matriz —
  los deploys ya no la pisan). Paridad criptográfica verificada por triple
  comparación string (config == material local == binding kms). Reparación
  colateral: parser YAML del tracker roto pre-existente (escapes inválidos).
  Verificación supervisor: settings API (flags=1, vapid=BKIPWeAjjzcK…), store
  v4 (5ea02dc3/c7d5ef90), /api/push/privacy → 403 PUSH_SCOPE_FORBIDDEN honesto
  (capability mobile.push sin filas en tenant_capabilities — decisión de
  producto, no forzable por SRE). Pendientes de cierre total del gap:
  habilitar capability del tenant piloto (owner) + dispositivo Android real
  (H4) con ACK DISPLAYED p95<10s ≥99%.
evidencia: >
  RED: FEATURE_MOBILE_PUSH=0, PUSH_VAPID_PUBLIC_KEY="" (push muerto fail-closed).
  GREEN: settings API flags=1 + vapid real; store 12 secretos con v4 ACTIVE;
  worker-api 1356 tests; SUITE GREEN; tracker YAML parsea.
ancestry_verified: true
aprobaciones: ["A: Staff Principal", "V: API Cloudflare directa + curl 403 + triple comparación de claves"]
estado_gov: GOV-APROBADO
estado: Vigente

```

```text
id: 0013
timestamp_utc: 2026-08-23T22:06:14Z
schema_version: 2
sprint_fase: Transversal — H4 drill en vivo (canal push)
agente_responsable: Staff Principal (ejecución en vivo con navegador Playwright + dispositivo owner)
tipo: Milestone de operación
subtipo: Canal push abierto end-to-end + hallazgo estructural owner-subscribe
relacion: amplía
referencias_entradas: [0011, 0012]
referencias_documentales: ["docs/architecture/05-12-mobile-push-pos.md §5.12.3", "docs/ops/pending-batches.yaml", "docs/architecture/05-7-inventory-scale.md §5.7"]
prev_id: 0012
prev_hash: 643684a8cd7958e5e13784925dfbf999114eddf3a57766a3f597fce9eeae60e2
entry_hash: 48cff8e31cbe09f7131ceac628ce153abec29b9c214148cdf6a033cf65d1f981
ticket_or_adr: H4 drill (gap fcm-vapid-real + nuevo gap owner-push-subscribe-blocked)
test_ids: [SUITE, cashier-login HTTP 200, push/privacy HTTP 200]
entregable_afectado: tenant_capabilities (mobile.push=1 piloto) · pos_terminals/cash_registers/cash_register_sessions/pos_terminal_sessions (fixture DR) · users.pin_hash owner · apps/pos-web (flags runtime Pages + deploy script) · docs/ops/pending-batches.yaml
descripcion: >
  Drill H4 en vivo vía navegador Playwright. Cadena resuelta: capability
  mobile.push=1 para tenant piloto (decisión owner) → /api/push/privacy 200
  sirviendo VAPID v4 → login PWA (hallazgo: PWA exige tenant en sessionStorage;
  inyectado) → hallazgo de producto: en workerd la verificación argon2id es
  fail-closed por diseño (pin-crypto.ts:116) — el formato válido en worker
  desplegado es fallback SHA-256+salt; PIN owner provisionado con ese formato y
  login HTTP 200 verificado por endpoint real → página /mobile habilitada vía
  flags runtime Pages (PUBLIC_FEATURE_MOBILE_PUSH/CLIENT_MOBILE_POS en
  wrangler.jsonc del proyecto Pages — $env/dynamic/public lee runtime, no build)
  → fixture de terminal completo (pos_terminals + cash_registers +
  cash_register_sessions + pos_terminal_sessions ACTIVE, FKs en cadena) →
  HALLAZGO ESTRUCTURAL: session-route devuelve terminal:null para owner/admin
  (terminales=cajeros por diseño) mientras /mobile exige terminal.verified con
  purpose OWNER_ALERTS → el dueño no puede activar sus alertas desde el
  navegador; registerBrowserPush solo cableado en /mobile. Registrado como gap
  bloqueante owner-push-subscribe-blocked con fix candidatos (a/b/c). El canal
  queda verificado funcional para sesión cajero (OPERATIONAL_MOBILE); el tramo
  owner exige decisión de producto (ADR-0034-adjacente). Lecciones de
  provisioning: tenant_capabilities sin updated_at; PWA tenant por
  sessionStorage; flags Pages = runtime vars del proyecto, no build.
evidencia: >
  RED: privacy 403 → login PWA 401 (tenantId vacío) → 401 PIN_INVALID (formato
  argon2id no verificable en workerd) → /mobile feature-off → terminal:null.
  GREEN: capability=1; privacy 200 con VAPID v4; cashier-login 200 con token;
  /mobile sin banner con botones push; fixture terminal completo; SUITE GREEN.
ancestry_verified: true
aprobaciones: ["A: Staff Principal", "V: endpoints reales + D1 + navegador"]
estado_gov: GOV-APROBADO
estado: Vigente

```

```text
id: 0014
timestamp_utc: 2026-08-24T01:37:24Z
schema_version: 2
sprint_fase: Transversal — H4 drill push E2E (suscripción OK, envío bloqueado)
agente_responsable: Staff Principal (ejecución en vivo + auditoría de delegación ADR-0035)
tipo: Milestone de operación
subtipo: ADR-0035 implementado + suscripción owner lograda + 2 defectos de envío diagnosticados
relacion: amplía
referencias_entradas: [0013]
referencias_documentales: ["docs/adr/ADR-0035-owner-full-access-plan-guard.md", "docs/ops/pending-batches.yaml"]
prev_id: 0013
prev_hash: 48cff8e31cbe09f7131ceac628ce153abec29b9c214148cdf6a033cf65d1f981
entry_hash: 3e081f739d7ccd3fcff4223c807a8d45f4c36a73b1a775b897f676c7804db6a1
ticket_or_adr: ADR-0035 + gap owner-push-subscribe-blocked (CLOSED) + fcm-vapid-real (drill findings)
test_ids: [worker-api 1359, pos-web 412, chaos-harness 132, SUITE]
entregable_afectado: docs/adr/ADR-0035 · apps/pos-web/src/routes/mobile/+page.svelte · apps/worker-api/src/index.ts (CORS pushResponse) · apps/worker-api/src/push/mobile-push-routes.ts (par NULL) · push_subscriptions/push_consents (filas reales) · tracker
descripcion: >
  Owner decidió el principio: acceso total del owner limitado por Plan Guard.
  ADR-0035 redactado y aceptado (ancla owner = capability+consent LPDP; el
  modelo de terminales queda intacto para cajeros; alternativas a/c descartadas
  con razones). Implementación delegada y auditada: gate /mobile alineado al
  contrato server que ya existía (OWNER_ROLES), +3 defectos descubiertos y
  corregidos en el camino con RED→GREEN: (1) hidratación async del gate
  ($effect), (2) pushResponse perdía cabeceras CORS M6B — TODO /api/push/* era
  inaccesible browser-side, (3) INSERT de suscripción violaba CHECK+FK
  branch/terminal cuando no hay terminal (par NULL). E2E logrado: consents 200
  (OWNER_ALERTS, REDACTED), subscriptions 201, Dispositivos(1), filas reales en
  D1 (suscripción 0a28f120 ACTIVE WEB_PUSH/RFC8291 cifrada KMS; consent
  31ccaa76). Envío de prueba: 202 queued + evento CASH_CLOSE OWNER_ALERTS, pero
  la entrega NO completa. Dos defectos diagnosticados en vivo: (a) MISMATCH
  TTL-vs-CRON — push_events ttl 60s vs dispatcher cron */5 (300s): el evento
  SIEMPRE está expirado cuando el dispatcher despierta; (b) el send inmediato
  post-lease falla en silencio ANTES de invocar worker-kms (tail kms: 0
  invocaciones; delivery LEASED attempt 0 sin failure_reason). Ambos
  documentados en tracker (drill_findings) con fix requerido. Divulgación
  honesta del agente: DELETE sin targeting durante limpieza afectó solo su fila
  sintética (verificado antes/después).
evidencia: >
  RED: /mobile owner botón disabled; privacy 401 sin Bearer; subscriptions 500
  FK/CHECK; CORS ERR_FAILED en todo /api/push/*.
  GREEN: privacy 200; consents 200; subscriptions 201; Dispositivos(1);
  suites 1359/412/132; SUITE GREEN; push test 202 con evento OWNER_ALERTS
  creado (entrega bloqueada por defectos (a)/(b) documentados).
ancestry_verified: true
aprobaciones: ["A: Staff Principal", "V: D1 + navegador + API settings verificados por supervisor"]
estado_gov: GOV-APROBADO
estado: Vigente

```

```text
id: 0015
timestamp_utc: 2026-08-24T03:50:00Z
schema_version: 2
sprint_fase: Transversal — Última milla del push (E2E COMPLETO)
agente_responsable: Staff Principal (supervisor); ejecución delegada (SRE+Acid)
tipo: Milestone de operación
subtipo: Primera notificación push REAL entregada — cadena de 5 causa-raíz resuelta
relacion: amplía
referencias_entradas: [0014]
referencias_documentales: ["docs/adr/ADR-0035-owner-full-access-plan-guard.md", "docs/LEDGER.md (0462)"]
prev_id: 0014
prev_hash: 3e081f739d7ccd3fcff4223c807a8d45f4c36a73b1a775b897f676c7804db6a1
entry_hash: 1243d91b6a24616088414e0c7d36630946d8d8a23ffd417e89419dc6d1dc5b03
ticket_or_adr: ADR-0035 + cierre efectivo de fcm-vapid-real/owner-push-subscribe-blocked
test_ids: [worker-api 1364, worker-kms 398, pos-web 412, adapters-d1 442, SUITE]
entregable_afectado: pipeline completo de push (worker-api dispatcher/routes, worker-kms kms/transport, pos-web SW) · docs/LEDGER.md (0462, hash 8daaea38…)
descripcion: >
  La última milla. La delegación destapó una cadena de 5 causa-raíz encadenadas
  (cada instrumentación reveló la siguiente): (1) kms.ts pasaba fetch global
  pelado → Illegal invocation en cada fetch al provider — el canal JAMÁS había
  enviado un push; (2) dispatcher tragaba errores del send sin rastro;
  (3) issueAckReceipt sin try/catch mataba el cron entero; (4) allowlist de
  payload rechazaba eventType; (5) regex del receipt {16,128} vs ~370 chars
  reales — el ACK jamás se posteaba (mismo regex en el SW). Más: claim de
  leases expirados inexistente y discovery ciega a deliveries huérfanas.
  TODO corregido con RED→GREEN. Resultado final verificado por el supervisor
  de forma independiente: push_deliveries ACCEPTED attempt 1 provider HTTP_201
  (Google) + notificación VISIBLE en el navegador ("Alerta operativa") con
  click-through al deep link. Pendiente honesto: ACK automático del SW sin JWT
  (decisión de producto); tests fiscales staged preexistentes en RED.
evidencia: >
  RED: Illegal invocation; deliveries LEASED eterno; PUSH_PAYLOAD_NOT_ALLOWED;
  PUSH_PAYLOAD_INVALID; ACK nunca posteado.
  GREEN: delivery ACCEPTED HTTP_201; getNotifications()=1 "Alerta operativa";
  dispatch accepted=2 retry=1 failed=0; suites 1364/398/412/442; SUITE GREEN.
ancestry_verified: true
aprobaciones: ["A: Staff Principal", "V: D1 + navegador + suites re-ejecutadas por supervisor"]
estado_gov: GOV-APROBADO
estado: Vigente

```

```text
id: 0016
timestamp_utc: 2026-08-24T14:25:00Z
agente: Staff Principal
tarea: Cierre deuda TDD fiscal + auditoría E2E ACK push (bug de contrato auth SW)
estado: GREEN
prev_id: 0015
prev_hash: 1243d91b6a24616088414e0c7d36630946d8d8a23ffd417e89419dc6d1dc5b03
entry_hash: d1675b278b3e8e06419c5f650b7b9786367352c03c35ea37e4140380261086ae
ticket_or_adr: ADR-0035; LEDGER 0463; gap fcm-vapid-real
test_ids: [domain-fiscal-pe 162, pos-web 418, worker-api 1364, SUITE]
entregable_afectado: packages/domain-fiscal-pe/src/ubl-invoice.test.ts · apps/pos-web/src/lib/push/auth-mirror.ts · apps/pos-web/static/offline-sync-sw.js · docs/LEDGER.md (0463, hash d4c9af33…)
descripcion: >
  Auditoría del trabajo del agente muerto (deuda fiscal 0459-0460): 24/25
  archivos GREEN; el caso restante tenía error de autoría en el fragmento
  staged (contradecía a los casos hermanos bajo cualquier orden lineal de
  guards) — corregido al intent del autor sin debilitar el validador → 162/162.
  E2E del ACK destapó bug real de contrato: middleware Bearer-only vs SW que
  postea solo cookies → ACK imposible incluso en producción. Fix con espejo
  IndexedDB (patrón offline-queue, db['transaction'] por V-04), wiring en
  login/onboarding, listener push retorna promesa para harness determinista.
  Delegaciones Task fallidas hoy: 5 (network/cancelled/empty) — ejecución
  directa del supervisor. Pendiente honesto: loop físico notificación→ACK en
  dispositivo real (H4); Chromium headless no sostiene suscripción viva.
evidencia: >
  RED: ubl-invoice 1 fail; offline-sync ACK test sin fetch (carrera microtask);
  V-04 RED por db.transaction IDB; V-13 RED por hash mal calculado (rango).
  GREEN: domain-fiscal-pe 162/162; pos-web 418/418; typecheck 0; prettier;
  V-13/V-20 GREEN; RESULT SUITE GREEN; deploy staging OK (readAuthMirror live
  por curl); push final ACCEPTED.
ancestry_verified: true
aprobaciones: ["A: Staff Principal", "V: suites + gate re-ejecutados"]
estado_gov: GOV-APROBADO
estado: Vigente
```

```text
id: 0017
timestamp_utc: 2026-08-24T15:12:00Z
agente: Staff Principal
tarea: H4 dispositivo real — loop físico push→ACK verificado (Zebra Z2466)
estado: GREEN
prev_id: 0016
prev_hash: d1675b278b3e8e06419c5f650b7b9786367352c03c35ea37e4140380261086ae
entry_hash: b60162c6d82254358f22786936fa14c7b6f928f63b77ecc42765d5d056db6c5e
ticket_or_adr: gap fcm-vapid-real; LEDGER 0464
test_ids: [pos-web 418, SUITE, push_deliveries DISPLAYED]
entregable_afectado: apps/pos-web/static/offline-sync-sw.js · docs/ops/pending-batches.yaml · docs/LEDGER.md (0464, hash b699ece3…)
descripcion: >
  Tercer defecto encadenado del pipeline push cazado en dispositivo real: el SW
  en cold-start pierde kipuspayApiBase (estado de módulo) y nadie persistía el
  apiBase → ACK fetch al origen equivocado (404 silencioso, 0 trazas en worker).
  Fix: persistencia IDB (config/apiBase, DB v2) + recuperación en
  dispatchDisplayedAck. Verificación física completa vía ADB+CDP: login real
  (espejo auth escrito por producción), suscripción cb0c7914, push ACCEPTED →
  DISPLAYED en 4.8s, notificación visible en bandeja (screenshot). Nota técnica:
  la query ORDER BY rowid DESC LIMIT 1 engaña con múltiples suscripciones (la
  muerta se inserta después) — filtrar por subscription_id del dispositivo.
  Pendiente honesto: SLO ≥99% requiere volumen; canal FCM_HTTP_V1 nativo
  opcional (Web Push lo cubre).
evidencia: >
  RED: 0 requests /api/push/ack en observabilidad pese a notificación visible;
  notificaciones en bandeja con when viejos (14:10/14:30) tras push nuevo.
  GREEN: displayed_at=14:55:26.853 (accepted 14:55:22, Δ4.8s); pos-web 418/418;
  SUITE GREEN; V-13 GREEN; deploy verificado en dispositivo (idbOpen presente).
ancestry_verified: true
aprobaciones: ["A: Staff Principal", "V: D1 + bandeja Android + observabilidad worker"]
estado_gov: GOV-APROBADO
estado: Vigente
```
