#!/usr/bin/env python3
"""KipusPay — V-16: el ledger es append-only (invariante 4).

Una entrada commiteada nunca se edita ni se borra: toda corrección es una entrada
nueva `CORRIGE`. Este check es el mismo código para el hook pre-commit y para CI, así
que no pueden divergir.

Uso:
  ledger_append_only.py --cached                  (hook: cambios en staging)
  ledger_append_only.py origin/main...HEAD        (CI: contra la base del PR)

Decisiones que importan:
- **Qué se protege.** La invariante habla de *entradas*, y eso es exactamente lo que se
  congela: desde la primera línea `id: NNNN` del archivo previo hacia abajo. La cabecera
  (título, cómo se escribe una entrada, qué skill usar) es documentación operativa y sí
  se corrige; si fuera intocable, el ledger acumularía instrucciones obsoletas para
  siempre y ningún agente podría arreglarlas.
- **Renames.** Se pasa `-M` a `git diff`: mover el archivo (`Ledger.md` → `docs/LEDGER.md`)
  es un rename, no un borrado.
- **Borrado real.** Si el ledger desaparece es RED explícito; el gate no se calla.
- No se limita por pathspec: se lee el diff completo y se localiza el archivo por su ruta
  destino, para que un rename se vea aunque el pathspec sea el nombre nuevo.
"""
from __future__ import annotations

import importlib.util
import re
import subprocess
import sys

_spec = importlib.util.spec_from_file_location("paths", f"{__file__.rsplit('/', 1)[0]}/paths.py")
paths = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(paths)

LEDGER = paths.LEDGER
HUNK = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+")
ENTRY_START = re.compile(r"^id: \d+")


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], capture_output=True, text=True, check=True
    ).stdout


def base_rev(diff_args: list[str]) -> str | None:
    """Revisión contra la que se compara, para poder leer el archivo *previo*."""
    for arg in diff_args:
        if "..." in arg:
            left, _, right = arg.partition("...")
            try:
                return git("merge-base", left or "HEAD", right or "HEAD").strip()
            except subprocess.CalledProcessError:
                return left or None
        if ".." in arg:
            return arg.partition("..")[0] or None
        if not arg.startswith("-"):
            return arg
    return "HEAD"


def first_entry_line(rev: str | None, path: str) -> int | None:
    """Línea (1-based) de la primera entrada en la versión previa del archivo."""
    if rev is None:
        return None
    try:
        content = git("show", f"{rev}:{path}")
    except subprocess.CalledProcessError:
        return None
    for i, line in enumerate(content.splitlines(), start=1):
        if ENTRY_START.match(line):
            return i
    return None


def main(argv: list[str]) -> int:
    diff_args = argv or ["--cached"]

    tracked = git("ls-files", "--", LEDGER).strip()
    staged = git("diff", "--cached", "--name-only", "--", LEDGER).strip()
    if not tracked and not staged:
        print("RESULT V-16 GREEN")
        print(f"     {LEDGER} aún no versionado: nada que proteger")
        return 0

    try:
        diff = git("diff", "-M", "-U0", *diff_args)
    except subprocess.CalledProcessError as exc:
        print(f"RESULT V-16 RED  git diff falló: {exc.stderr.strip() or exc}")
        return 1

    rev = base_rev(diff_args)
    source = target = None
    old_line = 0
    guard: int | None = None
    removed: list[tuple[int, str]] = []
    header_touched = 0
    deleted = False

    for line in diff.splitlines():
        if line.startswith("--- "):
            source = line[4:].removeprefix("a/")
            continue
        if line.startswith("+++ "):
            target = line[4:].removeprefix("b/")
            if target == "/dev/null" and source == LEDGER:
                deleted = True
            if target == LEDGER:
                guard = first_entry_line(rev, source if source != "/dev/null" else LEDGER)
            continue
        if target != LEDGER:
            continue
        m = HUNK.match(line)
        if m:
            old_line = int(m.group(1))
            continue
        if line.startswith("-") and not line.startswith("--"):
            if guard is None or old_line >= guard:
                removed.append((old_line, line))
            else:
                header_touched += 1
            old_line += 1

    if deleted:
        print(f"RESULT V-16 RED  {LEDGER} fue eliminado — es append-only (invariante 4)")
        return 1
    if removed:
        print(
            f"RESULT V-16 RED  {LEDGER}: {len(removed)} línea(s) de entrada"
            " eliminada(s)/modificada(s) — append-only (invariante 4)"
        )
        for ln, text in removed[:5]:
            print(f"     línea {ln}: {text}")
        return 1

    print("RESULT V-16 GREEN")
    if header_touched:
        print(f"     {header_touched} línea(s) de cabecera editada(s); entradas intactas")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
