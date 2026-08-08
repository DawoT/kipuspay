---
doc_id: gtm
alias: GTM
authority: derivada
owner: "@DawoT"
---

# KipusPay — Estrategia Go-To-Market y Landing Page Comercial
## Documento Consolidado de Producto, Pricing y Ventas

> KipusPay es el sistema de punto de venta y facturación electrónica que se vende solo, porque en cinco minutos ya está cobrando la primera venta — no en cinco semanas de implementación.

> **Estado de publicación:** la gobernanza de especificación está `GOV-APROBADO` (milestone Sprint 0, entrada 0176 del Ledger), pero mientras el Roadmap mantenga `Entrega = Planificado`, este documento es especificación comercial, no autorización para publicar claims. Staff Growth solo publica un claim cuando el Quality Gate, la evidencia de implementación y la aprobación RACI correspondiente están cerrados.

---

## 1. Propuesta de Valor — Una Sola Frase

**"El único POS que no se cae contigo."**

Frase de respaldo (para contextos donde se necesite más de 6 palabras): *"Vende, cobra y emite boletas aunque se corte la luz, el internet, o sea tu día de más gente en la tienda."*

Esta propuesta de valor está diseñada para funcionar igual de bien en la boca de un vendedor telefónico, en un titular de landing page, y en un anuncio de Facebook de 15 segundos — porque no depende de que el cliente entienda tecnología. Depende de que reconozca un dolor que ya vivió: el sistema lento en hora punta, la venta que se perdió porque "se cayó el internet", el descuadre de caja que nadie puede explicar a fin de mes.

### 1.1 Los Tres Dolores que KipusPay Vende (no las tres features que KipusPay tiene)

Todo el frontend, todo el copy y todo el pricing de KipusPay se organiza alrededor de tres dolores universales de cualquier negocio con caja registradora — desde una farmacia de barrio hasta una cadena de 40 locales:

| Dolor del dueño de negocio | Lo que siente | Lo que KipusPay resuelve | Frase de venta |
|---|---|---|---|
| **"Se me llenó la cola y el sistema no aguantó"** | Vergüenza frente al cliente, ventas perdidas por gente que se va | Responde igual de rápido en la venta 1 que en la venta 10,000 | *"Despide a las colas. Atiende al triple sin que se ponga lento."* |
| **"Se cortó el internet y tuve que cerrar la caja"** | Impotencia, pérdida de ingresos en horas pico que no vuelven | Sigue vendiendo, cobrando e imprimiendo sin conexión; sincroniza solo al volver la señal | *"El internet caído dejó de ser excusa para cerrar la caja."* |
| **"No sé por qué la caja no cuadra"** | Sospecha sobre el personal, horas perdidas cuadrando planillas a mano | Cada sol y cada unidad de stock queda registrado exacto, sin huecos ni ventas "fantasma" | *"Cada sol cuadra. Siempre."* |

Nótese lo que NO aparece en esta tabla: sharding, Edge, latencia, arquitectura, transacciones ACID, D1, Workers. Ese vocabulario vive exclusivamente en el documento técnico interno. En todo material de cara al cliente, la regla es simple: **si el dueño de la ferretería no lo diría en una conversación con su contador, no va en la landing.**

---

## 2. A Quién le Vendemos — Segmentación por Vertical

KipusPay se posiciona como agnóstico de vertical, pero se **vende** vertical por vertical, porque cada tipo de negocio tiene un dolor dominante distinto que debe liderar su propia página de aterrizaje. En producto eso significa **un solo core + capabilities** (Arquitectura §1.1 / ADR-ARCH-002): las landings empaquetan comercialmente bundles de capabilities, no forks del código.

**Regla comercial (Roadmap FASE 6):** el *feature destacado en demo* y el copy de landing vertical solo se usan en campaña o pitch **después** del Quality Gate del sprint indicado. Hasta entonces: vender el dolor + lo ya shipped (caja offline, formalización, Modo Dueño básico, CPE/PSE); no prometer KDS/split, FEFO, arqueo Z ciego ni merma entre locales como listos. Las capabilities de FASE 6B/6D (promociones, variantes/unidades, apartados, ubicaciones/racks, series, balanza, etiquetas, control 3-way, diario contable) y DR/BCP entran como **material secundario** de demo solo tras su Quality Gate (§4.1); nunca como feature destacado antes del gate.

| Vertical | Dolor dominante | Gancho de landing específico | Feature destacado en demo | Listo tras |
|---|---|---|---|---|
| **Restaurantes / Food service** | Comandas perdidas, cuentas divididas mal cobradas, cocina desincronizada del salón | *"Tu cocina y tu caja, siempre en el mismo minuto."* | Comandas → KDS + split bill → sales | **Sprint 19** (QG cerrado) |
| **Farmacias** | Vencimientos no controlados, quiebre de stock de medicamentos de alta rotación, normativa SUNAT estricta | *"Nunca más un cliente se va sin su medicina por falta de stock."* | FEFO/lotes + alertas de vencimiento/quiebre | **Sprint 18** |
| **Retail / Ferreterías / Minimarkets** | Robo hormiga, descuadres de caja, control de múltiples locales | *"Sabe exactamente qué pasó en cada una de tus tiendas, hoy, ahora."* | Arqueo Z ciego + authz descuentos + audit trail | **Sprint 17** |
| **Servicios (spas, talleres, consultorios)** | Citas y cobros desconectados, no hay "producto físico" que descontar | *"Cobra sin inventario, sin fricción, sin complicarte."* | Bypass de inventario + facturación/NV rápida | Núcleo (Fases 1–5) |
| **Cadenas / Multi-local (4+ sucursales, ≥30 → Enterprise)** | Visibilidad consolidada, control de merma entre locales, reportería | *"Un solo panel para saber cómo le va a cada una de tus tiendas — actualizado cuando sincroniza."* | Transferencias + merma documentada; Modo Dueño ranking | Ranking Dueño: **Crece+ tras su gate**; **merma/xfer: Sprint 20** (QG cerrado, claim live) |

Cada vertical necesita su propia landing (misma plantilla de diseño, copy y casos de éxito distintos) — no una landing genérica con un selector de industria que diluye el mensaje. Detalle técnico: Arquitectura §5.3.

---

## 3. Arquitectura de Navegación — Del Sitio Principal a Cada Vertical, y de la Venta al Producto

Una landing premium con verticalización (sección 2) solo funciona si la navegación entre el sitio principal, las landings de vertical y el producto activado sigue una lógica clara — de lo contrario, el visitante se pierde exactamente en el momento en que estaba más cerca de decidir. Esta sección define esa arquitectura en dos capas: la del **sitio de marketing** (pre-venta) y la del **producto ya activo** (post-onboarding).

### 3.1 Mapa del Sitio — Capa de Marketing (Pre-Venta)

```text
kipuspay.pe (Home / Landing Principal)
│
├── /para/restaurantes          → Landing vertical: Restaurantes
├── /para/farmacias             → Landing vertical: Farmacias
├── /para/retail                → Landing vertical: Retail y Minimarkets
├── /para/servicios             → Landing vertical: Spas, talleres, consultorios
├── /para/cadenas                → Landing vertical: Multi-local / Franquicias
│
├── /precios                    → Página de pricing standalone (los 4 planes, sección 4)
├── /seguridad                  → Página ampliada de confianza y cumplimiento (sección 5.7.1)
├── /casos-de-exito              → Índice de testimonios, filtrable por vertical
├── /comparar/[competidor]      → Páginas de comparación directa (SEO + conversión)
│     ├── /comparar/bsale
│     ├── /comparar/alegra
│     └── /comparar/siigo
│
├── /blog                       → Contenido de los growth loops (sección 7.3)
├── /ayuda                      → Centro de soporte y FAQ extendido
│
└── /empezar                    → Flujo de registro (RUC → Rubro → Primera venta)
      └── (al completarse) → redirige al producto activo, nunca a una pantalla de marketing
```

**Reglas de navegación de esta capa:**

1. **El Home nunca es el destino final de un anuncio pagado.** Todo tráfico de campaña (Facebook, Google Ads) dirigido a un vertical específico aterriza directo en `/para/[vertical]`, no en el Home genérico — el Home existe para tráfico de marca y exploración libre, donde sí tiene sentido dejar que el visitante se autoidentifique.
2. **El Home resuelve la autoidentificación de vertical en el primer scroll**, justo después del hero (sección 5.1): un selector visual de tarjetas ("¿Cuál es tu negocio?") que enruta a la landing vertical correspondiente — el mismo patrón de tarjetas con ícono que luego reaparece en el onboarding del producto (sección 5.2), para que la experiencia se sienta continua entre "estoy averiguando" y "ya me registré".
3. **`/precios` y `/seguridad` son accesibles desde cualquier landing vertical** vía el header persistente — son las dos páginas que un visitante consulta cuando ya está convencido del problema y evaluando el riesgo de decidir, sin importar por qué landing entró.
4. **`/comparar/[competidor]` es tráfico de intención alta** (alguien buscando activamente "alternativa a Bsale") y por eso su CTA es más directo y su copy omite la narrativa emocional de la landing principal — va derecho a la tabla comparativa (sección 5.7) y al CTA de prueba gratuita.
5. **`/empezar` es el único punto de entrada al producto.** Ninguna otra ruta del sitio de marketing permite saltarse el flujo de RUC → Rubro → Primera venta — mantener un solo punto de entrada evita que existan "onboardings alternativos" no probados que degraden el Time-to-First-Sale (métrica clave, sección 9).

### 3.2 Header y Footer — Consistencia entre Landings de Vertical

Para que las cinco landings de vertical (sección 2) no se sientan como cinco sitios distintos, el header y el footer permanecen idénticos en estructura y posición en todas — solo cambia el contenido del cuerpo:

**Header persistente (todas las páginas del sitio de marketing):**
`Logo KipusPay` — `Para tu negocio ▾` (dropdown a los 5 verticales) — `Precios` — `Seguridad` — `Casos de éxito` — `Ingresar` (link a login del producto) — `[Empieza gratis]` (botón CTA, siempre visible, siempre el mismo estilo)

**Footer persistente:**
Cuatro columnas — `Producto` (verticales, precios, seguridad) / `Comparativas` (vs. competidores) / `Recursos` (blog, ayuda, casos de éxito) / `Legal` (términos, privacidad, SUNAT compliance) — más los sellos de confianza de la sección 5.7.1 repetidos aquí, porque el footer es lo último que ve alguien indeciso antes de cerrar la pestaña.

### 3.3 Navegación del Producto Activo (Post-Onboarding) — Arquitectura de Información por Rol

Una vez el negocio está activado, la navegación deja de ser la de un sitio de marketing y se convierte en la de una app — pero mantiene la misma filosofía de "cada rol ve solo lo que necesita" que ya se estableció en la densidad adaptativa del sistema de diseño (sección 6.1). La navegación no es una sola IA (arquitectura de información): son tres, una por rol, coexistiendo en el mismo producto.

**Navegación del Cajero (pantalla de cobro — alta frecuencia, cero fricción):**

```text
┌─────────────────────────────────────────────┐
│ [Sesión de caja: Abierta]      [Cajero: Ana] │  ← barra superior fija, siempre visible
├─────────────────────────────────────────────┤
│                                               │
│   COBRO (pantalla por defecto, 90% del uso)  │  ← no hay "home" separado: cobrar ES el home
│                                               │
├─────────────────────────────────────────────┤
│ [Cobrar] [Historial del día] [Caja] [Ayuda]  │  ← navegación inferior, máximo 4 opciones
└─────────────────────────────────────────────┘
```

Solo 4 destinos posibles desde la pantalla de cobro — cualquier función que no sea "cobrar, ver lo cobrado hoy, gestionar la caja, o pedir ayuda" no pertenece a la navegación del cajero, aunque exista en el sistema para otro rol.

**Navegación del Administrador de tienda (gestión de un local):**

```text
Inicio (resumen del día) │ Ventas │ Inventario │ Clientes │ Caja │ Reportes │ Configuración
```

Navegación lateral persistente tipo dashboard, con "Inicio" mostrando el mismo resumen accionable que Modo Dueño (sección 6.3) pero con alcance de un solo local.

#### 3.3.1 Configuración del negocio (Admin — fuente de verdad post-onboarding)

El onboarding (`/empezar`) solo siembra lo mínimo para cobrar. **Toda la configuración profunda vive en Admin → Configuración** (roles `owner` / `admin`). El cajero no ve este menú.

Subsecciones del panel Configuración:

| Sección | Qué se configura |
|---|---|
| **Datos del negocio** | RUC (opcional en control interno), razón social, nombre comercial, dirección, ubigeo, logo |
| **Régimen tributario** | NRUS / RER / RMT / RG / Aún no definido — bloquea Factura (`01`) en NRUS |
| **Etapa de formalización** | Control interno → Formalizando facturación → Emisor electrónico (cambio con confirmación) |
| **Comprobantes habilitados** | Nota de venta (`NV`), Boleta, Factura, NC, ND — según régimen × etapa |
| **Series por sucursal** | `NV01`, `B001`, `F001`, `FC01`… (la caja elige serie de su local) |
| **Certificado / PSE** | Modo PSE KipusPay (default) o certificado `.pfx` propio del tenant; estado de envíos |
| **Facturación electrónica (estado)** | Facturas pendientes de envío, Resumen Diario del día, alertas de plazo (3d/7d), bajas |
| **Impuestos** | IGV, ICBPER, exonerados por rubro |
| **Impresión / hardware** | Ancho de papel 58/80 mm, impresora; **troubleshooter visual** ("Probar impresora USB" / "Buscar impresoras en mi red" / "Probar balanza") sin exponer WebUSB/WSS/IP |
| **Usuarios y roles** | Alta/baja de cajeros y permisos; **invitación por email/link** + emisión de **PIN de caja** y **badge barcode**; **handoff de turno** sin cerrar caja solo tras el Quality Gate del Sprint 51 (PIN temporal, `SHIFT_TRANSFER` en auditoría) |

**Presets de rol (RBAC, Arquitectura §5.3):** KipusPay expone 4 roles con permisos pre-armados; los cambios de permiso, precio o configuración generan `audit_events` (control §5.3 regla 12).

| Rol | Caja | Descuentos | Cierre Z / arqueo | Conteo físico | Reportes | Config / plan | Reimpresión |
|---|---|---|---|---|---|---|---|---|
| **Cajero** | Sí | Solo dentro del umbral sin authz | No | No | Arqueo propio del día | No | Solo si autoriza supervisor + sello "COPIA" |
| **Supervisor** | Sí | Hasta umbral con PIN | No | Ciega (conteo) | Arqueo por cajero | No | Sí, con sello "COPIA" |
| **Admin** | Sí | Sin límite (audit) | Sí | Aprueba diferencias/mermas | Todos (según plan) | Sí | Sí |
| **Owner (Modo Dueño)** | No | Aprobación push | Sí | Aprueba | Todos (según plan) | Sí | Sí |

**Acciones comerciales (FASE 6C-6E) por rol:** la emisión de cotizaciones y pedidos con retiro es de Cajero/Supervisor (nunca altera precios); **canje de crédito de tienda/gift cards** y **comisiones** requieren Admin/Owner (monto lo impone el servidor); **cuotas** las arma Supervisor+ (respeta `credit_limit`); **devolución a proveedor** y **ventas recurrentes** son de Admin/Owner; **caja móvil** usa los mismos permisos que la caja fija (mismo RBAC, sin rol extra). **Acciones comerciales FASE 6B/6D por rol:** crear/editar **promociones** y **listas de precio**, gestionar **ubicaciones/racks** y **etiquetas de precio** es de Admin/Owner; el **apartado** lo arma Cajero/Supervisor (reserva + abonos; no emite CPE hasta convertir a venta, regla 17); el **número de serie** se asigna en recepción y la devolución lo revierte a disponible (regla 24); el **peso de balanza** sobre umbral exige PIN de supervisor (`WEIGHT_OVERRIDE`, regla 25). Todo genera `audit_events` (reglas 13–27).

Regla de control: el dueño nunca opera la caja (no mezcla roles); el cajero jamás ve el menú financiero (GTM §3.3); reimprimir deja rastro (`sale_reprints`) y el ticket reimpreso lleva **"COPIA"**.

**Etapas de formalización (copy de producto, sin jerga):**

| Etapa | Default en caja | Mensaje al dueño |
|---|---|---|
| Control interno | **Nota de venta** | *"Llevas tu control de ventas. Cuando actives facturación electrónica, KipusPay te guía."* |
| Formalizando | Boleta/Factura vía **activación PSE** | *"Ya emites comprobantes electrónicos con KipusPay. Completa tu alta si quieres usar tu propio certificado."* |
| Emisor electrónico | Boleta/Factura a SUNAT | *"Tus comprobantes se envían solos (facturas al instante; boletas en el resumen diario)."* |

Banner persistente en Admin/Caja mientras esté en control interno: *"Tu negocio aún no emite comprobantes electrónicos. Activa facturación cuando estés listo."*
Banner ámbar si hay envíos/RC cerca del plazo: *"Hay comprobantes por declarar a SUNAT. KipusPay lo reintenta solo; revisa el estado en Configuración."*

**Navegación del Dueño / Modo Dueño (móvil, multi-local):**

```text
Hoy (default) │ Locales │ Alertas │ Finanzas │ Yo
```

Cinco destinos en tab bar inferior, patrón de app de consumo (igual a apps bancarias) — "Hoy" es el resumen accionable, "Locales" muestra el ranking comparativo solo cuando el plan y el gate de GTM-03 lo habilitan, "Finanzas" agrupa CxC/CxP/caja de forma consolidada, "Yo" es cuenta, plan de suscripción y **atajo "Activar facturación electrónica"** (la config profunda permanece en Admin escritorio). **Lectura offline (edge D):** "Hoy" y "Locales" se ven sin conexión desde el último rollup cacheado (IndexedDB, solo lectura) con banner "Datos de hace X horas" — el Dueño nunca pierde visibilidad, pero la data stale nunca se presenta como en vivo.

**Principio transversal:** ningún rol ve nunca la navegación de otro rol. Un cajero jamás ve un menú con "Reportes financieros" aunque técnicamente tenga los permisos — la arquitectura de información se diseña por tarea real, no por matriz de permisos expuesta como menú.

---

## 4. Estructura de Precios — Planes y Justificación Comercial

El pricing de KipusPay se diseña alrededor de un principio de PLG (Product-Led Growth): **el plan de entrada debe ser tan barato y tan fácil de activar que la decisión de compra la tome el cajero o el dueño solo, sin necesitar aprobación de un comité ni una llamada de ventas.**

### 4.1 Planes Sugeridos

| Plan | Precio mensual | Precio anual (2 meses gratis) | Para quién | Límites (por feature; cobro nunca se apaga) |
|---|---|---|---|---|
| **Arranque** | S/ 49 (~US\$ 13) | S/ 490 (~US\$ 130) | Negocio de 1 local, 1-2 cajeros | 1 sucursal, **1 caja**, **1,000 comprobantes/mes incluidos** + **S/ 0.05** por adicional (nunca se corta el cobro), soporte por chat. Sin Modo Dueño móvil ni reportes avanzados. |
| **Crece** | S/ 129 (~US\$ 35) | S/ 1,290 (~US\$ 350) | Negocio de 1-3 locales en expansión | Hasta 3 sucursales, **cajas ilimitadas**, comprobantes **incluidos sin sobregiro en pitch** (holgura de plan), **Modo Dueño móvil**, reportes avanzados, **promociones (gate 30)**, **variantes/unidades (gate 31)**, **apartados (gate 32)**, **kits BOM y listas de precio (gate 18)**, **venta por peso/balanza, series y etiquetas (gates 38–42)**, soporte estándar |
| **Cadena** | S/ 349 (~US\$ 95) + S/ 39 por sucursal adicional | Igual con 2 meses gratis | Cadenas de 4+ locales | Sucursales ilimitadas, analítica predictiva (gate Sprint 46), **fidelización light / puntos** (QG Sprint 24; motor completo = roadmap), **API de integraciones** (QG Sprint 23), **insight del negocio + briefing diario** (gate Sprint 49), **control de compras 3-way (gate Sprints 28–32)**, **recepción parcial de OC (gate Sprint 20)**, **diario contable (gate Sprint 32)**, **multi-almacén/ubicaciones (gate Sprints 38–42)**, **DR/BCP (gate Sprint 48)**, account manager dedicado |
| **Enterprise** | Cotización personalizada | — | Cadenas de 30+ locales, franquicias, requerimientos de integración a medida | SLA contractual, **soporte prioritario**, onboarding asistido, integraciones a medida (ERP contable, e-commerce) — e-commerce = backlog v10 |

**Freeze comercial Cadena (FASE 7):** claim “API de integraciones” **descongelada** tras QG Sprint 23; claim **fidelización light** (puntos) **descongelada** tras QG Sprint 24 (`docs/ops/s24-whatsapp-loyalty-qg.md`). El “motor de fidelización” completo (tiers/campañas) sigue fuera de pitch hasta sprints posteriores. Hasta entonces: vender multi-sucursal, Modo Dueño, API y puntos light; no afirmar motor completo.

**Freeze “analítica predictiva” (Cadena, FASE 6F):** la claim “analítica predictiva” del plan Cadena **queda congelada** hasta el Quality Gate del **Sprint 46** (Roadmap FASE 6F). Hasta entonces no afirmar pronósticos de ventas ni detección de quiebre en pitch/landing; vender reporting exacto (rollups D1) y Modo Dueño. Tras el gate, la claim se descongela con disclaimer (“estimación, no garantía”).

**Freeze “Gerente de Operaciones” (Cadena/Enterprise, FASE 6F):** la claim “El único POS que viene con un Gerente de Operaciones incluido” (inteligencia del negocio: agente de insights + Morning Briefing diario) **queda congelada** hasta el Quality Gate del **Sprint 49** (Roadmap FASE 6F). Hasta entonces no prometer chatbot de insights ni resumen automático diario en pitch/landing; vender analítica predictiva descongelada (Sprint 46), reporting exacto y Modo Dueño. Tras el gate, la claim se descongela (el briefing se entrega como data verificable sobre rollups D1, no como “IA que opina”).

**Copy post-gate y criterios de descongelado (Sprint 49):** cuando pase el gate, la narrativa de venta usa estos 3 proof points — y solo se venden si el gate los verificó:
1. **Exactitud, no opinión:** *"Cada mañana recibes 3 viñetas — ventas, quiebre, excepciones de caja — calculadas sobre los números exactos de tu negocio (rollups D1), no sobre estimaciones."* (Gate: 0 discrepancias NLG vs D1 en 500 casos; las respuestas se auditan en `insight_log`.)
2. **Privacidad por diseño:** *"La IA responde sobre agregados y seudónimos — nunca ve el email, teléfono ni documento de tus clientes."* (Gate: suite de prompts adversos de PII → 0 PII en respuestas; schema PII-free, regla 33/regla 32.)
3. **Siempre al día, incluso con sync offline:** *"Si una tablet estuvo sin señal y sincroniza tarde, el resumen se regenera con las ventas ya integradas — nunca te muestra cifras viejas como si fueran de hoy."* (Gate: re-materialización de rollup + invalidación de briefing KV en Sprint 6/49.)

Estos proof points **no se publican en la landing antes del gate** (regla comercial FASE 6); quedan especiados aquí para que el descongelado sea ejecución, no rediseño.

**Gates de claims retail/servicios (FASE 6C-6E):** cotizaciones/presupuestos (**GTM-19**, gate Sprint 33), devolución a proveedor (**GTM-20**, gate Sprint 34), crédito de tienda/gift cards (**GTM-21**, gate Sprint 35), pago en partes/cuotas (**GTM-22**, gate Sprint 36), comisiones, pedidos con retiro, ventas recurrentes/membresías y caja móvil solo se venden tras el Quality Gate de sus sprints (Roadmap FASE 6C-6E); antes, responder como roadmap con fecha de gate. La promesa “exporta todo tu historial” (GTM §5.7.1) queda respaldada por el **Sprint 42** (backup/restore) y **47** (LPDP).

**Gates de claims retail/inventario (FASE 6B/6D y Sprints 18/20/48):** estas capabilities están especificadas en la arquitectura (Arquitectura §5.3 reglas 5/14–17/23–27/32; Roadmap FASE 6B/6D) pero **no se publican como claims** hasta su Quality Gate: kits BOM y listas de precio múltiples (**retail/food**, gate **Sprint 18** — **QG cerrado**, claim FEFO/farmacia live); recepción parcial de OC (**Cadena**, gate **Sprint 20** — **QG cerrado**, claim `merma_xfer` live); control de compras 3-way (**Cadena**, gates **Sprints 28–32**); promociones y tramos (**Crece**, gate **Sprint 30** — **QG cerrado**, GTM-15); catálogo multi-variante y unidades de medida (**Crece**, gate **Sprint 31**); apartados/anticipos (**Crece**, gate **Sprint 32**); diario contable (**Cadena**, gate **Sprint 32**); ubicaciones/racks (**Cadena**, gates **Sprints 38–42**); números de serie, venta por peso/balanza y etiquetas de precio (**Crece**, gates **Sprints 38–42**); DR/BCP (**Cadena**, gate **Sprint 48**). Antes del gate, responder como roadmap con fecha de gate; **no prometer** “control de compras”, “diario contable”, “multi-almacén”, “promociones” ni “apartados” como disponibles.

**Gates de flujo del cliente (FASE 6G):** los claims "sube tu catálogo con la cámara", "cambia de turno sin cerrar caja", "atribuye la venta al vendedor con su badge" y "asistente de impresora" solo se venden tras el Quality Gate de los **Sprints 50–53** (Roadmap FASE 6G); antes, vender el catálogo por importador CSV/Bsale/Alegra (Sprint 21) y el arqueo Z estándar. El **setup checklist** y el **Product Tour** son internos de retención, no claims de landing.

**Regla de producto no negociable (anti-canibalización del cobro):** **nunca apagamos la caja** por volumen ni por excedente. Arranque incluye 1,000 comprobantes/mes; el adicional se **factura** (S/ 0.05) en batch fuera del cobro (Arquitectura §4.1) — no hay paywall en hora punta ni HTTP 402 en emisión. El upgrade Arranque → Crece se dispara cuando el negocio **pide una capacidad nueva** (segunda caja, local, Modo Dueño) o cuando el sobregiro hace más barato subir de plan — nunca porque "se le acabaron" y dejó de vender.

**Regla de cupo (transparencia con el cajero, Arquitectura §4.1):** el cupo se consume **al emitir**, no al anular. Cada CPE emitido — incluidas **Notas de Crédito/Débito** (`07`/`08`) y `NV` — cuenta como 1 comprobante de los 1,000/mes. Una NC que corrige un error consume 1 doc de cupo y **no** reembolsa el de la venta original; la baja de boleta no suma ni resta. **El cupo cubre la generación/procesamiento del comprobante, sin importar el estado final de aceptación SUNAT** (`QUARANTINED`/`REJECTED`): un CPE que SUNAT nunca aceptó ya consumió su doc; la caja nunca se detiene por rechazo (el cobro commite y el envío reintenta en la cola de resumen). Precio activo tras GTM-04 / Sprint 27 (QG `docs/ops/s27-usage-overage-qg.md`).

### 4.1.1 Matriz de claims, gates y controles (GTM-01..22)

Esta matriz es la fuente de verdad para landing, anuncios, demos, FAQ y guion comercial. Un claim con estado **congelado** se puede mencionar únicamente como roadmap con su sprint y Quality Gate; no se presenta como una capacidad disponible.

| ID | Claim/control | Estado público | Gate o evidencia obligatoria |
|---|---|---|---|
| **GTM-01** | Analítica predictiva de Cadena | Congelado hasta Sprint 46 | Sprint 46 cerrado; disclaimer "estimación, no garantía"; no decisiones automáticas de stock/precio |
| **GTM-02** | Soporte prioritario Enterprise | **Descongelado** tras Sprint 13 | Contrato [`docs/ops/support_sla_enterprise.md`](docs/ops/support_sla_enterprise.md); Crece mantiene soporte estándar; RACI PM+Growth |
| **GTM-03** | Ranking comparativo de locales en Modo Dueño | Listo tras QG Sprint 9 (Data cert + `FEATURE_REPORTING_CATALOG`) | Capability/report gate verificado; rollups SoT; banner offline cuando corresponda |
| **GTM-04** | 1,000 comprobantes/mes en Arranque + S/ 0.05 por excedente | **Descongelado** tras Sprint 27 | Metering idempotente; facturación fuera del hot path; ningún `402` en cobro/emisión; QG `docs/ops/s27-usage-overage-qg.md` |
| **GTM-05** | Devolución con NC/NV_RETURN y compensación de CxC | **Descongelado** tras Sprint 28 | 0 saldo fantasma en ciclos total/parcial; copy explica que la NC no reembolsa el cupo original; QG `docs/ops/s28-sales-returns-qg.md` |
| **GTM-06** | Venta rápida sin catálogo / pagos manuales offline | Línea genérica: Sprint 50; captura manual: Sprint 22 (**QG cerrado**) | Línea genérica sin stock; captura electrónica offline con alerta ámbar, audit y conciliación posterior; nunca prometer pago electrónico offline confirmado |
| **GTM-07** | Nota de venta para control interno | Bloqueado hasta gate fiscal | Leyenda visible "no es comprobante autorizado por SUNAT"; no llamarla boleta/factura ni contingencia |
| **GTM-08** | Envío, plazo y rechazo SUNAT | Bloqueado hasta Sprints 5/5b/26 | T-24h/T-6h, DLQ `QUARANTINED`/`DEADLINE_EXCEEDED`; el cobro no se bloquea; no afirmar aceptación antes del CDR |
| **GTM-09** | Exportación, privacidad y conservación | Export/LPDP congelado hasta Sprints 42/47 | Export reproducible, consentimiento, anonimización y retención fiscal verificados; no prometer "cuando quieras" antes del gate |
| **GTM-10** | Forecasting y briefing | Forecast gate 46; briefing gate 49 | Disclaimer; hechos D1 trazables, PII-free, anti-alucinación e idempotencia comprobados |
| **GTM-11** | Modo Dueño offline | Listo tras QG Sprint 9 (banner S8 + ranking SoT S9) | Banner con antigüedad; nunca presentar el último rollup como tiempo real ni permitir mutaciones offline |
| **GTM-12** | Prueba social, badges y claims legales | Condicionado a evidencia | Permiso para testimonios; certificación/sello solo con respaldo vigente; Staff Fiscal/Security aprueban copy legal |
| **GTM-13** | Control de compras 3-way + recepción parcial de OC (Cadena) | **Descongelado** tras Sprint 29 (3-way) + Sprint 20 (recepción parcial) | Matching OC = recepción = factura; 0 CxP sin cerrar (flag 3-way); diferencia = 422 u override auditado; QG `docs/ops/s29-purchasing-three-way-qg.md` |
| **GTM-14** | Diario contable / chart of accounts (Cadena) | **Descongelado** tras QG Sprint 32 | Ledger solo lectura para UI; asiento de venta = débito efectivo/CxC + crédito venta/IGV; export bit-consistente con Sprint 23; 0 mutación desde cliente; QG `docs/ops/s32-layaway-journal-qg.md` |
| **GTM-15** | Promociones y tramos (Crece/retail) | **Descongelado** tras Sprint 30 | Precio final impuesto por el servidor (cliente solo envía ID de promo); anti-apilamiento en 100% de combos; promoción sobre lote respeta `batch_id` (FEFO); QG `docs/ops/s30-pricing-promotions-qg.md` |
| **GTM-16** | Catálogo multi-variante / unidades de medida + kits BOM + listas de precio (Crece) | **Descongelado** tras QG Sprint 31 (variantes/UM) + Sprint 18 (kits/listas) | 0 stock cruzado entre variantes; conversión UM racional a microunidades exactas; snapshots históricos; explosión BOM/FEFO atómica con rollback total; precio resuelto por lista |
| **GTM-17** | Inventario profundo retail: apartados, ubicaciones/racks, números de serie, venta por peso, etiquetas de precio | **Apartados descongelados** tras QG Sprint 32; resto congelado hasta Sprints 38–42 | Apartado sin CPE hasta conversión; suma de stock por ubicaciones invariante; seriales duplicados = 422; peso y monto recalculados por servidor (authz sobre umbral); etiquetas solo imprimen precios; QG apartados `docs/ops/s32-layaway-journal-qg.md` |
| **GTM-18** | Continuidad del negocio (DR/BCP, Cadena) | Congelado hasta Sprint 48 | RPO=0 en tx ACID comprometidas; RPO≤1d en rollups; RTO por shard; restauración probada y simulacro anual verificado |
| **GTM-19** | Cotizaciones / presupuestos (Servicios/Retail) | **Descongelado** tras QG Sprint 33 | Precio snapshot COM-05; 0 CPE y 0 reserva hasta convertir; expirada → 422 + recotizar; distinto de apartado (GTM-17); QG `docs/ops/s33-quotes-qg.md` |
| **GTM-20** | Devolución a proveedor (Cadena) | **Descongelado** tras QG Sprint 34 | NC del proveedor (0 CPE nuestro / 0 cupo); revierte stock+PMP outbound+CxP; mismatch = 422 o `SUPPLIER_PRICE_DIFF`; distinto de GTM-05 y GTM-13; QG `docs/ops/s34-supplier-returns-qg.md` |
| **GTM-21** | Crédito de tienda / gift cards (Cadena/Crece) | **Descongelado** tras QG Sprint 35 | Vale = venta (doc+cupo); canje impone monto servidor; NC sin reembolso+consent → crédito; GL 2102 ≠ 2101; distinto de GTM-05 y GTM-20; QG `docs/ops/s35-store-credit-qg.md` |
| **GTM-22** | Pago en partes / cuotas (Crece/Cadena) | **Descongelado** tras QG Sprint 36 | Schedule sobre AR; solo principal reduce CxC (COM-06); pago idempotente Zero-Trust; OVERDUE no corta caja; distinto de GTM-17 y GTM-21; QG `docs/ops/s36-installments-qg.md` |

**Regla de publicación:** cada release de copy registra el ID GTM afectado, el sprint/gate y el enlace a la evidencia. Staff Growth no descongela un claim por decisión comercial; solo lo hace después de la firma del Quality Gate correspondiente (Proceso §8.1).

**Justificación de los montos:**

- **S/ 49/mes** para el plan Arranque está deliberadamente por debajo del umbral psicológico de "esto es una decisión que tengo que pensar" — es menos de lo que ese mismo negocio gasta en rollos de papel térmico al mes. El objetivo no es rentabilidad en este plan; es **eliminar la fricción de decisión a cero**.
- El cupo de **1,000 comprobantes/mes** en Arranque + **S/ 0.05** de sobregiro protege el margen Edge sin romper la promesa de cobro continuo; el offloading cliente (Arquitectura §7.5) mantiene el costo marginal por boleta cercano a una escritura D1. La adquisición agresiva a S/ 49 sigue viable sin subsidiar tenants de alto volumen.
- El salto de **Arranque a Crece (S/ 49 → S/ 129)** está calibrado para activarse naturalmente cuando el negocio necesita una **segunda caja**, abre un segundo local, o quiere ver el negocio desde el celular (Modo Dueño) — el momento exacto en que esas capacidades dejan de ser nice-to-have y se vuelven indispensables, lo que hace que el upsell se sienta como una necesidad propia y no como una venta forzada.
- El plan **Cadena** con precio por sucursal adicional (S/ 39) convierte el crecimiento del cliente en crecimiento de ingreso recurrente sin que el cliente sienta que "cambió de categoría" — es una extensión natural del mismo plan, no un salto a un nuevo contrato.
- **Enterprise sin precio público** es intencional: a partir de 30 locales, el comprador ya no es el dueño solo — hay un comité, y ese proceso de venta necesita conversación humana, no un botón de "Comprar ahora".

### 4.2 Garantía que Elimina el Riesgo Percibido

**"30 días de prueba real, con datos reales, sin tarjeta de crédito."** No un demo con datos ficticios — el negocio usa KipusPay en su caja de verdad durante 30 días, y solo paga si decide quedarse. Esto traslada el riesgo de la decisión del cliente hacia KipusPay, que es exactamente donde debe estar cuando el producto es tan bueno como afirma serlo.

### 4.3 Política de Cobranza — Por Qué "El POS que no se cae" Nunca Puede Apagar a un Cliente por un Pago Fallido

La promesa central de marca de KipusPay es que el sistema nunca deja al negocio sin poder vender. Esa promesa debe cumplirse también cuando el problema es administrativo, no técnico — si a un cliente le rebota la tarjeta un viernes en hora punta, apagarle el sistema en ese momento contradice exactamente lo que se le vendió, y convierte a un cliente satisfecho en un detractor de marca en minutos.

Por eso, la lógica de cobranza de KipusPay sigue un **periodo de gracia activo** en lugar de suspensión instantánea:

1. **Pago fallido →** el negocio sigue vendiendo con total normalidad. No se bloquea ni una sola función de cobro ni la emisión de comprobantes con serie oficial.
2. **Aviso visible pero tranquilo →** aparece un banner ámbar (nunca rojo de alarma) tanto en la pantalla de cobro como en Modo Dueño: *"Hubo un problema con tu pago. Actualiza tu método de pago en los próximos 3 días para seguir disfrutando de todos los beneficios de tu plan."*
3. **Recordatorios progresivos →** notificación push, email y WhatsApp los días 1, 2 y 3 del periodo de gracia — dando al dueño múltiples oportunidades de resolverlo sin fricción, con un enlace directo de un clic para actualizar la tarjeta.
4. **Solo tras el periodo de gracia sin resolución →** el plan pasa a un modo de **funcionalidad premium reducida** (se pausan Modo Dueño, reportes avanzados, multi-caja adicional y API), **nunca** a un apagado de caja ni a "comprobantes internos" sin validez fiscal — cobrar y emitir con serie oficial sigue activo, con banner persistente de regularización, y reactivación instantánea en cuanto el pago se regulariza.

Este periodo de gracia no es una debilidad del modelo de cobranza — es, en sí mismo, un argumento de venta: *"Ni siquiera un problema con tu tarjeta te deja sin vender."* Es la misma promesa del hero de la landing, aplicada con la misma seriedad a la relación comercial, no solo a la infraestructura técnica.

---

## 5. Landing Page — Estructura y Copy Completo

La landing sigue una estructura de "problema → alivio → prueba → acción", optimizada para que un dueño de negocio sin tiempo pueda decidir en menos de 90 segundos de lectura.

### 5.1 Hero (primer scroll, sin necesidad de bajar) — Video Generado por IA como Fondo

Este es el punto de mayor diferenciación visual de toda la landing, y el que más debe alejarse del estándar de la categoría: ningún competidor regional (Bsale, Alegra, Siigo) usa video como lenguaje de marca en su hero — todos usan captura de pantalla estática del software o ilustración plana de stock. KipusPay rompe ese patrón deliberadamente.

**Headline:**
> ## El único POS que no se cae contigo.

**Subheadline:**
> Vende, cobra y factura aunque se corte la luz, el internet, o sea tu día de más gente. Configúralo en 5 minutos. Sin contratos largos, sin instalador, sin dolores de cabeza.

**CTA primario:** `Empieza gratis, sin tarjeta →`
**CTA secundario:** `Ver cómo funciona (2 min)` (video demo)

**Elemento visual — video de fondo en loop (8-12 seg, sin audio, autoplay muted):** no una animación de interfaz ni un screencast del producto, sino una pieza cinematográfica corta que transmite *velocidad, calma y control* sin mostrar una sola pantalla de software — el video vende la sensación del negocio funcionando bien, no las features. La interfaz real del producto se muestra después, en la sección 5.3, una vez que el visitante ya sintió la promesa emocional.

**Microcopy de confianza bajo el CTA:** `Más de [N] comercios ya venden con KipusPay · 30 días de prueba con tus datos reales · Tus datos, siempre tuyos`

#### Prompt Profesional para Generación del Video Hero (IA de video, ej. Sora / Veo / Runway)

El siguiente prompt está redactado siguiendo las mejores prácticas de generación de video por IA (descripción de shot, movimiento de cámara, iluminación, ritmo y mood explícitos, sin ambigüedad interpretativa) para maximizar consistencia entre generaciones y minimizar artefactos:

```text
Cinematic commercial video, 10 seconds, seamless loop, no text, no logos, no UI screens.

SUBJECT: A small independent retail shop in Latin America (a neighborhood
pharmacy or minimarket) at golden hour, viewed from a warm, human,
documentary-style angle — not corporate stock-footage energy.

SHOT SEQUENCE (3 shots, smooth crossfade transitions):
1. (0-3s) Close-up, shallow depth of field: a shopkeeper's hands calmly
   scanning a product and tapping a sleek tablet screen at checkout.
   The tablet screen glows softly but its content stays abstract/blurred
   bokeh — we feel technology, we don't read it. Warm practical lighting,
   soft window light from the left.
2. (3-6s) Medium shot, slow dolly-in: the shopkeeper smiles genuinely and
   hands a small paper receipt to a customer, both relaxed, unhurried.
   Background shows a modest, real, lived-in store — not a sterile
   showroom. Shallow depth of field keeps focus on the human exchange.
3. (6-10s) Wide shot, slow crane-up: the small store from outside at
   dusk, warm lights on, a few customers inside, the street calm. Camera
   rises gently to suggest stability and quiet confidence, not hype.

MOOD & COLOR GRADE: Warm, cinematic, slightly desaturated shadows with
warm highlights — inspired by A24 film color grading and Apple product
launch films, NOT saturated stock-footage commercial look. Color palette
should read as trustworthy and premium: deep ink blacks, warm amber
accents, soft neutral whites. No cold blue corporate tech lighting.

CAMERA: Handheld-smooth (gimbal-stabilized feel), 35mm lens look, natural
motion blur, shallow depth of field throughout. No drone shots, no fast
cuts, no glitch/tech transition effects.

PACING: Slow, confident, unhurried — the pacing itself should communicate
"this business runs smoothly," never frantic or rushed.

AUDIO: None (video will be muted autoplay on web).

NEGATIVE PROMPT: no on-screen text, no UI mockups, no dashboards, no
futuristic holograms, no neon, no glitch effects, no stock-photo
corporate handshake energy, no overly polished/artificial staging,
no visible brand logos.
```

**Nota de producción:** generar 2-3 variantes del mismo prompt cambiando solo el vertical del comercio (farmacia, restaurante pequeño, ferretería) para poder servir un hero video distinto por landing de vertical (ver sección 2) sin cambiar una sola palabra del copy — el mismo sistema de mood y color grade mantiene consistencia de marca entre verticales.

---

### 5.2 Sección "El Problema que Ya Conoces"

Tres columnas, una por dolor (ver tabla sección 1.1), cada una con:
- Ícono simple (no ilustración corporativa genérica)
- Frase de dolor en primera persona: *"Se me llenó la cola y el sistema se puso lento."*
- Frase de alivio de KipusPay debajo, en color de "sello" (verde institucional)

Este bloque existe para que el visitante piense *"eso me pasó a mí"* antes de que la marca le explique nada de sí misma — la venta empieza por empatía, no por feature.

---

### 5.3 Sección "Cómo Funciona" (pasos, sin jerga)

1. **Cuéntanos de tu negocio** — Si ya tienes RUC, KipusPay trae tus datos desde SUNAT. Si aún estás formalizando, empiezas igual con el nombre de tu negocio.
2. **Elige tu rubro y tu etapa** — Restaurante, farmacia, retail, servicios; y si hoy necesitas **control interno (nota de venta)**, estás **activando facturación**, o ya eres **emisor electrónico**.
3. **Empieza a vender** — En menos de 5 minutos completas tu primera venta. Según tu etapa: ves una **nota de venta** (control interno, claramente etiquetada) o una **boleta/factura electrónica** (KipusPay se encarga del envío a SUNAT como PSE o con tu certificado). Conectar tu impresora física es opcional y se configura después.

Debajo, un contador visual simple tipo barra de progreso ("⚡ Tiempo promedio de activación: 4 min 32 seg") — convertir la velocidad de onboarding en un dato mostrable es en sí mismo un argumento de venta frente a la competencia, cuyo proceso de implementación toma semanas.

**Nota de diseño de producto (documento digital primero):** el primer cobro genera de inmediato un PDF/QR compartible por WhatsApp. El emparejamiento de impresora térmica es configuración secundaria, nunca bloqueo de la primera venta.

**Nota de cumplimiento (cero engaño fiscal):** la **nota de venta** es legítima para quien aún se formaliza — **nunca** se presenta como boleta/factura SUNAT (leyenda obligatoria). Quien activa facturación emite CPE válidos; KipusPay opera como **PSE** por defecto (no se vende “contingencia” como atajo ilegal). Al activar facturación, el historial de notas de venta **no se convierte** en boletas. Guías de remisión y regímenes especiales avanzados llegan en fases posteriores.

---

### 5.4 Sección "Vende sin Miedo a que se Corte el Internet"

**Headline:** *"El internet se corta. Tus ventas, no."*

Copy de cuerpo:
> Si tu conexión falla, KipusPay sigue funcionando exactamente igual: cobras, imprimes y sigues atendiendo. Cuando la señal regrese, todo se sincroniza solo — incluyendo el envío de facturas y el resumen diario de boletas a SUNAT — y te avisa si algo se acerca al plazo legal. Si el dispositivo se queda sin espacio local tras muchas horas offline, KipusPay te avisa en caja antes de que se llene — nunca pierde ventas en silencio.

Elemento visual: comparación lado a lado — "Con otros sistemas" (ícono de caja bloqueada, "Sistema no disponible") vs. "Con KipusPay" (venta procesándose con indicador sutil de sincronización pendiente que luego se resuelve).

---

### 5.5 Sección "Cada Sol Cuadra, Siempre" (Control Antipérdidas)

**Headline:** *"Se acabaron los descuadres que nadie puede explicar."*

Copy de cuerpo:
> KipusPay descuenta el inventario exacto en el momento exacto de cada venta. No hay forma de que "sobre" ni "falte" — si un producto salió de tu tienda, quedó registrado. Al cerrar caja, ves en un vistazo si algo no cuadra, y por qué.

Prueba social específica de este dolor: testimonio breve tipo *"Antes perdía 2 horas cuadrando caja cada noche. Ahora es automático."* — atribuido a un perfil de negocio real (dueño de minimarket, farmacia, etc., con nombre y ciudad si se cuenta con permiso, o "Dueño de minimarket, Arequipa" si es agregado).

**Alineación técnica (Arquitectura §5.3/§9):** el claim "cada sol cuadra" se sostiene en el **arqueo por fórmula** (`expected = opening + ventas efectivo + ingresos − retiros − egresos`, conciliado con conteo de denominaciones), el **costo promedio ponderado (PMP)** que da el margen real por producto, y el **conteo físico de inventario** con diferencias auditadas — no solo en "descontar inventario al vender".

---

### 5.6 Sección "Un Panel para Todo tu Negocio" (Modo Dueño)

**Headline:** *"Sabe cómo te va, sin estar ahí."*

Copy de cuerpo:
> Desde tu celular, ve las ventas de todos tus locales y cuánto ganaste hoy, actualizado a medida que las cajas sincronizan — antes de que termine el día. También puedes revisar qué local vende más y qué producto se está por acabar cuando tu plan tenga esos reportes habilitados. Como revisar tu cuenta bancaria, pero de tu negocio.

Elemento visual: mockup de app móvil estilo dashboard financiero premium (referencia de diseño: Stripe Dashboard / Apple Card app), nunca un mockup que luzca a "reporte de Excel exportado".

**Alineación técnica (Arquitectura §9):** las cifras del Modo Dueño salen de la **capa de rollups diarios en D1** (`daily_financial_rollups`), no de Analytics Engine (muestreado). Son exactas para el último estado sincronizado, no una promesa de tiempo real continuo. Ventas de hoy, arqueo por cajero y alertas de stock mínimo están en **Arranque**; top productos/margen, inventario valorizado, merma y ranking de sucursales son reportes "avanzados" gated a **Crece/Cadena** (GTM-03 / catálogo §9). En offline, aplica GTM-11: lectura pura y banner de antigüedad.

---

### 5.7 Sección Comparativa (Objeción Directa a la Competencia)

**Headline:** *"¿Por qué cambiarte de tu sistema actual?"*

Tabla de 4 filas, lenguaje 100% de negocio (no técnico):

| | Sistemas tradicionales | KipusPay |
|---|---|---|
| Si se corta el internet | Dejas de vender | Sigues vendiendo normal |
| Implementación | Semanas, con instalador | 5 minutos, tú solo |
| Costo mensual | Cuotas altas + instalación + soporte técnico aparte | Desde S/ 49/mes, todo incluido |
| Soporte | Ticket y espera | Chat según plan; soporte prioritario Enterprise solo con el gate GTM-02 |

---

### 5.7.1 Sección "Tu Negocio, Tus Datos, Tu Tranquilidad" (Confianza y Seguridad)

Un negocio que va a confiar su caja registradora — es decir, su dinero — a un sistema nuevo necesita sentirse seguro antes de sentirse entusiasmado. Esta sección existe específicamente para neutralizar el miedo silencioso que ningún visitante escribe en un formulario de contacto pero que sí decide si compra: *"¿y si pierdo mi información, o alguien más la ve?"*

**Headline:** *"Tan seguro como tu banco. Tan simple como tu celular."*

Cuatro íconos con una frase corta cada uno, sin tecnicismos:

- 🔒 **"Tu información va cifrada, siempre."** — nunca viaja ni se guarda en texto plano.
- 📄 **"Tus datos son tuyos. Punto."** — la exportación y los derechos de privacidad se habilitan según los gates de Sprints 42/47; antes del gate no se promete exportación completa ni borrado inmediato de datos fiscales.
- 🧾 **"Acompañamiento para SUNAT."** — KipusPay guía el envío, los plazos y los estados; la aceptación final depende de SUNAT/OSE/PSE y nunca se garantiza por copy.
- 🇵🇪 **"Soporte real, en español, con personas reales."** — no un bot que te deja esperando.

Elemento visual: sellos de confianza discretos solo cuando exista evidencia vigente y autorización de uso (certificaciones, logos de pasarelas o referencias de cumplimiento). Queda prohibido publicar un badge genérico de "Cumple normativa SUNAT" o una certificación no obtenida.

Esta sección se ubica deliberadamente justo antes del pricing: la secuencia psicológica es *"esto funciona → esto es seguro → esto cuesta esto"* — nunca se pide el compromiso de precio antes de resolver el miedo.

---

### 5.8 Sección de Pricing (ver estructura completa en sección 4)

Presentar los 4 planes en tarjetas, con el plan **Crece** marcado como "Más elegido" (anclaje de precio — dirige la decisión hacia el plan de mejor margen sin presionar). Toggle mensual/anual con el ahorro anual visible como badge ("2 meses gratis").

---

### 5.9 Sección de Preguntas Frecuentes (Elimina Objeciones antes de que Aparezcan)

Formato acordeón, con las objeciones reales que un dueño de negocio peruano tendría:

- *"¿Necesito internet para instalarlo?"* → Solo la primera vez, para configurarlo. Después funciona sin conexión cuando la necesites. Si estuviste offline mucho tiempo, KipusPay sincroniza solo y te avisa si algún comprobante electrónico está cerca del plazo de declaración a SUNAT.
- *"¿Emite boletas y facturas válidas para SUNAT?"* → Después del Quality Gate fiscal de los Sprints 5/5b, cuando activas facturación electrónica KipusPay puede operar como PSE para emitir CPE válidos. Si aún te formalizas, empiezas con **nota de venta** de control interno — claramente etiquetada, sin hacerse pasar por boleta.
- *"¿Qué es una nota de venta y en qué se diferencia de una boleta?"* → La nota de venta es tu control interno de caja e inventario. **No** es un comprobante autorizado por SUNAT. La boleta/factura sí lo es. KipusPay nunca confunde las dos.
- *"¿Cuándo me piden el DNI del cliente?"* → En boletas de **S/ 700 o más** es obligatorio registrar tipo y número de documento y el nombre. En montos menores es opcional (salvo que el cliente lo pida). En facturas siempre se pide RUC.
- *"¿Puedo usar KipusPay si aún no estoy formalizado / no tengo facturación electrónica?"* → Sí. Eliges “control interno”, cobras con nota de venta, y activas facturación desde Configuración cuando estés listo — sin perder historial.
- *"¿Cómo subo todos mis productos? ¿Necesito un archivo Excel?"* → Hoy puedes usar CSV o un importador habilitado. El escáner con cámara y la venta rápida genérica se habilitan como claims públicos solo después del Quality Gate del Sprint 50 (GTM-06); mientras tanto, no prometemos esa automatización.
- *"¿Cómo cambio de cajero en medio del día?"* → El handoff sin cerrar caja se comunica solo después del Quality Gate del Sprint 51: PIN temporal de un solo uso, auditoría y atribución por turno. Antes del gate, se usa el flujo de cierre/cambio ya disponible.
- *"¿Y si se corta el internet y el cliente quiere pagar con Yape?"* → Sí: captura manual con alerta ámbar *"Sin conexión. Verifica visualmente la app del cliente antes de entregar el producto"*. Queda listado como pago **no conciliado por API**; nunca se presenta como captura confirmada (QG Sprint 22).
- *"¿Puedo vender algo que todavía no tengo en mi sistema?"* → La línea genérica es una capacidad del Sprint 50 y solo se promete después de su Quality Gate. Cuando esté habilitada, no descontará stock y quedará marcada como "pendiente de catalogar".
- *"¿Qué pasa si se corta el internet y no se envían mis boletas a SUNAT?"* → Tras el gate fiscal de los Sprints 5/5b/26, sigues cobrando; KipusPay reintenta el envío y el resumen diario al volver la señal, y te avisa si se acerca el plazo legal. No apagamos la caja.
- *"¿Qué pasa si aún no tengo el certificado digital (.pfx)?"* → Después del gate PSE del Sprint 5, KipusPay puede operar mediante PSE según la configuración y disponibilidad del servicio. Si prefieres tu propio `.pfx`, lo cargas en Configuración; nunca se guarda la clave privada en texto plano.
- *"¿Qué pasa con mis datos si dejo de pagar?"* → Tus datos son tuyos. La exportación completa y los derechos LPDP se habilitan conforme a los gates de Sprints 42/47; la retención fiscal obligatoria puede impedir el borrado inmediato de ciertos documentos, que se anonimizan cuando corresponda (GTM-09).
- *"¿Necesito comprar un equipo especial?"* → No, funciona en la tablet, celular o computadora que ya tienes — incluyendo equipos de gama baja. Conectar una impresora térmica es opcional y se configura después de tu primera venta.
- *"¿Puedo cambiar de plan cuando crezca mi negocio?"* → Sí, sin perder configuración ni historial. Arranque **nunca te apaga la caja**: incluye 1,000 comprobantes/mes y el excedente se factura a S/ 0.05; subes a Crece cuando necesitas segunda caja, otro local o Modo Dueño — o cuando te conviene frente al sobregiro.
- *"¿Las notas de crédito o anulaciones me consumen mis comprobantes del plan?"* → Sí, transparente: cada comprobante emitido cuenta, **incluidas las notas de crédito/débito** (cada una es un documento real ante SUNAT). El cupo se usa al emitir, no al anular; una corrección consume 1 comprobante y no devuelve el de la venta original. La baja de boleta no suma ni resta.
- *"¿Y si SUNAT rechaza mi factura o boleta? ¿Cómo devuelvo el dinero?"* → Si el comprobante **nunca fue aceptado** (rechazado, en cuarentena o vencido el plazo), KipusPay te permite **anularlo con una nota de crédito sin esperar la aceptación** — la caja nunca se detiene por un rechazo y el dinero ya contabilizado se revierte con el respaldo fiscal correcto. El Modo Dueño te avisa cuando un comprobante quedó sin aceptar y te ofrece anularlo desde ahí.
- *"¿Puedo vender al crédito y qué pasa si el cliente devuelve?"* → Sí: la devolución (GTM-05 / Sprint 28) genera nota de crédito o NV_RETURN según tu formalización, dentro de la ventana N días de tu política. Si la venta fue a crédito, **rebaja automáticamente lo que te deben** en la misma operación; si pagaron en efectivo, el vuelto sale por caja. La NC **no** reembolsa el cupo del comprobante original (§4.1): el documento nuevo cuenta +1.
- *"¿Me cobran el comprobante si SUNAT lo rechaza o nunca lo acepta?"* → El cupo cubre la **generación** del comprobante, sin importar el estado final de aceptación: un CPE emitido que SUNAT deja en cuarentena o rechaza ya contó. Si hay un rechazo real (no un error de caja), lo corregimos con una nota de crédito y reemites — nunca te detenemos el cobro.
- *"¿Qué pasa si se me pasa la fecha de pago de mi plan?"* → Nunca te apagamos en plena venta. Tienes días de gracia para actualizar tu método de pago sin que se interrumpa tu operación — ver sección 4.3.
- *"¿Puedo armar promociones u ofertas?"* → El motor de promociones (2x1, % fijo, % por umbral de monto/cantidad, precio por tramo) está habilitado tras el Quality Gate del **Sprint 30** (GTM-15). El precio final siempre lo impone KipusPay desde el servidor, nunca la caja.
- *"¿Manejan tallas, colores o unidades de medida?"* → **Sí (GTM-16):** cada variante conserva stock, lotes y precio propios; cajas, packs y fracciones se convierten con factores exactos en el servidor. Cambiar una presentación no altera ventas ni devoluciones históricas.
- *"¿Controlo mi inventario por estantes o racks? ¿Y si vendo por peso?"* → Ubicaciones/racks, números de serie, venta por peso/balanza y etiquetas de precio se comunican solo después de los Quality Gates de los **Sprints 38–42** (GTM-17). La balanza se configura desde Admin y el peso lo recalcula el servidor; antes del gate no se promete ese control de ubicaciones.
- *"¿Puedo apartar mercadería y cobrar un adelanto?"* → **Sí (GTM-17 / Sprint 32):** reserva el ítem, cobra adelantos y el comprobante nace solo al convertir a venta. Cancelar un apartado abierto reembolsa los abonos sin nota de crédito. El diario Cadena (GTM-14) es solo lectura y coincide con el export Contasis/Concar.
- *"¿Puedo emitir cotizaciones o presupuestos?"* → **Sí (GTM-19 / Sprint 33):** congela el precio del servidor hasta la fecha de vencimiento y no emite boleta/factura/NV ni reserva stock. Al convertir hereda ese snapshot aunque la lista haya cambiado; si venció, hay que recotizar.
- *"¿Puedo devolver mercadería al proveedor?"* → **Sí (GTM-20 / Sprint 34):** revierte stock y PMP, baja el CxP si la factura ya estaba abierta y no emite nota de crédito SUNAT nuestra (la NC es del proveedor). Distinto de la devolución a cliente (GTM-05).
- *"¿Puedo vender vales / gift cards o dejar crédito de tienda?"* → **Sí (GTM-21 / Sprint 35):** la venta del vale es una venta (doc + cupo). El canje lo impone el servidor (nunca el monto que teclea la caja). Una NC sin reembolso puede pasar a crédito con consentimiento del cliente; distinto de GTM-05 (devolución cliente) y GTM-20 (devolución proveedor).
- *"¿Puedo cobrar en cuotas / pago en partes?"* → **Sí (GTM-22 / Sprint 36):** plan sobre la CxC de la venta a crédito; solo el **principal** baja el saldo (COM-06); el interés se asienta aparte. Retry idempotente; atraso (OVERDUE) alerta al Dueño y **no** corta la caja. Distinto de apartado (GTM-17) y vale (GTM-21).

---

### 5.10 CTA Final (Cierre)

**Headline:** *"Tu próxima venta puede ser la primera con KipusPay."*

**CTA:** `Empieza gratis ahora →`
**Microcopy:** `30 días de prueba real · Cancela cuando quieras · Sin letra chica`

---

### 5.11 Dirección de Diseño Diferencial — Por Qué Esta Landing No Puede Parecerse a Ninguna Otra

Toda landing de POS/facturación en la región comparte el mismo lenguaje visual: azul corporativo, capturas de pantalla de dashboards con gráficos de barras, ilustraciones planas de personas sonriendo junto a una tablet, y un layout de secciones apiladas verticalmente sin ninguna sorpresa de scroll. Ese lenguaje visual, aunque "correcto", comunica exactamente lo contrario de lo que KipusPay necesita transmitir: **se ve como más de lo mismo, no como la categoría nueva que es.**

El factor diferencial clave de la landing de KipusPay no es un elemento aislado — es la combinación deliberada de cuatro decisiones que ningún competidor regional está tomando simultáneamente hoy:

1. **Video cinematográfico como lenguaje de marca, no captura de producto.** El hero no abre mostrando software — abre mostrando la sensación de un negocio que funciona bien (sección 5.1). El producto se revela después, cuando el visitante ya sintió la promesa. Esto invierte el orden que usa el 100% de la competencia (producto primero, emoción después, si acaso).
2. **Paleta "Ledger Minimalism" en vez de azul corporativo genérico.** Tintas profundas, ámbar cálido de atención (nunca rojo de alarma), y tipografía de cifras estable — una paleta que se siente prestada de una fintech premium o de un banco digital moderno, no de un software contable de los 2000. Ningún competidor de la categoría usa esta paleta hoy; todos convergen en azul-y-blanco corporativo.
3. **Scroll con ritmo narrativo, no lista de features.** Cada sección de la landing sigue la secuencia problema → alivio → prueba → seguridad → precio → acción (secciones 4.2 a 4.10) — un arco emocional deliberado, no una grilla de tarjetas de "características" apiladas sin jerarquía narrativa, que es el patrón por defecto de casi toda la competencia.
4. **Micro-interacciones con personalidad propia, no plantilla de librería de animación genérica.** El indicador de "costura" de sincronización (sección 6.1), las transiciones suaves del Modo Vitrina, y las animaciones de Modo Dueño están diseñadas como firma de marca reconocible — algo que un usuario recordaría y describiría a otro dueño de negocio ("se ve carísimo, pero cuesta poco"), no solo una interfaz funcional.

**Prueba de diferenciación (checklist antes de aprobar el diseño final):** si se le muestra la landing a alguien sin el logo visible, ¿podría confundirla con Bsale, Alegra, Siigo o cualquier landing de SaaS genérica? Si la respuesta es "sí, se parece", el diseño no está listo para publicarse — el objetivo no es una landing bonita dentro de la categoría, es una landing que no parezca pertenecer a la categoría en absoluto.

---

## 6. Frontend Premium — Lo que Convierte a KipusPay en un Producto, no en un Software

Un negocio decide en segundos si algo "se ve profesional" o "se ve improvisado", y esa percepción determina si confía su caja registradora al sistema. El frontend de KipusPay se diseña bajo un principio simple: **debe verse y sentirse como una app de consumo premium (Stripe, Apple, Spotify), nunca como un ERP tradicional.**

### 6.1 Sistema de Diseño de Marca

- **Tipografía de cifras siempre estable:** los montos en pantalla nunca "tiemblan" ni saltan al actualizarse — refuerza la sensación de precisión financiera en cada vistazo, incluso sin que el usuario sepa nombrar por qué se siente confiable.
- **Paleta de estado no alarmista:** las discrepancias o pendientes de sincronización se comunican en tonos ámbar de "atención", nunca en rojo de "error" — un negocio no necesita sentir pánico por una sincronización pendiente que se resolverá sola.
- **Indicador de sincronización visible pero discreto:** una micro-animación sutil muestra qué está "cosiéndose" con el servidor en segundo plano, sin interrumpir al cajero ni generar ansiedad sobre si la venta "se guardó bien".
- **Densidad adaptada al rol:** la pantalla de cobro (cajero) prioriza velocidad y botones grandes de un toque; el panel del dueño prioriza espacio y jerarquía visual tipo dashboard editorial — dos personas usando la misma marca, cada una con la interfaz que su trabajo necesita.

### 6.2 Onboarding "Zero-Fricción" — El Corazón del PLG

Ningún ERP tradicional puede replicar esto sin rehacer su producto desde cero, porque asumen implementación consultiva. KipusPay se diseña al revés: el onboarding *es* el primer uso del producto, no un paso previo a él.

**Flujo de pantallas (máximo 4), sin excepción:**

1. **Negocio →** con RUC: autocompletado de razón social, dirección y régimen vía SUNAT. Sin RUC aún: nombre comercial y paso a control interno. Cero formularios largos.
2. **Rubro →** selección visual (tarjetas con ícono) entre restaurante, farmacia, retail, servicios — precompone catálogo de ejemplo, impuestos y layout de cobro.
3. **Etapa de formalización →** tres tarjetas: *Solo necesito control interno (nota de venta)* / *Estoy activando facturación electrónica* / *Ya emito boletas y facturas*. Define el default de caja y los documentos habilitados (detalle en §3.3.1).
4. **Primera venta guiada →** "aha moment" antes del minuto 5: nota de venta (si control interno) o boleta/factura electrónica (si formalizando/emisor, vía PSE KipusPay por defecto).

La configuración profunda (series, certificado, estado de envíos SUNAT, logo, usuarios) se completa después en **Admin → Configuración** (§3.3.1), nunca como bloqueo del onboarding.

**Regla de producto no negociable:** si el onboarding requiere una llamada de un vendedor o un documento PDF de instrucciones, el onboarding falló. El producto debe explicarse solo.

**Regla de cumplimiento no negociable (cero engaño fiscal):** la nota de venta está permitida para control interno / pre-formalización, **siempre** con leyenda legal y **nunca** como boleta SUNAT. No se usa el término “contingencia” para describir la falta de certificado: el camino de producto es **activación de facturación / PSE**.

**El "segundo día" (flujo post-onboarding, FASE 6G):** el primer minuto logra la venta; el **primer día** completa el negocio sin fricción:
- **Setup checklist** (Admin/Modo Dueño): logo, impresora, invitar cajero, activar facturación, subir catálogo — barra de completitud que guía sin bloquear la caja (nunca condiciona el cobro).
- **Product Tour por rubro:** al elegir la modalidad, tooltips explican cómo usar lo que se habilitó (KDS, FEFO, balanza, promociones, variantes): *"Como eres restaurante, activamos las comandas de cocina — configura aquí tu pantalla de chef."*
- **Catálogo con cámara:** capability de Sprint 50, visible como claim público solo después de su Quality Gate. Antes, el onboarding ofrece CSV/importador y no promete escaneo automático.
- **Equipo en minutos:** handoff de turno, PIN temporal, badge y atribución de vendedor son claims de Sprint 51; antes del gate se mantiene el flujo de cambio ya disponible y no se promete transferencia sin cierre.

*(Claims de este flujo se descongelan por gates: "sube tu catálogo con la cámara" y "cambia de turno sin cerrar caja" tras Quality Gate de Sprints 50–53, FASE 6G.)*

### 6.3 App "Modo Dueño" — Mobile-First para quien no está en la Tienda

Mientras el cajero vive en la pantalla de alta densidad, el dueño del negocio vive en su celular. Modo Dueño es una experiencia separada, optimizada para lectura rápida en momentos sueltos del día (semáforo, sala de espera, antes de dormir):

 - **Resumen del día en la parte superior**, sin necesidad de hacer scroll ni tocar nada: ventas de hoy vs. ayer, ranking de locales si tiene más de uno *(ranking = reporte avanzado, plan Crece+, §4.1 — ver Alineación técnica abajo)*.
 - **Alertas push accionables**, no solo informativas: *"Se está por acabar el Paracetamol 500mg en tu local de Miraflores — ¿generar orden de compra?"* con un botón de una sola acción, no un enlace a un módulo separado.
- **Quién es responsable de cada sol**: además del arqueo por cajero, el Z desglosa las **diferencias por operador/turno** (handoff con conteo intermedio) y el Dueño ve **pagos electrónicos no conciliados por API** (captura manual offline) — si faltan S/ 50, sabe si fue en la mañana o en la noche, sin culpar al cajero equivocado.
- **Modelo de interacción de app de consumo**, no de panel administrativo: gestos de swipe, animaciones de entrada suaves, cifras grandes y legibles — la misma calidad visual que un dueño de negocio ya espera de su app bancaria.

**Alineación técnica (Arquitectura §9):** las cifras del Modo Dueño salen de la **capa de rollups diarios en D1** (`daily_financial_rollups`), no de Analytics Engine (muestreado) — el dueño ve números exactos, no aproximaciones. Top productos/margen, inventario valorizado, merma por sucursal y ranking de locales son reportes "avanzados" gated a Crece/Cadena (GTM §4.1); ventas de hoy, arqueo por cajero, desglose por operador/turno y pagos no conciliados están en Arranque. Cualquier alerta accionable ("¿generar orden de compra?") usa el `reorder_point` de `branch_stock_policies` (Arquitectura §5.3).

### 6.4 Evolución del Modo Vitrina — De Pantalla Secundaria a Canal de Venta

El Modo Vitrina deja de ser solo una animación de confirmación de pago y se convierte en una superficie de negocio adicional:

- **Kiosko de autoatención:** visión de producto, no claim disponible en la landing. Solo se comunica después de un sprint y Quality Gate específicos de autoatención; mientras tanto, Modo Vitrina se limita a la confirmación de pago.
- **Pedido por QR desde la mesa:** visión de producto post–Sprint 19 (comandas/KDS ya con QG cerrado). No destacarlo en landing de restaurantes como claim; el demo de food service usa salón → KDS → split → sales + Vitrina de pedido.
- **Momento de marca en el punto de pago:** la animación de confirmación (con el logo del negocio del comerciante, no el de KipusPay, en pantalla) convierte cada transacción en un micro-momento de marca premium para el propio comerciante — un diferenciador físico que ningún competidor regional ofrece de fábrica.

### 6.5 Estándares de UX Premium — Lo que Separa "Se Ve Bien" de "Se Siente Premium"

Un sistema de diseño y un onboarding rápido no garantizan por sí solos una experiencia premium si los detalles de interacción cotidiana no están resueltos. Estos son los estándares no negociables que completan la experiencia:

- **Velocidad percibida antes que velocidad real:** toda acción del cajero (agregar producto, aplicar descuento, cobrar) debe reflejarse en pantalla en menos de 100ms de forma optimista — la confirmación real del servidor llega después, en segundo plano, sin que el cajero perciba espera. Un sistema técnicamente rápido que "se siente lento" por falta de feedback inmediato pierde toda la ventaja de percepción frente a la competencia.
- **Cero pantallas de carga en bucle (spinners) en flujos críticos:** cobrar, abrir caja y cerrar caja nunca muestran un spinner genérico indefinido — se usan estados de progreso con contexto ("Confirmando con tu banco...") o, preferentemente, actualización optimista de interfaz. Un spinner sin contexto comunica incertidumbre, exactamente lo opuesto a la promesa de marca de KipusPay.
- **Estados vacíos con propósito, nunca pantallas en blanco:** un inventario recién creado sin productos, un historial de ventas del primer día, o un local recién agregado sin datos aún, siempre muestran una ilustración breve y una acción sugerida clara ("Agrega tu primer producto en 10 segundos") — nunca una tabla vacía sin contexto, que comunica que "algo está roto" en lugar de "esto es nuevo".
- **Errores redactados por humanos, no por el sistema:** ningún mensaje de error expone jerga técnica ("Error 500", "Timeout de conexión D1") al cajero o al dueño — todo error se traduce a lenguaje de negocio con una acción clara ("No pudimos confirmar este pago con tu banco. Intenta de nuevo o cobra en efectivo.").
- **Accesibilidad como estándar, no como feature opcional:** contraste de color AA como mínimo (crítico dado que muchos puntos de venta operan bajo luz de tienda variable, no oficinas controladas), objetivos táctiles de mínimo 44x44px en la pantalla de cobro para uso rápido y con dedos apurados, y soporte completo de navegación por teclado en el panel administrativo para negocios que usan lector de código de barras USB en lugar de mouse.
- **Feedback táctil y sonoro deliberado, no decorativo:** un sonido breve y distintivo de confirmación al completar una venta (perceptible en un ambiente ruidoso de tienda sin ser molesto en uso prolongado) y vibración háptica en dispositivos móviles al confirmar acciones críticas — pequeñas señales sensoriales que refuerzan la sensación de "esto sí se guardó", reduciendo la ansiedad de doble-clic o de repetir una venta por inseguridad.
- **Modo oscuro real en Modo Dueño**, no solo una paleta invertida automática — pensado para el momento de uso real (revisar el negocio antes de dormir, en la cama, con la luz apagada), coherente con el resto de apps premium que el dueño ya usa a esa hora del día.

---

## 7. Funnel de Adquisición y Growth Loops

Un pricing de entrada bajo y un onboarding de 5 minutos solo generan crecimiento exponencial si existe un mecanismo que convierta cada cliente nuevo en un canal de adquisición del siguiente. KipusPay necesita al menos dos loops de crecimiento activos desde el lanzamiento:

### 7.1 Loop de Referidos "Negocio Recomienda Negocio"

Los dueños de negocio confían en recomendaciones de otros dueños de negocio de su mismo gremio (asociaciones de comerciantes, grupos de WhatsApp de rubro) mucho más que en publicidad paga. Mecanismo sugerido: **un mes gratis para quien refiere, un mes gratis para quien es referido** — simple, sin niveles ni condiciones complejas que haya que explicar.

### 7.2 Loop de Marca Visible en el Punto de Venta

Cada boleta, factura o nota de venta impresa y cada pantalla del Modo Vitrina pueden ser superficies publicitarias pasivas: un pie de página discreto tipo *"Emitido con KipusPay"* con un código QR corto, solo si no desplaza campos ni leyendas fiscales obligatorias y si el tenant lo habilita. La nota de venta conserva siempre la leyenda de control interno de GTM-07.

### 7.3 Loop de Contenido "Casos de Éxito por Vertical"

Cada testimonio de cliente (ver sección 5.5) se convierte en contenido de landing específico de vertical, que a su vez se distribuye en los mismos canales donde ese vertical busca soluciones (grupos de Facebook de dueños de farmacia, foros de gastronomía) — el contenido de venta y el contenido de producto son el mismo activo, reutilizado.

---

## 8. Manejo de Objeciones — Guion para Ventas y Soporte

Además de las FAQ públicas de la landing (sección 5.9), el equipo comercial necesita respuestas preparadas para las objeciones que surgen en conversación directa, especialmente con negocios que ya usan un sistema (migración, no adquisición nueva). El equipo debe citar el ID `GTM-*` cuando una respuesta dependa de un gate:

| Objeción real | Respuesta comercial |
|---|---|
| *"Ya tengo un sistema, cambiar es mucho trabajo"* | Tras Sprint 21: "Importamos catálogo y clientes desde Bsale/Alegra (o CSV) con dry-run para que confirmes antes de cobrar el mismo día" — proceso en `docs/ops/catalog-import-playbook.md`. Antes del gate: CSV + onboarding guiado; **no prometer** importador automático con fecha inventada. |
| *"¿El KDS / split de cuenta / lotes FEFO ya están?"* | Solo afirmar si el sprint de GTM §2 está cerrado (17 caja, 18 farmacia, 19 resto, 20 cadena). Si no: "Está en el roadmap v8.1 con fecha de Quality Gate; hoy te cubrimos caja offline, SUNAT/PSE y Modo Dueño." |
| *"¿Puedo cobrar con Yape / Plin / tarjeta en la caja?"* | Sí (QG Sprint 22): medio de pago Zero-Trust en el cobro (distinto del cobro de la suscripción KipusPay / Stripe). Soft-launch detrás de `FEATURE_PAYMENTS_*`. |
| *"¿Mi contador puede llevarlo a Contasis/Concar?"* | Sí (QG Sprint 23): export de asientos Contasis (CSV) / Concar (XML) por rango y sucursal. Soft-launch detrás de `FEATURE_ACCOUNTING_EXPORT` (Cadena+). |
| *"¿Tienen API / fidelización como el plan Cadena dice?"* | API de integraciones sí (QG Sprint 23): API keys + webhooks `sale.created` / `cpe.*` (Cadena+). Fidelización **light** (puntos + canje authz + WhatsApp opt-in) sí (QG Sprint 24). Motor completo (tiers/campañas) = roadmap. |
| *"¿Y si el sistema nuevo falla y pierdo ventas el primer día?"* | "Por eso das el primer mes de prueba con tus datos reales, en paralelo a tu sistema actual si quieres — decides quedarte solo cuando confíes." |
| *"Mi personal no es bueno con la tecnología"* | "Si saben usar WhatsApp, saben usar KipusPay. La pantalla de cobro tiene menos botones que la calculadora que probablemente usan hoy." |
| *"¿Por qué es tan barato comparado con [competidor]?"* | "No cobramos por instalación, servidor ni soporte técnico aparte — todo eso ya está incluido en el precio del plan. No es que seamos más baratos por hacer menos; es que no tenemos los costos que ellos sí tienen." |
| *"¿Qué pasa si crezco y ya no me alcanza el plan?"* | "Cambias de plan en un clic. En Arranque **nunca cortamos el cobro**: 1,000 comprobantes/mes incluidos y S/ 0.05 el adicional. Subes a Crece cuando necesitas otra caja, otro local, Modo Dueño — o cuando el sobregiro hace más sentido subir." |
| *"Aún no estoy formalizado / solo quiero control interno"* | "Perfecto: empiezas con nota de venta, con tu inventario y caja cuadrados desde el día uno. Cuando actives facturación en Configuración, las ventas nuevas salen como boleta o factura — el historial de notas se conserva tal cual." |
| *"¿Y si SUNAT me fiscaliza y aún no terminé el trámite?"* | "Si activaste facturación: emites CPE válidos (KipusPay puede operar como PSE). Si estás en control interno: la nota de venta dice claramente que no es comprobante SUNAT — no te hacemos pasar una cosa por otra." |
| *"¿Y si se corta el internet varios días?"* | "Sigues vendiendo mientras el dispositivo tenga espacio y el flujo offline esté disponible. Al volver, KipusPay sincroniza lo pendiente y te avisa si algo se acerca al plazo; el banner indica qué está confirmado y qué aún está pendiente. La caja no se apaga." |
| *"¿Qué pasa si un día me rebota el pago de la suscripción?"* | "Nunca te apagamos en medio de una venta. Tienes días de gracia con aviso claro para actualizar tu tarjeta, y sigues cobrando con normalidad mientras tanto — eso también es parte de la promesa de 'el POS que no se cae'." |
| *"¿Manejan promociones u ofertas?"* | Tras el Quality Gate del **Sprint 30** (GTM-15): sí, motor de promociones (2x1, % fijo, tramos) con el precio final impuesto por el servidor. Antes del gate: roadmap con fecha de gate; no afirmar "promos" como listas. |
| *"¿Puedo controlar las compras a proveedores?"* | Sí (GTM-13 / Cadena): recepción parcial de OC (Sprint 20) y matching 3-way OC + recepción + factura (Sprint 29). Si la factura no cuadra en cantidad o precio, KipusPay exige corrección o un override autorizado auditado; con 3-way activo el CxP se abre al match de factura, no al recibir. |
| *"¿Tienen apartados o reserva de mercadería?"* | Sí (QG Sprint 32 / GTM-17): apartados con abonos que no emiten comprobante hasta convertir a venta. Diario Cadena (GTM-14) solo lectura y bit-consistente con el export. |
| *"¿Puedo emitir cotizaciones / presupuestos?"* | Sí (QG Sprint 33 / GTM-19): precio congelado COM-05, sin comprobante ni reserva hasta convertir. Vencida → recotizar. Distinto de apartado. |
| *"¿Puedo devolver mercadería al proveedor?"* | Sí (QG Sprint 34 / GTM-20): revierte stock+PMP+CxP; 0 CPE nuestro; mismatch = 422 o override auditado. Distinto de devolución a cliente. |
| *"¿Puedo vender vales / gift cards?"* | Sí (QG Sprint 35 / GTM-21): vale = venta (doc+cupo); canje lo impone el servidor; NC sin reembolso+consent → crédito. Distinto de GTM-05 y GTM-20. |
| *"¿Puedo cobrar en cuotas?"* | Sí (QG Sprint 36 / GTM-22): schedule sobre AR; solo principal reduce CxC; atraso no corta caja. Distinto de apartado (GTM-17) y vale (GTM-21). |
| *"¿Manejan tallas/colores o venta por peso?"* | Variantes y unidades tras el Quality Gate del **Sprint 31** (GTM-16); venta por peso/balanza tras los gates de **Sprints 38–42** (GTM-17). Antes: productos simples y cobro por unidad. |

---

## 9. Métricas de Éxito Comercial (Qué Mirar, No Solo Qué Construir)

Para que la v9 se valide como éxito comercial y no solo como producto bien construido, el negocio debe monitorear desde el día uno:

- **Time-to-first-sale (TTFS):** minutos entre el registro y la primera venta emitida (nota de venta o boleta, según etapa) — el indicador más directo de si el onboarding zero-fricción realmente funciona. Meta: bajo 5 minutos para el 80% de los registros.
- **Tasa de upgrade de formalización:** % de tenants en control interno que activan facturación electrónica (FORMALIZING / ELECTRONIC_ISSUER) en 90 días — valida el growth path de formalización.
- **Tasa de activación de prueba a pago:** porcentaje de negocios que, tras los 30 días de prueba real, se convierten en clientes pagos — mide si la propuesta de valor sobrevive el contacto con el uso real, no solo con el copy de la landing.
- **Net Revenue Retention (NRR) por upgrade de plan:** cuántos clientes de Arranque suben a Crece al agregar una segunda caja, abrir un segundo local, activar Modo Dueño **o** al acumular sobregiro — valida expansión natural **sin** apagar la caja por volumen.
- **Coeficiente de referidos (K-factor):** cuántos clientes nuevos trae, en promedio, cada cliente existente vía el loop de referidos — el indicador de si el crecimiento se vuelve compuesto o depende linealmente de gasto en adquisición pagada.
- **Adopción de capabilities profundas (diagnóstico NRR):** % de tenants de Crece/Cadena que activan cada capability de FASE 6B/6D (promociones, variantes/unidades, apartados, ubicaciones/racks) en los primeros 90 días tras su Quality Gate — diagnostica si el upgrade natural (NRR) viene de features profundas de retención y no solo de cajas/locales/sobregiro.
