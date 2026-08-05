#!/usr/bin/env bash
# Sprint 14 — auditoría de dependencias (0 critical/high abiertas).
# Usa pnpm audit; falla si hay critical/high en prod.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "RESULT DEPS_AUDIT RED  pnpm ausente"
  exit 1
fi

# --audit-level high: exit ≠0 si high/critical
set +e
OUT="$(pnpm audit --audit-level=high --json 2>/dev/null)"
RC=$?
set -e

if [ "$RC" -eq 0 ]; then
  echo "RESULT DEPS_AUDIT GREEN  0 vulnerabilidades high/critical (pnpm audit)"
  exit 0
fi

# pnpm audit puede fallar por red; si JSON parseable con meta, reportar
if echo "$OUT" | head -c 20 | grep -q '{'; then
  echo "RESULT DEPS_AUDIT RED  vulnerabilidades high/critical detectadas"
  echo "$OUT" | head -c 2000
  exit 1
fi

echo "RESULT DEPS_AUDIT RED  pnpm audit no disponible (rc=$RC); CI debe reintentar"
exit 1
