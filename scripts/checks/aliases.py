#!/usr/bin/env python3
"""KipusPay — V-18: front-matter, alias en prosa y rutas citadas.

La prosa cita en español con alias (`Arquitectura §5.3`, `Proceso §8.1`), mientras los
paths son ASCII en inglés (`docs/ARCHITECTURE.md`). Ese puente solo es fiable si algo lo
verifica, así que este check valida tres cosas:

1. **Front-matter.** Cada documento del corpus declara `doc_id`, `alias`, `authority` y
   `owner`. Un agente sabe qué autoridad tiene un archivo sin inferirlo del nombre.
2. **Resolución de alias.** `Alias §N` resuelve a un heading numerado existente *dentro
   de los archivos de ese alias*. Es más estricto que V-12, que junta los headings de
   todo el corpus: así se detecta un puntero que existe en otro documento (fue el caso
   de `Agents §5.4`, que resolvía contra la especificación por coincidencia).
3. **Rutas citadas.** Todo `*.md` mencionado en prosa o en un enlace existe. Es lo que
   convierte un rename en un fallo del gate en vez de en una referencia colgada.

El ledger queda fuera de (2) y (3): es inmutable y sus punteros son históricos (la
equivalencia de paths viejos se declara en la entrada 0182, no reescribiendo entradas).

Emite `RESULT V-18 GREEN|RED [motivo]` y sale 1 si algo falla.
"""
from __future__ import annotations

import glob
import importlib.util
import os
import re
import sys

_spec = importlib.util.spec_from_file_location("paths", f"{__file__.rsplit('/', 1)[0]}/paths.py")
paths = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(paths)

AUTHORITIES = {"normativa", "derivada", "generada", "inmutable"}
FM_FIELDS = ("doc_id", "alias", "authority", "owner")

ALIAS_REF = re.compile(
    r"\b(%s)\s+§\s?([0-9]+(?:\.[0-9]+)*)" % "|".join(re.escape(a) for a in paths.ALIASES)
)
HEADING_NUM = re.compile(r"^#{1,6}\s+\**([0-9]+(?:\.[0-9]+)*)")
FENCE = re.compile(r"^```")
# Se acepta un patrón (`docs/roadmap/fase-*.md`) si resuelve a por lo menos un archivo:
# el router necesita hablar de familias de archivos sin listarlas una por una.
MD_MENTION = re.compile(r"[A-Za-z0-9_.*/-]+\.md")
ROUTER_HEADING = "## Ruta de lectura"

# `README.md` es entrada humana, no corpus normativo: no lleva front-matter.
FM_EXEMPT = {paths.README}


def front_matter(text: str) -> dict[str, str] | None:
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


def body_lines(text: str) -> list[str]:
    """Líneas sin front-matter y sin el contenido de los fences."""
    if text.startswith("---\n"):
        end = text.find("\n---\n", 4)
        if end != -1:
            text = text[end + 5 :]
    out, infence = [], False
    for line in text.splitlines():
        if FENCE.match(line):
            infence = not infence
            continue
        if not infence:
            out.append(line)
    return out


def main() -> int:
    docs = paths.normative_docs()
    if paths.INDEX in [d for d in os.listdir(paths.ROOT)]:
        docs = docs + [paths.INDEX]

    texts = {}
    for d in docs:
        with open(os.path.join(paths.ROOT, d), encoding="utf-8") as fh:
            texts[d] = fh.read()

    problems: list[str] = []

    # (1) front-matter -------------------------------------------------------
    seen_ids: dict[str, str] = {}
    for d in docs:
        if d in FM_EXEMPT:
            continue
        fm = front_matter(texts[d])
        if fm is None:
            problems.append(f"{d}: sin front-matter YAML al inicio")
            continue
        for field in FM_FIELDS:
            if not fm.get(field):
                problems.append(f"{d}: front-matter sin `{field}`")
        authority = fm.get("authority", "")
        if authority and authority not in AUTHORITIES:
            problems.append(
                f"{d}: authority `{authority}` no es una de {sorted(AUTHORITIES)}"
            )
        alias = fm.get("alias", "")
        if alias and alias != "—" and alias not in paths.ALIASES:
            problems.append(f"{d}: alias `{alias}` no está en el mapa de paths.py")
        doc_id = fm.get("doc_id", "")
        if doc_id:
            if doc_id in seen_ids:
                problems.append(f"{d}: doc_id `{doc_id}` duplicado con {seen_ids[doc_id]}")
            seen_ids[doc_id] = d

    # (2) resolución de alias ------------------------------------------------
    headings: dict[str, set[str]] = {}
    for alias in paths.ALIASES:
        nums: set[str] = set()
        for f in paths.alias_files(alias):
            with open(os.path.join(paths.ROOT, f), encoding="utf-8") as fh:
                for line in fh:
                    m = HEADING_NUM.match(line)
                    if m:
                        nums.add(m.group(1))
        headings[alias] = nums

    for d in docs:
        if d == paths.LEDGER:
            continue
        for i, line in enumerate(body_lines(texts[d]), start=1):
            for alias, num in ALIAS_REF.findall(line):
                if not paths.alias_files(alias):
                    continue  # el alias aún no tiene archivos (corte en curso)
                if num not in headings[alias]:
                    problems.append(
                        f"{d}:{i}: `{alias} §{num}` no resuelve a ningún heading de "
                        f"{', '.join(paths.alias_files(alias))}"
                    )

    # (3) rutas .md citadas --------------------------------------------------
    for d in docs:
        if d == paths.LEDGER:
            continue
        base = os.path.dirname(os.path.join(paths.ROOT, d))
        for i, line in enumerate(body_lines(texts[d]), start=1):
            for mention in MD_MENTION.findall(line):
                if "*" in mention:
                    if glob.glob(os.path.join(paths.ROOT, mention)) or glob.glob(
                        os.path.join(base, mention)
                    ):
                        continue
                    problems.append(f"{d}:{i}: el patrón `{mention}` no resuelve a ningún archivo")
                    continue
                if os.path.exists(os.path.join(paths.ROOT, mention)) or os.path.exists(
                    os.path.join(base, mention)
                ):
                    continue
                problems.append(f"{d}:{i}: cita `{mention}`, que no existe en el repo")

    # (4) el router no puede desaparecer sin que el gate lo note -------------
    if ROUTER_HEADING not in texts.get(paths.CONTRACT, ""):
        problems.append(f"{paths.CONTRACT}: falta la sección `{ROUTER_HEADING}` (router)")

    if problems:
        print(f"RESULT V-18 RED  {len(problems)} problema(s) de alias/front-matter")
        for p in problems[:10]:
            print(f"     {p}")
        return 1

    print("RESULT V-18 GREEN")
    print(
        f"     {len(seen_ids)} docs con front-matter válido; alias resueltos contra "
        f"{sum(len(v) for v in headings.values())} headings"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
