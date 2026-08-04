#!/usr/bin/env bash
# KipusPay — primer paso en un clone nuevo (o en un runner/agente en la nube).
# Instala el hook de verificación y corre el gate documental.
# Sin esto, `git commit` NO ejecuta la batería: los hooks no viajan en el clone.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1

echo "== KipusPay bootstrap =="

missing=0
for bin in git python3; do
  if command -v "$bin" >/dev/null 2>&1; then
    echo "ok   $bin: $(command -v "$bin")"
  else
    echo "RED  falta $bin (requerido por scripts/verify.sh)"
    missing=1
  fi
done
[ "$missing" -eq 1 ] && exit 1

git config core.hooksPath scripts/git-hooks
chmod +x scripts/git-hooks/* scripts/*.sh scripts/checks/*.py 2>/dev/null || true
echo "ok   core.hooksPath = $(git config core.hooksPath)"

echo ""
echo "Contrato de trabajo: leer AGENTS.md completo antes de tocar cualquier documento."
echo "Índice de implementación: INDEX.md (generado; regenerar con scripts/index.sh)."
echo "Doctrina: docs/ARCHITECTURE.md · proceso: docs/PROCESS.md · registro: docs/LEDGER.md."
echo ""

bash scripts/verify.sh
