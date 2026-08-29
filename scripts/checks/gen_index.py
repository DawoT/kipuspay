#!/usr/bin/env python3
"""KipusPay — genera INDEX.md (índice de implementación para agentes).

El índice NO contiene texto normativo: solo punteros. La doctrina vive una sola vez en
los documentos maestros (invariante 9). Desde el corte en capítulos, cada puntero incluye
**archivo y línea**: el router deja de decir "§5.3" y pasa a decir "abre este archivo".

Uso:
  gen_index.py            regenera INDEX.md
  gen_index.py --check    falla si INDEX.md está desincronizado (V-15)
"""
from __future__ import annotations

import importlib.util
import os
import re
import sys

_spec = importlib.util.spec_from_file_location("paths", f"{__file__.rsplit('/', 1)[0]}/paths.py")
paths = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(paths)

INDEX = paths.INDEX

HEADING_NUM = re.compile(r"^#{2,4}\s+\**([0-9]+(?:\.[0-9]+)*)[.\\]?\s*(.*)$")
CAPABILITY_ROW = re.compile(r"^\|\s*`([a-z][a-z0-9_.*]*)`[^|]*\|\s*([0-9C][0-9–\-,C ]*)\s*\|\s*([^|]+)\|")
REGISTRY_ROW = re.compile(r"^\|\s*((?:SEC|FIS|COM|DAT|PERF|SYN|LPDP|CAL|ADR)-[A-Z0-9*-]+)\s*\|\s*([^|]+)\|\s*([^|]+)\|")
PORT_ROW = re.compile(r"^\|\s*`([A-Z][A-Za-z]+)`\s*\|\s*([^|]+)\|\s*([^|]+)\|")
PACKAGE_LINE = re.compile(r"^\s{2}([a-z][a-z0-9-]+)/\s*#\s*(.+)$")
SPRINT_ROW = re.compile(
    r"^\|\s*(FL-[0-9]+(?:\.[0-9]+)?|[0-9][0-9a-z–\-]*)\s*\|\s*([0-9A-Z][0-9A-Z–\-]*)\s*\|\s*([^|]+)\|\s*([^|]+)\|"
)
CREATE_TABLE = re.compile(r"\s*CREATE TABLE(?:\s+IF NOT EXISTS)?\s+([A-Za-z_][A-Za-z0-9_]*)", re.I)
SPRINT_HEADING = re.compile(
    r"^#{3,4}\s+Sprint\s+(FL-[0-9]+(?:\.[0-9]+)?|[0-9]+[a-z]?)\s*[—–-]\s*(.+)$"
)
FIRST_SECTION = re.compile(r"§\s?([0-9]+(?:\.[0-9]+)*)")


def read(rel: str) -> list[str]:
    with open(os.path.join(paths.ROOT, rel), encoding="utf-8") as fh:
        return fh.readlines()


def scan(files: list[str]) -> list[tuple[str, int, str, str]]:
    """[(archivo, línea, sección vigente, texto)] recorriendo los archivos en orden."""
    out = []
    for rel in files:
        section = (paths.front_matter(rel) or {}).get("section", "?")
        for i, line in enumerate(read(rel), start=1):
            m = HEADING_NUM.match(line)
            if m:
                section = m.group(1)
            out.append((rel, i, section, line))
    return out


def link(rel: str) -> str:
    return f"[`{rel}`]({rel})"


def build() -> str:
    spec_files = paths.spec_family()
    spec = scan(spec_files)

    # § -> archivo donde vive esa sección (para resolver punteros del Registry)
    section_file: dict[str, str] = {}
    for rel, _, section, line in spec:
        if HEADING_NUM.match(line) and section not in section_file:
            section_file[section] = rel

    caps, seen = [], set()
    for rel, ln, _, line in spec:
        m = CAPABILITY_ROW.match(line)
        if m:
            # Soporta celdas multi-cap con coma (ej. `catalog.variants, catalog.uom`)
            caps_in_cell = re.findall(r"`([^`]+)`", line.split("|")[1] if "|" in line else line)
            for cap in caps_in_cell:
                if cap not in seen and "." in cap:
                    seen.add(cap)
                    caps.append((cap, m.group(2).strip(), m.group(3).strip(), rel, ln))

    rules = []
    for rel, _, _, line in spec:
        m = REGISTRY_ROW.match(line)
        if m and m.group(2).strip().startswith("§"):
            pointer = m.group(2).strip()
            sec = FIRST_SECTION.search(pointer)
            target = section_file.get(sec.group(1), "—") if sec else "—"
            rules.append((m.group(1), pointer, m.group(3).strip(), target))

    tables = []
    for rel, ln, section, line in spec:
        m = CREATE_TABLE.match(line)
        if m:
            tables.append((m.group(1), section, rel, ln))

    ports, in_ports = [], False
    for rel, ln, _, line in spec:
        if line.startswith("| Puerto |"):
            in_ports = True
            continue
        if in_ports:
            m = PORT_ROW.match(line)
            if m:
                ports.append((m.group(1), m.group(2).strip(), m.group(3).strip(), rel, ln))
            elif not line.startswith("|---"):
                in_ports = False

    packages = [
        (m.group(1), m.group(2).strip(), rel, ln)
        for rel, ln, _, line in spec
        if (m := PACKAGE_LINE.match(line))
    ]

    # --- sprints: estado (portada del roadmap) + archivo de fase -------------
    roadmap_files = paths.process_family()
    status: dict[str, tuple[str, str, str]] = {}
    order: list[str] = []
    in_sprints = False
    for rel in roadmap_files:
        for line in read(rel):
            if line.startswith("| Sprint | FASE |"):
                in_sprints = True
                continue
            if in_sprints:
                m = SPRINT_ROW.match(line)
                if m:
                    sid = m.group(1).strip()
                    status[sid] = tuple(g.strip() for g in m.groups()[1:])
                    order.append(sid)
                elif not line.startswith("|---"):
                    in_sprints = False

    located: dict[str, tuple[str, int, str]] = {}
    for rel in paths._expand(paths.ROADMAP_PHASES):
        fase = (paths.front_matter(rel) or {}).get("fase", "?")
        for i, line in enumerate(read(rel), start=1):
            m = SPRINT_HEADING.match(line)
            if m:
                located[m.group(1)] = (rel, i, fase)

    sprints = []
    for sid in order:
        fase, especificacion, entrega = status[sid]
        rel, ln, fase_fm = located.get(sid, ("—", 0, fase))
        sprints.append((sid, fase_fm if rel != "—" else fase, rel, ln, especificacion, entrega))
    for sid, (rel, ln, fase) in located.items():
        if sid not in status:
            sprints.append((sid, fase, rel, ln, "sin fila de estado", "—"))

    out: list[str] = []
    w = out.append
    w("---")
    w("doc_id: index")
    w("alias: \"—\"")
    w("authority: generada")
    w("owner: \"@DawoT\"")
    w("---\n")
    w("# KipusPay — Índice de implementación (GENERADO)\n")
    w("> **No editar a mano.** Se regenera con `scripts/index.sh` y el gate V-15 falla si\n"
      "> queda desincronizado. Contiene solo punteros: la regla vive una vez en la\n"
      "> especificación (invariante 9 de `AGENTS.md`).\n")
    w("Ruta de trabajo de un agente: capability → sprint → **archivo de fase** → reglas y DDL\n"
      "en el **capítulo** que corresponda → package destino (§1.1) → gate (`Proceso §8.1`).\n"
      "Abre solo los archivos que esta tabla te señale.\n")

    w("## Capabilities → sprint\n")
    w("| Capability | Sprint | Empaquetado GTM | Definida en | Línea |")
    w("|---|---|---|---|---|")
    for cap, sprint, gtm, rel, ln in caps:
        w(f"| `{cap}` | {sprint} | {gtm} | {link(rel)} | {ln} |")
    w("")

    w("## Sprints → fase, archivo y estado\n")
    w("| Sprint | FASE | Archivo | Línea | Especificación | Entrega |")
    w("|---|---|---|---|---|---|")
    for sid, fase, rel, ln, espec, entrega in sprints:
        w(f"| {sid} | {fase} | {link(rel) if rel != '—' else '—'} | {ln or '—'} | {espec} | {entrega} |")
    w("")

    w("## Tablas DDL → capítulo y línea\n")
    w("| Tabla | Sección | Archivo | Línea |")
    w("|---|---|---|---|")
    for name, sec, rel, ln in tables:
        w(f"| `{name}` | §{sec} | {link(rel)} | {ln} |")
    w("")

    w("## Reglas → sección canónica (Registry §0.4)\n")
    w("| ID | Definición | Tema | Archivo |")
    w("|---|---|---|---|")
    for rid, sec, tema, rel in rules:
        w(f"| {rid} | {sec} | {tema} | {link(rel) if rel != '—' else '—'} |")
    w("")

    w("## Puertos → adapters\n")
    w("| Puerto | Responsabilidad | Adapters | Archivo | Línea |")
    w("|---|---|---|---|---|")
    for port, resp, adapters, rel, ln in ports:
        w(f"| `{port}` | {resp} | {adapters} | {link(rel)} | {ln} |")
    w("")

    w("## Packages destino (monorepo objetivo §1.1)\n")
    w("| Package | Contenido | Archivo | Línea |")
    w("|---|---|---|---|")
    for pkg, desc, rel, ln in packages:
        w(f"| `{pkg}` | {desc} | {link(rel)} | {ln} |")
    w("")

    w(f"<!-- generado desde: {len(spec_files)} archivo(s) de especificación + "
      f"{len(roadmap_files)} de proceso/roadmap -->")
    return "\n".join(out) + "\n"


def main(check_only: bool) -> int:
    content = build()
    target = os.path.join(paths.ROOT, INDEX)
    if check_only:
        try:
            with open(target, encoding="utf-8") as fh:
                current = fh.read()
        except FileNotFoundError:
            print(f"RESULT V-15 RED  falta {INDEX} (correr scripts/index.sh)")
            return 1
        if current != content:
            print(f"RESULT V-15 RED  {INDEX} desincronizado (correr scripts/index.sh)")
            return 1
        print("RESULT V-15 GREEN")
        return 0
    with open(target, "w", encoding="utf-8") as fh:
        fh.write(content)
    print(f"{INDEX} regenerado: {content.count(chr(10))} líneas")
    return 0


if __name__ == "__main__":
    sys.exit(main("--check" in sys.argv))
