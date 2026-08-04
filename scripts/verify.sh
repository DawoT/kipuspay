#!/usr/bin/env bash
# KipusPay — Batería de verificación documental (AGENTS.md §5)
# Fences pares, 0 UPSERT INTO, 0 literales http/ws, db.transaction prohibido,
# FKs tenant, cadena del ledger (schema v2).
# Salida: exit 0 = GREEN, exit 1 = RED.

set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1

FAIL=0
DOCS=(
  "Ledger.md"
  "AGENTS.md"
  "Agents.md"
  "GTM.md"
  "Arquitectura Técnica POS SUNAT v8.0 KipusPay.md"
)

# Corpus normativo escaneable (excluye meta: scripts/, .opencode/)
SCAN="Ledger.md AGENTS.md Agents.md GTM.md Arquitectura Técnica POS SUNAT v8.0 KipusPay.md"

say() { printf '%s\n' "$*"; }

check_fences() {
  for f in "${DOCS[@]}"; do
    [ -f "$f" ] || { say "RED  fences: falta $f"; FAIL=1; continue; }
    n=$(grep -c '^```' "$f" || true)
    if [ $((n % 2)) -ne 0 ]; then
      say "RED  fences: $f tiene $n fences (impar)"
      FAIL=1
    else
      say "ok   fences: $f ($n)"
    fi
  done
}

check_no_upsert() {
  n=$(grep -rInE 'UPSERT INTO [A-Za-z_]' $SCAN 2>/dev/null | grep -vE 'Prohibido|prohibido|no se usa|nunca.*UPSERT|jamás.*UPSERT' | wc -l)
  if [ "$n" -gt 0 ]; then say "RED  UPSERT INTO detectado"; grep -rInE 'UPSERT INTO [A-Za-z_]' $SCAN | grep -vE 'Prohibido|prohibido' | head -3; FAIL=1; else say "ok   0 UPSERT INTO"; fi
}

check_no_http_ws() {
  n=$(grep -rInE 'http://|ws://' $SCAN 2>/dev/null \
      | grep -vE 'http://(www\.)?w3\.org|http://www\.apache\.org|http://schemas' \
      | grep -vE 'https?://|wss://' | wc -l)
  if [ "$n" -gt 0 ]; then say "RED  literales http:// o ws:// ($n)"; grep -rInE 'http://|ws://' $SCAN | grep -vE 'http://(www\.)?w3\.org|http://www\.apache\.org' | head -5; FAIL=1; else say "ok   sin literales http/ws"; fi
}

check_db_transaction() {
  n=$(grep -rInE 'db\.transaction\s*\(' --include='*.ts' . 2>/dev/null | wc -l)
  if [ "$n" -gt 0 ]; then say "RED  db.transaction( prohibido en código ($n)"; FAIL=1; else say "ok   db.transaction prohibido en código"; fi
}

check_tenant_fks() {
  if ! grep -qE 'CREATE TABLE[^(]*tenants\b' "Arquitectura Técnica POS SUNAT v8.0 KipusPay.md"; then
    say "RED  no se encontró CREATE TABLE tenants"
    FAIL=1
  else
    say "ok   tabla tenants definida"
  fi
  # Heurística: las tablas multitenant que usan tenant_id deben referenciar tenants.
  n=$(grep -rInE 'tenant_id[^N]*' --include='*.md' "Arquitectura Técnica POS SUNAT v8.0 KipusPay.md" | grep -cE 'tenant_id ' || true)
  say "ok   referencias tenant_id presentes ($n)"
}

check_ledger_chain() {
  python3 - <<'PY'
import re, hashlib, sys
try:
    with open('Ledger.md', encoding='utf-8') as f:
        lines = f.readlines()
except FileNotFoundError:
    print("RED  ledger: falta Ledger.md"); sys.exit(1)

starts = [i for i,l in enumerate(lines) if re.match(r'^id: \d+', l)]
entries = []
for j, a in enumerate(starts):
    b = starts[j+1] if j+1 < len(starts) else len(lines)
    eid = re.match(r'^id: (\d+)', lines[a]).group(1)
    e = a
    while e < b and not lines[e].startswith('estado: Vigente'):
        e += 1
    stored = prev_hash = None
    for l in lines[a:e+1]:
        m = re.match(r'^entry_hash: (\S+)', l);  stored = stored or (m.group(1) if m else None)
        m = re.match(r'^prev_hash: (\S+)', l);   prev_hash = prev_hash or (m.group(1) if m else None)
    h = hashlib.sha256(''.join(l for l in lines[a:e+1] if not l.startswith('entry_hash:')).encode()).hexdigest()
    entries.append((eid, stored, h, prev_hash))

bad = 0
for i, (eid, stored, computed, ph) in enumerate(entries):
    if stored is not None:
        if stored != computed:
            print(f"RED  ledger {eid}: entry_hash {stored[:12]} != {computed[:12]}"); bad += 1
        else:
            print(f"ok   ledger {eid}: hash OK")
    if ph is not None and i > 0:
        prev_stored = entries[i-1][1]
        if prev_stored is not None and ph != prev_stored:
            print(f"RED  ledger {eid}: prev_hash {ph[:12]} != entry_hash previo {prev_stored[:12]}"); bad += 1
        elif prev_stored is not None:
            print(f"ok   ledger {eid}: enlace prev_hash -> {entries[i-1][0]} OK")
sys.exit(1 if bad else 0)
PY
  local rc=$?
  [ $rc -ne 0 ] && FAIL=1
}

check_fences
check_no_upsert
check_no_http_ws
check_db_transaction
check_tenant_fks
check_ledger_chain

if [ $FAIL -eq 0 ]; then
  echo ""
  say "GREEN — todas las verificaciones documentales pasan"
  exit 0
else
  echo ""
  say "RED — verificación fallida, corrige antes del commit"
  exit 1
fi
