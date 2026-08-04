#!/usr/bin/env python3
"""KipusPay — V-00: autotest del verificador.

El falso GREEN histórico (entrada 0179 del Ledger) existió porque un check no podía
fallar y nadie lo probó. Este autotest alimenta casos sintéticos a los detectores de
`structural.py` y exige que **detecten la violación** y que **no marquen el caso
limpio**. Corre antes que el resto de la batería: si el detector está roto, el
veredicto del gate no vale nada.

Emite `RESULT V-00 GREEN|RED` y sale 1 si algún detector falla.
"""
from __future__ import annotations

import importlib.util
import sys

HERE = __file__.rsplit("/", 1)[0]


def load_structural():
    spec = importlib.util.spec_from_file_location("structural", f"{HERE}/structural.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def load_code_money():
    spec = importlib.util.spec_from_file_location("code_money", f"{HERE}/code_money.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def load_tdd_evidence():
    spec = importlib.util.spec_from_file_location("tdd_evidence", f"{HERE}/tdd_evidence.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


SUCIA = """```sql
CREATE TABLE mala (
    id TEXT PRIMARY KEY,
    tenant_id TEXT,
    total_amount REAL NOT NULL,
    price_cents REAL NOT NULL,
    qty REAL NOT NULL,
    FOREIGN KEY (order_id) REFERENCES pedidos(id)
);
CREATE TABLE pedidos (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    total_cents INTEGER NOT NULL
);
```
"""

LIMPIA = """```sql
CREATE TABLE buena (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    total_amount_cents INTEGER NOT NULL,
    points_balance REAL NOT NULL DEFAULT 0,
    qty REAL NOT NULL,
    FOREIGN KEY (tenant_id, order_id) REFERENCES pedidos(tenant_id, id)
);
CREATE TABLE pedidos (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    total_cents INTEGER NOT NULL
);
```
"""


def money_violations(st, body: str) -> list[str]:
    out = []
    for col, typ in st.column_defs(body):
        if col.endswith("_cents") and typ != "INTEGER":
            out.append(f"{col}:{typ}")
        elif typ == "REAL" and st.MONEY_HINT.search(col) and not st.RATIO_OK.search(col):
            out.append(f"{col}:REAL")
    return out


def nullable_tenant(st, body: str) -> list[str]:
    return [
        m.group(0).strip()
        for m in st.TENANT_COL.finditer(body)
        if "NOT NULL" not in m.group("rest").split("--")[0].upper()
    ]


def simple_fks(st, text: str) -> list[str]:
    tables = st.parse_tables(text)
    owned = {n for n, b in tables if any(c == "tenant_id" for c, _ in st.column_defs(b))}
    out = []
    for name, body in tables:
        if name not in owned:
            continue
        for m in st.FOREIGN_KEY.finditer(body):
            cols = [c.strip() for c in m.group(1).split(",")]
            if m.group(2) in owned and "tenant_id" not in cols:
                out.append(f"{name}->{m.group(2)}")
    return out


def main() -> int:
    st = load_structural()
    fails: list[str] = []

    def expect(cond: bool, msg: str) -> None:
        if not cond:
            fails.append(msg)

    sucia = dict(st.parse_tables(SUCIA))
    limpia = dict(st.parse_tables(LIMPIA))

    expect(len(sucia) == 2 and len(limpia) == 2, "parse_tables no encontró las 2 tablas")

    # V-06: dinero
    expect(len(money_violations(st, sucia["mala"])) == 2, "V-06 no detectó REAL monetario ni _cents no INTEGER")
    expect(money_violations(st, limpia["buena"]) == [], "V-06 marcó como violación un caso limpio (ratios REAL)")

    # V-05: tenant_id anulable
    expect(len(nullable_tenant(st, sucia["mala"])) == 1, "V-05 no detectó tenant_id anulable")
    expect(nullable_tenant(st, limpia["buena"]) == [], "V-05 marcó NOT NULL como anulable")

    # V-14: FK simple hacia tabla tenant-owned
    expect(simple_fks(st, SUCIA) == ["mala->pedidos"], "V-14 no detectó la FK simple")
    expect(simple_fks(st, LIMPIA) == [], "V-14 marcó una FK compuesta como simple")

    # V-10: escapes de exportación
    expect(bool(st.ESCAPE_NOISE.search("tenant" + chr(92) + "_id TEXT")), "V-10 no detecta escapes")
    expect(not st.ESCAPE_NOISE.search("tenant_id TEXT"), "V-10 detecta escapes donde no hay")

    # V-09: placeholders de imagen
    expect(bool(st.IMAGE_PLACEHOLDER.search("valor: ![][image7] ok")), "V-09 no detecta placeholders")

    # V-11: CREATE TABLE fuera de fence
    expect(st.FENCE.match("```sql") is not None and st.FENCE.match("```sql").group(1) == "sql",
           "V-11 no lee el lenguaje del fence")
    expect(st.FENCE.match("```") is not None and st.FENCE.match("```").group(1) == "",
           "V-11 no distingue fence sin lenguaje")

    # V-12: headings y referencias
    expect(st.HEADING_NUM.findall("## **5.3 Operación**\n### 0.4 Registry\n") == ["5.3", "0.4"],
           "V-12 no extrae headings numerados")
    expect(st.SECTION_REF.findall("ver §5.3 y § 0.4") == ["5.3", "0.4"], "V-12 no extrae referencias §")

    # V-21: dinero en código (CAL-01)
    cm = load_code_money()
    expect(bool(cm.TO_FIXED.search("return total.toFixed(2);")), "V-21 no detecta toFixed")
    expect(bool(cm.FLOAT_ON_MONEY.search("const x = parseFloat(total_cents);")), "V-21 no detecta parseFloat sobre dinero")
    expect(bool(cm.SUSPECT_TYPED.search("const total: number = 0;")), "V-21 no detecta dinero tipado number sin _cents")
    expect(bool(cm.CENTS_OK.search("total_cents")), "V-21 no reconoce _cents como dinero OK")
    expect(not cm.CENTS_OK.search("total"), "V-21 marca un nombre sin _cents como dinero OK")

    # V-20: parseo de entradas del ledger (CAL-07) + reachability helpers
    te = load_tdd_evidence()
    entries = te.parse_entries(
        "id: 0188\nred_commit_sha: a1b2\nred_run_id: r1\ngreen_commit_sha: c3d4\n"
        "green_run_id: r2\nancestry_verified: true\nid: 0189\n".splitlines()
    )
    expect(len(entries) == 2 and entries[0]["id"] == "0188", "V-20 no parsea las entradas del ledger")
    expect(any(e.get("red_commit_sha") == "a1b2" for e in entries), "V-20 pierde campos de la entrada")
    corr = te.corriged_ids(
        [
            {"id": "0207", "relacion": "CORRIGE", "referencias_entradas": "[0202, 0203]"},
            {"id": "0202", "relacion": "AMPLIA"},
        ]
    )
    expect("0202" in corr and "0203" in corr, "V-20 corriged_ids no lee referencias CORRIGE")
    expect(te.is_ancestor_of_head("N/A") is True, "V-20 N/A no debe fallar reachability")
    expect(te.is_ancestor_of_head("not-a-sha") is False, "V-20 SHA inválido debe fallar reachability")

    if fails:
        print(f"RESULT V-00 RED  {len(fails)} detector(es) del gate fallan")
        for f in fails:
            print(f"     {f}")
        return 1
    print("RESULT V-00 GREEN")
    print("     23 aserciones sobre los detectores del gate")
    return 0


if __name__ == "__main__":
    sys.exit(main())
