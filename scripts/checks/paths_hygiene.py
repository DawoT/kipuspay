#!/usr/bin/env python3
"""KipusPay — V-17: higiene de rutas versionadas.

Tres fallos que este repo ya sufrió y que un agente no puede resolver solo:

1. **Colisión de case.** `AGENTS.md` (contrato) y `Agents.md` (proceso) convivían en
   git: en un checkout case-insensitive (macOS/Windows) uno sobrescribe al otro y el
   agente no puede saber cuál es la autoridad.
2. **Espacios en el path.** El nombre largo de la especificación se partía en palabras
   dentro de `scripts/verify.sh` y provocó un falso GREEN (Ledger 0179).
3. **No-ASCII.** Acentos en paths rompen greps, herramientas y clones entre sistemas.

Emite `RESULT V-17 GREEN|RED` y sale 1 si algo falla.
"""
from __future__ import annotations

import collections
import subprocess
import sys


def tracked_files() -> list[str]:
    out = subprocess.run(
        ["git", "ls-files", "-z"], capture_output=True, text=True, check=True
    ).stdout
    return [p for p in out.split("\0") if p]


def main() -> int:
    try:
        files = tracked_files()
    except (subprocess.CalledProcessError, FileNotFoundError) as exc:
        print(f"RESULT V-17 RED  no se pudo listar el índice de git: {exc}")
        return 1

    problems: list[str] = []

    con_espacios = [f for f in files if " " in f]
    problems += [f"espacio en el path: {f}" for f in con_espacios]

    no_ascii = [f for f in files if not f.isascii()]
    problems += [f"caracter no ASCII en el path: {f}" for f in no_ascii]

    por_minusculas = collections.defaultdict(list)
    for f in files:
        por_minusculas[f.lower()].append(f)
    for lower, group in sorted(por_minusculas.items()):
        if len(group) > 1:
            problems.append(f"colisión case-insensitive: {' vs '.join(sorted(group))}")

    if problems:
        print(f"RESULT V-17 RED  {len(problems)} problema(s) de higiene de rutas")
        for p in problems[:8]:
            print(f"     {p}")
        return 1

    print("RESULT V-17 GREEN")
    print(f"     {len(files)} rutas versionadas: ASCII, sin espacios, sin colisiones")
    return 0


if __name__ == "__main__":
    sys.exit(main())
