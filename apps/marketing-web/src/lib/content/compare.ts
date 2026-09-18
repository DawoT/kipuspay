import type { ComparePage, CompareRow, CompetitorSlug } from './types.js';

const BY_SLUG: Readonly<Record<CompetitorSlug, ComparePage>> = {
  bsale: {
    slug: 'bsale',
    name: 'Bsale',
    title: 'KipusPay vs Bsale',
    metaDescription: 'Compara opciones de caja, configuración y reportes entre Bsale y KipusPay.',
    intro:
      'Descubre una experiencia de venta más ágil, fácil de configurar y con control total desde tu celular.',
    hook: 'Compara opciones para cobrar y supervisar tu negocio desde el celular.',
    whyMigrate: [
      {
        icon: 'senal',
        title: 'Venta y sincronización',
        body: 'La operación sin conexión y la sincronización dependen de la configuración de tu caja.',
      },
      {
        icon: 'reloj',
        title: 'Configuración guiada',
        body: 'La puesta en marcha se completa por etapas; el tiempo depende de los datos y ajustes de tu negocio.',
      },
      {
        icon: 'panel',
        title: 'Modo Dueño en tu celular',
        body: 'Consulta ventas y caja desde tu teléfono; la información se actualiza cuando sincronizan las sucursales y las funciones dependen de tu plan.',
      },
    ],
    rows: [
      {
        label: 'Empezar a usarlo',
        reported: 'La puesta en marcha depende del producto y de la configuración',
        kipus: 'Guía de configuración por etapas; el tiempo depende de los datos del negocio',
      },
      {
        label: 'Equipo necesario',
        reported: 'Los equipos y periféricos compatibles dependen del proveedor',
        kipus: 'Los equipos y periféricos deben ser compatibles con KipusPay',
      },
    ],
    faq: [
      {
        q: '¿Puedo traer mi catálogo desde Bsale?',
        a: 'Si tu sistema anterior permite exportar el catálogo a CSV, puedes revisar el archivo e importarlo con la herramienta disponible en KipusPay.',
      },
      {
        q: '¿Pierdo mi historial de ventas al cambiarme?',
        a: 'El historial del sistema anterior no se transfiere automáticamente. Antes de migrar, revisa qué información puedes exportar y qué requiere conservarse en cada sistema.',
      },
      {
        q: '¿Tengo que cambiar mi facturación antes de probar?',
        a: 'Puedes comenzar con ventas de control interno. Las opciones de facturación electrónica dependen de la habilitación de tu negocio; SUNAT determina la aceptación de cada comprobante.',
      },
      {
        q: '¿Cómo funciona la migración asistida de inventario y variantes?',
        a: 'La importación depende del formato de tu archivo. Revisa las columnas admitidas por la herramienta antes de cargar productos, precios o variantes.',
      },
      {
        q: '¿Necesito comprar un certificado digital propio para SUNAT?',
        a: 'Los requisitos de facturación dependen de la habilitación fiscal de tu negocio. Confirma las condiciones vigentes antes de iniciar el trámite.',
      },
      {
        q: '¿Puedo usar mis impresoras térmicas y lectores actuales de Bsale?',
        a: 'La compatibilidad depende del modelo de impresora o lector. Comprueba los periféricos compatibles antes de conectar o comprar un equipo.',
      },
    ],
  },
  alegra: {
    slug: 'alegra',
    name: 'Alegra',
    title: 'KipusPay vs Alegra',
    metaDescription: 'Compara opciones de caja, configuración y reportes entre Alegra y KipusPay.',
    intro:
      'Diseñado específicamente para el ritmo de la caja y el mostrador del comercio en el Perú.',
    hook: 'Conoce las opciones de caja y control comercial para tu negocio.',
    whyMigrate: [
      {
        icon: 'caja',
        title: 'Diseñado para la agilidad en caja',
        body: 'Pantalla optimizada para la hora punta: cobros en un toque, tickets rápidos y cero colas.',
      },
      {
        icon: 'senal',
        title: 'Flujo de caja',
        body: 'Revisa cómo se registran las ventas y qué opciones de operación sin conexión están disponibles para tu configuración.',
      },
      {
        icon: 'documento',
        title: 'Modo Dueño y formalización',
        body: 'Consulta ventas desde el celular; los datos se actualizan cuando sincronizan las cajas. Las opciones fiscales dependen de su habilitación y SUNAT determina la aceptación.',
      },
    ],
    rows: [
      {
        label: 'Enfoque principal',
        reported: 'El enfoque y las funciones dependen del producto contratado',
        kipus: 'Funciones de caja y control comercial según el plan',
      },
      {
        label: 'Experiencia en mostrador',
        reported: 'Los pasos de cobro dependen del producto y de su configuración',
        kipus: 'La pantalla muestra el producto, el total y la acción de cobro',
      },
    ],
    faq: [
      {
        q: '¿Puedo traer mi catálogo desde Alegra?',
        a: 'Si puedes exportar el inventario a un formato admitido, revisa las columnas del archivo e impórtalo con la herramienta disponible en KipusPay. El tiempo depende del tamaño y la calidad de los datos.',
      },
      {
        q: '¿Y mi contador? ¿Cómo recibe la información de ventas?',
        a: 'Puedes revisar las opciones de exportación de ventas disponibles en tu plan y confirmar con tu contador qué formato necesita.',
      },
      {
        q: '¿Tengo que migrar todas mis cajas o sucursales de golpe?',
        a: 'No. Muchos comercios inician con una caja principal durante unos días y luego suman el resto de locales y mostradores a su propio ritmo.',
      },
      {
        q: '¿Qué diferencia hay en la velocidad de cobro frente a un sistema contable?',
        a: 'La pantalla de caja muestra el total y los medios de pago. Las funciones fiscales dependen de la habilitación de tu negocio; SUNAT determina la aceptación de cada comprobante.',
      },
      {
        q: '¿Cómo se gestiona el certificado digital para boletas y facturas?',
        a: 'Los requisitos de facturación dependen de la habilitación fiscal de tu negocio. Confirma las condiciones vigentes antes de iniciar el trámite.',
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
    metaDescription: 'Compara opciones de caja, configuración y reportes entre Siigo y KipusPay.',
    intro: 'Conoce las opciones de caja y gestión comercial disponibles para tu equipo.',
    hook: 'Todo lo que tu comercio necesita para vender rápido y crecer con orden.',
    whyMigrate: [
      {
        icon: 'reloj',
        title: 'Flujo de caja',
        body: 'La pantalla organiza los pasos principales de una venta; el aprendizaje depende de la configuración y del equipo.',
      },
      {
        icon: 'panel',
        title: 'Modo Dueño en el celular',
        body: 'Consulta ventas y caja desde el celular; los datos se actualizan cuando sincronizan las sucursales y las funciones dependen de tu plan.',
      },
      {
        icon: 'senal',
        title: 'Operación y sincronización',
        body: 'La operación sin conexión y la sincronización dependen de la configuración de tu caja.',
      },
    ],
    rows: [
      {
        label: 'Curva de aprendizaje',
        reported: 'El aprendizaje depende de la configuración y del equipo',
        kipus: 'La pantalla organiza los pasos principales de una venta',
      },
      {
        label: 'Configuración inicial',
        reported: 'La puesta en marcha depende del producto y de la configuración',
        kipus: 'Guía de configuración por etapas; el tiempo depende de los datos del negocio',
      },
    ],
    faq: [
      {
        q: '¿Puedo traer mi catálogo desde Siigo?',
        a: 'La importación depende del formato admitido y de la calidad del archivo. Revisa las columnas aceptadas antes de cargar productos, categorías, precios o existencias; no se garantiza un mapeo automático.',
      },
      {
        q: '¿Sirve si tengo varios locales y almacenes?',
        a: 'Si tu plan incluye Modo Dueño, puedes revisar las ventas consolidadas; los datos se actualizan cuando sincronizan las sucursales.',
      },
      {
        q: '¿Necesito asistencia técnica para realizar la migración?',
        a: 'La puesta en marcha se completa por etapas; el tiempo depende de los datos y ajustes de tu negocio. Revisa los canales de soporte incluidos en tu plan.',
      },
      {
        q: '¿Cómo se transfieren los códigos de barras y lotes?',
        a: 'La importación depende del formato del archivo y de las funciones habilitadas para tu negocio. Revisa las columnas admitidas antes de cargar los datos.',
      },
      {
        q: '¿Debo pagar costos de mantenimiento o renovación de certificado?',
        a: 'Los costos y requisitos de facturación dependen del plan y de la habilitación fiscal de tu negocio. Revisa las condiciones vigentes antes de contratar.',
      },
      {
        q: '¿Cuánto tarda mi personal en aprender a cobrar con KipusPay?',
        a: 'El tiempo de aprendizaje varía según la experiencia del equipo y la configuración del negocio. La pantalla muestra el producto, el total y los pasos disponibles para cobrar.',
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
    reported: 'La venta sin conexión depende del producto y del plan',
    kipus: 'La venta se guarda en el equipo y se sincroniza al volver la conexión',
  },
  {
    label: 'Equipos y hardware',
    reported: 'Los equipos y periféricos compatibles varían por producto',
    kipus: 'Disponible en equipos compatibles; revisa los requisitos de tus periféricos',
  },
  {
    label: 'Puesta en marcha y migración',
    reported: 'El tiempo de configuración depende de tus datos y necesidades',
    kipus: 'Alta guiada por etapas; el tiempo depende de la configuración de tu negocio',
  },
  {
    label: 'Modo Dueño en el celular',
    reported: 'El acceso a reportes móviles depende del producto y del plan',
    kipus: 'Consulta ventas y caja cuando tus locales sincronizan; funciones según tu plan',
  },
  {
    label: 'Facturación electrónica',
    reported: 'Las condiciones dependen del producto y del plan contratado',
    kipus: 'Las opciones dependen de la habilitación del negocio; SUNAT determina la aceptación',
  },
  {
    label: 'Actualizaciones de sistema',
    reported: 'Las actualizaciones dependen del proveedor y del plan contratado',
    kipus: 'Consulta las condiciones de actualización incluidas en tu plan',
  },
  {
    label: 'Curva de aprendizaje del cajero',
    reported: 'El tiempo de aprendizaje depende del equipo y de la configuración',
    kipus: 'La venta muestra el producto, el total y el paso para cobrar',
  },
  {
    label: 'Soporte y atención',
    reported: 'Los canales y horarios de soporte dependen del proveedor y del plan',
    kipus: 'Consulta los canales de soporte disponibles en tu plan',
  },
];

export function compareDisclaimer(name: string): string {
  return `Comparativa basada en testimonios de comercios y en información pública de ${name}. No representamos a ${name} ni usamos su marca para sugerir vínculo comercial.`;
}
