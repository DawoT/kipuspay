#!/usr/bin/env python3
"""KipusPay — V-19: presupuesto de tamaño por archivo normativo.

Un monolito no es un problema de estilo: es un problema de costo. Un agente que necesita
82 líneas de una fase no puede cargar 887, y uno que busca una regla de caja no puede
cargar 3899 líneas de especificación. Este check congela esa ganancia: ningún documento
que se lea como doctrina pasa de `MAX_LINES`.

Quedan fuera por naturaleza, no por conveniencia:
- `authority: inmutable` — el ledger es un log append-only; crece por diseño y nadie lo
  lee completo (se lee la última entrada).
- `authority: generada` — `INDEX.md` es un índice de punteros, justamente para *no* leer
  los documentos completos; su tamaño es consecuencia del corpus, no una decisión.

Emite `RESULT V-19 GREEN|RED [motivo]` y sale 1 si algún archivo excede el presupuesto.
"""
from __future__ import annotations

import importlib.util
import os
import sys

_spec = importlib.util.spec_from_file_location("paths", f"{__file__.rsplit('/', 1)[0]}/paths.py")
paths = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(paths)

MAX_LINES = 1000
EXEMPT_AUTHORITIES = {"inmutable", "generada"}


def main() -> int:
    sizes: list[tuple[int, str]] = []
    over: list[tuple[int, str]] = []

    for rel in paths.normative_docs():
        authority = (paths.front_matter(rel) or {}).get("authority", "")
        if authority in EXEMPT_AUTHORITIES:
            continue
        with open(os.path.join(paths.ROOT, rel), encoding="utf-8") as fh:
            n = sum(1 for _ in fh)
        sizes.append((n, rel))
        if n > MAX_LINES:
            over.append((n, rel))

    if over:
        print(f"RESULT V-19 RED  {len(over)} archivo(s) sobre el presupuesto de {MAX_LINES} líneas")
        for n, rel in sorted(over, reverse=True):
            print(f"     {rel}: {n} líneas (+{n - MAX_LINES}) — pártelo por sección")
        return 1

    sizes.sort(reverse=True)
    top = ", ".join(f"{rel.rsplit('/', 1)[-1]} {n}" for n, rel in sizes[:3])
    print("RESULT V-19 GREEN")
    print(f"     {len(sizes)} archivos ≤ {MAX_LINES} líneas · mayores: {top}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
