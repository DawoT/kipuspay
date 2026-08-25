/**
 * Página /seguridad — GTM §5.7.1 / Sprint 13.
 * Claims ≤ lo implementado y probado en Fases 1–2 (+ gates ya cerrados).
 *
 * Evidencia interna (control — jamás se renderiza; el copy público no la cita):
 *  - encryption: Arquitectura seguridad transporte + ASVS L2 (Sprint 2).
 *  - ownership: GTM-09 · Sprints 42/47 (export y LPDP).
 *  - sunat: GTM-08 · ADR-FISCAL-001 · Sprints 5/5b (envío/plazos/RC).
 *  - support: docs/ops/support_sla_enterprise.md · GTM-02.
 *  - disclaimers: GTM-12 (badges), GTM-07 (nota de venta), GTM §4.3 (gracia).
 */

export interface SecurityPillar {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

export const SECURITY_PAGE = {
  title: 'Seguridad y confianza',
  headline: 'Tan seguro como tu banco. Tan simple como tu celular.',
  lede: 'Tu caja es tu dinero. Aquí solo afirmamos lo que ya está construido y probado — nada de sellos inventados.',
  pillars: [
    {
      id: 'encryption',
      title: 'Tu información va cifrada, siempre.',
      body: 'El tráfico hacia KipusPay usa HTTPS. No guardamos secretos de pago ni claves privadas en texto plano en el dispositivo de caja.',
    },
    {
      id: 'ownership',
      title: 'Tus datos son tuyos.',
      body: 'Puedes exportar tu catálogo y tus ventas cuando quieras, incluso al momento de cancelar. El borrado de datos personales respeta la retención fiscal que exige SUNAT: anonimizamos y conservamos el comprobante sin tu nombre.',
    },
    {
      id: 'sunat',
      title: 'Acompañamiento para SUNAT.',
      body: 'Cuando activas facturación, KipusPay guía el envío y los plazos. La aceptación final la decide SUNAT; nunca afirmamos "aceptado" antes de la respuesta oficial.',
    },
    {
      id: 'support',
      title: 'Soporte real, en español.',
      body: 'Personas reales según tu plan. El soporte prioritario Enterprise queda definido en el contrato de servicio de tu plan.',
    },
  ] as const satisfies readonly SecurityPillar[],
  disclaimers: [
    'No publicamos badges de "cumple normativa" ni logos de terceros sin autorización y evidencia vigente.',
    'La nota de venta de control interno no es comprobante autorizado por SUNAT.',
    'Nunca apagamos la caja por un ticket de soporte o un pago de suscripción en periodo de gracia.',
  ] as const,
  /** Proceso real de envío — los pasos sí son una secuencia (numeración válida). */
  sunatFlow: {
    eyebrow: 'Así funciona el envío',
    heading: 'De tu caja a SUNAT, paso a paso.',
    steps: [
      {
        title: 'Vendes y el documento se genera',
        body: 'La venta queda registrada al instante, con o sin internet. El comprobante nace en el momento del cobro, no después.',
      },
      {
        title: 'KipusPay lo envía por ti',
        body: 'Al activar la facturación, el envío a SUNAT ocurre solo: las facturas se envían de inmediato y las boletas se agrupan en el resumen del día.',
      },
      {
        title: 'Se acerca un plazo y te avisamos',
        body: 'Si algo está por vencer (envíos pendientes o bajas), la caja y el Modo Dueño te avisan antes de que el plazo te gane.',
      },
      {
        title: 'SUNAT responde y eso es lo que cuenta',
        body: 'La aceptación la decide SUNAT. KipusPay muestra el estado real de cada comprobante: pendiente, aceptado o rechazado. Nada de "aceptado" anticipado.',
      },
    ],
  },
  retention: {
    heading: 'Cuánto guardamos y por qué',
    body: 'Los comprobantes fiscales se conservan alrededor de 5 años, como exige SUNAT. Si un cliente pide borrar sus datos, anonimizamos su nombre, correo, teléfono y dirección; los comprobantes se conservan sin su nombre. El borrado no es "cuando quieras": la retención fiscal va primero y siempre lo decimos.',
  },
  sla: {
    heading: 'Soporte según tu plan',
    body: 'Arranque y Crece incluyen soporte por chat, en español, con personas reales. Cadena incluye account manager dedicado. Enterprise firma un contrato de servicio con soporte prioritario y tiempos definidos; Crece no lo promete.',
    severities: [
      {
        title: 'Prioridad Crítica: Interrupción del cobro',
        body: 'Respuesta en 1 hora calendario en Enterprise (atención continua) y 4 horas hábiles en el resto de planes.',
      },
      {
        title: 'Prioridad Alta: Trámites tributarios',
        body: 'Respuesta en 4 horas hábiles en Enterprise y 1 día hábil en el resto de planes (envíos o bajas ante SUNAT por vencer).',
      },
      {
        title: 'Prioridad Normal: Consultas y configuración',
        body: 'Respuesta en 1 día hábil en Enterprise y 2 días hábiles en el resto de planes. El canal oficial es soporte@kipuspay.com.',
      },
    ],
  },
  uptime: {
    eyebrow: 'Compromiso de servicio',
    heading: 'Disponibilidad con números, no con promesas.',
    points: [
      {
        title: '99.9% de disponibilidad mensual',
        body: 'Es el compromiso contractual de la plataforma. La caja local, además, sigue cobrando e imprimiendo sin internet: el punto de venta no depende de la nube para vender.',
      },
      {
        title: 'Si la caja no cobra, respondemos en horas',
        body: 'En Enterprise, respuesta en 1 hora calendario (atención continua). En los demás planes, 4 horas hábiles. El canal oficial es soporte@kipuspay.com.',
      },
      {
        title: 'La caja nunca se apaga',
        body: 'Ni por un pago en gracia ni por volumen: el cobro en tienda y la emisión de comprobantes siguen activos mientras se resuelve cualquier tema administrativo.',
      },
    ],
  },
} as const;

/** Textos prohibidos en copy de /seguridad (anti-engaño). */
export const SECURITY_FORBIDDEN = [
  /contingencia/i,
  /aceptad[oa] por SUNAT(?!.*depende)/i,
  /sin limite de retencion/i,
  /borramos todo cuando quieras/i,
  /certificad[oa] SUNAT/i,
] as const;
