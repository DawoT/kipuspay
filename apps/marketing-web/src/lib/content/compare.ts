import type { ComparePage, CompareRow, CompetitorSlug } from './types.js';

const BY_SLUG: Readonly<Record<CompetitorSlug, ComparePage>> = {
  bsale: {
    slug: 'bsale',
    name: 'Bsale',
    title: 'KipusPay vs Bsale',
    metaDescription: 'Compara KipusPay con Bsale: vende aunque se corte el internet, en minutos.',
    intro: 'Si buscas una alternativa a Bsale, mira la diferencia en el día a día de tu caja.',
    hook: 'La caja no se detiene cuando se cae la señal.',
    whyMigrate: [
      {
        icon: 'senal',
        title: 'La venta no espera al internet',
        body: 'Cobras igual con la señal caída y el envío se completa solo cuando vuelve.',
      },
      {
        icon: 'reloj',
        title: 'Empiezas hoy, no el mes que viene',
        body: 'Sin instalador ni visita técnica: entras desde el equipo que ya tienes.',
      },
      {
        icon: 'etiqueta',
        title: 'Un precio que entiendes',
        body: 'Un plan claro en lugar de módulos sueltos que se suman al final del mes.',
      },
    ],
    rows: [
      {
        label: 'Empezar a usarlo',
        reported: 'Coordinar instalación y capacitación',
        kipus: 'Abres el navegador y cobras',
      },
      {
        label: 'Equipo necesario',
        reported: 'Compra de caja y periféricos',
        kipus: 'La tablet o computadora que ya tienes',
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
    metaDescription: 'Compara KipusPay con Alegra: cobro simple y facturación sin drama.',
    intro: 'Si evaluas salir de Alegra, esto es lo que cambia en tu mostrador.',
    hook: 'Primero cobrar, después contabilizar.',
    whyMigrate: [
      {
        icon: 'caja',
        title: 'Nace del mostrador',
        body: 'La pantalla está pensada para el cajero en hora punta, no para el escritorio del contador.',
      },
      {
        icon: 'senal',
        title: 'Sigue vendiendo sin señal',
        body: 'La venta se guarda primero en tu equipo y se envía después, sin bloquear la cola.',
      },
      {
        icon: 'documento',
        title: 'El documento de tu etapa',
        body: 'Nota de venta de control interno si aún te formalizas; boleta o factura cuando corresponde.',
      },
    ],
    rows: [
      {
        label: 'Punto de partida',
        reported: 'Primero la contabilidad, después el punto de venta',
        kipus: 'Primero el mostrador: cobrar rápido y bien',
      },
      {
        label: 'Qué ve tu cajero',
        reported: 'Formularios pensados para oficina',
        kipus: 'Producto, total grande y botón de cobrar',
      },
    ],
    faq: [
      {
        q: '¿Puedo traer mi catálogo desde Alegra?',
        a: 'Sí. Exportas tus productos a un archivo CSV y los importas en KipusPay el mismo día.',
      },
      {
        q: '¿Y mi contador?',
        a: 'Puedes exportar tus ventas para tu contador. KipusPay no reemplaza tu contabilidad: se encarga del mostrador.',
      },
      {
        q: '¿Tengo que migrar todo de golpe?',
        a: 'No. Muchos empiezan por una caja, la usan una semana y recién ahí mueven el resto.',
      },
    ],
  },
  siigo: {
    slug: 'siigo',
    name: 'Siigo',
    title: 'KipusPay vs Siigo',
    metaDescription: 'Compara KipusPay con Siigo: implementacion en minutos, no en semanas.',
    intro: 'Si Siigo se siente pesado para tu local, mira cómo KipusPay simplifica el cobro.',
    hook: 'Todo lo que tu caja necesita. Nada de lo que no usa.',
    whyMigrate: [
      {
        icon: 'reloj',
        title: 'Se aprende en un turno',
        body: 'Sin semanas de implementación ni un manual para el equipo del mostrador.',
      },
      {
        icon: 'panel',
        title: 'Solo lo que tu negocio usa',
        body: 'Si no manejas inventario, no ves campos de inventario.',
      },
      {
        icon: 'senal',
        title: 'La caída de señal no para el día',
        body: 'Sigues cobrando y la información se pone al día cuando vuelve la conexión.',
      },
    ],
    rows: [
      {
        label: 'Curva de aprendizaje',
        reported: 'Capacitación por módulos',
        kipus: 'Un turno con tu equipo y listo',
      },
      {
        label: 'Configuración inicial',
        reported: 'Proyecto de implementación',
        kipus: 'Preguntas básicas y tu primera venta',
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
        a: 'Puedes hacerlo tú mismo. Si te trabas, el soporte responde en español, con personas reales.',
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

/** Filas de negocio GTM §5.7 — sin jerga técnica. */
export const COMPARE_ROWS: readonly CompareRow[] = [
  {
    label: 'Si se corta el internet',
    reported: 'Dejas de vender',
    kipus: 'Sigues vendiendo normal',
  },
  {
    label: 'Implementacion',
    reported: 'Semanas, con instalador',
    kipus: 'Minutos, tu solo',
  },
  {
    label: 'Costo mensual',
    reported: 'Cuotas altas + instalacion + soporte aparte',
    kipus: 'Desde un plan claro, todo incluido',
  },
  {
    label: 'Soporte',
    reported: 'Ticket y espera',
    kipus: 'Chat segun plan; prioritario Enterprise cuando el gate lo habilite',
  },
];

/** Lo comparado es lo reportado por comercios, no una afirmacion sobre el producto ajeno. */
export function compareDisclaimer(name: string): string {
  return `Comparativa basada en lo que nos reportan comercios que migran y en informacion publica de ${name}. No representamos a ${name} ni usamos su marca para sugerir vinculo alguno.`;
}
