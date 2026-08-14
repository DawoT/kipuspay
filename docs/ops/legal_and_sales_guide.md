---
doc_id: ops-legal-and-sales-guide
alias: "—"
authority: normativa
owner: "@DawoT"
---

# KipusPay — Documento Maestro Consolidador Operativo, Comercial, Legal y de Contratos (Versión Final Completa)

> **Portal Oficial:** `https://kipuspay.com`  
> **Canales Oficiales:** `contacto@kipuspay.com` · `soporte@kipuspay.com` · `privacidad@kipuspay.com` · `facturacion@kipuspay.com`  
> **Libro de Reclamaciones Virtual:** `https://kipuspay.com/reclamaciones`  
> **Ámbito de Aplicación:** República del Perú & Operaciones SaaS Globales  
> **Propósito:** Este documento constituye la fuente única de verdad legal, comercial y operativa de KipusPay. Consolida íntegramente en un solo texto el Manual Comercial de Ventas, la Oferta del Producto Final Completo v1.0, los Términos y Condiciones del Servicio, la Política de Privacidad LPDP (Ley N.º 29733), el Acuerdo de SLA y Niveles de Servicio, la Política de Cancelaciones y Reembolsos, y el Playbook Legal y Comercial de Preguntas Frecuentes.

> **Estado de claims vs producto (GTM freeze):** comandas/KDS, arqueo Z ciego, FEFO, merma entre locales, derechos LPDP ARCO self-serve y Disaster Recovery permanecen **en preparación** hasta su Quality Gate (GTM-09, GTM-18 y `PUBLIC_CLAIMS`). El catálogo de esta guía es contractual; no afirma que esas capabilities estén live en producción. El export de catálogo/ventas y el libro de reclamaciones con número de caso sí están cableados.

---

## PARTE I: MANUAL OPERATIVO Y ESTRATEGIA COMERCIAL DE VENTAS

### 1. Identidad, Propuesta de Valor y Lenguaje Comercial

#### 1.1 Propuesta de Valor Central
**"El único POS que no se cae contigo."**

*Frase de respaldo para presentaciones institucionales, propuestas y contratos:*  
> *"Vende, cobra y emite comprobantes electrónicos válidos aunque se corte la luz, el internet, o sea el día de mayor afluencia de clientes en tu negocio."*

#### 1.2 Los Tres Dolores Universales del Comercio
Toda la estrategia de ventas y los términos contractuales de KipusPay en `kipuspay.com` se articulan alrededor de tres problemas críticos que afectan a los comercios:

| Dolor Real del Negocio | Lo que Siente el Cliente | Lo que KipusPay Resuelve en Producto | Mensaje Comercial y Contractual |
|---|---|---|---|
| **Lentitud en hora punta** | Vergüenza frente al cliente, colas largas y ventas perdidas por gente que se retira | Responde con la misma velocidad inmediata en la venta 1 que en la venta 10,000 | *"Despide a las colas. Atiende al triple sin que la caja se ponga lenta."* |
| **Corte de luz o internet** | Impotencia, cierre forzoso de caja y pérdida de ingresos en las horas de mayor venta | Sigue vendiendo, cobrando e imprimiendo tickets sin conexión; sincroniza solo al volver la señal | *"El internet caído dejó de ser excusa para cerrar la caja."* |
| **Descuadres de caja** | Sospecha sobre el personal, horas perdidas cuadrando planillas a mano y fuga de dinero | Cada sol y cada unidad de inventario quedan registrados exactamente sin faltantes inexplicables | *"Cada sol cuadra. Siempre."* |

#### 1.3 Diccionario de Traducción Comercial y Legal
Queda estrictamente prohibido utilizar jerga técnica de ingeniería de software en conversaciones con clientes, presentaciones comerciales o anexos contractuales. El equipo comercial y legal debe utilizar las siguientes equivalencias oficiales:

| Término Técnico Interno (Prohibido en Ventas/Legal) | Término Comercial y Legal Autorizado | Explicación para el Cliente / Abogado / Contador |
|---|---|---|
| *Edge / Cloudflare Workers / Sharding* | **Infraestructura Global Redundante** | El sistema procesa la información en nodos distribuidos para garantizar máxima velocidad sin servidores centralizados lentos. |
| *Offline-First / IndexedDB* | **Modo de Venta Continua Local** | La caja registradora graba y opera en el dispositivo del cliente de forma segura aunque no haya conexión a internet. |
| *Motor ACID / D1 / Batch* | **Registro Contable Inalterable** | Cada transacción financiera, de caja e inventario se graba de forma exacta, atómica e indivisible. |
| *Metered Billing / Overdraft* | **Facturación de Comprobantes Adicionales** | Consumo de comprobantes por encima del plan sin bloquear el servicio, cobrado a mes vencido a tarifa transparente. |
| *PII Anonimization / LPDP* | **Protección y Anonimización de Datos** | Disociación de datos personales que preserva el registro contable obligatorio exigido por ley. |

---

### 2. Modelo Comercial, Estructura de Precios y Políticas de Cobro

#### 2.1 Estructura de Planes de Suscripción en `kipuspay.com`

| Plan | Precio Mensual | Precio Anual (2 meses gratis) | Alcance Comercial e Inclusiones | Límite y Regla de Cobro (La caja NUNCA se apaga) |
|---|---|---|---|---|
| **Arranque** | S/ 49 | S/ 490 | 1 sucursal, **1 caja**, ventas/cobros, Notas de Venta, Boletas y Facturas electrónicos, impresión 58/80mm, modo vitrina, arqueo diario, **alta rápida de catálogo con escáner de cámara**, **venta rápida genérica** y soporte por chat. | Incluye **1,000 comprobantes/mes**. Excedente a **S/ 0.05 por comprobante adicional** facturado fuera del flujo de cobro. |
| **Crece** | S/ 129 | S/ 1,290 | Hasta 3 sucursales, **cajas ilimitadas**, **Modo Dueño móvil**, **alertas push operacionales**, **caja móvil PWA Android**, reportes avanzados, arqueo Z ciego, PIN de descuentos, **handoff de turno con PIN temporal**, lotes (FEFO), recetas/BOM, promociones, variantes, apartados, series, balanza por peso y comisiones. | Comprobantes incluidos sin sobregiro en uso regular. Holgura de procesamiento para negocios en expansión. |
| **Cadena** | S/ 349 + S/ 39 por sucursal extra | Proporcional con 2 meses gratis | Sucursales ilimitadas, **comandas/KDS (restaurantes)**, transferencias, recepción 3-way, importadores masivos, Yape/Plin local, exportación contable, API/Webhooks, puntos, devoluciones con NC, diario contable, cotizaciones, dev. a proveedor, vales, cuotas, racks, **pedidos con retiro por WhatsApp**, **membresías y ventas recurrentes**, **analítica predictiva (con disclaimer)**, cumplimiento LPDP y Disaster Recovery. | Diseñado para cadenas de 4+ locales que requieren control consolidado e integración contable. |
| **Enterprise** | Cotización personalizada | — | Cadenas de 30+ locales o franquicias. Incluye **SLA contractual prioritario (1h SEV-1)**, **Asistente Gerente de Operaciones / Chatbot de Insights diario**, account manager dedicado, onboarding asistido e integraciones personalizadas. | Contrato a medida con garantías operativas y jurídicas personalizadas. |

#### 2.2 Reglas de Medición de Comprobantes (Metering)
1. **Definición de Comprobante:** Se contabiliza como comprobante emitido a toda Boleta de Venta Electrónica, Factura Electrónica, Nota de Crédito Electrónica, Nota de Débito Electrónica y Nota de Venta emitida desde la caja.
2. **Consumo de Cupo:** El cupo se consume al emitir. Una Nota de Crédito emitida para corregir o anular una venta **consume 1 comprobante de cupo** y **no reembolsa** el comprobante consumido por la venta original.
3. **Facturación de Excedentes:** En el plan Arranque, los comprobantes adicionales a los 1,000 incluidos se facturan a **S/ 0.05 por unidad** al final del período de facturación. **Bajo ninguna circunstancia la caja registradora detiene su operación por haber superado el cupo del plan.**

#### 2.3 Política Anti-Apagado y Período de Gracia Comercial
1. **Fallo de Cobro o Tarjeta Rebotada:** El punto de venta y la emisión fiscal oficiales permanecen 100% activos.
2. **Aviso Amigable (Días 1 a 3):** Banner amigable en la caja y en Modo Dueño para regularizar la tarjeta.
3. **Pausa Selectiva (Día 4 en adelante):** Se pausan únicamente herramientas de gestión avanzada (Modo Dueño móvil, reportes de inteligencia y accesos API). **La caja registradora en tienda y la emisión oficial continúan operando para que el negocio no deje de cobrar.**

#### 2.4 Prueba Gratuita de 30 Días
KipusPay ofrece **30 días de prueba real en caja de verdad, sin ingresar tarjeta de crédito**. Si finalizado el período el cliente decide no contratar, no se genera cobro ni penalidad alguna, pudiendo el cliente exportar la totalidad de su información comercial.

---

### 3. Marco Tributario y Formalización Fiscal (SUNAT Perú)

#### 3.1 Proveedor de Servicios Electrónicos (PSE)
KipusPay opera como Proveedor de Servicios Electrónicos (PSE) por defecto, asumiendo la responsabilidad del transporte informático y firma de comprobantes, o permite que el cliente integre su propio **Certificado Digital (`.pfx`)**.

#### 3.2 Etapas de Formalización Tributaria del Comercio
- **Control Interno:** Emisión exclusiva de **Notas de Venta** para control mercantil interno.
- **Formalizando:** Facturación electrónica activa vía PSE KipusPay mientras se tramita el alta.
- **Emisor Electrónico:** Emisión oficial de Boletas y Facturas ante SUNAT (`B001`, `F001`).

#### 3.3 Regla Obligatoria sobre Notas de Venta (Cero Engaño Fiscal)
1. **Naturaleza del Documento:** La Nota de Venta es un comprobante de control interno mercantil e inventarios. **No posee validez tributaria ante SUNAT ni genera crédito fiscal.**
2. **Prohibición Comercial:** Queda estrictamente prohibido a los ejecutivos de venta comercializar la Nota de Venta como "boleta informal", "factura sin impuestos" o "contingencia fiscal".
3. **Impresión Legítima:** Toda Nota de Venta impresa por KipusPay lleva impresa de forma visible la leyenda: *"NOTA DE VENTA — Documento de control interno no válido para fines tributarios"*.

#### 3.4 Normativa en Punto de Venta
- **Boletas de Venta ≥ S/ 700.00:** Exigen consignar obligatoriamente tipo/número de documento (DNI/CE/Pasaporte) y nombre del comprador.
- **Facturas Electrónicas:** Exigen RUC activo y habido en la base de datos de SUNAT.

---

### 4. Garantías Operativas, Offline-First e Integridad Financiera

#### 4.1 Continuidad Sin Conexión
KipusPay garantiza contractualmente que la caja registradora **sigue vendiendo, cobrando e imprimiendo tickets de forma ininterrumpida** ante cortes de luz o de señal de internet. Las ventas se guardan localmente de forma segura y se sincronizan automáticamente al reestablecerse la conexión.

#### 4.2 Integridad Financiera ("Cada Sol Cuadra")
- **Arqueo por Fórmula:**  
  $$\text{Efectivo Esperado} = \text{Fondo de Apertura} + \text{Efectivo Cobrado} + \text{Ingresos de Caja} - \text{Egresos} - \text{Retiros}$$
- **Valorización PMP:** Inventario descontado en el momento exacto de la venta y valorizado por el método de Costo Promedio Ponderado.
- **Cobros Digitales Offline:** En pagos con Yape/Plin sin internet, se activa la **Verificación Visual Manual** en pantalla ámbar para comprobar la captura del cliente en su celular antes de entregar el producto.

---

### 5. Protección de Datos Personales (LPDP - Ley N.º 29733)

#### 5.1 Cumplimiento Legal
Cumplimiento estricto de la Ley N.º 29733 y D.S. N.º 003-2013-JUS. Garantía plena del ejercicio de derechos ARCO a través del canal oficial: **`privacidad@kipuspay.com`**.

#### 5.2 Retención Fiscal vs. Anonimización
Ante una solicitud de borrado de datos formulada por un comprador final, KipusPay anonimiza los datos personales identificables (`customers.pii_erased = TRUE` / `[ANONYMIZED]`), manteniendo la conservación del comprobante fiscal emitido durante el plazo legal de **5 años** exigido por SUNAT.

---

### 6. Matriz Completa de Funcionalidades del Producto Final Completo v1.0

El catálogo funcional de KipusPay comprende el 100% de las herramientas del producto final v1.0, distribuidas por plan. Las filas de comandas/KDS, arqueo Z ciego, emisión SUNAT en vivo, WhatsApp/membresías, LPDP self-serve y Disaster Recovery permanecen **en preparación** (header de freeze / `PUBLIC_CLAIMS`); no se venden como live.

| Área Funcional | Descripción de la Funcionalidad | Plan Mínimo | Alcance Legal y Operativo |
|---|---|---|---|
| **Caja & Cobros** | POS Checkout Offline-First con soporte de efectivo, tarjeta y billeteras digitales | **Arranque** | Venta continua ininterrumpida sin conexión a internet. |
| **Emisión Fiscal** | Boleta, Factura, Nota de Crédito y Débito electrónica vía PSE o certificado propio | **Arranque** | Emisión oficial cumpliendo normativas de SUNAT. |
| **Control Interno** | Nota de Venta para control mercantil de caja e inventarios | **Arranque** | Documento mercantil de control interno. |
| **Hardware** | Impresión de tickets 58/80mm, soporte de balanzas por peso y Modo Vitrina | **Arranque** | Impresión por outbox local; diagnósticos de hardware integrados. |
| **Alta de Catálogo** | Escáner rápido de productos con cámara de celular y Venta Rápida genérica | **Arranque** | Alta de productos en <3s; la línea genérica cobra sin corromper stock. |
| **Gestión Móvil** | Modo Dueño móvil, Alertas Push operacionales y Caja Móvil PWA Android | **Crece** | Monitoreo consolidado en celular y venta móvil en tienda. |
| **Control de Caja** | Arqueo Z ciego, PIN de autorización de descuentos y handoff de turno con PIN temporal | **Crece** | Cierre ciego antipérdidas; cambio de turno en <5s sin cerrar sesión de caja. |
| **Inventario Retail** | Lotes & FEFO, Recetas/BOM, Variantes & UOM, Series y Ubicaciones/Racks | **Crece** | Control de vencimientos, explosión de insumos y trazabilidad de series. |
| **Ventas Avanzadas** | Promociones y tramos, Apartados/anticipos, Comisiones de vendedor y Venta por peso | **Crece** | Reglas de precio en servidor, reserva sin CPE e incentivos a vendedores. |
| **Restaurantes** | Comandas de cocina (KDS) y división de cuentas (Split Bill) | **Cadena** | Sincronización instantánea salón-cocina y cobros fraccionados. |
| **Multi-Local** | Transferencias entre sucursales, Recepción 3-Way de compras y Control de mermas | **Cadena** | Cuadre exacto entre Órdenes de Compra, recepción física y factura de proveedor. |
| **Integraciones** | Importadores masivos (Bsale/Alegra/CSV), Exportación Contable y API/Webhooks | **Cadena** | Migración en minutos y exportación bit a bit para sistemas contables (Contasis/Concar). |
| **Fidelización** | Puntos de cliente, Recibos por WhatsApp, Crédito de Tienda / Gift Cards y Cuotas | **Cadena** | Acumulación de puntos, envío de tickets por chat, vales y cronogramas CxC. |
| **Servicios** | Pedidos con retiro por WhatsApp y Membresías / Ventas recurrentes | **Cadena** | Reserva de pedidos con fulfillment y generación periódica con período de gracia. |
| **Analítica & DR** | Analítica predictiva de ventas/quiebres (con disclaimer) y Disaster Recovery (DR) | **Cadena** | Estimación estadística de reposición y continuidad de negocio RPO=0. |
| **Inteligencia AI** | SLA Prioritario (1h SEV-1) y Asistente Gerente de Operaciones / Chatbot Insights | **Enterprise** | Resumen diario matutino automático y consultas de inteligencia sobre datos del negocio (en preparación hasta Quality Gate). |

---

### 7. Control Interno, Roles y Prevención de Fraudes

- **Permisos por Rol:** Cajero (cobro y su arqueo), Supervisor (descuentos con PIN, sello **COPIA**, handoff de turno con PIN), Admin (catálogos, precios, promociones, mermas) y Owner (acceso total consolidado, finanzas y chatbot de insights).
- **Auditoría Inalterable:** Todo cambio de precio, descuento, anulación, reimpresión o transferencia de turno registra un evento inalterable (`audit_events`).

---

## PARTE II: TÉRMINOS Y CONDICIONES OFICIALES DE USO DEL SERVICIO (PERÚ)

### 1. Objeto y Aceptación
El presente contrato regula los términos y condiciones de uso del servicio SaaS denominado **KipusPay**, accesible desde `https://kipuspay.com`. Al registrarse o utilizar El Servicio, El Cliente acepta íntegramente estas condiciones bajo el amparo de la **Ley N.º 29571 (Código de Protección y Defensa del Consumidor)**, el Código Civil Peruano, la normativa tributaria de SUNAT y la Ley N.º 27269.

### 2. Licencia SaaS y Tarifas
KipusPay concede una licencia de uso no exclusiva, revocable e intransferible. Las tarifas en soles (S/) incluyen los tributos de ley. Las condiciones de cobro adicional (S/ 0.05 por comprobante extra en plan Arranque) y la regla anti-apagado se rigen según la Parte I, Sección 2.3.

### 3. Libro de Reclamaciones Virtual
De conformidad con la Ley N.º 29571 y D.S. N.º 011-2011-PCM, KipusPay mantiene a disposición su **Libro de Reclamaciones Virtual** accesible en `https://kipuspay.com/reclamaciones`. El formulario emite un número de caso (`REC-AAAAMMDD-XXXX`) como acuse de recepción.

### 4. Jurisdicción y Ley Aplicable
Este contrato se rige por las leyes de la República del Perú. Cualquier controversia será resuelta ante los **Jueces y Tribunales del Distrito Judicial de Lima Centro, Perú**.

---

## PARTE III: POLÍTICA OFICIAL DE PRIVACIDAD Y PROTECCIÓN DE DATOS PERSONALES (LPDP PERÚ)

### 1. Bancos de Datos Personales
KipusPay trata los datos personales de acuerdo a la **Ley N.º 29733** y **D.S. N.º 003-2013-JUS** en sus bancos de datos registrados ante la Autoridad Nacional de Protección de Datos Personales (ANPDP): Clientes, Usuarios de Sistema y Compradores Finales.

### 2. Ejercicio de Derechos ARCO
Los titulares pueden ejercitar sus derechos de Acceso, Rectificación, Cancelación u Oposición enviando una solicitud a nuestro Oficial de Protección de Datos (DPO) al correo: **`privacidad@kipuspay.com`**.

### 3. Procedimiento de Anonimización
Ante solicitudes de cancelación de datos de compradores finales, KipusPay suprime los datos identificables (`[ANONYMIZED]`), manteniendo la conservación del comprobante fiscal durante el período legal obligatorio de **5 años** exigido por SUNAT.

---

## PARTE IV: ACUERDO DE NIVEL DE SERVICIO, DISPONIBILIDAD Y SOPORTE (SLA)

### 1. Compromiso de Disponibilidad
- **Punto de Venta Local:** Disponibilidad del 100% para cobros e impresión sin conexión a internet.
- **Plataforma Nube (`kipuspay.com`):** Compromiso mensual del **99.9% de uptime**.

### 2. Tiempos de Respuesta
- **SEV-1 (Caja no cobra):** 1 hora calendario en Enterprise (Atención 24/7) / 4 horas hábiles en Estándar.
- **SEV-2 (Degradación fiscal):** 4 horas hábiles en Enterprise / 1 día hábil en Estándar.
- **SEV-3 (Consultas/Configuración):** 1 día hábil en Enterprise / 2 días hábiles en Estándar.
- **Canal de Atención:** `soporte@kipuspay.com`.

---

## PARTE V: POLÍTICA DE CANCELACIÓN, REEMBOLSOS Y GARANTÍA DE 30 DÍAS

### 1. Prueba Gratuita de 30 Días
Prueba completa por 30 días con datos reales sin requerir tarjeta de crédito.

### 2. Cancelación y Reembolsos
- **Planes Mensuales (Arranque, Crece, Cadena):** Cancelación libre en cualquier momento desde el panel Admin sin penalidad. El cambio a Enterprise no es self-serve: se contrata con el equipo comercial. La facturación de tarjeta se gestiona por el portal de cobro.
- **Planes Anuales (2 Meses Gratis):** Reembolso proporcional restando los meses consumidos a tarifa mensual regular dentro de los 15 días hábiles a través de `facturacion@kipuspay.com`.

---

## PARTE VI: PLAYBOOK DE PREGUNTAS FRECUENTES COMERCIAL, LEGAL Y OPERATIVO

### Q1: ¿Qué pasa si el internet falla por 3 días seguidos?
La caja está diseñada para seguir vendiendo, cobrando e imprimiendo tickets; al volver la señal, todo se sincroniza con `kipuspay.com` y SUNAT. El modo offline en producción permanece **en preparación** hasta su Quality Gate (no se vende como live).

### Q2: ¿Es legal emitir Notas de Venta antes de estar en SUNAT?
Sí, es un documento mercantil legítimo de control interno. Lleva la leyenda obligatoria de no validez tributaria.

### Q3: ¿Por qué una Nota de Crédito consume 1 comprobante del plan?
Porque requiere la misma firma digital y procesamiento fiscal ante SUNAT que una factura.

### Q4: ¿Qué pasa con mis datos si decido cancelar mi cuenta?
Tus datos son tuyos. Puedes exportar todo tu catálogo y ventas en CSV antes o al momento de cancelar.

### Q5: ¿Cómo funciona el escáner rápido con cámara de celular?
Apuntas la cámara al código de barras en el panel de Admin y en <3s registras nombre, precio y stock.

### Q6: ¿Cómo funciona el handoff rápido de turno entre cajeros?
El cajero saliente presiona "Transferir Turno", el entrante ingresa su PIN temporal y en <5s la sesión continúa atribuida al nuevo operador sin cerrar caja.

### Q7: ¿Cómo funciona el Asistente de Insights diario en Enterprise?
Capability **en preparación** hasta Quality Gate. El diseño: a las 3:30 AM genera 3 viñetas resumen (ventas, quiebre y excepciones de caja) y permite consultas en chat en lenguaje natural sobre los datos del negocio.

### Q8: ¿Cómo funcionan los pedidos con retiro por WhatsApp?
El cliente reserva sin pago previo y el sistema le envía un aviso por WhatsApp informando que su pedido está listo para recoger y pagar en tienda.

### Q9: ¿Cómo funcionan las membresías y ventas recurrentes?
Se establece el ciclo y el sistema liquida periódicamente la venta, emitiendo el comprobante y la cuenta por cobrar correspondiente.

### Q10: ¿Por qué KipusPay no apaga la caja si me atraso en el pago?
Porque la caja de tu negocio nunca debe detenerse. Tienes 3 días de gracia y luego se pausan reportes avanzados, pero la caja registradora sigue cobrando.

### Q11: ¿Puedo vender por peso si no tengo balanza digital conectada?
Sí. KipusPay permite conectar balanzas digitales para lectura automática, pero también permite el ingreso manual del peso autorizando al cajero en pantalla.

### Q12: ¿Qué es el control 3-way matching de compras y para qué le sirve a una cadena?
Compara automáticamente la Orden de Compra enviada al proveedor, la Recepción de mercadería en el almacén y la Factura entregada por el proveedor para evitar pagar facturas con sobreprecio.

### Q13: ¿Puedo dar crédito a mis clientes sin perder el control de la caja?
Sí. Desde el plan Crece asignas límites de crédito por cliente y al vender a crédito registras la cuenta por cobrar (CxC), permitiendo cobrar cuotas o abonos futuros.

### Q14: ¿Cómo se manejan las devoluciones de clientes si la compra fue a crédito?
Al procesar la devolución y emitir la Nota de Crédito, el sistema reduce de forma inmediata y automática el saldo pendiente de la cuenta por cobrar (CxC) del cliente.

### Q15: ¿Qué pasa con las facturas si un cliente solicita el borrado de sus datos personales?
KipusPay borra el nombre, correo, teléfono y dirección del cliente de la base de datos de marketing, y reemplaza su nombre por `[ANONYMIZED]` en el registro histórico, conservando la validez fiscal de la factura ante SUNAT durante los 5 años exigidos por ley.

---
