/**
 * Centro de ayuda — Categorías y preguntas frecuentes para el dueño del comercio.
 * Copys en lenguaje claro de negocio, sin jerga técnica (GTM §1 / Rule V-26).
 */

export interface HelpItem {
  readonly id: string;
  readonly question: string;
  readonly answer: string;
}

export interface HelpCategory {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly items: readonly HelpItem[];
}

export const HELP_CATEGORIES: readonly HelpCategory[] = [
  {
    id: 'sunat',
    title: 'Facturación y SUNAT',
    description: 'Emisión de boletas, facturas y notas de venta sin enredos.',
    items: [
      {
        id: 'activar-facturacion',
        question: '¿Cómo activo la emisión de boletas y facturas electrónicas?',
        answer:
          'Ingresas tu RUC y datos del negocio en la configuración. KipusPay se encarga del envío automático a SUNAT por ti. No necesitas comprar certificados adicionales.',
      },
      {
        id: 'nota-de-venta-vs-boleta',
        question: '¿Puedo cobrar si todavía no tengo RUC o facturación activa?',
        answer:
          'Sí. Puedes emitir notas de venta para tu control interno. El comprobante indica claramente su condición para no generar confusiones.',
      },
      {
        id: 'comprobantes-anulados',
        question: '¿Cómo anulo una venta o hago una nota de crédito?',
        answer:
          'Desde el historial de ventas seleccionas la transacción y eliges anular o emitir nota de crédito. El ajuste se envía a SUNAT de forma automática.',
      },
    ],
  },
  {
    id: 'hardware',
    title: 'Impresoras y Equipos',
    description: 'Compatibilidad con impresoras térmicas, gavetas y celulares.',
    items: [
      {
        id: 'impresora-compatible',
        question: '¿Qué impresoras puedo usar para imprimir tickets?',
        answer:
          'Funciona con impresoras térmicas Bluetooth o USB de 58mm y 80mm. También puedes enviar tickets por WhatsApp directamente al cliente.',
      },
      {
        id: 'equipos-soporte',
        question: '¿Necesito comprar una máquina especial?',
        answer:
          'No. Puedes usar cualquier celular, tablet o computadora con navegador web. El sistema se adapta a la pantalla que ya tienes.',
      },
    ],
  },
  {
    id: 'offline',
    title: 'Modo Offline y Conexión',
    description: 'Ventas que continúan aunque falle el internet.',
    items: [
      {
        id: 'sin-internet',
        question: '¿Qué pasa si se corta el internet en mi local?',
        answer:
          'Sigues cobrando normalmente. Tus ventas se guardan en el equipo y, apenas vuelve la señal, se sincronizan con tu panel sin perder información.',
      },
      {
        id: 'limite-offline',
        question: '¿Cuántas ventas puedo hacer sin internet?',
        answer:
          'Puedes continuar operando durante toda tu jornada. Al reconectarse el equipo, el sistema procesa los comprobantes pendientes automáticamente.',
      },
    ],
  },
  {
    id: 'caja',
    title: 'Punto de Venta y Cierre',
    description: 'Apertura de turno, arqueo y control diario de efectivo.',
    items: [
      {
        id: 'cierre-caja',
        question: '¿Cómo hago el cierre de caja al final del día?',
        answer:
          'En la sección de Caja seleccionas "Cerrar Turno". El sistema compara el efectivo esperado con el contado y genera el reporte consolidado.',
      },
      {
        id: 'varios-cajeros',
        question: '¿Puedo tener varios cajeros o vendedores en el mismo local?',
        answer:
          'Sí. Puedes asignar permisos para que cada vendedor registre sus ventas sin modificar precios ni ver los reportes globales del negocio.',
      },
    ],
  },
];

export function allHelpCategories(): readonly HelpCategory[] {
  return HELP_CATEGORIES;
}

export function searchHelpItems(query: string): HelpItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results: HelpItem[] = [];
  for (const cat of HELP_CATEGORIES) {
    for (const item of cat.items) {
      if (item.question.toLowerCase().includes(q) || item.answer.toLowerCase().includes(q)) {
        results.push(item);
      }
    }
  }
  return results;
}
