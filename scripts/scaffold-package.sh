#!/usr/bin/env bash
# KipusPay — generador de paquetes del monorepo (Arquitectura §1.1).
# Uso: scripts/scaffold-package.sh <nombre> <kind: domain|adapter> [descripción]
# Crea los configs DRY (package.json, tsconfig.json, vitest.config.ts); el contenido
# de src/ se escribe a mano por paquete para que cada dominio sea explícito.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

NAME="${1:-}"
KIND="${2:-}"
DESC="${3:-$(echo "KipusPay — package $NAME")}"

if [[ -z "$NAME" || ( "$KIND" != "domain" && "$KIND" != "adapter" ) ]]; then
  echo "uso: scripts/scaffold-package.sh <nombre> <domain|adapter> [descripción]" >&2
  exit 1
fi

case "$KIND" in
  domain)   DIR="packages/domain-$NAME"; SCOPE="domain"; THRESHOLD=95 ;;
  adapter)  DIR="packages/adapters-$NAME"; SCOPE="adapters"; THRESHOLD=70 ;;
esac

mkdir -p "$ROOT/$DIR/src"
cd "$ROOT/$DIR"

cat > package.json <<EOF
{
  "name": "@kipuspay/$SCOPE-$NAME",
  "version": "0.0.0",
  "private": true,
  "description": "$DESC",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "lint": "eslint src --max-warnings 0",
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run --coverage",
    "test:unit": "vitest run --coverage",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "build": "true"
  }
}
EOF

cat > tsconfig.json <<EOF
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src"
  },
  "include": ["src"]
}
EOF

cat > vitest.config.ts <<EOF
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**'],
      thresholds: {
        lines: $THRESHOLD,
        functions: $THRESHOLD,
        branches: $THRESHOLD,
        statements: $THRESHOLD,
      },
    },
  },
});
EOF

cat > vitest.integration.config.ts <<EOF
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    passWithNoTests: true,
  },
});
EOF

echo "creado $DIR (kind=$KIND, cobertura=$THRESHOLD%)"
