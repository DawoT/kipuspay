#!/usr/bin/env python3
"""KipusPay — V-25: espejo up<->down de migraciones D1.

Cada migración up en `packages/adapters-d1/migrations/` debe tener su par en
`migrations-down/` con el MISMO nombre de archivo, y viceversa (Sprint 1:
"migraciones up/down en CI"). Un down huérfano o faltante rompe el rollback.

Emite `RESULT V-25 GREEN|RED` y sale 1 si el espejo está incompleto.
"""
from __future__ import annotations

import os
import sys

UP_DIR = "packages/adapters-d1/migrations"
DOWN_DIR = "packages/adapters-d1/migrations-down"


def mirror_violations(up_dir: str, down_dir: str) -> list[str]:
    ups = {f for f in os.listdir(up_dir) if f.endswith(".sql")}
    downs = {f for f in os.listdir(down_dir) if f.endswith(".sql")}
    out: list[str] = []
    for f in sorted(ups - downs):
        out.append(f"falta-down:{f}")
    for f in sorted(downs - ups):
        out.append(f"huerfano-down:{f}")
    return out


def main() -> int:
    violations = mirror_violations(UP_DIR, DOWN_DIR)
    if violations:
        print(f"RESULT V-25 RED  espejo de migraciones incompleto ({len(violations)})")
        for v in violations:
            print(f"     {v}")
        return 1
    print("RESULT V-25 GREEN")
    return 0


if __name__ == "__main__":
    sys.exit(main())
