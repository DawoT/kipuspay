---
doc_id: runbook-owner-mode-ledger
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Runbook — Modo Dueño + Ledger CxC/CxP (Sprint 8)

**Capabilities:** `ledger.accounts_receivable`, `ledger.accounts_payable`, `purchasing.orders`, `cash.register_expenses`, `owner.mode`, `owner.offline_rollup`, `owner.push_alerts`  
**Flags (default `0`):** `FEATURE_LEDGER_AR_AP`, `FEATURE_PURCHASING_ORDERS`, `FEATURE_CASH_EXPENSES`, `FEATURE_OWNER_MODE`, `FEATURE_OWNER_PUSH`

## Alcance

- Dominio puro en `@kipuspay/domain-cash` (`planCreateAr`, `planPayAr`, `compensateArOnCreditNote`, AP/OC/egresos).
- DAT-05: venta a crédito → INSERT CxC en el mismo `db.batch` que la venta.
- Edge E-D: NC / `NV_RETURN` reduce `balance_due_cents` + asiento de pago en la misma tx.
- Chaos `ar-compensate`: 500 ciclos total+parcial, 0 drift (quality step 4f).
- API: `/api/ledger/*`, `/api/purchasing/orders*`, `/api/cash/expenses`, `/api/owner/day-summary`, `/api/owner/push/*`.
- PWA Dueño: `/owner` tabs Hoy / Finanzas / Yo (+ Locales gated). Dark mode real (CSS variables).
- Offline: cache IDB del último rollup + banner “Datos de hace X horas (no en vivo)” + refresh al `online`.

## Fronteras (no tragar)

| Fuera de 8 | Dueño |
|---|---|
| Sprint 9 | Catálogo reportes, cron multi-shard, CSV, **descongelar GTM-03/11** |
| Sprint 25 | Print ladder / outbox |
| Sprint 17 | `cash.blind_z` / credit limit runtime |
| Sprint 20/28 | Partial receive / three-way |
| Sprint 43–45 | `mobile.push` completo (aquí solo `owner.push_alerts`) |

## Growth freeze

**GTM-03 / GTM-11 permanecen congelados** hasta Quality Gate de Sprint 9. S8 implementa infraestructura offline+banner y ranking copy “no-live”; no descongela pitch de ranking.

## Design checklist (GTM §6.3)

- [ ] Tab bar consumo (Hoy / Finanzas / Yo); no panel admin chrome
- [ ] Hoy: resumen accionable sin scroll infinito
- [ ] Dark mode real (variables Dueño, no chrome admin)
- [ ] Yo: plan + atajo “Activar facturación electrónica” → Admin
- [ ] Locales: ranking UI gated / copy no-live
- [ ] Banner antigüedad nunca dice “en vivo”

## Push SLA

Harness `runPushDeliveryHarness(100)`: tasa ≥99% con endpoints `https://` + keys. Evidencia en unit tests `owner/push-routes.test.ts`.

## Verificación

```bash
scripts/verify.sh
scripts/quality.sh
node scripts/chaos/run.mjs --scenario ar-compensate --sprint 8
```

## QG

`estado_gov: EN REVISION` hasta firma humana A + V (Proceso §8.1). Residuales S5–S7 no se fingen.
