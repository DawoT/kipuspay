import type { VerticalLanding, VerticalSlug } from './types.js';

const BY_SLUG: Readonly<Record<VerticalSlug, VerticalLanding>> = {
  restaurantes: {
    slug: 'restaurantes',
    navLabel: 'Restaurantes y cafeterías',
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
        a: 'Sigues cobrando igual. Cuando vuelve la señal, el envío de comprobantes se completa solo.',
      },
      {
        q: '¿Necesito una impresora especial?',
        a: 'No. Empiezas con el comprobante digital y conectas la impresora térmica después; nunca bloquea el cobro.',
      },
      {
        q: '¿Puedo dividir cuentas entre varios clientes en una misma mesa?',
        a: 'Sí. Puedes separar consumos o cobrar partes iguales con distintos medios de pago (efectivo, tarjeta o billetera digital) emitiendo el comprobante correspondiente para cada comensal.',
      },
      {
        q: '¿Cómo controlo las recetas y el consumo de insumos en cocina?',
        a: 'Puedes vincular los platos de tu carta a sus insumos principales, de modo que cada venta descuente automáticamente las porciones y alerten cuando sea momento de reponer en almacén.',
      },
    ],
    checkout: {
      documentLabel: 'Boleta electrónica',
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
        title: 'Boleta y factura en mesa',
        description: 'Emisión directa ante SUNAT para cada comensal',
      },
      {
        icon: 'sync',
        title: 'Caja continua en salón',
        description: 'Cobra sin pausas aunque se corte la conexión',
      },
    ],
  },
  farmacias: {
    slug: 'farmacias',
    navLabel: 'Farmacias y boticas',
    title: 'KipusPay para farmacias',
    pain: 'Despacha medicamentos en segundos, encuentra precios y presentaciones al instante y mantén el control estricto de tu inventario con total tranquilidad tributaria.',
    hook: 'Atención ágil en mostrador, stock protegido y SUNAT al día.',
    metaDescription:
      'POS para farmacias y boticas: despacho ágil, control FEFO de lotes y emisión SUNAT sin demoras.',
    points: [
      'Búsqueda instantánea por principio activo, nombre comercial y presentación',
      'Emisión inmediata de boletas y facturas con DNI o RUC en un solo toque',
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
        relief: 'Emisión automática y 100% legal ante SUNAT en segundos.',
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
        q: '¿Puedo emitir boleta y factura?',
        a: 'Sí, según tu etapa. Si aún te estás formalizando, cobras con nota de venta de control interno, siempre etiquetada como tal.',
      },
      {
        q: '¿Cuánto demora cargar mi catálogo?',
        a: 'Puedes importarlo desde un archivo CSV y cobrar el mismo día.',
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
      documentLabel: 'Boleta electrónica',
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
        title: 'SUNAT con DNI o RUC',
        description: 'Emisión electrónica inmediata en un solo toque',
      },
    ],
  },
  retail: {
    slug: 'retail',
    navLabel: 'Retail y minimarkets',
    title: 'KipusPay para retail y minimarkets',
    pain: 'Todo lo que tu minimarket, ferretería o tienda necesita para despachar sin colas, registrar cada producto por código de barras y ver tus ganancias diarias en tiempo real.',
    hook: 'Ventas rápidas, stock al día y control total de tus tiendas.',
    metaDescription:
      'POS para retail y tiendas: escaneo ágil, inventario en tiempo real y arqueos automáticos sol a sol.',
    points: [
      'Escaneo ágil de productos con código de barras y venta rápida en un toque',
      'Inventario actualizado en tiempo real que descuenta al instante en cada venta',
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
        a: 'Sí. Cada local tiene su caja y los ves juntos en Modo Dueño; el ranking de locales depende de tu plan.',
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
        a: 'Sí. Cualquier lector de código de barras USB o Bluetooth funciona de inmediato al conectarlo, permitiendo un cobro ágil y continuo en mostrador.',
      },
      {
        q: '¿Puedo vender por peso conectando una balanza digital?',
        a: 'Sí. Puedes conectar una balanza digital compatible para lectura automática del peso o ingresar el peso manualmente en pantalla con cálculo instantáneo del precio total.',
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
        description: 'Ventas, arqueos y ganancias en tiempo real',
      },
      {
        icon: 'shield-check',
        title: '100% legal ante SUNAT',
        description: 'Boletas y facturas emitidas en automático',
      },
    ],
  },
  servicios: {
    slug: 'servicios',
    navLabel: 'Servicios y talleres',
    title: 'KipusPay para servicios',
    pain: 'El sistema ágil y directo para consultorios, talleres, salones de belleza y profesionales. Factura a empresas o emite boletas a tus clientes en segundos desde cualquier equipo.',
    hook: 'Cobra tus servicios en un clic, sin complicaciones de inventario.',
    metaDescription:
      'POS para servicios y profesionales: cobra en segundos, factura a empresas y opera sin complicaciones.',
    points: [
      'Cobro ágil y directo de servicios sin exigencia de inventario ni campos innecesarios',
      'Emisión de facturas electrónicas a empresas con RUC y boletas a clientes al instante',
      'Listo para operar en 5 minutos desde cualquier tablet, computadora o celular',
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
        relief: 'Facturación electrónica ágil con validación de RUC y DNI al instante.',
      },
      {
        icon: 'reloj',
        pain: 'Sistemas complejos que demoran días en configurarse y capacitar al personal.',
        relief: 'Tu primera venta lista en menos de 5 minutos, fácil e intuitivo.',
      },
    ],
    faq: [
      {
        q: '¿Me sirve si no manejo inventario?',
        a: 'Sí. Cobras sin stock y sin campos que no usas.',
      },
      {
        q: '¿Puedo emitir factura a empresas?',
        a: 'Sí. Al activar facturación electrónica, la caja te pide el RUC del cliente.',
      },
      {
        q: '¿Y si todavía no estoy formalizado?',
        a: 'Empiezas con nota de venta de control interno y activas facturación desde Configuración, sin perder historial.',
      },
      {
        q: '¿Puedo emitir cotizaciones antes de confirmar el trabajo?',
        a: 'Sí. Creas una cotización con los servicios presupuestados y, cuando el cliente aprueba, la conviertes en comprobante de pago en un solo toque sin redigitar.',
      },
      {
        q: '¿Puedo registrar anticipos o pagos en cuotas por servicios realizados?',
        a: 'Sí. Puedes registrar abonos parciales, controlar el saldo pendiente de cada cliente y emitir el comprobante correspondiente con total transparencia.',
      },
    ],
    checkout: {
      documentLabel: 'Factura electrónica',
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
        title: '100% legal ante SUNAT',
        description: 'Facturación electrónica sin trámites lentos',
      },
      {
        icon: 'smartphone',
        title: 'Control de clientes',
        description: 'Historial de trabajos y cuentas por cobrar',
      },
    ],
  },
  cadenas: {
    slug: 'cadenas',
    navLabel: 'Cadenas y multi-local',
    title: 'KipusPay para cadenas y multi-local',
    pain: 'Supervisa el rendimiento de cada local, compara ventas y consolida tus reportes desde tu celular con Modo Dueño. La solución robusta y escalable para negocios en expansión.',
    hook: 'Todas tus sucursales bajo control en una sola pantalla.',
    metaDescription:
      'POS para cadenas y sucursales: supervisa todos tus locales, compara ventas y gestiona con Modo Dueño.',
    points: [
      'Panel unificado para supervisar todas tus sucursales y cajas en tiempo real',
      'Comparativa y ranking de locales en vivo con Modo Dueño en tu celular',
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
        relief: 'Información sincronizada en tiempo real disponible desde tu celular.',
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
      documentLabel: 'Boleta electrónica',
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
        description: 'Métricas y stock de todas las sedes en vivo',
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
  },
};

export const VERTICAL_SLUGS: readonly VerticalSlug[] = [
  'restaurantes',
  'farmacias',
  'retail',
  'servicios',
  'cadenas',
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
