---
doc_id: ops-operational-seed
title: Seed operativo multivertical
status: active
alias: "—"
authority: derivada
owner: "@DawoT"
---

# Seed operativo multivertical

El paquete `scripts/staff/operational-seed.mjs` genera datos sintéticos y
deterministas para probar el recorrido común de KipusPay: inventario, nota de
venta (`NV01`), pagos, caja, compras, promociones y capacidades. Incluye un
tenant aislado para Retail, Farmacia, Restaurantes, Servicios, Cadenas y Grifos.

## Uso seguro

```bash
# Aplicar en un estado Wrangler local aislado (migraciones incluidas)
mkdir -p /tmp/kipuspay-operational-seed
bash scripts/staff/apply-operational-seed.sh --state-dir /tmp/kipuspay-operational-seed

# Solo generar/validar SQL
node scripts/staff/operational-seed.mjs /tmp/operational-seed.sql
node scripts/staff/validate-operational-seed.mjs /tmp/operational-seed.sql

```

El comando exige `--state-dir`, aplica solo con `--local --persist-to` y escribe
únicamente IDs `seed_*`. No existe una opción de staging: esa validación remota
requiere aprobación y un flujo separado. El seed es repetible mediante
`INSERT OR IGNORE`; no restablece stock ni correlativos que hayan avanzado en
el estado local y no borra datos anteriores.

## Datos y comprobaciones

Cada tenant contiene sucursal, caja abierta, usuarios owner/cashier con un hash
Argon2id sintético de prueba, serie NV, métodos de pago, cliente, proveedor,
orden de compra recibida, CxP, catálogo con variante, lista de precios,
promoción, lote, ubicación, stock y movimientos. Farmacia añade un producto con
dos lotes vigentes ordenados por vencimiento y otro con solo lote vencido; las
cantidades de lote, sucursal y ubicación quedan sincronizadas para probar FEFO y
bloqueo. Restaurante añade una comanda FIRED para el replay de KDS; la división
de cuenta aún requiere validación aparte. Servicios añade un producto de tipo
servicio, su UOM base y un plan mensual NV con precio FIXED versionado; su
primera ejecución queda en el futuro y el servicio no recibe stock. Los
snapshots de control plane KV se escriben por tenant; las capabilities
comerciales permanecen en D1. El tenant
Grifos añade catálogo
`GAS95` y un despacho idempotente con precio snapshot, volumen en microunits y
vínculo a la venta. El PIN conocido para pruebas locales es `4826`; no
reutilizarlo fuera del estado sintético local.

El seed pone los escenarios comunes y capabilities verticales. No sustituye
los recorridos completos aún pendientes de Restaurante/KDS/listo/split,
Farmacia/FEFO con checkout, Servicios/recurrencia, Cadena/transferencia/3-way
y Grifos/reporte de turno.

La prueba de contrato está en
`scripts/staff/operational-seed.test.mjs`. Después de aplicar el seed se deben
ejecutar las pruebas D1/E2E del flujo offline y verificar que la venta NV
descuenta stock una sola vez y conserva la autoridad server-side.
