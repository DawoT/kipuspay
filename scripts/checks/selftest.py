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
import os
import sys
import tempfile

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


def load_migrations_mirror():
    spec = importlib.util.spec_from_file_location(
        "migrations_mirror", f"{HERE}/migrations_mirror.py"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def load_api_contract():
    spec = importlib.util.spec_from_file_location(
        "api_contract", f"{HERE}/api_contract.py"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def load_marketing_copy():
    spec = importlib.util.spec_from_file_location(
        "marketing_copy", f"{HERE}/marketing_copy.py"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def load_pos_copy():
    spec = importlib.util.spec_from_file_location("pos_copy", f"{HERE}/pos_copy.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def load_pos_demo_ids():
    spec = importlib.util.spec_from_file_location("pos_demo_ids", f"{HERE}/pos_demo_ids.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def load_ci_cd():
    spec = importlib.util.spec_from_file_location("ci_cd", f"{HERE}/ci_cd.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_TMP_COUNTER = [0]


def __write_tmp(suffix: str, content: str) -> str:
    """Crea un archivo temporal real para scan_file (V-30)."""
    _TMP_COUNTER[0] += 1
    path = os.path.join(tempfile.gettempdir(), f"v30-selftest-{_TMP_COUNTER[0]}{suffix}")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(content)
    return path


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
    asserts = 0

    def expect(cond: bool, msg: str) -> None:
        nonlocal asserts
        asserts += 1
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

    # V-25: espejo up<->down de migraciones (Sprint 1)
    mm = load_migrations_mirror()
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        up = f"{tmp}/up"
        down = f"{tmp}/down"
        os.makedirs(up)
        os.makedirs(down)
        open(f"{up}/0001_ddl_base_v8.sql", "w").write("")
        open(f"{up}/0002_webhook_events.sql", "w").write("")
        open(f"{down}/0001_ddl_base_v8.sql", "w").write("")
        expect(
            mm.mirror_violations(up, down) == ["falta-down:0002_webhook_events.sql"],
            "V-25 no detectó el down faltante",
        )
        open(f"{down}/0003_atomic_guards.sql", "w").write("")
        expect(
            sorted(mm.mirror_violations(up, down))
            == ["falta-down:0002_webhook_events.sql", "huerfano-down:0003_atomic_guards.sql"],
            "V-25 no detectó down huérfano",
        )
        open(f"{down}/0002_webhook_events.sql", "w").write("")
        open(f"{up}/0003_atomic_guards.sql", "w").write("")
        expect(mm.mirror_violations(up, down) == [], "V-25 marcó un espejo completo como roto")

    # V-26: copy marketing sin jerga técnica (GTM §1 / Sprint 10)
    mc = load_marketing_copy()
    expect(
        mc.BANNED.search("Hecho en el Edge con D1 sharding") is not None,
        "V-26 no detecta jerga técnica en copy",
    )
    expect(
        mc.BANNED.search("Tu negocio con facturación electrónica") is None,
        "V-26 marca copy limpio como jerga",
    )
    expect(
        mc.BANNED.search("Resumen Diario con CDR y PSE") is not None,
        "V-26 no detecta CDR/UBL/PSE en copy",
    )
    expect(
        mc.INTERNAL.search("Plan Crece+ con GTM-02 y HTTP 402") is not None,
        "V-26 no detecta referencias internas (GTM-/HTTP)",
    )
    expect(
        mc.INTERNAL.search("hasta el Quality Gate del Sprint 27") is not None,
        "V-26 no detecta Quality Gate/Sprint en copy",
    )
    expect(
        mc.INTERNAL.search("Precios desde S/ 49/mes") is None,
        "V-26 marca copy limpio como referencia interna",
    )
    expect(
        mc._is_comment("// GTM §4.1 — comentario interno de código"),
        "V-26 no omite comentarios HTML",
    )
    expect(
        mc._is_scanned("playwright.config.ts") is False
        and mc._is_scanned("tests/e2e/pricing-claims.spec.ts") is False
        and mc._is_scanned("src/lib/content/home.ts") is True,
        "V-26 escanea configs o specs de test como copy",
    )
    expect(
        mc._is_comment("<!-- GTM-02 interno -->"),
        "V-26 no omite comentarios HTML",
    )

    # V-27: copy POS incluye label/placeholder (FASE E)
    pc = load_pos_copy()
    expect(
        pc.BANNED_WORDS.search(pc.visible_text('<Field label="Cuota inicial (céntimos)">')) is not None,
        "V-27 no ve céntimos en atributo label",
    )
    expect(
        pc.BANNED_WORDS.search(pc.visible_text('<Input placeholder="p-demo" />')) is not None,
        "V-27 no ve p-demo en placeholder",
    )
    expect(
        "JSON" in pc.visible_text('<Field label="Ítems del plan (JSON)">'),
        "V-27 no ve JSON en atributo label",
    )
    expect(
        pc.BANNED_WORDS.search(pc.visible_text('<p>Pago de cuotas</p>')) is None,
        "V-27 marca copy limpio de caja como jerga",
    )

    # V-28/V-29: contrato de integración entre apps (paridad epoch + POS↔API)
    ac = load_api_contract()
    good_migrations = "\n".join(
        f'CREATE TRIGGER backup_epoch_{t}_{k} AFTER INSERT ON "{t}" BEGIN END;'
        for t in ("sales", "users")
        for k in ("insert", "update", "delete")
    )
    expect(
        ac.epoch_parity_missing(["sales", "users", "tenant_data_epochs", "data_backups"], good_migrations) == [],
        "V-29 marca tablas con triggers (o infra excluida) como faltantes",
    )
    bad_migrations = good_migrations.replace("backup_epoch_users_insert", "")  # users queda sin insert
    expect(
        ac.epoch_parity_missing(["sales", "users"], bad_migrations) == ["users"],
        "V-29 no detecta el trigger faltante",
    )
    expect(
        ac.epoch_parity_missing(["data_backups"], "") == [],
        "V-29 no excluye la infraestructura del backup",
    )
    registered = [
        ("POST", "/api/cash/:id"),
        ("GET", "/api/pos/day-sales"),
        ("POST", "/api/sales/returns/policy"),
    ]
    expect(
        ac.route_parity_missing(
            registered,
            {
                "/api/cash/authz-token": {"POST"},
                "/api/sales/returns/policy": {"POST", "*"},
                "/api/pos/day-sales": {"GET"},
            },
        )
        == [],
        "V-28 marca rutas registradas como faltantes",
    )
    expect(
        ac.route_parity_missing(
            registered,
            {
                "/api/cash/authz-token": {"POST"},
                "/api/pos/nonexistent/deep": {"POST"},
                "/api/pos/day-sales": {"DELETE"},
            },
        )
        == [
            "DELETE /api/pos/day-sales (registrado: ['GET'])",
            "POST /api/pos/nonexistent/deep",
        ],
        "V-28 no detecta ruta o método faltante",
    )
    expect(
        ac.route_parity_missing(registered, {"/api/sales/returns/policy": {"*"}}) == [],
        "V-28 exige método cuando el cliente lo declara (path-only con *)",
    )
    expect(
        ac.extract_api_paths_from_line(
            "fetch(`${apiBase()}/api/ghost/path`, { method: 'POST' })"
        )
        == ["/api/ghost/path"],
        "V-28 no ve /api/ dentro de templates ${}",
    )
    expect(
        ac.extract_api_paths_from_line(
            "fetch(`${apiBase()}/api/commissions/payouts/${payoutId}/pay`, { method: 'POST' })"
        )
        == ["/api/commissions/payouts/*/pay"],
        "V-28 no colapsa ${id} a * dentro de templates",
    )

    # V-30: cero literales demo en el código fuente del POS (F-6, completo)
    pd = load_pos_demo_ids()
    expect(
        pd.scan_file(__write_tmp(".ts", "let branchId = $state('b-demo');\n")) == [(1, "b-demo")],
        "V-30 no ve literal demo asignado",
    )
    expect(
        pd.scan_file(__write_tmp(".ts", "if (session.tenantId !== 'demo') {}\n")) == [],
        "V-30 marca la comparación defensiva como hallazgo",
    )
    expect(
        pd.scan_file(
            __write_tmp(
                ".ts",
                "// legacy ('s-demo') antes del fix\nconst id = 'ok';\n/* b-demo histórico */\n",
            )
        )
        == [],
        "V-30 ve demo dentro de comentarios",
    )
    expect(
        pd.scan_file(__write_tmp(".svelte", "<!-- demo -->\nlet evidenceKey = $state('demo.jpg');\n"))
        == [(2, "demo.jpg")],
        "V-30 no ve demo en template svelte fuera del comentario",
    )
    expect(
        pd.scan_file(__write_tmp(".ts", "const ok = 'validId';\n")) == [],
        "V-30 marca texto sin demo",
    )

    # V-31: contrato CI/CD del deploy a staging (Proceso §5.2 Etapa 6, §13.7)
    cc = load_ci_cd()
    GOOD_WF = """
on:
  workflow_dispatch:
jobs:
  gate:
    steps:
      - run: bash scripts/verify.sh
  deploy:
    needs: [gate]
    steps:
      - name: kms
        run: pnpm --filter @kipuspay/worker-kms run deploy:staging
      - name: api
        run: pnpm --filter @kipuspay/worker-api run deploy:staging
      - name: fiscal
        run: pnpm --filter @kipuspay/worker-fiscal run deploy:staging
      - name: pos
        run: pnpm --filter @kipuspay/pos-web run deploy:staging
      - name: mkt
        run: pnpm --filter @kipuspay/marketing-web run deploy:staging
      - uses: actions/upload-artifact@v4
"""
    BAD_NO_WD = GOOD_WF.replace("  workflow_dispatch:\n", "")
    BAD_NO_GATE = GOOD_WF.replace("      - run: bash scripts/verify.sh\n", "")
    BAD_NO_ARTIFACT = GOOD_WF.replace("      - uses: actions/upload-artifact@v4\n", "")
    BAD_ORDER = GOOD_WF.replace(
        "pnpm --filter @kipuspay/worker-api run deploy:staging",
        "pnpm --filter @kipuspay/worker-fiscal run deploy:staging",
        1,
    )
    import tempfile as _tf

    with _tf.TemporaryDirectory() as tmp:
        os.makedirs(f"{tmp}/.github/workflows", exist_ok=True)
        open(f"{tmp}/.github/workflows/deploy-staging.yml", "w").write(GOOD_WF)
        expect(cc.violations(tmp) == [], "V-31 marcó un workflow correcto como violación")
        open(f"{tmp}/.github/workflows/deploy-staging.yml", "w").write(BAD_NO_WD)
        expect(
            any("workflow_dispatch" in v for v in cc.violations(tmp)),
            "V-31 no detecta workflow sin workflow_dispatch",
        )
        open(f"{tmp}/.github/workflows/deploy-staging.yml", "w").write(BAD_NO_GATE)
        expect(
            any("gate_documental" in v for v in cc.violations(tmp)),
            "V-31 no exige el gate documental (Etapa 0) como precondición",
        )
        open(f"{tmp}/.github/workflows/deploy-staging.yml", "w").write(BAD_NO_ARTIFACT)
        expect(
            any("artifact" in v for v in cc.violations(tmp)),
            "V-31 no exige artifact de evidencia",
        )
        open(f"{tmp}/.github/workflows/deploy-staging.yml", "w").write(BAD_ORDER)
        expect(
            any("worker-api" in v or "worker-fiscal" in v for v in cc.violations(tmp)),
            "V-31 no detecta target ausente tras reordenar (orden §13.7)",
        )

    if fails:
        print(f"RESULT V-00 RED  {len(fails)} detector(es) del gate fallan")
        for f in fails:
            print(f"     {f}")
        return 1
    print("RESULT V-00 GREEN")
    print(f"     {asserts} aserciones sobre los detectores del gate")
    return 0


if __name__ == "__main__":
    sys.exit(main())
