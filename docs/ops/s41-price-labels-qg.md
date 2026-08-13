---
doc_id: ops-s41-price-labels-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Sprint 41 — Etiquetas de precio y estantería — Quality Gate

**Estado software:** GREEN  
**Estado claim/hardware:** NO-GO hasta evidencia física compatible y firma A+V  
**Capability:** `catalog.price_labels`  
**Spec:** Arquitectura §5.8 regla 26 · ADR-0025 · GTM-17 · Roadmap FASE 6D

## Evidencia automatizada

| Check | Resultado |
|---|---|
| ADR-0025: lista explícita/default de sucursal, snapshot autoritativo y retry inmutable | GREEN |
| Mig 0034 DAT-12: templates versionados, batches idempotentes e items snapshot | GREEN |
| Down 0034 protegido ante templates no bootstrap, batches o items | GREEN |
| DSL `PRICE_LABEL_V1`: nodos/campos allowlisted, sin HTML/CSS/script/URL | GREEN |
| Barcode zero-dependency: EAN-8, EAN-13 y CODE128 con validación/checksum | GREEN |
| Golden bytes deterministas 58/80 mm y precios INTEGER cents | GREEN |
| D1: resolución server-side de lista/precio/producto/template y persistencia con `db.batch` | GREEN |
| Retry conserva snapshot; reprint crea identidad nueva y `PRICE_LABEL_REPRINT` hash-chain | GREEN |
| RBAC/capability/terminal: fail-closed y errores HTTP opacos | GREEN |
| Outbox genérica: ACK por ítem, F5/cuota y 0 bloqueo de venta/cierre Z | GREEN |
| WebUSB virtual: profile/endpoint allowlist, timeout, release y close en `finally` | GREEN |
| WSS virtual: solo `wss:`, host allowlisted, nonce+item ACK, timeout y reconnect | GREEN |
| Security Review: 0 critical/high/medium; gaps de integración fail-closed corregidos | GREEN |
| Chaos `price-label-printing`: 500 ciclos, 0 duplicados/stale/mix/bloqueo de caja | GREEN |
| D1 workerd: 115 tests de integración, incluida concurrencia/rollback | GREEN |
| Unit: print 31, POS 81, adapters 248, Worker 504, chaos 74 | GREEN |
| Cobertura: adapters 94.57% líneas/82.03% ramas; POS 79.83% líneas | GREEN |
| Bundle POS | 111.92 kB gzip de 300 kB |
| `scripts/verify.sh` | SUITE GREEN |
| `scripts/quality.sh` sobre commit limpio | Quality Gate OK |

## Evidencia RED→GREEN

- RED `1e3919b1acb55320e1ae2aac44aa4606ae1c30d5`: contratos fallaban porque
  no existían migración 0034, dominio/render, adapter, rutas, outbox, transportes ni chaos.
- GREEN `4eb2456177ca7dd9adeb1e3b0be4a80bc8762152`: implementación funcional,
  hardening de boundaries y formato reproducible; gate integral 8/8.
- Retry técnico conserva `batch_id`, bytes y snapshots; reprint explícito vuelve a
  resolver el precio vigente y crea audit exactamente una vez.
- La revisión de seguridad cerró los desacoples cliente/API, headers de terminal,
  fallback de autenticación demo y correlación criptográfica de ACK WSS.

## Matriz automatizada

| Perfil | Fixture | Evidencia |
|---|---|---|
| ESC/POS 58 mm | golden bytes | nombre/precio/barcode, overflow, caracteres y checksum |
| ESC/POS 80 mm | golden bytes | determinismo, copias, orden y precio INTEGER |
| WebUSB | dispositivo inyectable | claim/interface/endpoint, disconnect, timeout y cleanup |
| WSS LAN | socket inyectable | allowlist, binario, nonce+ACK, timeout, close y reconnect |
| IndexedDB | puerto persistente | F5, cuota, corrupción, subset pendiente y cierre Z |

## Matriz física pendiente

| Perfil | Evidencia requerida | Estado |
|---|---|---|
| Impresora térmica 58 mm WebUSB allowlisted | foto/ticket, fingerprint, endpoint, acentos, barcode escaneable, disconnect | NO-GO |
| Impresora térmica 80 mm WebUSB allowlisted | foto/ticket, fingerprint, endpoint, corte, barcode escaneable, timeout | NO-GO |
| Bridge WSS LAN paired/allowlisted | certificado, host, ACK/nonce, reconnect, pérdida de red | NO-GO |

Los fixtures demuestran el contrato de software, no compatibilidad física. Hasta anexar
la evidencia anterior y obtener firmas A+V independientes, no se activa la capability
en producción ni se publica el claim “etiquetas de precio en impresoras/perfiles
compatibles”.

## RACI

| Rol | Quién | Firma |
|---|---|---|
| R | Staff Frontend + Staff Backend Datos | OK software |
| A | Staff Principal + Staff Hardware | PENDIENTE evidencia física |
| V | Staff QA independiente + Staff Hardware | PENDIENTE evidencia física |
| Security | Staff Security Review | OK — 0 medium+ |
| Claim | Staff PM | NO-GO |

## Cutover condicionado

1. Aplicar 0034 con flags apagados y validar down en tenant sin snapshots.
2. Pair/fingerprint de impresora o bridge y registrar allowlist por terminal.
3. Ejecutar la matriz física 58/80 y anexar evidencia reproducible.
4. Obtener firmas A+V; recién entonces activar backend/UI por tenant.
5. Ante timeout/ACK perdido, apagar UI; conservar batches/snapshots para retry exacto.

## Residuales

- **S41-H1 (decisión documentada):** el ACK por ítem es un contrato OUTBOX de
  entrega — el servidor confía el ACK del terminal porque no hay binding
  criptográfico con el hardware físico (sin nonce firmado por la impresora).
  Es el diseño declarado ("ACK por ítem"), no una prueba de impresión física:
  un supervisor puede marcar items ACKED sin imprimir. Límite aceptado
  (evidencia de impresión NO verificable server-side); el claim GTM-17 sigue
  congelado y el piloto físico (WebUSB/WSS con firma A+V) permanece NO-GO
  hasta la matriz de hardware.
- Playwright Chromium y dispositivos físicos no estuvieron disponibles en este entorno.
- El claim GTM-17 de etiquetas permanece congelado; el software queda listo para piloto.
- Backup/restore continúa en Sprint 42.
