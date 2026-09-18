---
doc_id: adr-0042-lpdp-email-otp
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-0042 — Verificación titular LPDP con OTP por correo

| Campo | Valor |
|---|---|
| Estado | Propuesto |
| Fecha | 2026-09-17 |
| Decisores | Pendiente: Staff Principal · Staff Security |
| Consultados | Staff Backend · Staff Data · Staff QA |
| Informados | Staff PM · Staff Growth |
| Relaciona | Arquitectura §5.3 regla 32a · ADR-0031 · Sprint 47 · GTM-09 congelado |

## Contexto

La verificación pública del titular actualmente coteja tenant, DNI, nombre y
teléfono y luego emite un bearer token; son datos que no prueban control de un
canal independiente. El rate limit actual es lectura/escritura no atómica en KV
y solo por IP. Sprint 47 mantiene el autoservicio y GTM-09 congelados hasta
resolver ambos hallazgos de seguridad.

## Decisión

Requerir un OTP de un solo uso enviado únicamente al correo ya registrado del
cliente; nunca aceptar un destinatario proporcionado por el solicitante. El
reto, hash del OTP, expiración, intentos y consumo atómico residirán en un
Durable Object SQLite dedicado, en shards acotados; los límites por documento
aislados por tenant y por IP también se consumirán de forma atómica. Emisión,
envío, fallo de proveedor, expiración o respuesta de identidad no emitirán token; solo el
consumo válido del OTP podrá emitir el JWT titular. Toda falla de binding,
secreto o storage es fail-closed. `FEATURE_LPDP` sigue en `0` hasta validación
de entrega, revisión de seguridad y firmas A/V.

## Alternativas consideradas

| Opción | Por qué se descarta |
|---|---|
| Mantener cotejo de datos y KV | No añade factor independiente; KV get/put no es atómico y el límite por IP es evadible distribuyendo origen. |
| Workers Rate Limiting binding como contador autoritativo | Cloudflare documenta contadores locales por ubicación y eventualmente consistentes; no satisface este control exacto. |
| Reusar `TenantState` | Ese DO es el plano autoritativo de revocación por tenant; mezclarlo con tráfico público de titular amplía la superficie y acopla dominios distintos. |
| Enviar al correo escrito por el solicitante | Permitiría desviar el segundo factor y no demuestra control del contacto registrado. |

## Consecuencias

- **Gana:** prueba de posesión de un canal independiente, reto de un solo uso,
  límites resistentes a carreras y sin persistir DNI/IP en claro en el almacén
  de coordinación.
- **Paga:** nuevo DO SQLite y migración de clase, binding Cloudflare Email,
  sender domain onboarded, secreto dedicado HMAC, costo/latencia por shard,
  expiración/limpieza y validación externa de entrega y abuso.
- **Invariantes tocadas:** autenticación, cumplimiento LPDP, privacidad, fail-closed
  y concurrencia; sin cambio a DDL D1 ni a las reglas LPDP-01..04.
- **Activación:** Sprint 47; default-off. No canary ni habilitación de claim
  hasta completar QA humana, seguridad independiente y A/V.

## Evidencia de cierre

- Tests/checks: pendientes de RED→GREEN, integración Workerd concurrente,
  retries/expiración/replay y comprobación de logs PII-free.
- Entrega real: pendiente de dominio KipusPay habilitado en Cloudflare Email
  Sending y sender address aprobado. No se enviarán correos durante pruebas
  locales ni se usarán dominios de otra marca.
- Ledger: pendiente de commit con SHA real, run IDs y firmas criptográficas A/V.
- Firmas RACI: `R` implementación · `A` pendiente · `V` pendiente independiente.
