#!/usr/bin/env python3
"""KipusPay — checks estructurales del corpus normativo (AGENTS.md §5).

Emite una línea `RESULT <ID> GREEN|RED [motivo]` por check y sale 1 si alguno es RED.

V-05  aislamiento multitenant: `tenant_id` siempre NOT NULL (DAT-12, spec §5.0)
V-06  dinero en INTEGER cents (invariante 1): prohibido REAL en columnas monetarias
V-08  Registry §0.4: sin IDs huérfanos, duplicados ni prefijos no autorizados (invariante 9)
V-09  sin placeholders de imagen (los números deben ser texto legible por máquina)
V-10  sin escapes de exportación (\\_ \\= \\-) que corrompen SQL/TS y rompen los greps
V-11  todo CREATE TABLE dentro de un fence etiquetado
V-12  toda referencia § resuelve a una sección numerada existente
V-14  ratchet de FKs compuestas (DAT-12): la deuda legada no puede crecer

El ledger es inmutable (invariante 4): se excluye de V-12 porque sus punteros son
históricos y no pueden corregirse editando la entrada.
"""
from __future__ import annotations

import importlib.util
import re
import sys

_spec = importlib.util.spec_from_file_location("paths", f"{__file__.rsplit('/', 1)[0]}/paths.py")
paths = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(paths)

LEDGER = paths.LEDGER

# --- de-escape en memoria: los checks de contenido no deben depender de V-10 ---
UNESCAPE = re.compile(r"\\([_=`\-><!+.#()\[\]|*\\])")

# --- V-06 -------------------------------------------------------------------
MONEY_HINT = re.compile(
    r"(amount|total|price|cost|fee|balance|subtotal|igv|icbper|discount|payment"
    r"|cash|change|paid|debt|credit_limit|denomination|revenue|margin|tender)",
    re.I,
)
# Ratios/cantidades: REAL legítimo (spec §5.0).
RATIO_OK = re.compile(r"(qty|quantity|stock|percent|rate|factor|weight|points|confidence|ratio)", re.I)

# --- V-05 -------------------------------------------------------------------
# El aislamiento de tenant se garantiza por `tenant_id NOT NULL` + WHERE forzado
# desde el JWT + claves compuestas, no por FK a `tenants` (DAT-12, spec §5.0):
# `tenants` es catálogo con `shard_id` y la FK en cada tabla del hot path cobraría
# validación referencial por inserción de venta.
TENANT_COL = re.compile(r"^\s*tenant_id\s+TEXT\b(?P<rest>.*)$", re.I | re.M)

# --- V-14 -------------------------------------------------------------------
# §5.0.1 exige FK compuesta (tenant_id, parent_id) entre tablas tenant-owned. El
# DDL v8.0 arrastra deuda: se congela el inventario y el gate solo bloquea que crezca.
FK_BASELINE = "scripts/checks/fk_composite_baseline.txt"
FOREIGN_KEY = re.compile(r"FOREIGN KEY\s*\(([^)]*)\)\s*REFERENCES\s+([A-Za-z_][A-Za-z0-9_]*)", re.I)

# --- V-08 -------------------------------------------------------------------
RULE_PREFIXES = ("SEC", "FIS", "COM", "DAT", "PERF", "SYN", "LPDP", "CAL")
RULE_ID = re.compile(r"\b((?:%s)-[0-9]{2,})\b" % "|".join(RULE_PREFIXES))
ADR_ID = re.compile(r"\b(ADR-[A-Z]+-[0-9]{3})\b")
REGISTRY_ROW = re.compile(r"^\|\s*((?:SEC|FIS|COM|DAT|PERF|SYN|LPDP|CAL|ADR)-[A-Z0-9*-]+)\s*\|", re.M)

FENCE = re.compile(r"^```(\S*)")
HEADING_NUM = re.compile(r"^#{2,4}\s+\**([0-9]+(?:\.[0-9]+)*)", re.M)
SECTION_REF = re.compile(r"§\s?([0-9]+(?:\.[0-9]+)*)")
IMAGE_PLACEHOLDER = re.compile(r"!\[\]\[image[0-9]+\]")
ESCAPE_NOISE = re.compile(r"\\[_=`\-><!+.#()\[\]|*]")

results: list[tuple[str, str, str]] = []


def report(cid: str, red_detail: str | None, extra: list[str] | None = None) -> None:
    if red_detail:
        print(f"RESULT {cid} RED  {red_detail}")
        for line in (extra or [])[:5]:
            print(f"     {line}")
    else:
        print(f"RESULT {cid} GREEN")
    results.append((cid, "RED" if red_detail else "GREEN", red_detail or ""))


def load(path: str) -> list[str]:
    with open(path, encoding="utf-8") as fh:
        return fh.readlines()


def parse_tables(text: str) -> list[tuple[str, str]]:
    """Devuelve [(nombre, cuerpo)] de cada CREATE TABLE del texto de-escapado."""
    tables = []
    name = None
    body: list[str] = []
    for line in text.splitlines():
        if name is None:
            m = re.match(r"\s*CREATE TABLE(?:\s+IF NOT EXISTS)?\s+([A-Za-z_][A-Za-z0-9_]*)", line, re.I)
            if m:
                name, body = m.group(1), []
            continue
        body.append(line)
        if re.match(r"\s*\)\s*;", line):
            tables.append((name, "\n".join(body)))
            name = None
    return tables


def column_defs(body: str) -> list[tuple[str, str]]:
    """[(columna, tipo)] de las líneas de definición (ignora constraints de tabla)."""
    cols = []
    for raw in body.splitlines():
        line = raw.split("--")[0].strip()
        m = re.match(r"([a-z_][a-z0-9_]*)\s+(INTEGER|REAL|TEXT|BLOB|BOOLEAN|NUMERIC)\b", line, re.I)
        if m and m.group(1).upper() not in ("FOREIGN", "PRIMARY", "UNIQUE", "CHECK", "CONSTRAINT"):
            cols.append((m.group(1), m.group(2).upper()))
    return cols


def main(docs: list[str]) -> int:
    raw = {d: "".join(load(d)) for d in docs}
    clean = {d: UNESCAPE.sub(r"\1", t) for d, t in raw.items()}
    # La familia de la especificación puede ser un archivo o N capítulos: se concatena
    # para que el DDL y el Registry se analicen igual antes y después del corte.
    family = [f for f in paths.spec_family() if f in clean]
    spec_clean = "\n".join(clean[f] for f in family)

    tables = parse_tables(spec_clean)

    # V-05 — aislamiento multitenant: tenant_id NOT NULL
    nullable_tenant = []
    for name, body in tables:
        for m in TENANT_COL.finditer(body):
            rest = m.group("rest").split("--")[0]
            if not re.search(r"\bNOT NULL\b", rest, re.I):
                nullable_tenant.append(f"{name}.tenant_id sin NOT NULL")
    report(
        "V-05",
        f"{len(nullable_tenant)} tablas con tenant_id anulable" if nullable_tenant else None,
        nullable_tenant,
    )

    # V-06 — dinero en INTEGER cents
    money_violations = []
    for name, body in tables:
        for col, typ in column_defs(body):
            if col.endswith("_cents") and typ != "INTEGER":
                money_violations.append(f"{name}.{col} es {typ}, debe ser INTEGER")
            elif typ == "REAL" and MONEY_HINT.search(col) and not RATIO_OK.search(col):
                money_violations.append(f"{name}.{col} es REAL y parece monetaria (usar *_cents INTEGER)")
    report(
        "V-06",
        f"{len(money_violations)} columnas monetarias mal tipadas" if money_violations else None,
        money_violations,
    )

    # V-08 — Registry de reglas
    registry = REGISTRY_ROW.findall(spec_clean)
    reg_set = set(registry)
    dup = sorted({r for r in registry if registry.count(r) > 1})
    used: dict[str, set[str]] = {}
    for doc, text in clean.items():
        for rid in RULE_ID.findall(text) + ADR_ID.findall(text):
            used.setdefault(rid, set()).add(doc)
    orphans = sorted(rid for rid in used if rid not in reg_set)
    bad_prefix = sorted(r for r in reg_set if not r.split("-")[0] in RULE_PREFIXES + ("ADR",))
    problems = []
    if orphans:
        problems.append(f"{len(orphans)} huérfanos: {', '.join(orphans[:6])}")
    if dup:
        problems.append(f"duplicados: {', '.join(dup)}")
    if bad_prefix:
        problems.append(f"prefijos no autorizados: {', '.join(bad_prefix)}")
    report("V-08", "; ".join(problems) if problems else None,
           [f"{o} usado en {', '.join(sorted(used[o]))}" for o in orphans])

    # V-09 — placeholders de imagen
    ph = [f"{d}: {len(IMAGE_PLACEHOLDER.findall(t))}" for d, t in raw.items() if IMAGE_PLACEHOLDER.search(t)]
    report("V-09", f"placeholders de imagen en {len(ph)} doc(s)" if ph else None, ph)

    # V-10 — escapes de exportación
    esc = []
    for d, t in raw.items():
        n = len(ESCAPE_NOISE.findall(t))
        if n:
            esc.append(f"{d}: {n} escapes")
    report("V-10", f"escapes de exportación en {len(esc)} doc(s)" if esc else None, esc)

    # V-11 — CREATE TABLE fenceado + fences etiquetados
    # El ledger se excluye del etiquetado: su schema v2 envuelve cada entrada en un
    # fence desnudo y el archivo es inmutable (invariante 4).
    unfenced, untagged = [], []
    for d, lines in ((d, load(d)) for d in docs):
        infence = False
        for i, line in enumerate(lines, 1):
            m = FENCE.match(line)
            if m:
                if not infence and not m.group(1) and d != LEDGER:
                    untagged.append(f"{d}:{i} fence sin lenguaje")
                infence = not infence
                continue
            if not infence and re.match(r"\s*CREATE TABLE", line, re.I):
                unfenced.append(f"{d}:{i}")
    problems = []
    if unfenced:
        problems.append(f"{len(unfenced)} CREATE TABLE fuera de fence")
    if untagged:
        problems.append(f"{len(untagged)} fences sin lenguaje")
    report("V-11", "; ".join(problems) if problems else None, unfenced[:3] + untagged[:3])

    # V-12 — referencias § resolubles (el ledger se excluye: inmutable)
    sections: set[str] = set()
    for text in clean.values():
        sections.update(HEADING_NUM.findall(text))
    dangling = []
    for doc, text in clean.items():
        if doc == LEDGER:
            continue
        for line_no, line in enumerate(text.splitlines(), 1):
            for ref in SECTION_REF.findall(line):
                if ref not in sections:
                    dangling.append(f"{doc}:{line_no} §{ref}")
    report("V-12", f"{len(dangling)} referencias § sin sección destino" if dangling else None, dangling)

    # V-14 — ratchet de FKs compuestas hacia tablas tenant-owned
    owned = {name for name, body in tables if any(c == "tenant_id" for c, _ in column_defs(body))}
    simple_fks = []
    for name, body in tables:
        if name not in owned:
            continue
        for m in FOREIGN_KEY.finditer(body):
            cols = [c.strip() for c in m.group(1).split(",")]
            target = m.group(2)
            # Una FK simple a un catálogo (p. ej. tenants) es correcta por diseño.
            if target in owned and "tenant_id" not in cols:
                simple_fks.append(f"{name} -> {target} ({', '.join(cols)})")
    current = sorted(simple_fks)
    try:
        with open(FK_BASELINE, encoding="utf-8") as fh:
            baseline = sorted(l.strip() for l in fh if l.strip() and not l.startswith("#"))
    except FileNotFoundError:
        baseline = []
    nuevas = [f for f in current if f not in baseline]
    report(
        "V-14",
        f"{len(nuevas)} FK simples nuevas hacia tablas tenant-owned (baseline: {len(baseline)})" if nuevas else None,
        nuevas,
    )

    return 1 if any(status == "RED" for _, status, _ in results) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
