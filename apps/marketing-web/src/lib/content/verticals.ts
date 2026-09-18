import type { VerticalLanding, VerticalSlug } from './types.js';

const BY_SLUG: Readonly<Record<VerticalSlug, VerticalLanding>> = {
  restaurantes: {
    slug: 'restaurantes',
    navLabel: 'Restaurantes y cafeterías',
    shortLabel: 'Restaurantes',
    title: 'KipusPay para restaurantes',
    pain: 'El sistema de punto de venta pensado para el ritmo de la gastronomía peruana: atiende rápido, divide cuentas con facilidad y mantén tu salón y tu caja en perfecta sintonía.',
    hook: 'Mesas llenas, salón fluido y cuentas al instante.',
    metaDescription:
      'POS para restaurantes y gastronomía: atiende rápido, divide cuentas y mantén cocina y caja en sintonía.',
    points: [
      'Cobro en segundos en salón y mostrador, con efectivo, tarjeta y billeteras digitales',
      'Control de platos e insumos con recetas y descuento automático de inventario',
      'Cierres de turno y arqueos automáticos transparentes, sol a sol',
    ],
    pains: [
      {
        icon: 'reloj',
        pain: 'En hora punta las comandas y cuentas divididas generan demoras en caja.',
        relief: 'Atención ágil en mesa y mostrador, sin colas ni confusiones.',
      },
      {
        icon: 'senal',
        pain: 'Se corta el internet un viernes en la noche y tememos no poder cobrar.',
        relief: 'Sigues cobrando con total normalidad; la sincronización es automática.',
      },
      {
        icon: 'caja',
        pain: 'Cerrar caja al final del servicio toma tiempo y genera diferencias.',
        relief: 'Cierres de turno automáticos y cuentas claras al instante.',
      },
    ],
    faq: [
      {
        q: '¿Funciona con varias mesas abiertas a la vez?',
        a: 'Sí: cobras cada cuenta desde la misma caja. Las comandas de cocina sincronizadas están en el roadmap y las mostramos como tales, nunca como disponibles.',
      },
      {
        q: '¿Qué pasa si se corta el internet en plena noche?',
        a: 'Puedes seguir registrando ventas según la configuración de tu caja. Al volver la conexión, los datos pendientes se sincronizan; las funciones fiscales dependen de la habilitación del negocio y de la respuesta de SUNAT.',
      },
      {
        q: '¿Necesito una impresora especial?',
        a: 'La impresión física es opcional y se puede configurar después. El documento disponible depende de la habilitación de tu negocio.',
      },
      {
        q: '¿Puedo dividir cuentas entre varios clientes en una misma mesa?',
        a: 'Puedes separar consumos o cobrar partes iguales con distintos medios de pago. El documento disponible depende de la habilitación del negocio; SUNAT determina la aceptación de cada comprobante.',
      },
      {
        q: '¿Cómo controlo las recetas y el consumo de insumos en cocina?',
        a: 'Puedes vincular los platos de tu carta a sus insumos principales, de modo que cada venta descuente automáticamente las porciones y alerten cuando sea momento de reponer en almacén.',
      },
    ],
    checkout: {
      documentLabel: 'Ejemplo de venta',
      register: 'Caja salón',
      syncState: 'pending',
      caption: 'Ejemplo de una cuenta en hora punta.',
      lines: [
        { qty: 2, name: 'Menú del día', amount_cents: 3600 },
        { qty: 1, name: 'Chicha morada 1L', amount_cents: 900 },
        { qty: 1, name: 'Postre del día', amount_cents: 800 },
      ],
    },
    featuredClaimId: 'kds_split',
    heroPoster: '/media/og-restaurantes.png',
    heroBadges: [
      {
        icon: 'lightning',
        title: 'División de cuentas',
        description: 'Separa consumos o partes iguales en segundos',
      },
      {
        icon: 'document',
        title: 'Control de insumos',
        description: 'Descuento automático de recetas y porciones',
      },
      {
        icon: 'shield-check',
        title: 'Documentos según habilitación',
        description: 'Las opciones fiscales dependen de la habilitación del negocio',
      },
      {
        icon: 'sync',
        title: 'Caja continua en salón',
        description: 'La continuidad de la caja depende de su configuración y conexión disponible',
      },
    ],
    modules: [
      {
        id: 'kds-cocina',
        title: 'Comandas de cocina (en preparación)',
        subtitle: 'Integración aún no disponible',
        icon: 'lightning',
        tag: 'OPERACIÓN SALÓN',
        description:
          'La integración entre las comandas de mesa y una pantalla de cocina está en preparación y aún no está disponible para uso general.',
        highlights: [
          'La disponibilidad se comunicará cuando se habilite',
          'No se ofrece sincronización de cocina en este momento',
          'La caja de venta continúa como flujo independiente',
        ],
      },
      {
        id: 'division-cuentas',
        title: 'División Flexible de Cuentas',
        subtitle: 'Cobro rápido por comensal',
        icon: 'document',
        tag: 'EXPERIENCIA COMENSAL',
        description:
          'Permite organizar consumos individuales o partes iguales y registrar los pagos por comensal. El documento disponible depende de la habilitación fiscal del negocio.',
        highlights: [
          'División en partes iguales o por ítem consumido',
          'Múltiples medios de pago en la misma mesa',
          'Documento disponible según la habilitación del negocio',
        ],
      },
      {
        id: 'mapa-salon',
        title: 'Plano y Mapa de Mesas',
        subtitle: 'Monitoreo visual del salón',
        icon: 'panel',
        tag: 'GESTIÓN SALÓN',
        description:
          'Consulta el estado registrado de cada mesa: libre, ocupada, por cobrar o reservada. Asigna mozos y organiza la rotación desde la caja.',
        highlights: [
          'Estados de mesa con código de color intuitivo',
          'Asignación de mozo y comensales por mesa',
          'Consumo acumulado y tiempo de ocupación registrados',
        ],
      },
    ],
  },
  farmacias: {
    slug: 'farmacias',
    navLabel: 'Farmacias y boticas',
    shortLabel: 'Farmacias',
    title: 'KipusPay para farmacias',
    pain: 'Encuentra precios y presentaciones de medicamentos y organiza el inventario de tu farmacia o botica.',
    hook: 'Atención ágil en mostrador y control de inventario.',
    metaDescription: 'POS para farmacias y boticas: despacho ágil, control de lotes y existencias.',
    points: [
      'Búsqueda instantánea por principio activo, nombre comercial y presentación',
      'Datos de cliente asociados al documento habilitado para el negocio',
      'Alertas automáticas de stock mínimo y control de lotes con vencimientos (FEFO)',
    ],
    pains: [
      {
        icon: 'etiqueta',
        pain: 'El cliente espera en mostrador mientras buscamos presentaciones o precios.',
        relief: 'Catálogo rápido con búsqueda por principio activo o marca al instante.',
      },
      {
        icon: 'documento',
        pain: 'Emisión de boletas y facturas con DNI/RUC genera demoras en hora punta.',
        relief:
          'Las opciones de facturación dependen de la habilitación; SUNAT determina la aceptación de cada comprobante.',
      },
      {
        icon: 'cuaderno',
        pain: 'Medicamentos vencidos o quiebres imprevistos de stock crítico.',
        relief: 'Control FEFO por lote con alertas preventivas de reposición.',
      },
    ],
    faq: [
      {
        q: '¿Controla los vencimientos de cada lote?',
        a: 'Sí: control de vencimientos por lote (FEFO) para priorizar la salida de productos según su fecha de expiración, con descuento de inventario al vender y aviso de stock mínimo.',
      },
      {
        q: '¿Qué documentos puedo usar en la caja?',
        a: 'La nota de venta sirve para el control interno y no es un comprobante autorizado por SUNAT. Las opciones de facturación electrónica aún no están disponibles para activación general.',
      },
      {
        q: '¿Cómo puedo cargar mi catálogo?',
        a: 'Puedes revisar la plantilla CSV disponible y preparar los datos del catálogo antes de importarlos.',
      },
      {
        q: '¿Puedo buscar medicamentos por principio activo o laboratorio?',
        a: 'Sí. El buscador inteligente del mostrador te permite encontrar medicamentos por nombre comercial, principio activo, concentración o laboratorio en milisegundos.',
      },
      {
        q: '¿Cómo manejo la venta de pastillas por caja, blíster o unidad suelta?',
        a: 'Configuras factores de fracción exactos: el sistema descuenta las unidades individuales del inventario total y calcula el precio por fracción automáticamente sin descuadres.',
      },
    ],
    checkout: {
      documentLabel: 'Ejemplo de venta',
      register: 'Mostrador 1',
      syncState: 'synced',
      caption: 'Ejemplo de una venta de mostrador.',
      lines: [
        { qty: 1, name: 'Paracetamol 500mg x10', amount_cents: 450 },
        { qty: 2, name: 'Alcohol en gel 250ml', amount_cents: 1580 },
        { qty: 1, name: 'Termómetro digital', amount_cents: 2490 },
      ],
    },
    featuredClaimId: 'fefo_lots',
    heroPoster: '/media/og-farmacias.png',
    heroBadges: [
      {
        icon: 'lightning',
        title: 'Búsqueda instantánea',
        description: 'Por principio activo, laboratorio o marca comercial',
      },
      {
        icon: 'document',
        title: 'Control FEFO por lote',
        description: 'Prioriza vencimientos y previene pérdidas de stock',
      },
      {
        icon: 'cart',
        title: 'Venta fraccionada',
        description: 'Por caja, blíster o pastilla sin descuadres',
      },
      {
        icon: 'shield-check',
        title: 'Facturación según habilitación',
        description: 'Las opciones dependen de la habilitación fiscal del negocio',
      },
    ],
    modules: [
      {
        id: 'control-fefo',
        title: 'Control FEFO y Lotes',
        subtitle: 'Vencimientos bajo control',
        icon: 'shield-check',
        tag: 'CUMPLIMIENTO & CALIDAD',
        description:
          'Prioriza automáticamente la salida de los lotes con fecha de vencimiento más próxima. Evita pérdidas por mermas y asegura trazabilidad total.',
        highlights: [
          'Rotación First Expired, First Out automática',
          'Alertas preventivas de caducidad por semáforo',
          'Trazabilidad estricta por lote y laboratorio',
        ],
      },
      {
        id: 'fraccionamiento-med',
        title: 'Venta Fraccionada Exacta',
        subtitle: 'Por caja, blíster o pastilla',
        icon: 'cart',
        tag: 'MOSTRADOR ÁGIL',
        description:
          'Configura factores de conversión exactos. Despacha medicamentos en unidades sueltas sin descuadres en el inventario general ni cálculos manuales.',
        highlights: [
          'Descuento automático de inventario por unidad',
          'Cálculo instantáneo del precio fraccionado',
          'Control por blíster y unidad suelta en caja',
        ],
      },
      {
        id: 'receta-dni',
        title: 'Receta Médica y DNI/RUC',
        subtitle: 'Atención segura y formal',
        icon: 'document',
        tag: 'SUNAT & DIGEMID',
        description:
          'Organiza la información de recetas médicas y médicos tratantes asociada a cada despacho. Las opciones de facturación dependen de la habilitación del negocio.',
        highlights: [
          'Búsqueda instantánea por principio activo',
          'Registro y verificación de receta médica',
          'Opciones de facturación según la habilitación del negocio',
        ],
      },
    ],
  },
  retail: {
    slug: 'retail',
    navLabel: 'Retail y minimarkets',
    shortLabel: 'Retail',
    title: 'KipusPay para retail y minimarkets',
    pain: 'Herramientas para que tu minimarket, ferretería o tienda registre productos por código de barras y organice sus ventas, stock y cierres de caja.',
    hook: 'Ventas rápidas, stock al día y control total de tus tiendas.',
    metaDescription:
      'POS para retail y tiendas: escaneo de productos, control de inventario y arqueos de caja.',
    points: [
      'Escaneo ágil de productos con código de barras y venta rápida en un toque',
      'Inventario que se actualiza con las ventas sincronizadas',
      'Arqueos automáticos y control sol a sol con Modo Dueño desde tu celular',
    ],
    pains: [
      {
        icon: 'balanza',
        pain: 'Al cerrar la tienda la plata no cuadra y el inventario tiene diferencias.',
        relief: 'Cada producto y cada sol quedan registrados de forma inmutable.',
      },
      {
        icon: 'cuaderno',
        pain: 'En horas de alta afluencia la cola se traba buscando precios o códigos.',
        relief: 'Búsqueda instantánea y escaneo continuo a máxima velocidad.',
      },
      {
        icon: 'local',
        pain: 'Manejar más de un local complica saber cuánto se vendió realmente en el día.',
        relief: 'Ventas y caja de todas tus tiendas consolidadas en tu celular.',
      },
    ],
    faq: [
      {
        q: '¿Sirve si tengo dos o tres locales?',
        a: 'Puedes consultar la información disponible según el plan y la última sincronización. La antigüedad de los datos puede variar.',
      },
      {
        q: '¿Cómo sé si falta dinero en la caja?',
        a: 'El cierre compara lo esperado con lo contado y muestra la diferencia con total claridad. El arqueo ciego está en el roadmap.',
      },
      {
        q: '¿Puedo usarlo en la computadora que ya tengo?',
        a: 'Sí. Funciona en la tablet, el celular o la computadora que ya tienes, sin instalador.',
      },
      {
        q: '¿Es compatible con pistolas lectoras de código de barras?',
        a: 'La compatibilidad depende del modelo del lector, el sistema operativo y el navegador. Confirma el modelo probado antes de comprar o conectarlo.',
      },
      {
        q: '¿Puedo vender por peso conectando una balanza digital?',
        a: 'La lectura automática depende del modelo de balanza. El ingreso manual puede estar disponible según la configuración y los permisos del negocio.',
      },
    ],
    checkout: {
      documentLabel: 'Nota de venta',
      register: 'Caja 1',
      syncState: 'pending',
      caption: 'Ejemplo de control interno, antes de formalizar.',
      lines: [
        { qty: 3, name: 'Gaseosa 500ml', amount_cents: 1050 },
        { qty: 1, name: 'Detergente 900g', amount_cents: 1190 },
        { qty: 2, name: 'Fideos 500g', amount_cents: 760 },
      ],
    },
    featuredClaimId: 'blind_z_audit',
    heroPoster: '/media/og-retail.png',
    heroBadges: [
      {
        icon: 'lightning',
        title: 'Lector de código de barras',
        description: 'Escaneo ágil de productos para cobrar sin colas',
      },
      {
        icon: 'cart',
        title: 'Control de variantes',
        description: 'Tallas, colores, marcas y categorías en orden',
      },
      {
        icon: 'smartphone',
        title: 'Modo Dueño en el celular',
        description: 'Ventas, arqueos y ganancias según la última sincronización',
      },
      {
        icon: 'shield-check',
        title: 'Facturación según habilitación',
        description: 'Las opciones fiscales dependen de la habilitación del negocio',
      },
    ],
    modules: [
      {
        id: 'caja-express-barcode',
        title: 'Caja Express con Código de Barras',
        subtitle: 'Escaneo a máxima velocidad',
        icon: 'lightning',
        tag: 'COBRO RÁPIDO',
        description:
          'Lectura continua con pistolas de código de barras USB y Bluetooth. Despacha sin colas en horas punta con cálculo instantáneo de vuelto.',
        highlights: [
          'Lectura EAN-13 en 0.1 segundos por producto',
          'Calculadora interactiva de vuelto durante el cobro',
          'Apertura automática de gaveta y ticket limpio',
        ],
      },
      {
        id: 'balanza-pesables',
        title: 'Integración con Balanza Digital',
        subtitle: 'Venta fluida por peso',
        icon: 'balanza',
        tag: 'PRODUCTOS A GRANEL',
        description:
          'Conecta balanzas digitales para pesar carnes, frutas, verduras y embutidos. Captura el peso neto con tara y calcula el precio exacto al instante.',
        highlights: [
          'Lectura de peso sujeta a compatibilidad del modelo',
          'Tara automática y manual en mostrador',
          'Cálculo exacto sol a sol por gramo pesado',
        ],
      },
      {
        id: 'promociones-combos',
        title: 'Combos y Promociones 2x1',
        subtitle: 'Motor de ofertas automáticas',
        icon: 'etiqueta',
        tag: 'FIDELIZACIÓN',
        description:
          'Aplica descuentos automáticos por volumen, combos del día y ofertas 2x1 en caja sin que el cajero deba memorizar o calcular descuentos.',
        highlights: [
          'Promociones 2x1 y 3x2 automáticas en ticket',
          'Packs y combos con descuento porcentual',
          'Ahorro del cliente visible en pantalla y boleta',
        ],
      },
    ],
  },
  servicios: {
    slug: 'servicios',
    navLabel: 'Servicios y talleres',
    shortLabel: 'Servicios',
    title: 'KipusPay para servicios',
    pain: 'Una caja para consultorios, talleres, salones de belleza y profesionales que necesitan registrar servicios, pagos y datos de clientes.',
    hook: 'Cobra tus servicios en un clic, sin complicaciones de inventario.',
    metaDescription:
      'POS para servicios y profesionales: cobra en segundos, factura a empresas y opera sin complicaciones.',
    points: [
      'Cobro ágil y directo de servicios sin exigencia de inventario ni campos innecesarios',
      'Registro de datos comerciales de clientes y servicios prestados',
      'Configuración guiada desde una tablet, computadora o celular',
    ],
    pains: [
      {
        icon: 'caja',
        pain: 'Los sistemas tradicionales me exigen inventario y campos que no necesito.',
        relief: 'Cobras tus servicios directamente sin complicaciones de stock.',
      },
      {
        icon: 'documento',
        pain: 'Emitir facturas a empresas o boletas a clientes toma demasiado tiempo.',
        relief:
          'Las opciones de facturación dependen de la habilitación del negocio y de la respuesta de SUNAT.',
      },
      {
        icon: 'reloj',
        pain: 'Sistemas complejos que demoran días en configurarse y capacitar al personal.',
        relief:
          'Prepara una primera venta con la guía; el tiempo depende de los datos y la configuración de tu negocio.',
      },
    ],
    faq: [
      {
        q: '¿Me sirve si no manejo inventario?',
        a: 'Sí. Cobras sin stock y sin campos que no usas.',
      },
      {
        q: '¿Puedo emitir factura a empresas?',
        a: 'Las opciones de facturación electrónica aún no están disponibles para activación general. SUNAT determina la aceptación de cada comprobante.',
      },
      {
        q: '¿Y si todavía no estoy formalizado?',
        a: 'Puedes empezar con una nota de venta de control interno. Las opciones de facturación electrónica aún no están disponibles para activación general.',
      },
      {
        q: '¿Puedo emitir cotizaciones antes de confirmar el trabajo?',
        a: 'Puedes registrar los servicios y revisar las opciones de cotización disponibles en tu plan. El documento de una venta depende de la habilitación del negocio.',
      },
      {
        q: '¿Puedo registrar anticipos o pagos parciales por servicios?',
        a: 'Las opciones de abonos y cuentas por cobrar dependen de la configuración del negocio. El documento disponible depende de la habilitación fiscal.',
      },
    ],
    checkout: {
      documentLabel: 'Ejemplo de venta',
      register: 'Recepción',
      syncState: 'synced',
      caption: 'Ejemplo de un cobro sin inventario.',
      lines: [
        { qty: 1, name: 'Mantenimiento preventivo', amount_cents: 12000 },
        { qty: 1, name: 'Diagnóstico', amount_cents: 4500 },
      ],
    },
    featuredClaimId: 'services_core',
    heroPoster: '/media/og-servicios.png',
    heroBadges: [
      {
        icon: 'document',
        title: 'Cotizaciones a factura',
        description: 'Convierte presupuestos en facturas en un solo clic',
      },
      {
        icon: 'lightning',
        title: 'Cobro con Yape y tarjetas',
        description: 'Acepta pagos presenciales o transferencias',
      },
      {
        icon: 'shield-check',
        title: 'Facturación según habilitación',
        description: 'Las opciones fiscales dependen de la habilitación del negocio',
      },
      {
        icon: 'smartphone',
        title: 'Control de clientes',
        description: 'Historial de trabajos y cuentas por cobrar',
      },
    ],
    modules: [
      {
        id: 'ordenes-taller-b2b',
        title: 'Órdenes de Trabajo y Factura B2B',
        subtitle: 'Gestión de servicios y repuestos',
        icon: 'document',
        tag: 'OPERACIONES B2B',
        description:
          'Organiza mano de obra y repuestos en órdenes de trabajo estructuradas. Los documentos disponibles dependen de la habilitación del negocio.',
        highlights: [
          'Desglose detallado de mano de obra y repuestos',
          'Registro de los datos de facturación del cliente',
          'Documento disponible según la habilitación del negocio',
        ],
      },
      {
        id: 'historial-placa-cliente',
        title: 'Historial por Placa y Cliente',
        subtitle: 'Trazabilidad y recurrencia',
        icon: 'smartphone',
        tag: 'FIDELIZACIÓN',
        description:
          'Consulta los mantenimientos anteriores, repuestos utilizados y kilometraje con solo ingresar la placa del vehículo o el nombre del cliente.',
        highlights: [
          'Búsqueda instantánea por placa o RUC/DNI',
          'Línea de tiempo con fechas y comprobantes emitidos',
          'Carga de datos en nueva orden en un solo toque',
        ],
      },
      {
        id: 'detracciones-sunat',
        title: 'Información tributaria',
        subtitle: 'Sujeta a habilitación fiscal',
        icon: 'shield-check',
        tag: 'TRIBUTARIO SUNAT',
        description:
          'Las detracciones y los documentos tributarios dependen de la habilitación fiscal y de las reglas aplicables al negocio.',
        highlights: [
          'Consulta las reglas tributarias aplicables antes de operar',
          'No se confirma aceptación sin respuesta oficial',
          'La emisión depende de la habilitación fiscal',
        ],
      },
    ],
  },
  cadenas: {
    slug: 'cadenas',
    navLabel: 'Cadenas y multi-local',
    shortLabel: 'Cadenas',
    title: 'KipusPay para cadenas y multi-local',
    pain: 'Supervisa el rendimiento de cada local, compara ventas y consolida tus reportes desde tu celular con Modo Dueño. La solución robusta y escalable para negocios en expansión.',
    hook: 'Todas tus sucursales bajo control en una sola pantalla.',
    metaDescription:
      'POS para cadenas y sucursales: supervisa todos tus locales, compara ventas y gestiona con Modo Dueño.',
    points: [
      'Panel unificado para revisar sucursales y cajas a medida que sincronizan',
      'Comparativa y ranking de locales según la información sincronizada y tu plan',
      'Transferencias de mercadería y control de inventario con trazabilidad total',
    ],
    pains: [
      {
        icon: 'panel',
        pain: 'Tener que pedir reportes por chat a cada administrador de sucursal.',
        relief: 'Consolidado de ventas y caja de todas tus tiendas en una sola pantalla.',
      },
      {
        icon: 'caja',
        pain: 'Cada local maneja sus arqueos de manera dispersa y sin estandarización.',
        relief: 'Mismo proceso claro de arqueo y cierre en todas las sucursales.',
      },
      {
        icon: 'reloj',
        pain: 'Los reportes consolidados llegan tarde para tomar decisiones operativas.',
        relief:
          'Consulta desde tu celular la información disponible según la última sincronización.',
      },
    ],
    faq: [
      {
        q: '¿Veo todos mis locales en un solo lugar?',
        a: 'Sí, en Modo Dueño. Los datos se actualizan a medida que cada caja sincroniza con total estabilidad.',
      },
      {
        q: '¿Puedo comparar qué local vende más?',
        a: 'El ranking de locales es un reporte avanzado del plan Crece+.',
      },
      {
        q: '¿Y las transferencias entre locales?',
        a: 'Sí: registras transferencias de mercadería y control de merma entre tus sucursales con trazabilidad completa.',
      },
      {
        q: '¿Cómo controlo las compras y recepciones en almacén central?',
        a: 'Puedes generar órdenes de compra, registrar recepciones parciales o totales de mercadería y cotejar contra la factura del proveedor antes de autorizar el pago.',
      },
      {
        q: '¿Puedo asignar permisos diferenciados para administradores y cajeros?',
        a: 'Sí. Defines roles con permisos específicos: los cajeros solo operan su turno de venta, mientras que los administradores y dueños acceden a reportes y transferencias.',
      },
    ],
    checkout: {
      documentLabel: 'Ejemplo de venta',
      register: 'Local Centro · Caja 2',
      syncState: 'synced',
      caption: 'Ejemplo de una caja de sucursal.',
      lines: [
        { qty: 1, name: 'Café molido 250g', amount_cents: 2290 },
        { qty: 2, name: 'Galletas surtidas', amount_cents: 840 },
        { qty: 1, name: 'Agua mineral 2.5L', amount_cents: 590 },
      ],
    },
    featuredClaimId: 'owner_ranking',
    secondaryClaimId: 'merma_xfer',
    heroPoster: '/media/og-cadenas.png',
    heroBadges: [
      {
        icon: 'institution',
        title: 'Control multi-local',
        description: 'Métricas y stock según la última sincronización',
      },
      {
        icon: 'sync',
        title: 'Transferencias entre tiendas',
        description: 'Mueve mercadería y coteja recepciones',
      },
      {
        icon: 'shield-check',
        title: 'Permisos por cajero y sede',
        description: 'Control de accesos y arqueos independientes',
      },
      {
        icon: 'lightning',
        title: 'Sincronización robusta',
        description: 'Cada sucursal opera con total autonomía',
      },
    ],
    modules: [
      {
        id: 'modo-dueno-multisede',
        title: 'Modo Dueño Consolidado',
        subtitle: 'Control total en tu celular',
        icon: 'smartphone',
        tag: 'MULTI-LOCAL',
        description:
          'Consulta ventas, transacciones y arqueos disponibles de tus sucursales. Los datos se actualizan a medida que las cajas sincronizan.',
        highlights: [
          'Ventas y métricas según la última sincronización',
          'Arqueos y cierres de turno transparentes',
          'Acceso móvil para supervisión remota según la última sincronización',
        ],
      },
      {
        id: 'transferencias-interlocales',
        title: 'Transferencias de Mercadería',
        subtitle: 'Trazabilidad entre sucursales',
        icon: 'sync',
        tag: 'LOGÍSTICA & STOCK',
        description:
          'Despacha y recibe productos entre almacén central y sucursales. Controla guías de remisión internas y coteja cantidades sin descuadres.',
        highlights: [
          'Solicitudes de despacho y recepción registradas',
          'Descuento e ingreso automático en inventario',
          'Trazabilidad total de envíos sin diferencias',
        ],
      },
      {
        id: 'ranking-metas-locales',
        title: 'Ranking de Locales y Metas',
        subtitle: 'Cumplimiento y rendimiento',
        icon: 'institution',
        tag: 'GESTIÓN COMERCIAL',
        description:
          'Monitorea el cumplimiento porcentual de metas diarias por sucursal. Identifica tiendas con mejor desempeño y optimiza inventario por local.',
        highlights: [
          'Porcentaje de cumplimiento de meta diaria',
          'Comparativa sol a sol de recaudación por sede',
          'Ticket promedio y volumen por punto de venta',
        ],
      },
    ],
  },
  grifos: {
    slug: 'grifos',
    navLabel: 'Grifos y estaciones de servicio',
    shortLabel: 'Grifos',
    title: 'KipusPay para grifos',
    pain: 'Organiza los despachos por surtidor y registra los cobros y movimientos de caja de tu estación de servicio.',
    hook: 'Despachos organizados y control de caja por turno.',
    metaDescription:
      'POS para grifos y estaciones de servicio: registro de despachos, precios y movimientos por turno.',
    points: [
      'Cobro por monto o volumen en segundos: efectivo, tarjeta y saldo de flota en un solo toque',
      'Opciones de facturación sujetas a habilitación fiscal del negocio',
      'Control de precios por combustible y reporte de despachos por turno e isleta',
    ],
    pains: [
      {
        icon: 'reloj',
        pain: 'En hora punta la cola de la isleta crece cuando el sistema tarda en registrar el cobro.',
        relief:
          'Registras el despacho y cobras en segundos, sin que la cola espere por el comprobante.',
      },
      {
        icon: 'documento',
        pain: 'Revisar los requisitos tributarios de cada operación con flotas puede consumir tiempo.',
        relief:
          'Las funciones fiscales dependen de la habilitación del negocio y de las reglas aplicables.',
      },
      {
        icon: 'caja',
        pain: 'Cuadrar la caja al cierre del turno con varios surtidores activos toma media hora.',
        relief:
          'Consulta el reporte de turno disponible para revisar despachos, montos y medios de pago registrados.',
      },
    ],
    faq: [
      {
        q: '¿Puede la caja ver varios surtidores al mismo tiempo?',
        a: 'Sí. Desde la misma pantalla gestionas todas las isletas activas y cobras cada despacho sin cambiar de vista.',
      },
      {
        q: '¿Qué debo considerar para facturar un despacho?',
        a: 'Las opciones de facturación electrónica aún no están disponibles para activación general. Los requisitos tributarios dependen de la operación y de las reglas vigentes.',
      },
      {
        q: '¿Puedo registrar datos de una flota y sus vehículos?',
        a: 'Las funciones de flota se habilitan según la configuración del negocio. Confirma su disponibilidad antes de depender de ellas en una operación.',
      },
      {
        q: '¿Qué pasa si se va el internet en pleno turno?',
        a: 'Puedes seguir registrando ventas según la configuración de tu caja. Al volver la conexión, se sincronizan los datos pendientes; no se promete envío fiscal automático.',
      },
      {
        q: '¿Cómo controlo el stock y las mermas de combustible en los tanques?',
        a: 'El sistema registra los despachos y permite cotejar el volumen registrado contra el aforo de tus tanques para revisar posibles diferencias.',
      },
    ],
    checkout: {
      documentLabel: 'Ejemplo de venta',
      register: 'Caja central',
      syncState: 'synced',
      caption: 'Ejemplo de despacho de Gasohol 95 en isleta 2.',
      lines: [
        { qty: 1, name: 'Gasohol 95 · 20.50 gal', amount_cents: 36490 },
        { qty: 1, name: 'Aceite motor 4T 1L', amount_cents: 3200 },
      ],
    },
    featuredClaimId: 'fuel_fleet',
    heroPoster: '/media/og-kipuspay.png',
    heroBadges: [
      {
        icon: 'lightning',
        title: 'Despacho por monto o volumen',
        description: 'El registro por monto o volumen depende de la configuración de la estación',
      },
      {
        icon: 'document',
        title: 'Facturación según habilitación',
        description: 'Las opciones y cálculos fiscales dependen de la habilitación del negocio',
      },
      {
        icon: 'shield-check',
        title: 'Facturación a flotas',
        description: 'Los datos registrados dependen del flujo habilitado para el negocio',
      },
      {
        icon: 'sync',
        title: 'Registro según conexión',
        description:
          'La continuidad y sincronización dependen de la configuración de la caja y la conexión disponible',
      },
    ],
    modules: [
      {
        id: 'surtidor-despacho',
        title: 'Control de Surtidores e Isletas',
        subtitle: 'Cobro en pista por monto o volumen',
        icon: 'lightning',
        tag: 'OPERACIÓN EN PISTA',
        description:
          'Consulta el estado registrado de cada isleta: libre, despachando o en espera de pago. Organiza el cobro desde la pantalla de pista.',
        highlights: [
          'Estado registrado de cada isleta con indicador visual',
          'Cobro por monto fijo o por volumen de galones',
          'Registro de placa y tipo de combustible por despacho',
        ],
      },
      {
        id: 'precios-dia',
        title: 'Tablero de Precios del Día',
        subtitle: 'Gestión rápida de la lista de precios',
        icon: 'panel',
        tag: 'GESTIÓN COMERCIAL',
        description:
          'Organiza los precios registrados para cada combustible. La actualización en otras cajas depende de su conexión; consulta la hora de la última sincronización.',
        highlights: [
          'Precios por combustible con fecha de actualización visible',
          'Indicador de vigencia y última actualización',
          'Información tributaria sujeta a habilitación fiscal',
        ],
      },
      {
        id: 'flota-b2b',
        title: 'Flota y Clientes Empresa',
        subtitle: 'Despacho y facturación a cuentas corporativas',
        icon: 'document',
        tag: 'FACTURACIÓN FLOTA',
        description:
          'Organiza los datos de tus clientes empresa y los despachos asociados según las funciones habilitadas para tu negocio.',
        highlights: [
          'Saldo de cuenta y límite de crédito por empresa',
          'Registro de placa, odómetro y chofer en cada despacho',
          'Las funciones de facturación dependen de la habilitación fiscal',
        ],
      },
    ],
  },
};

export const VERTICAL_SLUGS: readonly VerticalSlug[] = [
  'restaurantes',
  'farmacias',
  'retail',
  'servicios',
  'cadenas',
  'grifos',
];

export function getVertical(slug: string): VerticalLanding | null {
  if ((VERTICAL_SLUGS as readonly string[]).includes(slug)) {
    return BY_SLUG[slug as VerticalSlug];
  }
  return null;
}

export function allVerticals(): readonly VerticalLanding[] {
  return VERTICAL_SLUGS.map((s) => BY_SLUG[s]);
}

/** Los otros cuatro rubros, para el cruce interno entre landings. */
export function otherVerticals(slug: VerticalSlug): readonly VerticalLanding[] {
  return allVerticals().filter((v) => v.slug !== slug);
}
