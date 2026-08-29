#!/usr/bin/env bash
# KipusPay — Batería de verificación documental (AGENTS.md §5)
#
# Cada check tiene un ID estable y emite una línea parseable:
#   RESULT <ID> GREEN|RED [motivo]
# La última línea es siempre `RESULT SUITE GREEN|RED`.
# Parseo desde un agente:  scripts/verify.sh | awk '$1=="RESULT" && $3=="RED"'
#
# V-00 autotest de los detectores  V-08 registry §0.4 sin huérfanos/duplicados
# V-01 fences pares                V-09 sin placeholders de imagen
# V-02 0 UPSERT INTO               V-10 sin escapes de exportación (\_ \= \-)
# V-03 sin literales http/ws       V-11 DDL fenceado + fences etiquetados
# V-04 db.transaction prohibido    V-12 referencias § resolubles
# V-05 tenant_id NOT NULL         V-13 cadena de hashes del ledger
# V-06 dinero en INTEGER cents     V-14 ratchet de FKs compuestas (DAT-12)
# V-07 sin switch(vertical)        V-15 INDEX.md sincronizado
#                                  V-16 ledger append-only (hook pre-commit — scripts/git-hooks/)
#                                  V-17 higiene de rutas versionadas
#                                  V-18 front-matter, alias y rutas citadas
#                                  V-19 presupuesto de tamaño por archivo
# Calidad de código (Arquitectura §13):
#                                  V-20 evidencia TDD del ledger (CAL-07)
#                                  V-21 dinero en código, cero float (CAL-01)
#                                  V-22 0 UPSERT INTO / db.transaction en *.sql
#                                  V-23 0 fork vertical en *.svelte (CAL-01)
#                                  V-24 presupuesto de bundle (CAL-06)
# Integración y deploy (Sprints 1,10,F):
#                                  V-25 espejo up↔down de migraciones D1 (Sprint 1)
#                                  V-26 copy marketing sin jerga técnica (GTM §1 / Sprint 10)
#                                  V-27 copy POS sin jerga técnica visible (Sprint F)
#                                  V-28 contrato POS↔API (/api registrado en worker-api — 0396)
#                                  V-29 paridad triggers epoch tenant_data_epochs (0396, 0052/0053)
#                                  V-30 cero literales demo en POS (F-6; refuerza V-27)
#                                  V-31 contrato CI/CD deploy staging (Proceso §5.2 Etapa 6, §13.7)
#
# Nota: se usa `set -uo pipefail` sin `-e` a propósito — la batería debe correr
# TODOS los checks y reportar el conjunto, no abortar en el primer RED.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1

FAIL=0
RED_IDS=()

# Corpus normativo descubierto desde la fuente única de rutas (scripts/checks/paths.py):
# contrato raíz + todo docs/**. Al partir un documento en capítulos, la batería los
# recoge sin editar este archivo.
mapfile -t DOCS < <(python3 scripts/checks/paths.py --list)
if [ "${#DOCS[@]}" -eq 0 ]; then
  echo "RESULT SUITE RED"
  echo "No se descubrió ningún documento normativo (revisa scripts/checks/paths.py)."
  exit 1
fi

say()  { printf '%s\n' "$*"; }
pass() { printf 'RESULT %s GREEN\n' "$1"; }
fail() { printf 'RESULT %s RED  %s\n' "$1" "$2"; FAIL=1; RED_IDS+=("$1"); }

# --- V-00: autotest del verificador -----------------------------------------
# Un gate sin autotest es como el falso GREEN que originó esta batería (Ledger 0179).
check_selftest() {
  python3 scripts/checks/selftest.py
  local rc=$?
  [ $rc -ne 0 ] && FAIL=1
  return 0
}

# --- V-17: higiene de rutas versionadas -------------------------------------
check_paths_hygiene() {
  python3 scripts/checks/paths_hygiene.py
  local rc=$?
  [ $rc -ne 0 ] && FAIL=1
  return 0
}

# --- V-18: front-matter, alias en prosa y rutas citadas ----------------------
check_aliases() {
  python3 scripts/checks/aliases.py
  local rc=$?
  [ $rc -ne 0 ] && FAIL=1
  return 0
}

# --- V-19: presupuesto de tamaño ---------------------------------------------
check_size_budget() {
  python3 scripts/checks/size_budget.py
  local rc=$?
  [ $rc -ne 0 ] && FAIL=1
  return 0
}

# --- V-01: fences pares ------------------------------------------------------
check_fences() {
  local bad="" f n
  for f in "${DOCS[@]}"; do
    if [ ! -f "$f" ]; then bad="$bad falta:$f"; continue; fi
    n=$(grep -c '^```' "$f")
    if [ $((n % 2)) -ne 0 ]; then bad="$bad $f($n)"; fi
  done
  if [ -n "$bad" ]; then fail V-01 "fences impares o docs ausentes:$bad"; else pass V-01; fi
}

# --- V-02: 0 UPSERT INTO (sintaxis inexistente en SQLite/D1) -----------------
check_no_upsert() {
  local hits
  hits=$(grep -InE 'UPSERT INTO [A-Za-z_]' "${DOCS[@]}" | grep -viE 'prohibi|nunca|jamás|no existe|no se usa')
  if [ -n "$hits" ]; then
    fail V-02 "UPSERT INTO detectado"
    printf '%s\n' "$hits" | head -5 | sed 's/^/     /'
  else pass V-02; fi
}

# --- V-03: sin literales http:// ni ws:// ------------------------------------
check_no_http_ws() {
  local hits
  hits=$(grep -InE 'http://|ws://' "${DOCS[@]}" \
        | grep -vE 'http://(www\.)?w3\.org|http://www\.apache\.org|http://schemas' \
        | grep -vE 'https?://|wss://')
  if [ -n "$hits" ]; then
    fail V-03 "literales http:// o ws://"
    printf '%s\n' "$hits" | head -5 | sed 's/^/     /'
  else pass V-03; fi
}

# --- V-04: db.transaction(callback) no existe en la API D1 -------------------
check_db_transaction() {
  local hits
  hits=$(grep -rInE 'db\.transaction\s*\(' --include='*.ts' --include='*.js' \
        --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build \
        --exclude-dir=.svelte-kit --exclude-dir=coverage . 2>/dev/null)
  if [ -n "$hits" ]; then
    fail V-04 "db.transaction( en código"
    printf '%s\n' "$hits" | head -5 | sed 's/^/     /'
  else pass V-04; fi
}

# --- V-07: capability model, no forks por vertical (ADR-ARCH-002) ------------
check_no_vertical_fork() {
  local hits
  # Excluir *.red.test.ts: son archivos de fase RED que mencionan switch(vertical)
  # en el texto de las descripciones de test, no como fork real de producción.
  hits=$(grep -rInE 'switch\s*\(\s*[A-Za-z_.]*vertical|vertical(_type)?\s*===' --include='*.ts' --include='*.js' \
        --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build \
        --exclude-dir=.svelte-kit --exclude-dir=coverage . 2>/dev/null \
        | grep -v '\.red\.test\.ts:')
  if [ -n "$hits" ]; then
    fail V-07 "fork por vertical en código"
    printf '%s\n' "$hits" | head -5 | sed 's/^/     /'
  else pass V-07; fi
}

# --- V-20: evidencia TDD del ledger (CAL-07, Arquitectura §13.9) ---------------
check_tdd_evidence() {
  python3 scripts/checks/tdd_evidence.py
  local rc=$?
  [ $rc -ne 0 ] && FAIL=1
  return 0
}

# --- V-21: dinero en código, cero float (CAL-01, Arquitectura §13.3) ----------
check_code_money() {
  python3 scripts/checks/code_money.py
  local rc=$?
  [ $rc -ne 0 ] && FAIL=1
  return 0
}

# --- V-22: 0 UPSERT INTO / db.transaction en *.sql/*.ts/*.svelte --------------
check_code_upsert_transaction() {
  local hits
  hits=$(grep -rInE 'UPSERT INTO [A-Za-z_]' --include='*.sql' --include='*.ts' --include='*.js' --include='*.svelte' \
        --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build \
        --exclude-dir=.svelte-kit --exclude-dir=coverage . 2>/dev/null \
        | grep -viE 'prohibi|nunca|jamás|no existe|no se usa')
  hits="$hits$(grep -rInE 'db\.transaction\s*\(' --include='*.sql' . 2>/dev/null)"
  if [ -n "$hits" ]; then
    fail V-22 "UPSERT INTO / db.transaction en código SQL"
    printf '%s\n' "$hits" | head -5 | sed 's/^/     /'
  else pass V-22; fi
}

# --- V-23: fork vertical en *.svelte (amplía V-07, ADR-ARCH-002) --------------
check_svelte_vertical_fork() {
  local hits
  hits=$(grep -rInE 'switch\s*\(\s*[A-Za-z_.]*vertical|vertical(_type)?\s*===' --include='*.svelte' \
        --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build \
        --exclude-dir=.svelte-kit --exclude-dir=coverage . 2>/dev/null)
  if [ -n "$hits" ]; then
    fail V-23 "fork por vertical en componente Svelte"
    printf '%s\n' "$hits" | head -5 | sed 's/^/     /'
  else pass V-23; fi
}

# --- V-24: presupuesto de bundle (CAL-06, Arquitectura §13.8) -----------------
check_bundle_budget() {
  python3 scripts/checks/bundle_budget.py
  local rc=$?
  [ $rc -ne 0 ] && FAIL=1
  return 0
}

# --- V-25: espejo up↔down de migraciones D1 -----------------------------------
# Cada migración up en packages/adapters-d1/migrations/ debe tener su down en
# migrations-down/ (Sprint 1: "migraciones up/down en CI"). Sin esto, un down
# se pierde silenciosamente y el rollback deja el schema a medias.
check_migrations_mirror() {
  python3 scripts/checks/migrations_mirror.py
  local rc=$?
  [ $rc -ne 0 ] && FAIL=1
  return 0
}

# --- V-26: copy marketing sin jerga técnica (GTM §1 / Sprint 10) --------------
# apps/marketing-web no puede contener Edge/D1/ACID/sharding/CDR/UBL/PSE etc.
# en copy de cara al cliente. El detector (scripts/checks/marketing_copy.py)
# escanea svelte/ts/md/html/css del sitio.
check_marketing_copy() {
  python3 scripts/checks/marketing_copy.py
  local rc=$?
  [ $rc -ne 0 ] && FAIL=1
  return 0
}

# --- V-27: copy del POS sin jerga técnica visible (Sprint F) -------------------
# El markup de las rutas de apps/pos-web (excluye dev/ y bloques <script>) no
# puede exponer flags, unidades internas, IDs demo ni refs de proceso al
# cajero/dueño. Detector: scripts/checks/pos_copy.py.
check_pos_copy() {
  python3 scripts/checks/pos_copy.py
  local rc=$?
  [ $rc -ne 0 ] && FAIL=1
  return 0
}

# --- V-30: cero literales demo en el código fuente del POS (F-6) -------------
# V-27 cubre el texto visible del template; V-30 escanea todo apps/pos-web/src
# (.ts + .svelte) y rechaza literales 'demo' asignados como valor (estado,
# objeto, params). Comparaciones defensivas y comentarios se permiten.
check_pos_demo_ids() {
  python3 scripts/checks/pos_demo_ids.py
  local rc=$?
  [ $rc -ne 0 ] && FAIL=1
  return 0
}

# --- V-05, V-06, V-08..V-12: checks estructurales ----------------------------
check_structural() {
  python3 scripts/checks/structural.py "${DOCS[@]}"
  local rc=$?
  [ $rc -ne 0 ] && FAIL=1
  return 0
}

# --- V-13: cadena de hashes del ledger --------------------------------------
check_ledger_chain() {
  python3 scripts/checks/ledger_chain.py
  local rc=$?
  [ $rc -ne 0 ] && FAIL=1
  return 0
}

# --- V-15: INDEX.md generado y sincronizado ----------------------------------
check_index_drift() {
  python3 scripts/checks/gen_index.py --check
  local rc=$?
  [ $rc -ne 0 ] && FAIL=1
  return 0
}

# --- V-28/V-29: contrato de integración entre apps ---------------------------
check_api_contract() {
  python3 scripts/checks/api_contract.py
  local rc=$?
  [ $rc -ne 0 ] && FAIL=1
  return 0
}

# --- V-31: contrato CI/CD del deploy a staging (Etapa 6, §13.7) --------------
check_ci_cd() {
  python3 scripts/checks/ci_cd.py
  local rc=$?
  [ $rc -ne 0 ] && FAIL=1
  return 0
}

check_selftest
check_paths_hygiene
check_size_budget
check_fences
check_no_upsert
check_no_http_ws
check_db_transaction
check_no_vertical_fork
check_structural
check_aliases
check_index_drift
check_ledger_chain
check_tdd_evidence
check_code_money
check_code_upsert_transaction
check_svelte_vertical_fork
check_bundle_budget
check_migrations_mirror
check_marketing_copy
check_pos_copy
check_pos_demo_ids
check_api_contract
check_ci_cd

echo ""
if [ $FAIL -eq 0 ]; then
  say "RESULT SUITE GREEN"
  exit 0
else
  say "RESULT SUITE RED"
  say "Corrige antes del commit. Para el ledger, nunca editar una entrada commiteada: agregar entrada CORRIGE."
  exit 1
fi
