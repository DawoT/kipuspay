---
doc_id: ops-fl-fiscal-live-qg
alias: "—"
authority: derivada
owner: "@DawoT"
---

# FASE FL — Quality Gate Facturador Live

**Software local:** GREEN (FL-0 fail-closed + FL-5 UBL/outbox).  
**Homologación / GTM-08 / producción SUNAT:** NO-GO hasta A+V.  
Staff **no** marca `go-live-sunat: CERRADO` ni descongela GTM-07/08.

| Sprint | Software | Externo | Bloquea A |
|---|---|---|---|
| FL-0 | GREEN: `MISCONFIGURED` 503; drain live sin firma → cuarentena; Dueño/ticket honestos | — | Review QG |
| FL-1 (= S11+S12) | UI `.p12` + cron `*/5` + flags git 0; UBL 01 con local anexo + tasa IGV + ProfileID | e-beta **F001-12 ACCEPTED** (SOAP sign-only, RUC `20612913251`). S11 UI y S12 drain WAIT: pass CDT en sesión, `AUTH_JWT_HS_SECRET`, flags runtime. SOL ya está en Secrets Store del worker-fiscal; cert staging ACTIVE (fingerprint CDT). | Pass sesión / flags |
| FL-2 (= S13) | Cliente HTTP + `.invalid` no acreditado | WAIT URL HTTPS ≠ `.invalid` | URL / cert plataforma |
| FL-3 (= S15) | UBL `07`/`08` + RC fail-closed | WAIT CDR en canal FL-2 | Canal acreditado |
| FL-4 (= S16+S14) | Pack de evidencia + override T6 listo; default e-beta | WAIT firmas A+V; T6 escrito | A+V; auth e-factura |
| FL-5 | UBL `31`/`02`/`20` + `fiscal_non_sale_outbox` + drain | WAIT flags runtime; detracción banco NO-GO | Flags Cadena |

## No cubierto

URL PSE real, SOL prod, correlativos prod, CDR visible en SOL/OSE, detracción
bancaria. e-beta **no** cierra GTM-08. Tracker: `docs/ops/pending-batches.yaml`
`go-live-sunat`.
