/**
 * Blog de negocio — Guías prácticas y artículos para el comercio peruano.
 * Sin jerga técnica interna de infraestructura (V-26 / GTM §1).
 */

export interface BlogContextualCta {
  readonly title: string;
  readonly description: string;
  readonly buttonText: string;
  readonly buttonHref: string;
}

export interface BlogSection {
  readonly heading: string;
  readonly paragraphs: readonly string[];
}

export interface BlogPost {
  readonly slug: string;
  readonly title: string;
  readonly date: string;
  readonly audience: string;
  readonly excerpt: string;
  readonly coverImage: string;
  readonly coverAlt: string;
  readonly readingTimeMinutes: number;
  readonly category: string;
  readonly tags: readonly string[];
  readonly contextualCta?: BlogContextualCta;
  readonly sections: readonly BlogSection[];
}

export const BLOG_POSTS: readonly BlogPost[] = [
  {
    slug: 'primera-venta-el-mismo-dia',
    title: 'Tu primera venta el mismo día que te registras',
    date: '2026-08-01',
    audience: 'Comercios y emprendedores en etapa de inicio',
    excerpt:
      'Cómo pasar de abrir tu cuenta a cobrar en mostrador sin pelearte con cuadernos ni trámites interminables.',
    coverImage: '/media/blog/primera-venta.jpg',
    coverAlt: 'Mostrador de comercio con tablet y comprobante de venta emitido al instante',
    readingTimeMinutes: 4,
    category: 'Primeros Pasos',
    tags: ['Inicio rápido', 'Caja diaria', 'Sin conexión', 'Comprobantes'],
    contextualCta: {
      title: 'Empieza a cobrar hoy mismo',
      description: 'Configura tu caja en minutos y haz tu primera venta sin complicaciones.',
      buttonText: 'Crear cuenta gratis',
      buttonHref: '/empezar',
    },
    sections: [
      {
        heading: 'Del registro a la caja en cuatro pasos',
        paragraphs: [
          'Abrir tu punto de venta no debería requerir días de espera ni visitas técnicas costosas. Empiezas ingresando el nombre de tu negocio, eliges tu rubro principal y seleccionas tu etapa de formalización.',
          'Eso es todo el proceso inicial: la configuración avanzada de series, impresoras y logotipos se completa después a tu ritmo, asegurando que nada bloquee tu primera venta del día.',
        ],
      },
      {
        heading: 'La primera venta en el mismo día',
        paragraphs: [
          'Una vez dentro, vas directo a la pantalla de caja: seleccionas el producto o escribes el monto y cobras. Si todavía no cuentas con facturación electrónica activa, la venta se emite como nota de venta con leyenda clara de control interno.',
          'Cuando decidas activar comprobantes electrónicos, las ventas nuevas se emitirán como boletas o facturas válidas ante SUNAT, conservando tu historial previo intacto y ordenado.',
        ],
      },
      {
        heading: 'Si se corta el internet, tu mostrador no se detiene',
        paragraphs: [
          'Uno de los mayores temores al digitalizar la caja es quedarse sin señal en plena atención. Con KipusPay la caja sigue cobrando con total normalidad aunque no haya conexión a internet.',
          'Cada venta queda registrada de forma segura en tu dispositivo y se sincroniza automáticamente en cuanto vuelve la señal. Ningún cliente espera y ninguna venta se pierde.',
        ],
      },
      {
        heading: 'Qué preparar antes de empezar',
        paragraphs: [
          'Ten a la mano el número de RUC de tu negocio si ya lo tienes (o tu DNI si comienzas con control interno), el nombre comercial de tu local y una lista básica de tus productos o servicios más vendidos.',
          'Con esos tres elementos tienes todo lo necesario para atender a tu primer cliente en cuestión de minutos.',
        ],
      },
    ],
  },
  {
    slug: 'recomienda-y-gana-un-mes',
    title: 'Recomienda KipusPay y ambos ganan un mes',
    date: '2026-08-08',
    audience: 'Dueños de negocios que ya usan KipusPay',
    excerpt:
      'Un mes de servicio sin costo para quien refiere y un mes para el negocio que llega por tu invitación.',
    coverImage: '/media/blog/referidos.jpg',
    coverAlt: 'Dos comerciantes conversando y compartiendo su experiencia con KipusPay',
    readingTimeMinutes: 3,
    category: 'Crecimiento y Comunidad',
    tags: ['Programa de referidos', 'Mes gratis', 'Comunidad comercial'],
    contextualCta: {
      title: '¿Ya usas KipusPay en tu negocio?',
      description:
        'Comparte tu enlace de recomendación desde Modo Dueño y gana un mes gratis por cada negocio invitado.',
      buttonText: 'Ir a Modo Dueño',
      buttonHref: '/empezar',
    },
    sections: [
      {
        heading: 'Negocio recomienda negocio',
        paragraphs: [
          'Quien ya vende día a día con KipusPay conoce de primera mano cómo mejora la velocidad de atención y el control de caja. Nuestro programa de recomendación es directo: un mes de servicio para ti y un mes para el comercio que se registra con tu enlace.',
          'Sin comisiones ocultas, sin letras chicas y sin esquemas complicados. Crecemos juntos cuando a tu red de contactos comerciales le va bien.',
        ],
      },
      {
        heading: 'Dónde encontrar tu enlace personal',
        paragraphs: [
          'Desde la aplicación de Modo Dueño en tu teléfono móvil, accedes a la sección de recompensas y copias tu enlace exclusivo con un solo toque.',
          'Puedes enviarlo directamente por WhatsApp a dueños de restaurantes, minimarkets, farmacias o cualquier negocio de tu zona.',
        ],
      },
      {
        heading: 'Cuándo se acredita tu beneficio',
        paragraphs: [
          'En cuanto el negocio invitado completa su primera venta en el sistema, el mes de beneficio se suma automáticamente a la cuenta de ambos.',
          'No necesitas esperar a fin de mes ni hacer trámites adicionales: el beneficio se aplica en tu siguiente ciclo de servicio de manera transparente.',
        ],
      },
      {
        heading: 'Confianza entre comerciantes',
        paragraphs: [
          'Los dueños de negocio confían mucho más en la experiencia real de un colega de mostrador que en la publicidad tradicional.',
          'Cada comercio que sumas fortalece una red de negocios independientes que cobran más rápido y administran mejor sus ingresos diarios.',
        ],
      },
    ],
  },
  {
    slug: 'control-interno-sin-confundir',
    title: 'Control interno sin confundir a SUNAT ni a tu cliente',
    date: '2026-08-12',
    audience: 'Negocios en proceso de formalización tributaria',
    excerpt:
      'La nota de venta sirve para tu control interno de caja e inventario: claridad total para tu cliente y orden para tu negocio.',
    coverImage: '/media/blog/control-interno.jpg',
    coverAlt: 'Ticket de control interno impreso con leyenda clara y ordenada',
    readingTimeMinutes: 4,
    category: 'Control y Formalización',
    tags: ['Notas de venta', 'Control interno', 'SUNAT', 'Transparencia'],
    contextualCta: {
      title: 'Lleva el control de tu caja sin enredos',
      description:
        'Empieza con nota de venta y pasa a boletas electrónicas cuando tu negocio lo decida.',
      buttonText: 'Probar KipusPay gratis',
      buttonHref: '/empezar',
    },
    sections: [
      {
        heading: 'Qué es el control interno de ventas',
        paragraphs: [
          'Si estás iniciando tu emprendimiento o aún estás tramitando tu alta tributaria, necesitas saber con exactitud cuánto dinero entra y qué productos salen de tu mostrador.',
          'La nota de venta es el documento ideal para tu control interno: registra el detalle de cada compra, el medio de pago utilizado y la hora exacta, entregando un comprobante ordenado a tu cliente.',
        ],
      },
      {
        heading: 'Transparencia en cada ticket impreso',
        paragraphs: [
          'Es fundamental que la nota de venta no induzca a error. En KipusPay, cada ticket de control interno incluye una leyenda clara y visible que especifica que no constituye un comprobante de pago tributario.',
          'Nunca disfrazamos notas de venta como boletas: la honestidad en el mostrador protege la reputación de tu establecimiento y genera confianza en tus compradores.',
        ],
      },
      {
        heading: 'La transición fluida a comprobantes electrónicos',
        paragraphs: [
          'El día que obtienes tu autorización y decides emitir comprobantes electrónicos, solo activas la opción en tu panel de administración.',
          'A partir de ese instante, las ventas nuevas se emiten directamente como boletas o facturas electrónicas con envío a SUNAT, manteniendo todo tu historial previo de ventas para análisis comparativo.',
        ],
      },
      {
        heading: 'La experiencia de cobro permanece idéntica',
        paragraphs: [
          'Tus cajeros no necesitan aprender un sistema nuevo ni cambiar sus hábitos de cobro: la pantalla, la búsqueda de productos y el cobro funcionan exactamente igual.',
          'La única diferencia es el formato final del comprobante y el respaldo tributario que KipusPay gestiona de manera automática.',
        ],
      },
    ],
  },
  {
    slug: 'ruc-10-vs-ruc-20-emitir-boletas',
    title: 'RUC 10 vs RUC 20: Cuándo emitir boletas y facturas en tu negocio',
    date: '2026-08-15',
    audience: 'Emprendedores y comerciantes evaluando su formalización tributaria',
    excerpt:
      'Diferencias prácticas entre persona natural con negocio y empresa jurídica para emitir comprobantes electrónicos y ordenar tu caja diaria.',
    coverImage: '/media/blog/ruc10-vs-ruc20.jpg',
    coverAlt:
      'Comparativa visual entre RUC 10 con negocio unipersonal y RUC 20 para empresa jurídica',
    readingTimeMinutes: 6,
    category: 'Tributación y Formalización',
    tags: ['RUC 10', 'RUC 20', 'SUNAT', 'Boletas electrónicas', 'Formalización'],
    contextualCta: {
      title: 'Emite comprobantes con RUC 10 o RUC 20',
      description:
        'KipusPay se adapta a tu régimen tributario sin configuraciones complejas ni cobros adicionales.',
      buttonText: 'Empieza a facturar',
      buttonHref: '/empezar',
    },
    sections: [
      {
        heading: 'RUC 10 y RUC 20: La diferencia fundamental',
        paragraphs: [
          'Al iniciar un negocio en Perú, una de las primeras decisiones tributarias es determinar si operarás como Persona Natural con Negocio (RUC que inicia con 10) o constituirás una Persona Jurídica como SAC, EIRL o SRL (RUC que inicia con 20).',
          'El RUC 10 vincula directamente tu patrimonio personal con el del negocio: es rápido de tramitar y permite acogerse a regímenes simplificados como el Nuevo RUS. Por su parte, el RUC 20 separa legalmente tu patrimonio personal de las obligaciones de la empresa, facilitando la incorporación de socios y el acceso a créditos comerciales mayores.',
        ],
      },
      {
        heading: 'Qué comprobantes puedes emitir según tu tipo de RUC',
        paragraphs: [
          'Si tienes RUC 10 bajo el régimen del Nuevo RUS, puedes emitir boletas de venta físicas o electrónicas y guías de remisión, pero no estás facultado para emitir facturas que den derecho a crédito fiscal a empresas.',
          'Si cuentas con RUC 10 en Régimen Especial, MYPE Tributario o Régimen General, o si operas con RUC 20, tienes la obligación y facultad de emitir tanto boletas de venta electrónicas a consumidores finales como facturas electrónicas con detalle de RUC para clientes corporativos.',
        ],
      },
      {
        heading: 'Cómo agilizar la emisión electrónica en el mostrador',
        paragraphs: [
          'En la atención diaria de mostrador, el tiempo por transacción es oro. Pedir los datos de facturación no debería demorar la fila de clientes.',
          'Con un sistema de punto de venta moderno como KipusPay, basta con ingresar el número de DNI o RUC del cliente para que la razón social y dirección se completen al instante, emitiendo el ticket en menos de tres segundos.',
        ],
      },
      {
        heading: 'El valor de la formalización para crecer',
        paragraphs: [
          'Emitir comprobantes electrónicos de manera ordenada no solo cumple con las normativas de SUNAT, sino que te otorga un registro financiero fidedigno de tus ventas.',
          'Este historial de facturación es la principal carta de presentación para solicitar financiamiento bancario, negociar mejores plazos con proveedores mayoristas y expandir tu negocio abriendo nuevos locales.',
        ],
      },
    ],
  },
  {
    slug: 'como-cuadrar-caja-minimarket',
    title: 'Cómo cuadrar la caja de un minimarket al final del día sin faltantes',
    date: '2026-08-18',
    audience: 'Dueños y administradores de minimarkets, bodegas y tiendas de abarrotes',
    excerpt:
      'Guía paso a paso para conciliar efectivo, billeteras digitales y tarjetas sin perder horas de sueño al cierre de turno.',
    coverImage: '/media/blog/cuadre-caja.jpg',
    coverAlt: 'Cajero realizando el arqueo de caja con desglose de efectivo, Yape y tarjetas',
    readingTimeMinutes: 5,
    category: 'Gestión de Mostrador',
    tags: ['Cuadre de caja', 'Arqueo', 'Minimarket', 'Control de efectivo', 'Billeteras digitales'],
    contextualCta: {
      title: 'Cierra tu caja en 2 minutos',
      description: 'KipusPay desglosa automáticamente tus ventas por medio de pago al instante.',
      buttonText: 'Ver demostración',
      buttonHref: '/empezar',
    },
    sections: [
      {
        heading: 'Por qué se producen los descuadres al final del día',
        paragraphs: [
          'En un minimarket con cientos de transacciones diarias, los faltantes de caja suelen originarse por tres factores comunes: cobros mal registrados entre efectivo y transferencias, entrega equivocada de vuelto en momentos de alta afluencia y salidas de caja no anotadas para compras menores a proveedores.',
          'Cuando el cierre se realiza sumando papelitos y vouchers a mano, encontrar el origen de una diferencia de 20 o 50 soles puede tomar más de una hora, desgastando la relación con el personal y retrasando la salida del turno.',
        ],
      },
      {
        heading: 'El proceso de arqueo ciego paso a paso',
        paragraphs: [
          'La mejor práctica para un cierre de caja transparente es el arqueo ciego: el cajero cuenta el dinero físico presente en la gaveta y registra las cantidades por denominación de billetes y monedas sin ver previamente el monto total que el sistema espera.',
          'Posteriormente, el sistema compara el conteo físico contra las ventas registradas y los movimientos de caja, generando un reporte exacto de balance que resalta de inmediato si existe un sobrante o faltante justificado.',
        ],
      },
      {
        heading: 'Separación automática de medios de pago',
        paragraphs: [
          'Hoy en día, más del 60% de las ventas en minimarkets urbanos se realizan mediante billeteras móviles y tarjetas de débito.',
          'Llevar la cuenta mental de qué pago entró por billetera digital y cuál por efectivo es imposible sin un registro digital por transacción. Tu punto de venta debe totalizar cada canal por separado para que conciliar el dinero en banco tome solo un vistazo a la pantalla.',
        ],
      },
      {
        heading: 'Control de gastos menores y fondos de cambio',
        paragraphs: [
          'Todo minimarket necesita un fondo inicial para dar cambio al abrir el día y realiza pagos menores de caja chica durante la jornada (como compra de hielo o pago a repartidores).',
          'Registrar cada entrada y salida de efectivo en el mismo instante en que ocurre garantiza que el saldo final de la gaveta coincida al céntimo con el reporte de cierre.',
        ],
      },
    ],
  },
  {
    slug: 'cobrar-yape-plin-evitar-estafas',
    title: 'Cómo cobrar con Yape y Plin en el mostrador evitando capturas falsas',
    date: '2026-08-20',
    audience: 'Comerciantes que reciben pagos diarios con billeteras digitales móviles',
    excerpt:
      'Consejos prácticos para validar transferencias al instante en el punto de venta y proteger los ingresos de tu mostrador.',
    coverImage: '/media/blog/yape-plin.jpg',
    coverAlt: 'Verificación segura de pago móvil con código de operación en el mostrador',
    readingTimeMinutes: 4,
    category: 'Medios de Pago',
    tags: ['Yape', 'Plin', 'Pagos digitales', 'Seguridad en caja', 'Prevención de estafas'],
    contextualCta: {
      title: 'Registra tus cobros digitales al instante',
      description:
        'Lleva el registro ordenado de cada transferencia sin depender de revisar capturas en tu celular personal.',
      buttonText: 'Probar KipusPay',
      buttonHref: '/empezar',
    },
    sections: [
      {
        heading: 'El riesgo de las capturas de pantalla editadas',
        paragraphs: [
          'El cobro mediante transferencias móviles revolucionó la velocidad del mostrador en el Perú, pero también trajo consigo modalidades de fraude donde compradores inescrupulosos muestran capturas de pantalla alteradas con aplicaciones falsas o comprobantes de transferencias anteriores.',
          'Confiar únicamente en mirar la pantalla del celular del cliente durante una hora de alta congestión puede costarle a un negocio cientos de soles a la semana en mercadería entregada sin pago real.',
        ],
      },
      {
        heading: 'Protocolo de verificación en tres pasos',
        paragraphs: [
          'Para proteger la caja de tu local, establece una regla clara para todo tu equipo de atención: nunca entregar el producto ni emitir el comprobante hasta verificar tres datos clave.',
          'Primero, confirma que la notificación bancaria haya ingresado a la cuenta del negocio o verifica los últimos dígitos del código de operación. Segundo, coteja el nombre del titular emisor. Tercero, registra de inmediato la venta en tu punto de venta seleccionando el medio de pago correspondiente.',
        ],
      },
      {
        heading: 'Código visual visible y centralizado en el mostrador',
        paragraphs: [
          'Colocar un código visual claro y protegido con soporte acrílico en la zona de cobro evita que los clientes se equivoquen de número al digitar manualmente y reduce el tiempo de espera.',
          'Además, disponer de una pantalla o sonido de confirmación en la caja permite que tanto el cajero como el comprador tengan certeza del pago sin generar incomodidad.',
        ],
      },
      {
        heading: 'Conciliación diaria entre banco y caja',
        paragraphs: [
          'Al final de la jornada, el total recaudado por transferencias digitales en el sistema de ventas debe coincidir exactamente con el extracto de movimientos de la cuenta bancaria vinculada.',
          'Esta disciplina diaria permite detectar cualquier error o intento de fraude en menos de 24 horas, asegurando la salud financiera de tu comercio.',
        ],
      },
    ],
  },
  {
    slug: 'checklist-abrir-restaurante-cafeteria-peru',
    title: 'Checklist operativo para abrir una cafetería o restaurante en Perú',
    date: '2026-08-22',
    audience: 'Emprendedores gastronómicos preparando la apertura de su primer local',
    excerpt:
      'Todo lo que necesitas revisar antes del primer día: licencias, comandas de cocina, control de mermas, sistema de caja y servicio rápido.',
    coverImage: '/media/blog/restaurante-checklist.jpg',
    coverAlt: 'Mostrador de cafetería con comanda organizada, caja y servicio al cliente',
    readingTimeMinutes: 7,
    category: 'Gastronomía',
    tags: ['Restaurantes', 'Cafeterías', 'Apertura de local', 'Gestión gastronómica', 'Comandas'],
    contextualCta: {
      title: 'Abre tu restaurante con una caja que no se cuelga',
      description:
        'Atiende mesas, envía comandas y cobra al instante incluso si se corta el internet.',
      buttonText: 'Empieza con KipusPay',
      buttonHref: '/para/restaurantes',
    },
    sections: [
      {
        heading: '1. Licencias municipales y requisitos sanitarios',
        paragraphs: [
          'Antes de encender los fogones, asegúrate de contar con la Licencia Municipal de Funcionamiento y la Inspección Técnica de Seguridad en Edificaciones de Defensa Civil.',
          'Asimismo, todo el personal en contacto con alimentos debe contar con su carné de sanidad vigente y el establecimiento debe tener implementadas las buenas prácticas de manipulación de alimentos.',
        ],
      },
      {
        heading: '2. Flujo de comandas entre salón y cocina',
        paragraphs: [
          'El cuello de botella más habitual en la inauguración de un restaurante ocurre entre la toma del pedido en mesa y la preparación en cocina o barra de café.',
          'Utilizar un sistema digital de pedidos permite que la orden viaje al instante a la comanda de cocina o barra de despacho, eliminando papelitos ilegibles y reduciendo los tiempos de espera del comensal.',
        ],
      },
      {
        heading: '3. Estandarización de recetas y costeo',
        paragraphs: [
          'Cada plato y bebida de tu carta debe contar con su ficha técnica de ingredientes con gramajes exactos y costo unitario calculado.',
          'Conocer tu margen de ganancia real por cada café o menú servido te permite ajustar precios con criterio y controlar las mermas de insumos perecibles desde la primera semana de operaciones.',
        ],
      },
      {
        heading: '4. Caja rápida con cobro mixto y propinas',
        paragraphs: [
          'En el rubro gastronómico es muy frecuente que una mesa solicite dividir la cuenta entre varios comensales o pagar una parte en efectivo y otra con tarjeta o billetera digital.',
          'Tu punto de venta debe permitir cobros mixtos y división de cuentas en segundos, evitando que los clientes hagan filas incómodas al momento de pedir la cuenta.',
        ],
      },
      {
        heading: '5. Plan de contingencia ante caídas de internet',
        paragraphs: [
          'Un restaurante en hora punta de almuerzo o cena no puede detener el despacho porque el proveedor de internet local tenga una interrupción.',
          'Tener una caja que opere de forma continua sin conexión a internet garantiza que las comandas sigan saliendo y las cuentas se sigan cobrando con total tranquilidad.',
        ],
      },
    ],
  },
];

export function publishedPosts(posts: readonly BlogPost[] = BLOG_POSTS): BlogPost[] {
  return [...posts];
}

export function postBySlug(slug: string, posts: readonly BlogPost[] = BLOG_POSTS): BlogPost | null {
  return posts.find((p) => p.slug === slug) ?? null;
}
