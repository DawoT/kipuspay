import type { VerticalLanding, VerticalSlug } from './types.js';

const BY_SLUG: Readonly<Record<VerticalSlug, VerticalLanding>> = {
  restaurantes: {
    slug: 'restaurantes',
    navLabel: 'Restaurantes y cafeterías',
    title: 'KipusPay para restaurantes',
    pain: 'Comandas perdidas, cuentas divididas mal cobradas, cocina desincronizada del salón.',
    hook: 'Tu cocina y tu caja, siempre en el mismo minuto.',
    metaDescription:
      'POS para restaurantes y food service: cobra sin fricción y prepárate para comandas sincronizadas.',
    points: [
      'Cobra sin fricción en la hora punta, sin que se ponga lento',
      'La caja sigue vendiendo aunque se corte el internet',
      'Confirmación de pago en pantalla para tu salón',
    ],
    pains: [
      {
        icon: 'reloj',
        pain: 'En hora punta la cola crece y el sistema se pone lento.',
        relief: 'Tu caja sigue el ritmo del salón.',
      },
      {
        icon: 'senal',
        pain: 'Se cae el internet un viernes y perdemos la noche.',
        relief: 'Sigues cobrando; se sincroniza después.',
      },
      {
        icon: 'caja',
        pain: 'Cerrar la caja nos toma media hora de papeles.',
        relief: 'El cierre sale claro, con la diferencia explicada.',
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
  },
  farmacias: {
    slug: 'farmacias',
    navLabel: 'Farmacias y boticas',
    title: 'KipusPay para farmacias',
    pain: 'Vencimientos sin control, quiebres de stock y presión fiscal todos los días.',
    hook: 'Nunca más un cliente se va sin su medicina por falta de stock.',
    metaDescription:
      'POS para farmacias: vende y factura con control, lotes y vencimiento de medicamentos (FEFO).',
    points: [
      'Cobra y factura sin colas, con boleta o factura según tu etapa',
      'El inventario descuenta solo en el instante de la venta',
      'Avisos de stock mínimo de tus productos',
    ],
    pains: [
      {
        icon: 'etiqueta',
        pain: 'El cliente espera mientras busco el precio.',
        relief: 'El catálogo responde al instante en el mostrador.',
      },
      {
        icon: 'documento',
        pain: 'Me piden factura y no quiero equivocarme de documento.',
        relief: 'Boleta o factura según tu etapa, sin confundir las dos.',
      },
      {
        icon: 'cuaderno',
        pain: 'Nunca sé cuánto queda hasta que falta.',
        relief: 'El inventario descuenta en el instante de la venta.',
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
  },
  retail: {
    slug: 'retail',
    navLabel: 'Retail y minimarkets',
    title: 'KipusPay para retail y minimarkets',
    pain: 'Robo hormiga, descuadres de caja y poco control cuando hay más de un local.',
    hook: 'Sabe exactamente qué pasó en cada una de tus tiendas, hoy.',
    metaDescription:
      'POS para retail y ferreterías: cobra offline, ve tu día y prepara el arqueo ciego del roadmap.',
    points: [
      'Cierre de caja claro, sin sorpresas ni planillas a mano',
      'Cada venta registrada: cada sol cuadra',
      'Crece a más locales sin cambiar de sistema',
    ],
    pains: [
      {
        icon: 'balanza',
        pain: 'Al cierre falta plata y nadie sabe por qué.',
        relief: 'Cada venta queda registrada: la diferencia se explica.',
      },
      {
        icon: 'cuaderno',
        pain: 'Anoto algunas ventas en un cuaderno aparte.',
        relief: 'Todo el día queda en un solo registro.',
      },
      {
        icon: 'local',
        pain: 'Abrí un segundo local y perdí el control.',
        relief: 'Sumas locales sin cambiar de sistema.',
      },
    ],
    faq: [
      {
        q: '¿Sirve si tengo dos o tres locales?',
        a: 'Sí. Cada local tiene su caja y los ves juntos en Modo Dueño; el ranking de locales depende de tu plan.',
      },
      {
        q: '¿Cómo sé si falta dinero en la caja?',
        a: 'El cierre compara lo esperado con lo contado y muestra la diferencia. El arqueo ciego está en el roadmap.',
      },
      {
        q: '¿Puedo usarlo en la computadora que ya tengo?',
        a: 'Sí. Funciona en la tablet, el celular o la computadora que ya tienes, sin instalador.',
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
  },
  servicios: {
    slug: 'servicios',
    navLabel: 'Servicios y talleres',
    title: 'KipusPay para servicios',
    pain: 'Citas y cobros desconectados, sin producto físico que descontar del inventario.',
    hook: 'Cobra sin inventario, sin fricción, sin complicarte.',
    metaDescription:
      'POS para spas, talleres y consultorios: cobra y factura sin pelearte con el stock.',
    points: [
      'Cobra sin inventario y sin fricción',
      'Boleta o factura según tu etapa de formalización',
      'Tu primera venta en menos de 5 minutos',
    ],
    pains: [
      {
        icon: 'caja',
        pain: 'Cobro servicios y el sistema me exige stock.',
        relief: 'Cobras sin inventario, sin campos que no usas.',
      },
      {
        icon: 'documento',
        pain: 'Todavía no facturo y no sé por dónde empezar.',
        relief: 'Empiezas con control interno y activas facturación cuando estés listo.',
      },
      {
        icon: 'reloj',
        pain: 'No quiero pasar un día entero configurando.',
        relief: 'Tu primera venta en menos de 5 minutos.',
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
  },
  cadenas: {
    slug: 'cadenas',
    navLabel: 'Cadenas y multi-local',
    title: 'KipusPay para cadenas y multi-local',
    pain: 'Poco visibilidad consolidada y reportería lenta entre sucursales.',
    hook: 'Un solo panel para saber cómo le va a cada una de tus tiendas — cuando sincroniza.',
    metaDescription:
      'POS multi-local: ranking de locales en Modo Dueño, control de stock y transferencias entre locales.',
    points: [
      'Un solo panel para ver todos tus locales',
      'Ranking de locales en Modo Dueño (plan Crece+)',
      'Datos actualizados cada vez que tus cajas sincronizan',
    ],
    pains: [
      {
        icon: 'panel',
        pain: 'Pido los números por mensaje a cada local.',
        relief: 'Ves todos tus locales en un solo panel.',
      },
      {
        icon: 'caja',
        pain: 'Cada tienda cierra la caja a su manera.',
        relief: 'El mismo cierre de caja en todas.',
      },
      {
        icon: 'reloj',
        pain: 'Cuando llega el reporte, ya pasó la semana.',
        relief: 'Los datos llegan a medida que las cajas sincronizan.',
      },
    ],
    faq: [
      {
        q: '¿Veo todos mis locales en un solo lugar?',
        a: 'Sí, en Modo Dueño. Los datos se actualizan a medida que cada caja sincroniza, no como una promesa de tiempo real continuo.',
      },
      {
        q: '¿Puedo comparar qué local vende más?',
        a: 'El ranking de locales es un reporte avanzado del plan Crece+.',
      },
      {
        q: '¿Y las transferencias entre locales?',
        a: 'Sí: registras transferencias de mercadería y control de merma entre tus sucursales con trazabilidad completa.',
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
