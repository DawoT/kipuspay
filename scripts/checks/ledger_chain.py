#!/usr/bin/env python3
"""KipusPay — V-13: cadena de hashes del ledger (schema v2).

`entry_hash` = SHA-256 del bloque `id:` → `estado:` excluyendo la línea
`entry_hash` y sin fences. `prev_hash` debe igualar el `entry_hash` de la entrada
anterior (regla vigente desde 0177). Las entradas 0143–0176 sin hash se conservan
como históricas y solo se validan si declaran uno.

Emite `RESULT V-13 GREEN|RED [motivo]` y sale 1 si la cadena está rota.
"""
from __future__ import annotations

import hashlib
import importlib.util
import re
import sys

_spec = importlib.util.spec_from_file_location("paths", f"{__file__.rsplit('/', 1)[0]}/paths.py")
paths = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(paths)

LEDGER = paths.LEDGER
# La pista de auditoría staff también encadena (hallazgo auditoría 2026-08-24:
# hashes rotos en 0006/0016/0017 invisibles para el gate).
STAFF_LEDGER = ".opencode/staff-ledger.md"


def check_chain(label: str, ledger_path: str) -> list[str]:
    try:
        with open(ledger_path, encoding="utf-8") as fh:
            lines = fh.readlines()
    except FileNotFoundError:
        return [f"{label}: falta {ledger_path}"]

    starts = [i for i, l in enumerate(lines) if re.match(r"^id: \d+", l)]
    entries = []
    for j, start in enumerate(starts):
        stop = starts[j + 1] if j + 1 < len(starts) else len(lines)
        eid = re.match(r"^id: (\d+)", lines[start]).group(1)
        end = start
        while end < stop and not lines[end].startswith("estado: Vigente"):
            end += 1
        stored = prev = None
        for line in lines[start:end + 1]:
            m = re.match(r"^entry_hash: (\S+)", line)
            stored = stored or (m.group(1) if m else None)
            m = re.match(r"^prev_hash: (\S+)", line)
            prev = prev or (m.group(1) if m else None)
        block = "".join(l for l in lines[start:end + 1] if not l.startswith("entry_hash:"))
        entries.append((eid, stored, hashlib.sha256(block.encode()).hexdigest(), prev))

    problems = []
    for i, (eid, stored, computed, prev) in enumerate(entries):
        if stored is not None and stored != computed:
            problems.append(f"{label} {eid}: entry_hash {stored[:12]} != calculado {computed[:12]}")
        if prev is not None and i > 0:
            prev_stored = entries[i - 1][1]
            if prev_stored is not None and prev != prev_stored:
                problems.append(f"{label} {eid}: prev_hash {prev[:12]} != entry_hash previo {prev_stored[:12]}")
    return problems


def main() -> int:
    problems = check_chain("ledger", LEDGER) + check_chain("staff", STAFF_LEDGER)
    if problems:
        print("RESULT V-13 RED  cadena rota en {0} punto(s)".format(len(problems)))
        for p in problems[:5]:
            print(f"     {p}")
        return 1
    print("RESULT V-13 GREEN")
    print("     ledger principal + staff-ledger verificados")
    return 0


if __name__ == "__main__":
    sys.exit(main())
