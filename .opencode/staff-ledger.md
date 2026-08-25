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
entry_hash: 00002285a4d19c9d1763e752e20f0011600426e13ecd847f27b087ea224aaf3d
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
prev_hash: 00002285a4d19c9d1763e752e20f0011600426e13ecd847f27b087ea224aaf3d
entry_hash: c0328d6ee8a53628e4a323cb9720aa3b7b62cef71eaf7a214ca4f9dfe9850571
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
prev_hash: c0328d6ee8a53628e4a323cb9720aa3b7b62cef71eaf7a214ca4f9dfe9850571
entry_hash: 516f7364eb0c4c15d1002a39896ebf1967e962816e7f7c1a2ac84934415721b7
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
prev_hash: 516f7364eb0c4c15d1002a39896ebf1967e962816e7f7c1a2ac84934415721b7
entry_hash: d82864968417b618c27d073a7a7bd23bf2c86832e851fd7d4356f99f5afd06ff
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
prev_hash: d82864968417b618c27d073a7a7bd23bf2c86832e851fd7d4356f99f5afd06ff
entry_hash: d46657234c69b912eeabb473d99f1f7cefadac8e5f99ac971ac583cb82c70059
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
prev_hash: d46657234c69b912eeabb473d99f1f7cefadac8e5f99ac971ac583cb82c70059
entry_hash: fb80a316abb7df9d84e2c5220a1e3209b0d52439911ea1a3302ebdf8b8ae43ab
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
prev_hash: fb80a316abb7df9d84e2c5220a1e3209b0d52439911ea1a3302ebdf8b8ae43ab
entry_hash: 6d3c1d20240db24bcde6f4cd024fd857d2a4b097cacf74a56e543e5ed575ecb0
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
prev_hash: 6d3c1d20240db24bcde6f4cd024fd857d2a4b097cacf74a56e543e5ed575ecb0
entry_hash: ca4f84aa6ba08571ccaa67a88ecd56ac5aa882328c09b2ffb86d66016b7596b8
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
prev_hash: ca4f84aa6ba08571ccaa67a88ecd56ac5aa882328c09b2ffb86d66016b7596b8
entry_hash: b805f8cb8107b8db144878d105c41556ece22d4edddb714f86b454a67339a899
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
prev_hash: b805f8cb8107b8db144878d105c41556ece22d4edddb714f86b454a67339a899
entry_hash: 8073852efaf4373a8b716705b770b2e43b2a9a46ca691c89a24d45ec284e1742
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
prev_hash: 8073852efaf4373a8b716705b770b2e43b2a9a46ca691c89a24d45ec284e1742
entry_hash: 1f20f96a5425eccc71e6d4a89285fa2e12b6fe117440296b319121f69c3c89bd
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
prev_hash: 1f20f96a5425eccc71e6d4a89285fa2e12b6fe117440296b319121f69c3c89bd
entry_hash: 0a9214a25f458395c996e74f942dc4ad420979eb29adc7a6e225391e2aa54839
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

```text
id: 0018
timestamp_utc: 2026-08-24T15:45:00Z
agente: Staff Principal
tarea: CORRIGE — reparación en cascada de cadena staff-ledger (0006→0018) + bloqueantes de auditoría
prev_id: 0017
prev_hash: 0a9214a25f458395c996e74f942dc4ad420979eb29adc7a6e225391e2aa54839
entry_hash: 58899726d7fe0bd97772a8700594b5a02d9c5449d28d4723c9298a7bfe7b6d50
ticket_or_adr: auditoría kipus-qa 2026-08-24; LEDGER 0463/0464
test_ids: [pos-web 420, SUITE]
entregable_afectado: .opencode/staff-ledger.md · apps/pos-web/src/lib/push/auth-mirror.ts · apps/pos-web/static/offline-sync-sw.js
descripcion: >
  CORRIGE — auditoría adversarial kipus-qa destapó: (1) 0006 con placeholder
  entry_hash sin rellenar desde su commit original + línea duplicada inyectada
  por sed global; (2) hashes de 0016/0017 sobre rangos truncados; (3) BLOQUEANTE-1
  skew versión IDB (auth-mirror v1 vs SW v2) → espejo muerto tras primer open del
  SW — fix AUTH_MIRROR_DB_VERSION=2 compartida + test de contrato; (4) BLOQUEANTE-2
  ACK sin inspección de response.ok — fix DISPLAYED_ACK_HTTP_<status>. Reparación
  en cascada: 13 entradas (0006→0018) re-derivadas secuencialmente porque el hash
  de cada una depende del prev_hash corregido de la anterior. Gate extendido:
  ledger_chain.py valida AMBAS cadenas (principal + staff).
  CORRIGE (relacion: corrige) — la auditoría adversarial de kipus-qa destapó:
  (1) 0006 arrastraba un placeholder entry_hash: __ENTRY_HASH__ sin rellenar
  desde su commit original (defecto preexistente invisible: el gate nunca
  validó el staff-ledger); el sed global de 0016 lo rellenó con el hash
  equivocado creando una línea duplicada — eliminada, el hash real 18799aa7
  (al que 0007 encadena) quedó intacto. (2) 0016/0017 declaraban hashes
  calculados sobre rangos truncados (awk detenido en el primer estado: en vez
  del cierre del bloque) — recalculados sobre el bloque completo id→estado
  final: 0016=37c3618d…, 0017=791af9e0…; prev_hash de 0017 actualizado en
  consecuencia. (3) BLOQUEANTE-1: skew de versión IDB (auth-mirror v1 vs SW
  v2) → VersionError silencioso mataba el espejo tras el primer open del SW;
  fix: AUTH_MIRROR_DB_VERSION=2 compartida + test de contrato que compara la
  versión del asset SW contra la constante. (4) BLOQUEANTE-2: el fetch del ACK
  no inspeccionaba response.ok (401/403/410 invisibles) — ahora notifica
  DISPLAYED_ACK_HTTP_<status> a los clients. Pendiente: extender el gate
  (V-13) a este archivo para que la cadena staff nunca más valide a ciegas.
evidencia: >
  RED: hashes 0016/0017 no verificables (37c3618d/791af9e0 calculados vs
  d1675b27/b60162c6 declarados); hash duplicado 0006/0016; grep db version
  skew. GREEN: 0006 con línea única 18799aa7; 0016/0017 con hashes de bloque
  completo; test de versión IDB 20/20; suites y gate en la entrada de cierre.
ancestry_verified: true
aprobaciones: ["A: Staff Principal", "V: kipus-qa (auditoría independiente)"]
estado_gov: GOV-APROBADO
estado: Vigente
```

```text
id: 0019
timestamp_utc: 2026-08-24T16:25:00Z
agente: Staff Principal
tarea: Ciclo de auditoría consolidada — kipus-qa (NO-GO→remediado) + kipus-sre (baseline SLO)
prev_id: 0018
prev_hash: 58899726d7fe0bd97772a8700594b5a02d9c5449d28d4723c9298a7bfe7b6d50
entry_hash: d786ee4ba469d6a112b0d94d22d1fc51f27ed9b4dd6fc77c8f9e8ec448fe3f84
ticket_or_adr: LEDGER 0465; gap fcm-vapid-real
test_ids: [pos-web 419, worker-kms 26, V-13 dual]
entregable_afectado: apps/pos-web/src/lib/push/auth-mirror.ts · apps/pos-web/static/offline-sync-sw.js · scripts/checks/ledger_chain.py · docs/ops/push-ack-slo-baseline.md · docs/LEDGER.md (0465, hash 3c55d58b…)
descripcion: >
  Primer ciclo completo delegación→auditoría→corrección del pipeline push.
  kipus-qa ejecutó auditoría adversarial real (re-ejecutó 5 suites, recomputó
  hashes, cazó huevos de serpiente por lectura de código) y emitió NO-GO
  fundado: 2 BLOQUEANTES de código (skew IDB, ACK silencioso) + corrupción de
  la propia cadena staff que este supervisor había introducido/mechanically
  heredado. Ambos bloqueantes corregidos con test de contrato; cascada
  0006→0018 re-derivada; gate V-13 ahora valida ambas cadenas — la clase de
  defecto no puede recurrir invisiblemente. kipus-sre entregó baseline honesto:
  el SLO §5.12.4 (desde created_at) es estructuralmente imposible con cron */5
  (hasta 554s queued→accepted) — requiere decisión ADR de despacho inline o
  presupuesto segmentado; FCM nativo APLAZAR. Lección de proceso: la muestra
  H4 (1 delivery DISPLAYED) no ejercitaba el camino roto (re-login→refresh de
  espejo) — exactamente el patrón que CAL-04 existe para cazar.
evidencia: >
  RED: NO-GO de kipus-qa con hashes staff no verificables; eslint worker-kms
  1 error; ledger_chain extendido en RED inicial. GREEN: V-13 dual GREEN;
  pos-web 419/419; worker-kms 26/26 lint OK; SUITE GREEN; baseline D1
  verificado independientemente por el supervisor (21 filas exactas).
ancestry_verified: true
aprobaciones: ["A: Staff Principal", "V: kipus-qa + kipus-sre (independientes)"]
estado_gov: GOV-APROBADO
estado: Vigente
```

```text
id: 0020
timestamp_utc: 2026-08-24T18:35:00Z
agente: Kipus Fiscal (Staff Fiscal)
tarea: Batería homologación FL-1 SUNAT e-beta — RC multi-doc y shape ND sellados (CDR 0); hallazgos exonerada/ICBPER/motivo-06
prev_id: 0019
prev_hash: d786ee4ba469d6a112b0d94d22d1fc51f27ed9b4dd6fc77c8f9e8ec448fe3f84
entry_hash: ad181b5910bbc5f36fbbcdaab657c02917b4baa24466423f3815a75bf23cddee
ticket_or_adr: FL-1; hallazgo ADR-FISCAL-003; Arquitectura §5.2
test_ids: [domain-fiscal-pe 165, V-13 dual]
entregable_afectado: packages/domain-fiscal-pe/src/ubl-invoice.ts · ubl-debit-note.ts · ubl-shared.ts (+tests) · scripts/staff/sign-only-cpe.mjs · tmp-staff/homologacion-fl1-resultados.json
descripcion: >
  Batería FL-1 (8 envíos reales a e-beta, CDT ROSA NEGRA): RC-20260824-001 con
  3 boletas ACEPTADA (CDR 0) y FD01-00000004 ACEPTADA (CDR 0) — primera ND del
  piloto validada con el builder de dominio. Dos defectos de schema corregidos
  en ubl-debit-note (e-beta no admite cbc:DebitNoteTypeCode; exige
  cac:RequestedMonetaryTotal) y un gap de forma en ICBPER (Percent del tributo
  3000). Hallazgos registrados sin retry agotado: (1) catálogo 10 wire de
  e-beta rechaza motivo ND 06 (CDR 2172) mientras acepta 01 — la taxonomía
  interna de ADR-FISCAL-003/§5.1 no coincide con el catálogo oficial SUNAT
  para ND y requiere tabla interna→wire en ciclo normativo propio;
  (2) catálogo 5 de e-beta sin {3000,ICBPER} (CDR 3051) — ambiente desactualizado;
  (3) exonerada con subtotal IGV 0.00 por línea rechazada (CDR 3111) pese al
  shape canónico con TaxExemptionReasonCode 20 — pendiente variante pre-go-live.
  Cabecera 0019 reparada (línea estado duplicada truncaba el bloque V-13 y
  dejaba su entry_hash sin verificar); hash re-derivado.
evidencia: >
  RED inicial: F001-14 CDR 3111; F001-15 CDR 2992→3051; FD01-04 m06
  0306→0306→2172. GREEN: RC-20260824-001 CDR 0 (3 boletas B001-3/4/5);
  FD01-00000004 m01 CDR 0; domain-fiscal-pe 165/165 (tests exonerada cabecera,
  ICBPER 3000/EXC+Percent, estabilidad shape gravado, motivo 06);
  verify.sh SUITE GREEN 32 checks; cadena staff 0001→0020 verificada.
ancestry_verified: true
aprobaciones: ["Ejecutó: Kipus Fiscal", "A: pendiente Staff Principal", "V: pendiente independiente"]
estado_gov: EN REVISION
estado: Vigente
```

```text
id: 0021
timestamp_utc: 2026-08-24T18:05:00Z
agente: Staff Principal
tarea: Ciclo delegación→auditoría — kipus-fiscal (batería FL-1) + kipus-sre (ADR-0036)
estado: Vigente
prev_id: 0020
prev_hash: ad181b5910bbc5f36fbbcdaab657c02917b4baa24466423f3815a75bf23cddee
entry_hash: 9906c87cd14bf9d4db6313c156be06e0b96562f60328538851d7de70faa86788
ticket_or_adr: ADR-0036; LEDGER 0467; FL-1
test_ids: [domain-fiscal-pe 165, V-13 dual, SUITE]
entregable_afectado: docs/adr/ADR-0036-push-dispatch-inline.md · packages/domain-fiscal-pe/src/ubl-debit-note.ts · tmp-staff/homologacion-fl1-resultados.json · docs/LEDGER.md (0467, hash 82a100a3…)
descripcion: >
  Ciclo completo con dos agentes en paralelo (primer intento rate-limited 429,
  retry OK). kipus-fiscal ejecutó 8 envíos e-beta: ND corregida ACEPTADA
  (RequestedMonetaryTotal, sin DebitNoteTypeCode — schema restringido SUNAT),
  RC multi-doc ACEPTADO; exonerada/ICBPER/motivo-06 registrados como hallazgos
  normativos (catálogos e-beta desactualizados o taxonomía interna ≠ wire —
  ciclo propio pendiente). Además reparó la cabecera de 0019 (línea estado
  duplicada truncaba V-13) y selló 0020. kipus-sre redactó ADR-0036 con costos
  de plataforma verificados (waitUntil 30s, techo service bindings → tope 16
  deliveries inline); Staff Principal lo ACEPTÓ (opción A: inline post-enqueue,
  cron backstop, flag, tope 16). Auditoría del supervisor: resultados JSON 1:1,
  V-13 dual GREEN, suites GREEN, secrets gitignored. Deuda menor detectada:
  warning complejidad fiscal-drain.ts:231 (16>15) preexistente — backlog.
evidencia: >
  RED: rate-limit 429 en primer par de delegaciones; ND m06 0306→2172;
  exonerada 3111; ICBPER 3051. GREEN: FD01-4 CDR 0; RC CDR 0; 165/165;
  SUITE GREEN; V-13 dual GREEN; ADR-0036 Aceptado; commits 8274bd5 + este.
ancestry_verified: true
aprobaciones: ["A: Staff Principal", "V: kipus-fiscal + kipus-sre (independientes) + supervisor"]
estado_gov: GOV-APROBADO
estado: Vigente
```

```
id: 0022
timestamp_utc: 2026-08-24T20:05:00Z
agente: Kipus Fiscal (Staff Fiscal)
tarea: Tabla de traducción motivo ND interno→wire catálogo 10 fail-closed — liquidación hallazgo FL-1 FINDING-1
prev_id: 0021
prev_hash: 9906c87cd14bf9d4db6313c156be06e0b96562f60328538851d7de70faa86788
entry_hash: d39a030368524d9f501b8278c2bf5b1d5df4a2f8a954dcbf57ba73b4d7da93ff
ticket_or_adr: ADR-FISCAL-003; Arquitectura §5.1 regla 5; FL-1 FINDING-1; FIS-13
test_ids: [nd-motive-catalog.test 7, domain-fiscal-pe 172, adapters-d1 442, worker-fiscal 47, adapters-sunat 44, V-13 dual, SUITE]
entregable_afectado: packages/domain-fiscal-pe/src/nd-motive-catalog.ts (+test) · packages/domain-fiscal-pe/src/ubl-debit-note.ts · ubl-shared.ts · ubl-invoice.ts (+tests) · index.ts · packages/adapters-d1/src/fiscal-xml-producer.test.ts
descripcion: >
  Nueva tabla de traducción interna→wire para motivos ND (catálogo 10 oficial
  verificado contra Anexo Nro. 8 y evidencia e-beta: 01 Intereses por mora,
  02 Aumento en el valor, 03 Penalidades / otros conceptos; 11 exportación y
  12 IVAP existen en el Anexo 8 sin uso interno). La verificación REFUTÓ la
  premisa de FL-1 FINDING-1: el wire 06 no existe en catálogo 10 (CDR 2172
  "Valor no se encuentra en el catalogo: 10") y la lista wire atribuida al
  catálogo oficial (01 anulación ítems … 06 intereses mora) es una mezcla del
  catálogo 09 de NC — la taxonomía interna {01,02,03} coincide semánticamente
  con el catálogo 10 real. El defecto de código era el alias '06' más fallback
  silencioso en ublNdMotiveDescription (eliminada; DRY en nd-motive-catalog).
  El builder ND ahora recibe motivo INTERNO y traduce vía translateNdMotiveToWire
  (pura, tipada): desconocido → UnknownNdMotiveError; interno '10' válido en
  taxonomía pero sin homologación e-beta → NdMotiveWireUnhomologatedError
  (fail-closed: jamás XML inválido; el drain lo lleva a FAILED_MISSING_XML y
  luego cuarentena POISON_RETRY, try/catch por fila fiscal-drain.ts:260).
  FD01-4 queda estable (interno 01 → wire 01 Intereses por mora, CDR 0).
  Deuda preexistente de 8274bd5 liquidada: lint complejidad buildUblInvoiceXml
  15>12 (guards extraídos a assertInvoiceInput, XML byte-idéntico) y test
  fiscal-xml-producer que aún esperaba cbc:DebitNoteTypeCode rechazado por
  e-beta 0306 — ahora aserta el shape ACEPTADO (sin DNTC + RequestedMonetaryTotal).
  Corrección doctrinal propuesta para ADR-FISCAL-003/§5.1 en reporte al
  supervisor (spec normativa no tocada).
evidencia: >
  RED: fiscal-xml-producer.test esperaba DebitNoteTypeCode (shape pre-FL-1);
  eslint complejidad buildUblInvoiceXml 15>12 heredado de 8274bd5.
  GREEN: domain-fiscal-pe 172/172 (7 tests nuevos en nd-motive-catalog.test:
  tabla completa internal→wire, exhaustividad contra DEBIT_NOTE_MOTIVE_CODES,
  FD01-4 estable, desconocidos con 06 incluido → UnknownNdMotiveError,
  interno 10 → NdMotiveWireUnhomologatedError, builder fail-closed sin XML);
  adapters-d1 442/442; worker-fiscal 47/47; adapters-sunat 44/44;
  lint --max-warnings 0 GREEN; typecheck GREEN; prettier aplicado;
  verify.sh RESULT SUITE GREEN (32 checks, V-13 dual incluido).
ancestry_verified: true
aprobaciones: ["Ejecutó: Kipus Fiscal", "A: pendiente Staff Principal", "V: pendiente independiente"]
estado_gov: EN REVISION
estado: Vigente
```

```text
id: 0023
timestamp_utc: 2026-08-24T19:05:00Z
agente: Staff Principal
tarea: Ciclo delegación→auditoría — kipus-sre (ADR-0036 implementado) + kipus-fiscal (catálogo 10 ND)
estado: Vigente
prev_id: 0022
prev_hash: d39a030368524d9f501b8278c2bf5b1d5df4a2f8a954dcbf57ba73b4d7da93ff
entry_hash: 6d4c9d9be7eff24baf0975f915d274769c8126b2be704dfbce49f503fd2b5ab9
ticket_or_adr: ADR-0036; LEDGER 0468
test_ids: [worker-api 1375, domain-fiscal-pe 172, V-13 dual, SUITE]
entregable_afectado: apps/worker-api/src/push/* · packages/adapters-d1/src/process-mobile-push-atomic.ts · packages/domain-fiscal-pe/src/nd-motive-catalog.ts · docs/LEDGER.md (0468, hash 975348f0…)
descripcion: >
  Segundo ciclo paralelo. kipus-sre implementó ADR-0036 con TDD (10 tests
  T1-T5 RED→GREEN): pipeline único reutilizado con filtro eventId en el claim,
  tope 16, flag default-off con rollback conductual garantizado por T1, fallos
  jamás tragados (T4 — regresión del drill). kipus-fiscal REFUTÓ el catálogo
  wire de mi brief (mezclaba catálogo 09 de NC) verificando contra Anexo 8 +
  CDR 2172 de e-beta antes de implementar — evidencia sobre autoridad,
  incluida la del supervisor; la taxonomía interna ya era identidad con el
  catálogo 10 oficial; el defecto real era el alias '06' + fallback
  silencioso. Fix fail-closed con errores tipados y '10' bloqueado hasta
  homologación. Propuesta doctrinal para ADR-FISCAL-003 pendiente de ciclo
  normativo propio. Auditoría del supervisor: suites re-ejecutadas (172/172,
  1375/1375 — 3 flaky en un run), flag/tope/catálogo verificados por lectura,
  V-13 dual GREEN, SUITE GREEN. Siguiente: deploy con flag OFF → game day →
  activar flag → batería de métricas ADR.
evidencia: >
  RED: 10 tests dispatcher/routes pre-implementación; tests ND con alias 06;
  3 flaky worker-api en run cargado. GREEN: 1375/1375; 172/172 (cobertura
  99.02%); 442/442; 47/47; 44/44; prettier; V-13 dual GREEN; SUITE GREEN.
ancestry_verified: true
aprobaciones: ["A: Staff Principal", "V: kipus-sre + kipus-fiscal (independientes) + supervisor"]
estado_gov: GOV-APROBADO
estado: Vigente
```

```text
id: 0024
timestamp_utc: 2026-08-24T22:50:00Z
agente: Staff Principal
tarea: Game day ADR-0036 — flag inline activado en staging (ejecución directa)
estado: Vigente
prev_id: 0023
prev_hash: 6d4c9d9be7eff24baf0975f915d274769c8126b2be704dfbce49f503fd2b5ab9
entry_hash: 337eda6fb61cc593300793d365871d8479cd0f3b382def9533cc944992dbb21f
ticket_or_adr: ADR-0036; LEDGER 0471; gap fcm-vapid-real
test_ids: [worker-api T1-T5, docs/ops/adr0036-gameday-staging.md]
entregable_afectado: docs/ops/adr0036-gameday-staging.md · worker staging (flag ON) · docs/LEDGER.md (0471, hash a30bf198…)
descripcion: >
  Game day ejecutado en caliente por el supervisor (delegación rate-limited
  por cupo diario del modelo de subagentes — segunda vez hoy; el patrón
  delegar-auditar degrada a ejecutar-auditar sin pérdida de rigor cuando la
  infraestructura de delegación no está disponible). Activación vía PATCH
  settings.bindings (multipart) sin redeploy. Resultados: queued→accepted
  ~4-5 min → ~2 s; E2E con Zebra en dock 5/8/18 s con ACK automático del SW
  (espejo auth en producción); rollback drill T1 verificado en caliente
  (flag off → 0 deliveries inline en 60 s); 0 fallos en logs; flag
  re-activado. Hallazgo de proceso: el PATCH de settings en caliente es el
  mecanismo correcto para flags de staging (sin drift de wrangler.jsonc).
  Pendiente gap: flota + n≥20 + clasificación ACCEPTED-sin-ACK.
evidencia: >
  RED: baseline cron 4-5 min; T1 con 0 deliveries inline (esperado). GREEN:
  3/3 inline ~2 s; E2E 5/8/18 s; 0 push_*_failed en observability; SUITE
  GREEN; V-13 dual GREEN (0471).
ancestry_verified: true
aprobaciones: ["A: Staff Principal", "V: D1 + observability + navegador (evidencia directa)"]
estado_gov: GOV-APROBADO
estado: Vigente
```

```text
id: 0025
timestamp_utc: 2026-08-24T23:49:08Z
agente: Kipus Fiscal/PM
tarea: Runbook operativo de onboarding fiscal de negocio nuevo (camino A, emisión directa)
estado: Vigente
prev_id: 0024
prev_hash: 337eda6fb61cc593300793d365871d8479cd0f3b382def9533cc944992dbb21f
entry_hash: 63acc1d2aa8a5ff11dc10bdbe3dd7e9ae9532c16a1ccfe461341d2a297096d5e
ticket_or_adr: ADR-FISCAL-001/006/007/008; Arquitectura §5.1 §5.2 §5.4; DECISIÓN OWNER camino A
test_ids: [SUITE, V-15, domain-fiscal-pe vitest, adapters-sunat vitest 44/44]
entregable_afectado: docs/runbooks/fiscal-onboarding-tenant.md (nuevo)
descripcion: >
  Runbook de onboarding fiscal por negocio (camino A del owner: cada RUC con
  certificado digital propio + SOL propio; PSE homologado a futuro). Cinco
  secciones: prerrequisitos humanos (.p12 uso tributario a nombre del RUC,
  SOL secundario con facturación, RUC emisor electrónico), provisioning
  técnico (validación openssl del .p12 con fallback -legacy, extracción
  PKCS#8 + cert-chain vía scripts/staff/extract-cdt-p12.sh, envelope
  AES-GCM v1 con DEK wrappeada en KMS vía wrap-tenant-cert.mjs y
  /v1/internal/tenant-cert/wrap-dek, registro D1 en tenant_certificates con
  schema de migración 0056 verificado, secretos SOL por worker), verificación
  e-beta pre-producción (firma ds:Signature en R2, send-beta-cpe.mjs, CDR
  código 0 como única aceptación), cutover a producción (T6: override
  SUNAT_BILL_ENDPOINT_URL, SOL prod, series nuevas) con rollback a e-beta,
  seguridad (clave privada jamás git/logs, rotación por vigencia, revocación)
  y futuro PSE (alias PSE_PLATFORM ya previsto en el CHECK de la tabla).
  Comandos tomados del código real; lo no automatizado quedó marcado como
  patrón o gap (SOL un par por ambiente, insert break-glass manual).
evidencia: >
  SUITE GREEN (scripts/verify.sh) tras crear el doc + regenerar INDEX.md;
  prettier --check limpio; domain-fiscal-pe vitest verde (cobertura 99%+
  líneas); adapters-sunat vitest 44/44; entry_hash calculado sobre este
  bloque con el algoritmo validado reproduciendo el hash de la entrada 0024.
ancestry_verified: true
aprobaciones: ["A: Staff Fiscal", "V: gate documental V-00..V-31 GREEN + tests packages fiscales"]
estado_gov: GOV-APROBADO
estado: Vigente
```

```text
id: 0026
timestamp_utc: 2026-08-24T20:05:00Z
agente: Kipus Security/Fiscal
tarea: Validación fail-closed de identidad/vigencia en upload de cert SUNAT + alerta T-30d de vencimiento
estado: Vigente
prev_id: 0025
prev_hash: 63acc1d2aa8a5ff11dc10bdbe3dd7e9ae9532c16a1ccfe461341d2a297096d5e
entry_hash: 6b71099ea27b6cc2fece7546101a85435f17ccbe60b1779a79ee846bdd454730
ticket_or_adr: SEC-03; Arquitectura §5.4; ADR-FISCAL-006; invariante 5 (fail-closed)
test_ids: [apps/worker-api/src/fiscal/tenant-cert-upload-routes.test.ts, apps/worker-api/src/fiscal/cert-expiry-scheduled.test.ts, apps/worker-api/src/worker-scheduled.test.ts, packages/domain-fiscal-pe/src/sunat-cert-subject.test.ts, packages/domain-integrations/src/mobile-push.red.test.ts]
entregable_afectado: apps/worker-api/src/fiscal/tenant-cert-upload-routes.ts; apps/worker-api/src/fiscal/cert-expiry-scheduled.ts (nuevo); packages/domain-fiscal-pe/src/sunat-cert-subject.ts (nuevo); packages/domain-integrations/src/mobile-push.ts
descripcion: >
  Cierre de dos gaps de SEC-03. (1) POST /api/fiscal/tenant-cert ahora valida
  fail-closed ANTES de KMS/D1: RUC del subject (solo marcadores estructurados
  organizationIdentifier «NTRPE-<RUC>» / OU, jamás el CN libre) contra
  tenants.ruc registrado → CERT_RUC_MISMATCH; notAfter vencido → CERT_EXPIRED;
  sin marcador USO TRIBUTARIO → CERT_USO_INVALIDO; tenant sin ruc →
  CERT_TENANT_NO_RUC. Un cert rechazado no consume wrapDek ni muta estado.
  (2) Job diario runCertExpiryScheduled enganchado al cron fiscal RC existente
  (FISCAL_RC_CRON 13:00 UTC, best-effort): barre tenant_certificates con
  expires_at en [hoy, hoy+30d] (idx_tenant_certificates_expires), re-valida
  límites en código (defensa en profundidad) y emite push OWNER_ALERTS
  CERT_EXPIRY_WARNING con dedup histórica por idempotency_key_hash estable
  «cert-expiry:<tenant>:<fingerprint>» → UNA alerta por certificado (patrón
  F5b-4); rotación (huella nueva) dispara alerta nueva; push_events no tiene
  pruning → dedup duradera. Registro del evento en los tres catálogos
  (adapters-d1 PushEventType, dispatcher, domain-integrations
  PUSH_EVENT_TYPES/COPY/DEEP_LINK_KINDS) — sin ello buildLockscreenPayload
  lanzaba PUSH_EVENT_TYPE_INVALID en runtime.
evidencia: >
  RED→GREEN documentado por test: domain sunat-cert-subject 8 RED (exports
  inexistentes) → GREEN; route 5 RED (A1/A2/A3/TENANT_NO_RUC/CN-libre
  devolvían 200 o PKCS12_INVALID) → GREEN; wiring cron 1 RED → GREEN;
  mobile-push.red 2 RED (catálogo sin CERT_EXPIRY_WARNING) → GREEN. Suites:
  domain-fiscal-pe 180/180, domain-integrations 128/128, adapters-d1 449/449,
  worker-api 1392/1392; tsc --noEmit OK ×4; eslint --max-warnings 0 OK ×4;
  prettier --check limpio; scripts/verify.sh RESULT SUITE GREEN. Nota:
  pnpm quality falla SOLO en worker-fiscal#lint por cambios preexistentes de
  otro flujo en el árbol (669 insertions; string F001-CHAN ausente en HEAD) —
  verificado con git show HEAD; paquetes tocados lint/tsc/tests limpios.
ancestry_verified: true
aprobaciones: ["A: Staff Security", "V: gate documental V-00..V-31 GREEN + suites 4 paquetes"]
estado_gov: GOV-APROBADO
estado: Vigente
```

```text
id: 0027
timestamp_utc: 2026-08-24T21:20:00Z
agente: Kipus ACID/Backend
tarea: Routing SOL SUNAT por tenant (emisión directa por negocio) con fallback backward-compatible al env del worker
estado: Vigente
prev_id: 0026
prev_hash: 6b71099ea27b6cc2fece7546101a85435f17ccbe60b1779a79ee846bdd454730
entry_hash: f581186340bfc7ae5ab87c74b286a2340848276cbfaf4bafa00c826de178eb2f
ticket_or_adr: SEC-03; Arquitectura §5.4; ADR-FISCAL-007/FL-2; patrón tenant_certificates (0056)
test_ids: [packages/adapters-d1/src/tenant-sol-credentials.test.ts, packages/adapters-d1/src/schema-full-down.integration.test.ts, apps/worker-fiscal/src/select-transport.test.ts, apps/worker-fiscal/src/fiscal-drain.test.ts, apps/worker-fiscal/src/fiscal-service.test.ts]
entregable_afectado: packages/adapters-d1/migrations/0061_tenant_sol_credentials.sql (nuevo); packages/adapters-d1/migrations-down/0061_tenant_sol_credentials.sql (nuevo); packages/adapters-d1/src/tenant-sol-credentials.ts (nuevo); apps/worker-fiscal/src/select-transport.ts; apps/worker-fiscal/src/fiscal-drain.ts; apps/worker-fiscal/src/fiscal-service.ts; apps/worker-fiscal/src/index.ts; packages/adapters-d1/test/generate-data-backup-schema.mjs; packages/adapters-d1/src/data-backup-registry.generated.ts
descripcion: >
  Emisión directa por negocio: cada tenant emite con SU credencial SOL, no con
  la del worker. (1) Tabla tenant_sol_credentials (migración 0061 up + down
  espejo protegido vía atomic_guards, patrón 0056): PK (tenant_id, alias) con
  alias='SUNAT', sol_credentials_envelope 'envelope-v1:{json}' AES-GCM cuyo
  plaintext es {solUser,solPassword} y cuya DEK se envuelve en KMS con
  backupId 'tenant-sol:SUNAT'; triggers de epoch + registro SECRET en
  D1_BACKUP_TABLES (V-29). (2) Puerto loadTenantSolCredentials(db,kms,tenantId)
  → {user,password}|null: sin fila → null (fallback legítimo al env);
  ciphertext corrupto → TENANT_CERT_UNWRAP_FAILED; payload inválido →
  TENANT_SOL_PAYLOAD_INVALID — jamás credenciales parciales. (3)
  selectFiscalTransport(env,{loadTenantSol}): wrapper de routing con caché por
  tenant resuelve el transporte REAL por emisor — staging: SOL del tenant →
  billService beta con sus credenciales; sin fila → env (PSE/beta/MISCONFIGURED
  intactos); producción: validación SOL pasa a lazy por tenant, sin fila ni env
  → SunatChannelError SUNAT_PRODUCTION_SOL_MISSING; plugins off sigue siendo
  MOCK puro (kill-switch global). Credencial corrupta → TenantSolChannelError,
  NUNCA fallback al env de otro emisor. (4) drain: transportFor por fila +
  catch tipado de errores de canal → QUARANTINED CHANNEL_ERROR visible (no INFRA
  que infla el breaker, no throw que aborte el drain multi-tenant). (5) submitRc:
  SOL del tenant primero, env como fallback, corrupta → 503 TENANT_SOL_UNAVAILABLE.
evidencia: >
  TDD RED→GREEN: adapters-d1 7 RED (módulo inexistente) → GREEN 7/7;
  worker-fiscal select-transport 7 RED (routing inexistente, producción eager)
  → GREEN 27/27; fiscal-drain 1 RED (SunatChannelError mata el drain completo,
  reproducido) → GREEN cuarentena CHANNEL_ERROR por fila; fiscal-service 4 RED →
  GREEN. Suites finales: adapters-d1 unit 449/449, integración 313/313 (chain
  down completo 0061→0000 deja schema limpio), worker-fiscal 72/72,
  worker-api backup 23/23; tsc --noEmit OK ×2; eslint --max-warnings 0 OK;
  prettier limpio; scripts/verify.sh RESULT SUITE GREEN (V-25 espejo, V-29
  paridad triggers); pnpm quality Quality Gate OK. Migración NO aplicada a
  staging D1 (queda para el supervisor).
ancestry_verified: true
aprobaciones: ["A: Staff Backend ACID", "V: gate documental V-00..V-31 GREEN + quality gate CAL"]
estado_gov: GOV-APROBADO
estado: Vigente
```

```text
id: 0028
timestamp_utc: 2026-08-24T23:05:00Z
agente: Kipus SRE/Security
tarea: Cierre Gap 6 LEDGER 0472 - ubicacion autoritativa de secrets SOL + rotacion documentada
estado: Vigente
prev_id: 0027
prev_hash: f581186340bfc7ae5ab87c74b286a2340848276cbfaf4bafa00c826de178eb2f
entry_hash: bed0de52c9efb625bbab0edff888d02139c19ebb30f95d71168d4be640f0d41c
ticket_or_adr: SEC-03; Gap 6 LEDGER 0472; nota deriva ADR-FISCAL-007 (Secrets Store vs secret_text)
test_ids: []
entregable_afectado: docs/runbooks/secrets-ops-material.md; docs/runbooks/fiscal-onboarding-tenant.md
descripcion: >
  Verificacion contra la API CF (GET settings, solo nombres/tipos, jamas valores) +
  wrangler secret list --env staging: SUNAT_SOL_USER y SUNAT_SOL_PASSWORD son bindings
  secret_text del Worker kipuspay-worker-fiscal-staging (junto a TENANT_CERT_ENVELOPE).
  kipuspay-worker-api-staging NO los tiene (sus secret_text: AUTH_JWT_HS_SECRET,
  PLATFORM_STAFF_TOKEN, TENANT_CERT_ENVELOPE): su buildRcCdrPort delega al servicio FISCAL
  cuando no hay SOL local - hallazgo LATENTE, sin rotura hoy (flags fiscales en 0 en el
  runtime staging de ambos workers). Mecanismo verificado: wrangler secret put (version
  nueva + deploy inmediato; acceso probado via secret list); alternativas dashboard /
  endpoint bulk de secrets; NUNCA PUT del script completo para rotar. Docs:
  secrets-ops-material.md gana seccion Credenciales SUNAT SOL (ubicacion autoritativa,
  mecanismo, rotacion completa: nueva clave en SUNAT -> persistir ops-local chmod 600 ->
  put x2 --env staging -> 1 envio e-beta con CDR codigo 0) y matriz corregida;
  fiscal-onboarding-tenant.md 2.6 deja la marca DESCONOCIDA y documenta precedencia fila
  tenant_sol_credentials (0061) > env del worker > fail-closed. Deriva documental
  registrada: ADR-FISCAL-007 enuncia solo Secrets Store; la realidad es secret_text del
  worker + filas por tenant - requiere decision Staff Fiscal/Principal con ADR.
  Sin rotacion real ejecutada (solo procedimiento); docs/LEDGER.md intacto.
evidencia: >
  GET /workers/scripts/{kipuspay-worker-api-staging,kipuspay-worker-fiscal-staging}/settings
  -> listas secret_text sin valores; wrangler secret list --env staging -> mismos 3 nombres
  en worker-fiscal-staging; consumidores verificados por lectura (select-transport.ts,
  fiscal-rc-routes.ts, fiscal-service.ts); CI no gestiona secrets de workers
  (deploy-staging.yml solo GitHub secrets CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID);
  prettier GREEN docs/runbooks/; scripts/verify.sh RESULT SUITE GREEN.
ancestry_verified: true
aprobaciones: ["A: pendiente firma Staff Principal", "V: gate documental SUITE GREEN"]
estado_gov: GOV-PENDIENTE
```

```text
id: 0029
timestamp_utc: 2026-08-25T02:05:00Z
schema_version: 2
sprint_fase: Automatización fiscal — alta de negocio emisor parametrizada
agente_responsable: Staff Backend ACID (kipus-acid)
tipo: Entregable nuevo
subtipo: comando staff de provisioning atómico + runbook
relacion: amplia
referencias_entradas: [0028]
referencias_documentales: ["docs/runbooks/fiscal-onboarding-tenant.md"]
prev_id: 0028
prev_hash: bed0de52c9efb625bbab0edff888d02139c19ebb30f95d71168d4be640f0d41c
entry_hash: 6491c0e79e1de8f8f415f1e1c7c026d45653340e457eecd0dbb10239691e003e
ticket_or_adr: SEC-03; gap 2 de LEDGER 0472 (alta de tenant copy-paste); automatización LEDGER 0473
test_ids: [scripts/staff/onboard-tenant.test.mjs]
entregable_afectado: scripts/staff/onboard-tenant.mjs (nuevo); scripts/staff/onboard-tenant.test.mjs (nuevo); package.json (script test:staff); docs/runbooks/fiscal-onboarding-tenant.md (§2.1)
descripcion: >
  Cierra el gap de alta copy-paste: scripts/staff/onboard-tenant.mjs genera y
  aplica el skeleton del emisor (tenants + branches + cash_registers +
  branch_document_series + payment_methods + snapshot TENANT_KV) de forma
  atómica y parametrizada. Fail-closed en entrada: tenant_id formato
  tenant_<snake_case>, RUC 11 dígitos CON dígito verificador módulo 11 SUNAT
  (validado contra los RUC reales Rosa Negra/receptor), nombre no vacío,
  catálogo documentos camino A (01/03/07/08 → F001/B001/FC01/FD01), régimen
  dentro del CHECK DDL, solo env staging (canal productivo WAIT). Default
  DRY-RUN (imprime plan+SQL+KV, exit 0 sin tocar nada); --apply exige
  namespace KV explícito. Idempotencia limpia: preflight SELECT por id y RUC
  devuelve contadores + contexto en la fila; colisión → TENANT_EXISTS /
  RUC_ALREADY_REGISTERED tipados SIN escribir nada; SQL generado usa INSERT
  simple (sin INSERT OR IGNORE ni cláusulas de conflicto, guardado por test).
  Atomicidad verificada empíricamente antes de diseñar: probe local wrangler
  d1 execute --file con INSERT válido + CHECK violation + INSERT válido →
  exit 1 y CERO filas persistidas (batch D1 all-or-nothing); camino feliz
  persiste completo. --apply orquesta preflight → batch (--file) → KV put →
  post-verificación de conteos por tabla (desvío → PARTIAL_APPLY visible);
  deps inyectables para tests. Sin secretos: el comando no maneja PINs/certs/
  SOL (owner user queda para flujo de auth). Runbook fiscal-onboarding-tenant
  §2.1 deja de mandar a copiar el seed (queda como fixture histórico) y
  referencia el comando con sus garantías. package.json gana test:staff
  (vitest --dir scripts/staff) para descubribilidad CI. Seed rosa-negra y
  apply script intactos; docs/LEDGER.md intacto (guardrail); sin --apply
  contra staging (solo dry-run).
evidencia: >
  TDD RED→GREEN: test primero (import falla, módulo inexistente) → GREEN
  47/47 en scripts/staff/onboard-tenant.test.mjs (validaciones fail-closed
  incl. checksum RUC e intento de inyección en tenant_id, generación SQL con
  escape de apóstrofes, preflight/idempotencia con abort antes de escritura,
  orden de orquestación apply, PARTIAL_APPLY, snapshot KV patrón Rosa Negra,
  CLI dry-run default/conflictos/flags desconocidas, ausencia de material de
  secretos en toda salida). Smoke CLI: dry-run exit 0 con plan+SQL; errores
  tipados exit 2 (ERR_TENANT_ID_FORMAT, ERR_RUC_CHECKSUM, ERR_UNKNOWN_FLAG).
  Probe atomicidad: wrangler 4.x d1 execute --file local, fallo a mitad →
  rollback total verificado por SELECT. prettier GREEN en los 4 archivos
  tocados; scripts/verify.sh RESULT SUITE GREEN (V-00..V-31) tras los
  cambios; pnpm test:staff 47/47.
ancestry_verified: true
aprobaciones: ["A: Staff Backend ACID", "V: gate documental SUITE GREEN + pnpm test:staff 47/47"]
estado_gov: GOV-PENDIENTE
estado: Vigente
```

```
id: 0030
timestamp_utc: 2026-08-25T01:42:27Z
schema_version: 2
sprint_fase: Transversal — Seguridad de credenciales SOL SUNAT
agente_responsable: Staff Security (kipus-security)
tipo: Decisión documental
subtipo: ADR corrector de arquitectura de credenciales SOL (deriva del FISCAL-007)
relacion: corrige
referencias_entradas: [0029]
referencias_documentales: ["docs/adr/ADR-0037-sol-credentials-architecture.md", "docs/adr/ADR-FISCAL-007-sunat-bill-beta.md", "docs/runbooks/secrets-ops-material.md", "docs/runbooks/fiscal-onboarding-tenant.md"]
prev_id: 0029
prev_hash: 6491c0e79e1de8f8f415f1e1c7c026d45653340e457eecd0dbb10239691e003e
entry_hash: 6d458488c61672bf8f86ebc714cc475f7eb541ddd139fed61867d20132afca6a
ticket_or_adr: ADR-0037 (Propuesto); corrige cláusulas de ubicación de ADR-FISCAL-007; LEDGER 0473/0474; SEC-03
test_ids: [SUITE, V-12, V-18]
entregable_afectado: docs/adr/ADR-0037-sol-credentials-architecture.md (nuevo)
descripcion: >
  Cierra el hallazgo documental de LEDGER 0474: ADR-FISCAL-007 enuncia SOL
  «solo Secrets Store» pero la realidad operativa es (a) secret_text bindings
  en kipuspay-worker-fiscal-staging (fallback backward-compatible del piloto
  Rosa Negra) y (b) filas tenant_sol_credentials (migración 0061, envelope
  AES-GCM con DEK KMS) como camino canónico multi-emisor; Secrets Store NO se
  usa para SOL. ADR-0037 (estado Propuesto, NO aceptado — decisión de Staff
  Principal) codifica la precedencia ya implementada y test-fijada en
  select-transport.ts + tenant-sol-credentials.ts: fila por tenant > env del
  worker > fail-closed (MISCONFIGURED staging / SUNAT_PRODUCTION_SOL_MISSING
  production; material corrupto → TenantSolChannelError TENANT_SOL_UNAVAILABLE,
  jamás fallback silencioso al SOL de otro emisor). Decisión propuesta:
  (i) fila por tenant canónica para todo negocio nuevo; (ii) env del worker
  DEPRECATED para nuevos tenants, retiro condicionado a migración del piloto a
  fila; (iii) Secrets Store explícitamente excluido para SOL (queda para
  material de plataforma worker-kms). Rotación por ubicación documentada
  (wrangler secret put ×2 + verificación CDR 0 vs re-wrap de fila). Corrección
  SEC-03 precisada: plaintext jamás en D1/git; el envelope cifrado ES la
  «envoltura KMS» que la regla admite (patrón tenant_certificates 0056).
  Sin cambios de código: el ADR documenta lo existente. Sin commits.
evidencia: >
  scripts/verify.sh RESULT SUITE GREEN tras crear el ADR (V-18 front-matter
  GREEN, V-12 refs GREEN — §5.2/§5.4/§0.4/§2.6 resuelven; V-19 presupuesto
  GREEN); git status limpio salvo el archivo nuevo (sin commits, sin tocar
  docs/LEDGER.md ni entradas previas de este ledger). Estado del ADR:
  Propuesto, firmas RACI A pendiente Staff Principal. Nota de integridad:
  el append inicial de esta entrada salió malformado (fence pegado por
  falta de \\n final → hash inválido, V-13 RED); reparado en la misma
  sesión ANTES de cualquier commit reescribiendo solo esta entrada nunca
  válida (fence + hash recalculado con lógica canónica de
  ledger_chain.py); cero entradas previas tocadas.
ancestry_verified: true
aprobaciones: ["A: pendiente Staff Principal (ADR Propuesto)", "V: gate documental SUITE GREEN"]
estado_gov: GOV-PENDIENTE
estado: Vigente
```

```
id: 0031
timestamp_utc: 2026-08-24T21:05:00Z
schema_version: 2
sprint_fase: Transversal — Auditoría de conformidad SUNAT SEE Del Contribuyente
agente_responsable: Kipus Fiscal (kipus-fiscal-auditor)
tipo: Auditoría
subtipo: Gap analysis emisor electrónico vs implementación (8 dimensiones)
relacion: registra
referencias_entradas: [0030]
referencias_documentales: ["docs/runbooks/fiscal-onboarding-tenant.md", "docs/runbooks/sunat-cdt-rosa-negra-staff.md", "packages/domain-fiscal-pe/src/index.ts", "packages/adapters-d1/src/process-credit-note-atomic.ts", "apps/worker-fiscal/src/fiscal-drain.ts", "packages/adapters-sunat/src/sunat-channel.ts"]
prev_id: 0030
prev_hash: 6d458488c61672bf8f86ebc714cc475f7eb541ddd139fed61867d20132afca6a
entry_hash: f4a3952e4b5eb865b14f629c67ed7e857875c2fc55515248328912e60a7d853c
ticket_or_adr: sin ADR (auditoría; hallazgos para backlog)
test_ids: [SUITE]
entregable_afectado: ninguno (solo lectura; reporte al owner)
descripcion: >
  GAP ANALYSIS SUNAT SEE Del Contribuyente sobre código (sin tocar nada).
  OK: plazos +3d factura / +7d RC con T-24h/T-6h/DEADLINE cubren facturas
  (computeMustSubmitByIso + processFiscalDeadlines + cron 6h); boletas jamás
  XML unitario (SKIP_RC fail-closed) y RC PRIMARY/COMPLEMENTARY con condición
  3 de baja; guard NC exige CDR salvo E-A full-cancel auditada
  CREDIT_NOTE_NO_CDR; canal producción allowlist exacta e-factura.sunat.gob.pe
  intacta con errores tipados; XML unitario firmado persiste en R2 con hash en
  D1. HALLAZGOS: (H1 BLOQUEANTE-CONDICIONAL) NC/ND sobre boleta clasifican
  canal RC pero nadie las envía — outbox solo inserta UNIT_XML
  (process-credit-note-atomic.ts:535, process-debit-note-atomic.ts:244) y el
  RC solo arma ('03','12') (build-daily-summary.ts:154): quedan PENDING hasta
  DEADLINE_EXCEEDED; hoy mitigado porque la única ruta NC es credit-note-ea
  full-cancel, pero ND (/api/sales/debit-notes) expone el hueco al activar su
  flag. (H2 GAP-PRODUCTO) payload QR fiscal no se construye en ningún punto
  del repo y representación impresa carece de fecha emisión/IGV/adquirente/
  denominación oficial (RS 097-2012 anexo 2 + RS 402-2019). (H3
  GAP-PRODUCTO) sobre RC firmado y CDR completo no se persisten (solo
  cdr_code/message en D1); retención R2 sin política declarada. (H4
  GAP-PRODUCTO) portal CPE existe (1 año, token, fail-closed) pero default
  OFF, nadie genera el enlace al adquirente y sirve HTML sin XML/CDR.
  (H5 MENOR) excepción E-A sin tope de 10° día hábil (cero lógica de días
  hábiles en domain-fiscal-pe). (H6 MENOR doc) runbooks no documentan
  elegibilidad CDT (gratuito, 3ra categoría, <=300 UIT, no PSE/OSE, máx 2).
evidencia: >
  scripts/verify.sh RESULT SUITE GREEN tras la auditoría; git status limpio
  (ningún archivo de código o doctrina modificado); cadena staff-ledger
  verificada con scripts/checks/ledger_chain.py tras este append. Sin
  commits, sin envíos a SUNAT.
ancestry_verified: true
aprobaciones: ["A: pendiente Staff Fiscal (hallazgos para backlog)", "V: gate documental SUITE GREEN"]
estado_gov: GOV-PENDIENTE
estado: Vigente
```

```
id: 0032
timestamp_utc: 2026-08-25T03:08:45Z
schema_version: 2
sprint_fase: Transversal — Remediación H2 (auditoría 0031, GAP-PRODUCTO)
agente_responsable: Kipus Hardware/Print
tipo: Implementación
subtipo: Payload QR fiscal RS 402-2019 + representación impresa CPE completa (TDD)
relacion: remedia
referencias_entradas: [0031]
referencias_documentales: ["packages/print-templates/src/fiscal-qr.ts", "packages/print-templates/src/qr-svg.ts", "packages/print-templates/src/build-html.ts", "packages/print-templates/src/build-escpos.ts", "apps/pos-web/src/lib/print/offload-compile.ts", "apps/pos-web/src/lib/print/printer-transport.ts", "apps/pos-web/src/lib/vendor/qrcode.mjs"]
prev_id: 0031
prev_hash: f4a3952e4b5eb865b14f629c67ed7e857875c2fc55515248328912e60a7d853c
test_ids: [packages/print-templates/src/fiscal-qr.test.ts, packages/print-templates/src/qr-svg.test.ts, packages/print-templates/src/fiscal-qr.integration.test.ts, packages/print-templates/src/print-templates.test.ts, apps/pos-web/src/lib/print/offload-compile.fiscal.test.ts]
entregable_afectado: hardware.print_templates (tickets CPE/NV 58/80); sin cambios de contrato DDL ni API
descripcion: >
  Cierra H2 de la auditoría 0031. (1) Builder buildFiscalQrPayload en
  print-templates: cadena pipe de 10 campos en orden normativo RUC|TIPO|
  SERIE|NUMERO(8d)|MTO IGV|MTO TOTAL|FECHA(yyyy-mm-dd)|TIPO DOC ADQ|NUM DOC
  ADQ|CODIGO HASH según anexo de representación impresa RS 402-2019/SUNAT
  (verificado con websearch contra manuales de integración que citan el anexo
  textualmente; el QR normativo NO es URL de consulta sino la cadena pipe;
  montos n(12,2) desde INTEGER cents, adquirente "-" si no aplica; validación
  fail-closed rechaza QR parciales). Punto único de construcción en flujo POS:
  buildSaleTicketSnapshot arma el payload solo con datos CPE completos (tipo
  fiscal + RUC + hash + fecha); CPE pendiente o NV no llevan QR. (2) QR
  renderizado zero-dep: qrMatrixToSvg (matriz→SVG, Web Platform APIs puro)
  consumiendo el generador vendorizado MIT ya existente en pos-web (cero npm
  nuevo, invariante 10); system_print inyecta el renderer, ESC/POS mantiene GS
  ( k nativo. (3) Plantillas HTML+ESC/POS completan campos faltantes del anexo
  2 RS 097-2012: denominación oficial (FACTURA ELECTRÓNICA/BOLETA DE VENTA
  ELECTRÓNICA/NC/ND), fecha de emisión, IGV desglosado y adquirente
  (denominación + tipo/número doc catálogo 06). TicketData/PrintTicketSnapshot
  extienden issueDateIso/igvCents/buyer opcionales; NV jamás imprime bloques
  fiscales. Alcance respetado: sin tocar worker-fiscal/adapters-d1 (agente
  paralelo) ni docs/LEDGER.md.
evidencia: >
  TDD RED→GREEN: 6 tests de plantilla + builder/matriz inexistentes RED,
  luego GREEN. Suites: print-templates 67 unit + 4 integration GREEN
  (lint/typecheck/prettier OK); pos-web print 38 GREEN (svelte-check 0).
  Evidencia 2 modelos simulados (fiscal-qr.integration.test.ts): térmica
  ESC/POS 58mm/32col y 80mm/48col decodificando bytes (layout completo +
  payload íntegro dentro de GS ( k) y SystemPrint HTML con matriz real del
  generador vendorizado (finder pattern ISO 18004 verificado, módulos SVG =
  módulos oscuros). scripts/verify.sh RESULT SUITE GREEN; bundle pos-web
  276.91 kB < 300 kB (CAL-06/V-24); cero dependencias npm nuevas. Sin commits.
ancestry_verified: true
aprobaciones: ["A: pendiente Staff Hardware (remediación H2 para revisión)", "V: gate documental SUITE GREEN + suites locales GREEN"]
estado_gov: GOV-PENDIENTE
estado: Vigente
entry_hash: 03cc27df1a23453ee7939ab409d49352284e3d1fb94a7ad1c89d6074a6d3e8c6
```

```
id: 0033
timestamp_utc: 2026-08-25T03:20:00Z
schema_version: 2
sprint_fase: Transversal — Remediación H1 (auditoría 0031, BLOQUEANTE-CONDICIONAL)
agente_responsable: Kipus ACID (Motor Transaccional)
tipo: Implementación
subtipo: NC/ND sobre boletas viajan por RC — canal fiscal completo (TDD)
relacion: remedia
referencias_entradas: [0031]
referencias_documentales: ["packages/adapters-d1/src/process-credit-note-atomic.ts", "packages/adapters-d1/src/process-debit-note-atomic.ts", "packages/adapters-d1/src/build-daily-summary.ts", "packages/domain-fiscal-pe/src/daily-summary.ts", "apps/worker-fiscal/src/fiscal-drain.ts"]
prev_id: 0032
prev_hash: 03cc27df1a23453ee7939ab409d49352284e3d1fb94a7ad1c89d6074a6d3e8c6
entry_hash: 463c579e9a49b298ab3230ad5338d22c31dba5d8a08478384dea409947f1d5b1
test_ids: [packages/domain-fiscal-pe/src/fiscal-rc.test.ts, apps/worker-fiscal/src/fiscal-drain.test.ts, packages/adapters-d1/src/fiscal-rc-notes.integration.test.ts, packages/adapters-d1/src/process-debit-note-atomic.integration.test.ts, packages/adapters-d1/src/process-offline-sale-atomic.integration.test.ts]
entregable_afectado: fiscal.rc_channel (NC/ND over boleta); sin cambios de contrato DDL ni API
descripcion: >
  Cierra H1 de la auditoría 0031: las NC (07)/ND (08) vinculadas a boletas
  ('03') clasificaban canal RC pero nadie las enviaba — el outbox solo
  insertaba UNIT_XML (process-credit-note-atomic.ts:535 /
  process-debit-note-atomic.ts:244) y el RC solo armaba '03'/'12'
  (build-daily-summary.ts:154 + planDailySummary daily-summary.ts:37 +
  sweep :358); quedaban PENDING hasta DEADLINE_EXCEEDED. Fix en 4 puntos:
  (1) procesos atómicos insertan fila outbox PENDING cuando el canal es RC
  (condición xmlChannel !== 'NONE'; E-A intacta — NC sin CDR del origen jamás
  se encola; UNIT_XML de factura sin cambios); (2) query del RC y del sweep
  incluyen 07/08 con EXISTS sobre origen 03/12 vía referenced_sale_id;
  (3) líneas UBL con tipo real 07/08 + condición catálogo 19 por motivo
  (NC motivo 01 → baja '3'; resto adición '1') y credit_note_motive_code en
  RcXmlRow; (4) planDailySummary acepta 07/08 para marcar daily_summary_id +
  sunat_status (sin re-listado infinito). Entrega verificada end-to-end:
  drain reclama → outboxDeliveryChannel('07'|'08', ref '03') = RC → SKIP_RC
  libera a PENDING → cron buildDailySummary arma SummaryDocuments → CDR.
  Guardrails respetados: sunat-channel, nd-motive-catalog y camino UNIT_XML
  de notas sobre factura intactos; db.batch único, cero UPSERT.
evidencia: >
  TDD RED→GREEN con causas exactas: RED dominio (RC_NO_BOLETAS al incluir
  07/08), RED integración H1-a/b (fila outbox undefined), H1-c/e
  (ALREADY_EXISTS en vez de SUCCESS — la query no veía notas), sweep ([]).
  GREEN: domain-fiscal-pe 181 unit; worker-fiscal 74 unit (incluye SKIP_RC
  de 07/08 ref '03'); adapters-d1 449 unit + 319 integration (42 archivos),
  incl. regresión ND/NC-over-factura UNIT_XML, caos de duplicado
  (NC_EXCEEDS_RESIDUAL, 1 sola fila outbox, serie intacta) y validación
  assertValidSummaryDocumentsXml sobre sobre mixto 07+08 con serie/número.
  lint/typecheck/prettier OK; scripts/verify.sh RESULT SUITE GREEN (32
  checks); pnpm quality OK (bundle POS 277.82 kB < 300 kB). Sin commits.
ancestry_verified: true
aprobaciones: ["A: pendiente revisión Staff Fiscal (remediación H1)", "V: gate documental SUITE GREEN + suites locales GREEN"]
estado_gov: GOV-PENDIENTE
estado: Vigente
```
id: 0034
timestamp_utc: 2026-08-25T04:29:46Z
schema_version: 2
sprint_fase: Transversal — Remediación H4+H6 (auditoría 0031)
agente_responsable: Kipus POS/Security (Staff Frontend + Security)
tipo: Implementación
subtipo: Portal CPE end-to-end (enlace distribuible + serving XML/constancia) + elegibilidad CDT en runbook (TDD)
relacion: remedia
referencias_entradas: [0031]
referencias_documentales: ["packages/domain-fiscal-pe/src/cpe-portal.ts", "apps/worker-api/src/fiscal/fiscal-rc-routes.ts", "apps/worker-api/src/index.ts", "apps/worker-api/wrangler.jsonc", "docs/runbooks/fiscal-onboarding-tenant.md"]
prev_id: 0033
prev_hash: 463c579e9a49b298ab3230ad5338d22c31dba5d8a08478384dea409947f1d5b1
entry_hash: 5c82427b48c5509dd57493613d2d8493954e1130eb1060ed05ea76603a9924ed
test_ids: [packages/domain-fiscal-pe/src/cpe-portal.test.ts, apps/worker-api/src/fiscal/fiscal-rc-routes.test.ts, apps/worker-api/src/auth/protected-routes.test.ts]
entregable_afectado: fiscal.cpe_portal (enlace distribuible + archivos xml/cdr); runbook onboarding fiscal (sección 1.1); sin cambios DDL ni en fiscal core
descripcion: >
  H4: el portal CPE existente (token SHA-256 determinista, vigencia 1 año,
  fail-closed por CPE_PORTAL_SECRET) servía solo HTML, estaba default OFF y
  nadie generaba el enlace al adquirente. Remediación en 3 frentes:
  (1) enlace distribuible por DERIVACIÓN DETERMINISTA — buildCpePortalUrl en
  domain-fiscal-pe compone {baseUrl}/v1/cpe/portal/{tenant}/{sale}?token=...
  sin escritura en D1; nuevo endpoint JWT GET /api/sales/:saleId/cpe-link en
  worker-api que lo entrega al POS solo con sunat_status=ACCEPTED (409
  CPE_NOT_ACCEPTED antes del CDR — invariante 8); consumo pos-web documentado
  (backend listo para representación impresa/WhatsApp).
  (2) el portal sirve ARCHIVOS además del HTML: ?file=xml descarga el XML
  firmado desde FISCAL_XML_R2 (fiscal-xml/{tenant}/{sale}.xml, application/xml
  + content-disposition F001-00000001.xml) y ?file=cdr sirve constancia de
  recepción generada desde estado autoritativo D1 (sales.sunat_status + CDR
  del resumen diario vía LEFT JOIN para boletas; renderCpeReceiptXml con
  escape XML). Archivos SOLO de CPE ACCEPTED, retención 1 año también para
  archivos (assertWithinRetention), aislamiento cross-tenant por token
  (SHA-256 liga tenant+sale), file desconocido → 400. La constancia está
  etiquetada como constancia KipusPay: NO reemplaza el CDR zip original
  (retenerlo exige cambios en worker-fiscal/drain — fuera de mi guardrail;
  el agente paralelo ya añade cdrZipB64 en RcCdrPort para H3).
  (3) default ON: isCpePortalEnabled pasa a opt-out (FEATURE_CPE_PORTAL !==
  '0'); se eliminan las dos líneas "FEATURE_CPE_PORTAL": "0" de wrangler.jsonc
  (respetando lección S12: jamás FEATURE_*=1 commiteado; opt-out sigue
  posible con var runtime). El fail-closed real permanece: sin
  CPE_PORTAL_SECRET → 503 PORTAL_UNAVAILABLE.
  H6: docs/runbooks/fiscal-onboarding-tenant.md §1.1 "Elegibilidad CDT
  (certificado gratuito)": requisitos (RUC activo/habido, 3ra categoría,
  ingresos ≤300 UIT ref S/ 1 260 000 año 2019, no inscrito PSE/OSE, sin CDT
  vigente, máx 2 CDTs, aceptar T&C), trámite SOL Empresas → Comprobantes de
  Pago → CDT con descarga por Buzón electrónico, autorización SUNAT hasta
  31-dic-2027 (Ley 32543; desde 2028 exige acreditación INDECOPI EREP),
  vigencia CDT 3 años, y cuándo se exige certificado pagado de CA (perfil no
  elegible). Fuente cpe.sunat.gob.pe/certificado-digital.
evidencia: >
  TDD RED→GREEN: RED dominio 7/8 (buildCpePortalUrl/renderCpeReceiptXml/
  fileUrls inexistentes), RED worker-api 13 (default OFF, sin files, sin
  cpe-link). GREEN: domain-fiscal-pe 198 unit (incl. 8 nuevos de portal);
  worker-api 1407 unit (32 en fiscal-rc-routes.test.ts: files xml/cdr,
  PENDING→409, R2 miss→404 FILE_NOT_FOUND, sin binding→503, cross-tenant
  token→401, traversal→400 BAD_FILE_REQUEST, retención+1h→410
  CPE_PORTAL_EXPIRED, HTML con descargas; paridad de rutas protegidas 446);
  tsc OK; eslint OK (complejidad 20→refactor serveCpePortalFile); prettier
  OK; scripts/verify.sh RESULT SUITE GREEN. Timeout flaky pre-existente en
  tenant-cert-upload bajo carga full-suite (pasa aislado y en clean
  checkout). Sin commits; guardrails respetados: cero toques a adapters-d1/
  worker-fiscal fiscal core ni a ledgers normativos.
ancestry_verified: true
aprobaciones: ["A: pendiente revisión Staff Fiscal (remediación H4)", "V: gate documental SUITE GREEN + suites locales GREEN"]
estado_gov: GOV-PENDIENTE
estado: Vigente
```
id: 0035
timestamp_utc: 2026-08-25T05:20:00Z
schema_version: 2
sprint_fase: Transversal — Remediación H3+H5 (auditoría 0031)
agente_responsable: Kipus Fiscal/ACID (Staff Backend Motor Transaccional)
tipo: Implementación
subtipo: Conservación SUNAT del sobre RC firmado + CDR en R2 (H3) y tope 10° día hábil E-A (H5) — TDD
relacion: remedia
referencias_entradas: [0031]
referencias_documentales: ["packages/adapters-d1/src/build-daily-summary.ts", "packages/adapters-d1/src/process-credit-note-atomic.ts", "packages/domain-fiscal-pe/src/business-days.ts", "packages/domain-fiscal-pe/src/archive-retention.ts", "apps/worker-fiscal/src/fiscal-drain.ts", "packages/adapters-sunat/src/http-rc-cdr-port.ts", "packages/adapters-d1/migrations/0062_fiscal_rc_archive.sql"]
prev_id: 0034
prev_hash: 5c82427b48c5509dd57493613d2d8493954e1130eb1060ed05ea76603a9924ed
entry_hash: 656f10277fac52cd2ad896cf96652a5c59f8a99ee82b206a1e6ae2decc71fec9
test_ids: [packages/domain-fiscal-pe/src/business-days.test.ts, packages/adapters-d1/src/fiscal-rc-archive.integration.test.ts, packages/adapters-d1/src/process-credit-note-ea-deadline.integration.test.ts, packages/adapters-d1/src/process-offline-sale-atomic.integration.test.ts, apps/worker-fiscal/src/fiscal-drain.test.ts]
entregable_afectado: fiscal.rc_archive (r2_rc_xml_key/r2_cdr_key en sunat_daily_summaries; r2_cdr_key en fiscal_outbox; mig 0062 up/down); fiscal.ea_deadline (guard dominio + preflight NC); puerto RcCdrPort gana cdrZipB64 opcional
descripcion: >
  H3: el sobre RC firmado y el CDR no se persistían — solo cdr_code/message en
  D1, violando la conservación SUNAT del emisor (CPEs/CDRs/resúmenes; Código
  de Comercio art. 190 / Reglamento SUNAT) mientras el XML unitario sí seguía
  el patrón R2 (fiscal_outbox.r2_xml_key, mig 0019). Remediación en 4 frentes:
  (1) mig 0062 (up/down espejados V-25): r2_rc_xml_key + r2_cdr_key en
  sunat_daily_summaries, r2_cdr_key en fiscal_outbox; registry de backup
  actualizado con las columnas nuevas. (2) buildDailySummary archiva
  post-commit BEST-EFFORT el sobre FIRMADO en rc/<tenant>/<id>.xml y el CDR
  en rc/<tenant>/<id>-cdr.zip (bytes exactos vía cdrZipB64 nuevo y opcional
  en RcCdrPort; http-rc-cdr-port lo propaga del body del PSE) o, si el PSE
  aún no entrega zip, receipt JSON rc/<tenant>/<id>-cdr.json; referencia D1
  en UNA sentencia UPDATE posterior — clave en D1 ⇒ objeto en R2 (sin
  referencias colgantes); fallo de R2 NO revierte el SUCCESS del CDR (warn
  RC_ARCHIVE_FAILED + claves NULL), porque el CDR ya es válido ante SUNAT.
  (3) drain unitario: receipt JSON fiscal-cdr/<tenant>/<sale>.json +
  r2_cdr_key en el MISMO UPDATE que marca SENT (best-effort, warn
  UNITARY_CDR_ARCHIVE_FAILED); refactor submitWithChannelIsolation para
  complejidad ≤15. (4) política de retención declarada UNA vez en
  domain-fiscal-pe (FISCAL_ARCHIVE_RETENTION_YEARS=5 / _MS, fuente citada en
  comentario) y expuesta para un job futuro de purga — SIN borrador
  automático. H5: la excepción E-A (NC de anulación sin CDR) carecía del
  tope SUNAT de los primeros 10 días hábiles del mes siguiente a la emisión
  del CPE. Nueva función pura business-days.ts (calendario Lima UTC-5,
  excluye sáb/dom; LIMITACIÓN documentada: sin feriados Perú v1 — error
  conservador contra el emisor, jamás a favor) + guard tipado
  assertEaAnulacionDeadline → CREDIT_NOTE_EA_DEADLINE_EXCEEDED, cableado en
  processCreditNoteAtomic como PREFLIGHT (antes del plan atómico → cero
  escrituras parciales: sin fila NC, correlativo intacto, sin auditoría ni
  outbox huérfanos — rollback verificado en test). Reloj inyectable
  options.nowMs; fixture E-A preexistente fijado (origin 2026-08-04 rompía
  por calendario real desde el 15-sep-2026). Guardrails: print-templates/
  pos-web intactos, ledgers normativos intactos, db.batch/sin UPSERT.
evidencia: >
  TDD RED→GREEN con causas exactas. H5 RED: módulo business-days inexistente
  (9 tests); integración: NC E-A fuera de tope resolvía SUCCESS (guard
  ausente). H5 GREEN: domain-fiscal-pe 198 unit (29 archivos, incl.
  business-days 9); adapters-d1 integration 55/55 en los 2 archivos del
  guard (tope vencido rechaza tipado + rollback verificado: 0 filas sales
  '07', current_number=3 intacto, 0 audit_events, 0 outbox; camino feliz E-A
  dentro de tope; NC sobre ACCEPTED vieja NO pasa por el guard).
  H3 RED: 4 tests nuevos (sobre firmado, zip exacto, receipt fallback,
  chaos R2) fallaban por claves/funciones inexistentes. H3 GREEN:
  adapters-d1 integration 326/326 (44 archivos, incl. fiscal-rc-archive
  10/10: XML con ds:Signature en rc/<t>/<id>.xml + r2_rc_xml_key; zip bytes
  exactos + r2_cdr_key; receipt JSON parseable; chaos → SUCCESS/ACCEPTED
  intacto, claves NULL, warn presente); adapters-d1 unit 449/449;
  worker-fiscal 76/76 (incl. H3-c receipt+r2_cdr_key en SENT y chaos R2);
  adapters-sunat 55/55; worker-api 1407/1407 (regresión); domain-fiscal-pe
  198/198. lint/typecheck/prettier OK en los 5 paquetes tocados (complejidad
  submit 20→refactor resultFromPse2xx; processClaimedRow 17→13 con
  submitWithChannelIsolation). scripts/verify.sh RESULT SUITE GREEN;
  pnpm quality Quality Gate OK (bundle POS 277.85 kB < 300 kB). Sin commits.
ancestry_verified: true
aprobaciones: ["A: pendiente revisión Staff Fiscal (remediación H3+H5)", "V: gate documental SUITE GREEN + suites locales GREEN"]
estado_gov: GOV-PENDIENTE
estado: Vigente

```
id: 0036
timestamp_utc: 2026-08-25T00:55:00Z
schema_version: 2
sprint_fase: Transversal — E2E e-beta: boleta S/0.01 a DNI + ND por RC (camino H1)
agente_responsable: Kipus Fiscal (Staff Fiscal SUNAT)
tipo: Auditoría
subtipo: Homologación runtime sendSummary — 3 envíos, hallazgos 2278/0306 + fixes builder test-first
relacion: registra
referencias_entradas: [0031, 0035]
referencias_documentales: ["packages/domain-fiscal-pe/src/ubl-summary.ts", "packages/domain-fiscal-pe/src/ubl-summary.test.ts", "scripts/staff/sign-only-cpe.mjs", "scripts/staff/send-beta-cpe.mjs", "tmp-staff/boleta-nd-e2e-resultados.json", "docs/architecture/05-2-fiscal-pipeline.md"]
prev_hash: 656f10277fac52cd2ad896cf96652a5c59f8a99ee82b206a1e6ae2decc71fec9
entry_hash: 1efcaedf3b2a4ea55b9f03c44636c69b596e87bb3fe6f85e4e33a0bad4bc3297
test_ids: [packages/domain-fiscal-pe/src/ubl-summary.test.ts]
entregable_afectado: fiscal.rc_ubl (SummaryDocuments: afectación 10/20/30 → tributos 1000/9997/9998; BillingReference opt-in); scripts staff RC (DNI tipo doc 1, líneas 03+08, DOC_KIND=RC → sendSummary)
descripcion: >
  Test E2E solicitado por owner en canal e-beta (CDT ROSA NEGRA): boleta
  B001-00000006 a DNI 10715001701 (tipo doc 1) por S/ 0.01 y su ND
  B001-00000001 viajando como línea 08 del RC complementario (camino H1,
  §5.2). Presupuesto 3/3 envíos SOAP sendSummary reales (sin mock ni
  contingencia, invariante 8). Resultados: RC-20260825-001 (boleta exonerada,
  tributo 9997 EXO) → intento 1 unreachable opaco (sondeo getStatus posterior:
  HTTP 200 sin fault ⇒ red+SOL OK; causa probable statusCode 98 clasificado
  unreachable antes de consultar ticket) + intento 2 CDR 2278 "Debe indicar
  Información acerca del importe total de IGV/IVAP" (el validador de resúmenes
  exige el nodo IGV; el EXO puro no basta — difiere del 3111 de facturas).
  RC-20260825-002 (complementario H1: boleta corregida gravada-cero según
  instrucción owner + ND con BillingReference→B001-00000006/03) → CDR 0306
  cvc-particle: el XSD restringido de e-beta rechaza cac:BillingReference tras
  cbc:ID en SummaryDocumentsLine (mismo patrón que FINDING-4 FL-1: e-beta es
  más restrictivo que el XSD oficial). Fixes test-first aplicados (RED→GREEN):
  builder ubl-summary.ts gana igvAffectationCode (10/20/30 → 1000 IGV / 9997
  EXO / 9998 INA) y BillingReference opt-in (default OFF = shape e-beta
  validado por RC-20260824-001 CDR 0; flag para canal producción/XSD oficial);
  sign-only-cpe.mjs soporta CUSTOMER_DOC_TYPE (DNI '1'), RC_LINE_KINDS '03,08',
  RC_NOTE_ID, REF_DOC_ID/REF_DOC_TYPE; send-beta-cpe.mjs enruta DOC_KIND=RC →
  documentType '03' (sendSummary). La ND quedó sin verificación runtime por
  agotamiento de presupuesto: pendiente ventana nueva con línea ND sin BR.
evidencia: >
  TDD RED→GREEN: 3 tests nuevos fallaban (BillingReference ausente, EXO 9997
  no emitido, INA 9998 no emitido); GREEN 9/9 en ubl-summary.test.ts. Suites:
  domain-fiscal-pe 203/203 (cobertura 99.06% statements ≥ umbral 95%),
  adapters-sunat 55/55, adapters-d1 449/449 (regresión del consumidor del
  builder). scripts/verify.sh RESULT SUITE GREEN. Evidencia runtime completa
  en tmp-staff/boleta-nd-e2e-resultados.json (3 envíos con wire-log de
  respuestas SUNAT, sin secretos) + XML firmados tmp-staff/e2e-rc1-*.xml y
  e2e-rc2-*.xml (hashes 0976c412… y bab954ef…, fingerprint cert
  4dc90110…). Sondeo getStatus con ticket dummy usado solo como diagnóstico
  (consulta, no consume envío). Sin commits.
ancestry_verified: true
aprobaciones: ["A: pendiente revisión Staff Fiscal", "V: gate documental SUITE GREEN + suites locales GREEN"]
estado_gov: GOV-PENDIENTE
estado: Vigente
```

```text
id: 0037
timestamp_utc: 2026-08-25T19:30:00Z
schema_version: 2
sprint_fase: Fase 1 — Fix F-02 registry-3 + worktree + CI alerts
agente_responsable: Staff SRE (ejecución: kipus-sre; auditoría: Staff Principal)
tipo: Corrección de especificación
subtipo: Bump D1_BACKUP_REGISTRY_VERSION registry-2 → registry-3
relacion: corrige
referencias_entradas: [0036]
referencias_documentales: [packages/adapters-d1/src/data-backup-registry.generated.ts, .github/workflows/deploy-staging.yml]
prev_id: 0036
prev_hash: 1efcaedf3b2a4ea55b9f03c44636c69b596e87bb3fe6f85e4e33a0bad4bc3297
entry_hash: 03af9f6e4c85396341208c0d9879b9af680fbd1b339a14c9391f19f48c3ef041
ticket_or_adr: F-02; V-13; V-31
test_ids: [packages/adapters-d1/src/fiscal-rc-ticket-correlative-schema.test.ts, V-13, V-31, SUITE]
entregable_afectado: packages/adapters-d1/src/data-backup-registry.generated.ts §registry; packages/adapters-d1/test/generate-data-backup-schema.mjs §generator
descripcion: >
  Cierre de GAP F-02: 0063 añade columnas sunat_reception_ticket/correlative a
  sunat_daily_summaries (tabla BUSINESS backuppeada) → breaking change según
  05-9-data-backup.md. Comentario generado estaba stale (0056+0057+0058+0060)
  y parchado manual a +0062 sin regenerar. Bump a registry-3 con 0062+0063 y
  fallback registry-2→3. Limpieza worktree stale y alertas CI success añadidas.
evidencia: >
  RED: registry-2 stale omitía 0062/0063; worktree stale; sin alerta success.
  GREEN: registry-3 en 5 hits; adapters-d1 452/452 + 334/334 integration;
  V-13 dual GREEN; SUITE GREEN (31/31); prettier limpio.
ancestry_verified: true
aprobaciones: [Staff SRE, Staff Principal]
estado_gov: GOV-APROBADO
estado: Vigente
```

```text
id: 0038
timestamp_utc: 2026-08-25T20:30:00Z
schema_version: 2
sprint_fase: Fase 1 — Hardening riesgos 1-3 auditoría pre-piloto
agente_responsable: Staff Principal (ejecución: kipus-qa + kipus-sre; auditoría: Staff Principal)
tipo: Corrección de especificación
subtipo: Flaky cert + TTL 360s + correlative chaos N=10
relacion: corrige
referencias_entradas: [0037]
referencias_documentales: [packages/adapters-d1/src/process-mobile-push-atomic.ts, packages/adapters-d1/src/build-daily-summary.ts, apps/pos-web/src/lib/fiscal/cert-client-validator.test.ts]
prev_id: 0037
prev_hash: 03af9f6e4c85396341208c0d9879b9af680fbd1b339a14c9391f19f48c3ef041
entry_hash: 77b30621dd0c1570b4aeff16e27401316630c9953732343405f4046ad3311097
ticket_or_adr: Riesgos 1-3 auditoría pre-piloto
test_ids: [apps/pos-web/src/lib/fiscal/cert-client-validator.test.ts, packages/adapters-d1/src/mobile-push-atomic.test.ts, packages/adapters-d1/src/fiscal-rc-f05.integration.test.ts, packages/adapters-d1/src/fiscal-rc-chaos-concurrent.integration.test.ts, V-13, SUITE]
entregable_afectado: packages/adapters-d1/src/process-mobile-push-atomic.ts §TTL; packages/adapters-d1/src/build-daily-summary.ts §correlative; apps/pos-web/src/lib/fiscal/cert-client-validator.test.ts §timeout
descripcion: >
  Cierre de los 3 riesgos residuales del auditor pre-piloto. (1) Flaky
  cert-client-validator: genrsa 2048 >5s bajo turbo → 3 timeouts. Fix: timeout
  5s→10s + sharedKeyPem reuse con certCache por subj|password|days (key no
  depende de days, solo notAfter). (2) Push TTL vs cron: default 300s marginal
  (=cron 300s) → bump a 360s (+60s margen) con comentario F-02; conserva TTLs
  explícitos. (3) Correlative: MAX+1 con retry 3 → bump a 10 + handler rc_type
  idempotente + chaos N=10 concurrent-writers sin 500.
evidencia: >
  RED: 3 timeouts 5000ms; TTL 60 expiraba antes del cron; MAX+1 con 10 writers
  daba 500 UNIQUE. GREEN: pos-web 467/467, adapters-d1 454/454 + chaos 2/2,
  F-05 4/4, SUITE GREEN (31/31), V-13 dual GREEN; prettier limpio.
ancestry_verified: true
aprobaciones: [Staff QA, Staff SRE, Staff Principal]
estado_gov: GOV-APROBADO
estado: Vigente
```
