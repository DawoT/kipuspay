#!/usr/bin/env python3
"""KipusPay — rutas canónicas del corpus (fuente única para todos los checks).

Ningún check vuelve a hardcodear un path: si un documento se mueve o se parte en
capítulos, se cambia aquí y la batería completa sigue.

Uso como CLI:
  paths.py --list       lista los docs normativos (uno por línea, para bash)
  paths.py --show       muestra el mapa de alias -> archivos
"""
from __future__ import annotations

import glob
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

CONTRACT = "AGENTS.md"          # contrato raíz: vive en el root por convención de agentes
INDEX = "INDEX.md"              # generado
README = "README.md"

SPEC_COVER = "docs/ARCHITECTURE.md"
SPEC_CHAPTERS = "docs/architecture/*.md"
PROCESS = "docs/PROCESS.md"
ROADMAP_COVER = "docs/ROADMAP.md"
ROADMAP_PHASES = "docs/roadmap/*.md"
GTM = "docs/GTM.md"
LEDGER = "docs/LEDGER.md"

# Alias usados en la prosa (`Arquitectura §5.3`) -> archivos donde puede resolver.
# La prosa cita en español; los paths son ASCII en inglés. Este mapa es el puente y
# lo valida el check V-18.
ALIASES: dict[str, tuple[str, ...]] = {
    "AGENTS": (CONTRACT,),
    "Arquitectura": (SPEC_COVER, SPEC_CHAPTERS),
    "Proceso": (PROCESS,),
    "Roadmap": (ROADMAP_COVER, ROADMAP_PHASES),
    "GTM": (GTM,),
    "Ledger": (LEDGER,),
}

# Documentos que el gate trata como inmutables (append-only).
IMMUTABLE = (LEDGER,)


def front_matter(rel: str) -> dict[str, str] | None:
    """Front-matter YAML plano de un doc (o None si no lo declara)."""
    with open(os.path.join(ROOT, rel), encoding="utf-8") as fh:
        text = fh.read(4096)
    if not text.startswith("---\n"):
        return None
    end = text.find("\n---\n", 4)
    if end == -1:
        return None
    fm: dict[str, str] = {}
    for line in text[4:end].splitlines():
        if ":" in line:
            key, _, value = line.partition(":")
            fm[key.strip()] = value.strip().strip('"')
    return fm


def _expand(pattern: str) -> list[str]:
    if "*" in pattern:
        return sorted(
            os.path.relpath(p, ROOT) for p in glob.glob(os.path.join(ROOT, pattern))
        )
    full = os.path.join(ROOT, pattern)
    return [pattern] if os.path.exists(full) else []


def alias_files(alias: str) -> list[str]:
    out: list[str] = []
    for pattern in ALIASES.get(alias, ()):
        out.extend(_expand(pattern))
    return out


def normative_docs() -> list[str]:
    """Contrato raíz + todo lo que viva bajo docs/ (incluye capítulos y fases)."""
    docs = _expand(CONTRACT)
    docs += sorted(
        os.path.relpath(p, ROOT)
        for p in glob.glob(os.path.join(ROOT, "docs", "**", "*.md"), recursive=True)
    )
    return docs


def spec_family() -> list[str]:
    """Portada + capítulos de la especificación, en orden de § (no alfabético)."""
    files = _expand(SPEC_COVER) + _expand(SPEC_CHAPTERS)

    def key(rel: str) -> tuple:
        section = (front_matter(rel) or {}).get("section", "")
        try:
            return (1, tuple(int(x) for x in section.split("."))) if section else (0, ())
        except ValueError:
            return (2, ())

    return sorted(files, key=key)


def process_family() -> list[str]:
    return _expand(PROCESS) + _expand(ROADMAP_COVER) + _expand(ROADMAP_PHASES)


def main(argv: list[str]) -> int:
    if "--list" in argv:
        print("\n".join(normative_docs()))
        return 0
    if "--show" in argv:
        for alias in ALIASES:
            print(f"{alias}: {', '.join(alias_files(alias)) or '(sin archivos)'}")
        return 0
    print(__doc__)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
