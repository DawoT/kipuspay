import type { ComparePage, CompareRow, CompetitorSlug } from './types.js';

const BY_SLUG: Readonly<Record<CompetitorSlug, ComparePage>> = {
  bsale: {
    slug: 'bsale',
    name: 'Bsale',
    title: 'KipusPay vs Bsale',
    metaDescription:
      'Compara KipusPay con Bsale: listo en 5 minutos, cobro continuo y control en vivo con Modo Dueño.',
    intro:
      'Descubre una experiencia de venta más ágil, fácil de configurar y con control total desde tu celular.',
    hook: 'Tu mostrador siempre en marcha: cobro fluido y listo en 5 minutos.',
    whyMigrate: [
      {
        icon: 'senal',
        title: 'Operación continua asegurada',
        body: 'Sigue cobrando y emitiendo comprobantes con total estabilidad; la sincronización trabaja sola en segundo plano.',
      },
      {
        icon: 'reloj',
        title: 'Puesta en marcha en 5 minutos',
        body: 'Sin demoras ni instalaciones técnicas complejas: empieza a vender el mismo día desde cualquier equipo.',
      },
      {
        icon: 'panel',
        title: 'Modo Dueño en tu celular',
        body: 'Supervisa tus ventas, caja y ganancias en tiempo real desde tu teléfono, con planes claros y transparentes.',
      },
    ],
    rows: [
      {
        label: 'Empezar a usarlo',
        reported: 'Coordinar instalación y capacitación previa',
        kipus: 'Listo para cobrar en 5 minutos desde el navegador',
      },
      {
        label: 'Equipo necesario',
        reported: 'Hardware dedicado o periféricos específicos',
        kipus: 'Cualquier tablet, celular o computadora que ya tengas',
      },
    ],
    faq: [
      {
        q: '¿Puedo traer mi catálogo desde Bsale?',
        a: 'Sí. Exportas tus productos a un archivo CSV desde tu panel anterior y los importas en KipusPay en un solo paso el mismo día.',
      },
      {
        q: '¿Pierdo mi historial de ventas al cambiarme?',
        a: 'Tu historial se queda seguro donde está. En KipusPay inicias tu nuevo periodo desde el primer día y puedes operar ambos sistemas en paralelo mientras te adaptas.',
      },
      {
        q: '¿Tengo que cambiar mi facturación antes de probar?',
        a: 'No. Puedes comenzar con notas de venta de control interno para familiarizar a tu equipo y activar la facturación electrónica cuando decidas hacer el cambio definitivo.',
      },
      {
        q: '¿Cómo funciona la migración asistida de inventario y variantes?',
        a: 'Nuestro importador reconoce automáticamente columnas de códigos de barra, precios, stock y variantes de talla o color, evitando la carga manual producto por producto.',
      },
      {
        q: '¿Necesito comprar un certificado digital propio para SUNAT?',
        a: 'No. KipusPay incluye la emisión tributaria con certificado digital gratuito integrado, sin trámites notariales ni pagos adicionales por renovación anual.',
      },
      {
        q: '¿Puedo usar mis impresoras térmicas y lectores actuales de Bsale?',
        a: 'Sí. KipusPay es compatible con las mismas impresoras térmicas USB/Bluetooth (58mm y 80mm) y lectores de barras que ya utilizas, sin necesidad de recomprar equipos.',
      },
    ],
  },
  alegra: {
    slug: 'alegra',
    name: 'Alegra',
    title: 'KipusPay vs Alegra',
    metaDescription:
      'Compara KipusPay con Alegra: punto de venta ágil, SUNAT automático y control desde el celular.',
    intro:
      'Diseñado específicamente para el ritmo de la caja y el mostrador del comercio en el Perú.',
    hook: 'Agilidad en tu caja, facturación automática y control en tiempo real.',
    whyMigrate: [
      {
        icon: 'caja',
        title: 'Diseñado para la agilidad en caja',
        body: 'Pantalla optimizada para la hora punta: cobros en un toque, tickets rápidos y cero colas.',
      },
      {
        icon: 'senal',
        title: 'Venta ágil y asegurada',
        body: 'El cobro y registro se procesan de inmediato en tu equipo con máxima estabilidad en todo momento.',
      },
      {
        icon: 'documento',
        title: 'SUNAT al día y Modo Dueño',
        body: 'Boletas y facturas 100% legales emitidas sin fricción y reportes en vivo en tu celular.',
      },
    ],
    rows: [
      {
        label: 'Enfoque principal',
        reported: 'Sistemas con foco contable tradicional',
        kipus: 'Mostrador ágil: cobrar rápido y controlar el negocio',
      },
      {
        label: 'Experiencia en mostrador',
        reported: 'Formularios con pasos múltiples',
        kipus: 'Producto, total grande y cobro en un solo toque',
      },
    ],
    faq: [
      {
        q: '¿Puedo traer mi catálogo desde Alegra?',
        a: 'Sí. Descargas el reporte de inventario en Excel o CSV desde Alegra y lo subes a KipusPay con nuestro asistente de importación en pocos minutos.',
      },
      {
        q: '¿Y mi contador? ¿Cómo recibe la información de ventas?',
        a: 'Puedes descargar resúmenes de ventas y reportes en Excel/CSV compatibles con sistemas contables como Concar y SIRE, manteniendo a tu contador al día sin fricciones.',
      },
      {
        q: '¿Tengo que migrar todas mis cajas o sucursales de golpe?',
        a: 'No. Muchos comercios inician con una caja principal durante unos días y luego suman el resto de locales y mostradores a su propio ritmo.',
      },
      {
        q: '¿Qué diferencia hay en la velocidad de cobro frente a un sistema contable?',
        a: 'KipusPay está diseñado para la agilidad de mostrador: pantalla táctil en un toque, cálculo automático de vueltos y emisión rápida para evitar colas en hora punta.',
      },
      {
        q: '¿Cómo se gestiona el certificado digital para boletas y facturas?',
        a: 'El certificado digital viene incluido sin costo en tu suscripción. Solo vinculas tu RUC y usuario secundario de SUNAT en la configuración y empiezas a emitir.',
      },
      {
        q: '¿Puedo importar mis listas de precios y clientes frecuentes?',
        a: 'Sí. Puedes importar tu base de clientes con RUC o DNI y tus listas de precios especiales desde un archivo estructurado para no perder datos clave.',
      },
    ],
  },
  siigo: {
    slug: 'siigo',
    name: 'Siigo',
    title: 'KipusPay vs Siigo',
    metaDescription:
      'Compara KipusPay con Siigo: fácil de usar, listo en 5 minutos y control total en vivo.',
    intro:
      'Una solución ligera, potente e intuitiva que tu equipo aprende a usar en un solo turno.',
    hook: 'Todo lo que tu comercio necesita para vender rápido y crecer con orden.',
    whyMigrate: [
      {
        icon: 'reloj',
        title: 'Se aprende en un turno',
        body: 'Intuitivo y directo: tu equipo empieza a vender de inmediato sin capacitaciones complejas.',
      },
      {
        icon: 'panel',
        title: 'Modo Dueño en vivo',
        body: 'Revisa ventas, caja e ingresos en tiempo real desde tu celular, estés donde estés.',
      },
      {
        icon: 'senal',
        title: 'Operación continua y estable',
        body: 'Tu mostrador nunca se detiene: atiende, cobra e imprime con máxima fluidez en todo momento.',
      },
    ],
    rows: [
      {
        label: 'Curva de aprendizaje',
        reported: 'Capacitaciones extensas por módulos',
        kipus: 'Tu equipo lo domina en un turno de trabajo',
      },
      {
        label: 'Configuración inicial',
        reported: 'Procesos largos de implementación',
        kipus: 'Listo para tu primera venta en 5 minutos',
      },
    ],
    faq: [
      {
        q: '¿Puedo traer mi catálogo desde Siigo?',
        a: 'Sí. Exportas tus artículos a un archivo CSV y el importador de KipusPay mapea tus categorías, precios y existencias automáticamente.',
      },
      {
        q: '¿Sirve si tengo varios locales y almacenes?',
        a: 'Sí. Cada sucursal tiene su propia caja y puedes consultar el consolidado y ranking de ventas en tiempo real desde tu celular mediante Modo Dueño.',
      },
      {
        q: '¿Necesito asistencia técnica para realizar la migración?',
        a: 'El proceso es autoguiado y toma 5 minutos. Si tienes preguntas, nuestro equipo de soporte te acompaña por WhatsApp con personas reales en español.',
      },
      {
        q: '¿Cómo se transfieren los códigos de barras y lotes?',
        a: 'El importador CSV incluye campos para código de barras, stock inicial y control de lotes con fechas de vencimiento para boticas y minimarkets.',
      },
      {
        q: '¿Debo pagar costos de mantenimiento o renovación de certificado?',
        a: 'No. No cobramos licencias anuales de mantenimiento ni tarifas por certificado digital. Todo está incluido en tu mensualidad transparente.',
      },
      {
        q: '¿Cuánto tarda mi personal en aprender a cobrar con KipusPay?',
        a: 'La interfaz es tan intuitiva como una app de celular: un cajero nuevo aprende a registrar ventas, emitir boletas y cobrar con Yape o tarjeta en un turno de 15 minutos.',
      },
    ],
  },
};

export const COMPETITOR_SLUGS: readonly CompetitorSlug[] = ['bsale', 'alegra', 'siigo'];

export function getCompare(slug: string): ComparePage | null {
  if ((COMPETITOR_SLUGS as readonly string[]).includes(slug)) {
    return BY_SLUG[slug as CompetitorSlug];
  }
  return null;
}

export function allCompares(): readonly ComparePage[] {
  return COMPETITOR_SLUGS.map((s) => BY_SLUG[s]);
}

/** Filas de negocio comparativas universales — sin jerga técnica. */
export const COMPARE_ROWS: readonly CompareRow[] = [
  {
    label: 'Cobro continuo en hora punta',
    reported: 'Se bloquea si se corta la conexión a internet',
    kipus: 'Cobro fluido y guardado local seguro sin interrupciones',
  },
  {
    label: 'Equipos y hardware',
    reported: 'Exige comprar equipos cautivos o licencias adicionales',
    kipus: 'Funciona en cualquier tablet, celular o computadora que ya tengas',
  },
  {
    label: 'Puesta en marcha y migración',
    reported: 'Semanas de espera, trámites y capacitaciones complejas',
    kipus: 'Listo para vender en 5 minutos con importador asistido',
  },
  {
    label: 'Modo Dueño en el celular',
    reported: 'Módulo de escritorio o cobro extra por usuario adicional',
    kipus: 'Ventas y arqueo en vivo desde tu celular sin costo extra',
  },
  {
    label: 'Emisión SUNAT automática',
    reported: 'Módulos contables complejos y demoras en la emisión',
    kipus: 'Emisión en un solo toque, 100% legal y automática',
  },
  {
    label: 'Actualizaciones de sistema',
    reported: 'Cobros anuales por versión, parches o mantenimiento',
    kipus: 'Actualizaciones automáticas continuas incluidas en tu plan',
  },
  {
    label: 'Curva de aprendizaje del cajero',
    reported: 'Días de inducción por menús enredados y pantallas lentas',
    kipus: 'Se aprende en un turno de 15 minutos sin complicaciones',
  },
  {
    label: 'Soporte y atención',
    reported: 'Tickets con días de espera o respuestas de bots genéricos',
    kipus: 'Soporte real por personas y WhatsApp en español',
  },
];

export function compareDisclaimer(name: string): string {
  return `Comparativa basada en testimonios de comercios y en información pública de ${name}. No representamos a ${name} ni usamos su marca para sugerir vínculo comercial.`;
}
