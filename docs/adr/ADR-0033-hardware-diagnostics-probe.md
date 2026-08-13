---
doc_id: adr-0033
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-0033 — Contrato de probe-mode en PrinterTransport y registry de diagnóstico inyectable

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-12 |
| Decisores | Staff Principal, Staff Hardware |
| Consultados | Staff Frontend (Admin), Staff QA/Chaos, Staff Design |
| Informados | Staff PM, Staff Growth |
| Relaciona | Arquitectura §5.3 regla 37b · Arquitectura §7.5 (PrinterTransport) · Roadmap FASE 6G Sprint 53 · Ledger 0332 · ADR-ARCH-002 |

## Contexto

La regla 37b (Arquitectura §5.3) exige un Troubleshooter de hardware en
Admin → Configuración con estados ✓/✗ que muestren causa comprensible y "paso
siguiente", ocultando la escalera WebUSB → WSS → Bluetooth (§7.5) y con log
`HARDWARE_DIAG` en `audit_events`. Hoy `PrinterTransport` (§7.5) solo expone
`preflight()`/`print()` con la escalera de fallback; los adapters reales
(WebUSB/WSS) viven en `lib/printing/price-label-transports.ts` (Sprint 41) y no
existe un modo de "probe" (probar un dispositivo sin emitir un ticket de venta)
ni un formato canónico de diagnóstico. Además, `navigator.usb`/`navigator.bluetooth`
no son mockeables en Playwright: sin un seam, el diagnóstico no es testeable de
punta a punta y la promesa "resuelve ≥90% de los casos sin chat de soporte" no
tiene evidencia.

## Decisión

Se define un **contrato de probe-mode** para la capa de hardware del cliente:
cada transporte de `PrinterTransport` y cada dispositivo (impresora, balanza,
vitrina) expone una operación `probe(timeoutMs)` que devuelve un
`DiagnosticReport` canónico (`{target, ok, causeCode, nextStepId, durationMs}`)
sin efectos secundarios de emisión; y todo diagnóstico se ejecuta a través de un
**diagnostic registry inyectable** que consulta `window.__KIPUS_TEST_HARDWARE__`
cuando existe (seam de test para E2E), cayendo a los adapters Web Platform reales
en producción. El copy de causas/nextStep vive en el dominio puro
(`packages/domain-hardware`) y es validado contra jerga técnica prohibida
(WebUSB, WSS, Bluetooth, IP, LAN, ESC/POS, puerto) por `validateDiagnosticsCopy`
— el botón "Probar impresora USB" del roadmap conserva su nombre normativo; la
prohibición aplica al copy de estados y pasos siguientes.

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| A: Diagnóstico ad-hoc en la página de configuración, sin contrato de probe ni dominio puro | El copy técnico se filtra a la UI, no hay formato canónico para `HARDWARE_DIAG` y no se puede cumplir la evidencia de ≥90% con tests |
| B: Mockear `navigator.usb`/`navigator.bluetooth` en Playwright | No es soportado de forma fiable por Playwright/Chromium; un seam propio es determinista y corre igual en CI |
| C: Ejecutar el diagnóstico server-side (Worker) | WebUSB/BroadcastChannel son APIs de navegador; no existe equivalente en Workers |

## Consecuencias

- **Gana:** diagnóstico testeable (unit + E2E) con report canónico; log `HARDWARE_DIAG`
  uniforme (el servidor persiste el report tal cual en `audit_events`); cero jerga
  técnica garantizada por test de copy; la escalera §7.5 queda intacta para el
  flujo de venta (el probe nunca emite).
- **Paga:** los transportes reales (price-label S41, escala S40) necesitan un
  método `probe` adicional; el seam `__KIPUS_TEST_HARDWARE__` es un punto de
  superficie de test que el guardián de bundle debe medir (es dead-code en
  producción sin el flag).
- **Invariantes tocadas:** invariante 10 (zero-dependency: el probe usa Web
  Platform APIs existentes, sin librerías npm); invariante 5 (fail-closed: sin
  probe disponible el report es `✗` con causa y paso siguiente, nunca "OK por
  omisión"); DRY (la semántica causa→paso vive UNA vez en `domain-hardware`).
- **Activación:** feature flag `PUBLIC_FEATURE_HARDWARE_DIAGNOSTICS` (default off)
  + capability `tenant_capabilities.hardware.diagnostics` (ADR-ARCH-002); la UI
  solo se muestra con ambos habilitados.

## Evidencia de cierre

- Tests / checks: domain-hardware cobertura ≥95% (CAL-05) · unit pos-web ≥70% ·
  E2E `hardware-diagnostics.spec.ts` (5/5) · `validateDiagnosticsCopy` RED si el
  copy contiene jerga prohibida · `verify.sh` SUITE GREEN (V-08 con la fila
  FASE 6G/HARDWARE_DIAG del Registry §0.4) · QG `docs/ops/s53-hardware-diagnostics-qg.md`.
- Ledger: `id: 0332`
- Firmas RACI: `R` Staff Hardware · `A` Staff Principal · `V` Staff QA/Chaos
