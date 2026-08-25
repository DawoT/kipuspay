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
        a: 'Sí. Exportas tus productos a un archivo CSV y los importas en KipusPay el mismo día.',
      },
      {
        q: '¿Pierdo mi historial de ventas?',
        a: 'Tu historial se queda donde está. En KipusPay empiezas uno nuevo desde el día que migras, y puedes usar ambos en paralelo mientras te acostumbras.',
      },
      {
        q: '¿Tengo que cambiar mi facturación antes de probar?',
        a: 'No. Puedes empezar con nota de venta de control interno y activar la facturación electrónica cuando decidas quedarte.',
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
        a: 'Sí. Exportas tus productos a un archivo CSV y los importas en KipusPay el mismo día.',
      },
      {
        q: '¿Y mi contador?',
        a: 'Puedes exportar tus ventas para tu contador. KipusPay se encarga de la agilidad en tu mostrador y facilita el reporte contable.',
      },
      {
        q: '¿Tengo que migrar todo de golpe?',
        a: 'No. Muchos empiezan por una caja, la usan unos días y luego suman las demás sucursales con total tranquilidad.',
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
        a: 'Sí. Exportas tus productos a un archivo CSV y los importas en KipusPay el mismo día.',
      },
      {
        q: '¿Sirve si tengo varios locales?',
        a: 'Sí. Cada local tiene su caja y los ves juntos en Modo Dueño; el ranking de locales depende de tu plan.',
      },
      {
        q: '¿Necesito ayuda para migrar?',
        a: 'Puedes hacerlo tú mismo en minutos. Si tienes dudas, nuestro soporte te acompaña con personas reales en español.',
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

/** Filas de negocio comparativas — sin jerga técnica. */
export const COMPARE_ROWS: readonly CompareRow[] = [
  {
    label: 'Continuidad operativa',
    reported: 'Dependencia de conexión constante',
    kipus: 'Operación continua sin interrupciones',
  },
  {
    label: 'Puesta en marcha',
    reported: 'Semanas y configuración técnica',
    kipus: 'Listo para vender en 5 minutos',
  },
  {
    label: 'Control del negocio',
    reported: 'Reportes diferidos de escritorio',
    kipus: 'Modo Dueño en tiempo real desde el celular',
  },
  {
    label: 'Facturación SUNAT',
    reported: 'Gestión compleja o demoras en emisión',
    kipus: '100% legal y automática en cada venta',
  },
];

export function compareDisclaimer(name: string): string {
  return `Comparativa basada en testimonios de comercios y en información pública de ${name}. No representamos a ${name} ni usamos su marca para sugerir vínculo comercial.`;
}
