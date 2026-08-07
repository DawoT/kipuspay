---
doc_id: ops-s25-print-outbox-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Sprint 25 — Print outbox + offloading — Quality Gate

**Estado:** GOV-APROBADO (firma A+V)  
**Capabilities:** `client.offloading`, `hardware.print_fallback`  
**Spec:** Arquitectura §7.5; edge 2D ADR-0012; Roadmap FASE 8

## Evidencia

| Check | Resultado |
|---|---|
| Print outbox IDB `print_jobs/{saleId}` + F5 survival | GREEN — pos-web `print-outbox` |
| pendingCount PENDING+FAILED exacto (500 ciclos) | GREEN — chaos 250 FAILED / 250 ACK |
| GS ( k ) QR térmica zero-dep | GREEN — print-templates |
| Escalera WebUSB→WSS→BT→SystemPrint→WA | GREEN — failback mock + SystemPrint real |
| Blind Z bloquea con outbox > 0 | GREEN — `outboxPendingCount` + 409 |
| `pos_terminals` 58/80 | GREEN — mig 0018 + resolve |
| Flags default off | GREEN — `CLIENT_OFFLOADING` / `HARDWARE_PRINT_FALLBACK` |
| CAL-06 / V-24 bundle | GREEN — quality step 8/8 |
| `scripts/verify.sh` | SUITE GREEN |
| `scripts/quality.sh` | Quality Gate OK |

## RACI

| Rol | Quién | Firma |
|---|---|---|
| R | Frontend + Hardware | OK |
| A | Staff Principal | OK |
| V | Frontend + Hardware + QA/Chaos | OK |

## Residuales

- Emparejamiento WebUSB/WSS/BT en hardware real (sandbox fail-closed)
- OffscreenCanvas raster QR pantalla (térmica ya GS k)
- Circuit breaker fiscal → Sprint 26
- Cupo/Stripe → Sprint 27
