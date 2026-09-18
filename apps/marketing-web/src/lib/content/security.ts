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
      body: 'Las herramientas self-serve para exportación y solicitudes sobre datos personales aún están en preparación. Consulta la política de privacidad y sus canales de contacto para conocer las opciones vigentes.',
    },
    {
      id: 'sunat',
      title: 'Facturación sujeta a habilitación.',
      body: 'Las opciones de facturación electrónica aún no están disponibles para activación general. SUNAT determina la aceptación de cada comprobante.',
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
  /** Información de estado para no presentar capacidades fiscales bloqueadas como disponibles. */
  sunatFlow: {
    eyebrow: 'Antes de facturar electrónicamente',
    heading: 'Verifica la habilitación y los requisitos vigentes.',
    steps: [
      {
        title: 'La función depende de habilitación',
        body: 'La emisión electrónica aún no está disponible para activación general. Las condiciones se comunicarán cuando el servicio y el negocio estén habilitados.',
      },
      {
        title: 'Consulta los requisitos aplicables',
        body: 'Los requisitos y procedimientos tributarios dependen del tipo de comprobante y de la situación del negocio. Confirma la información vigente con SUNAT y otras fuentes oficiales aplicables.',
      },
      {
        title: 'No anticipes el resultado',
        body: 'La aceptación la determina SUNAT. No consideres un comprobante aceptado hasta contar con la respuesta oficial correspondiente.',
      },
      {
        title: 'Los estados requieren evidencia oficial',
        body: 'KipusPay no debe presentar como aceptado un comprobante sin la respuesta oficial que confirme ese estado.',
      },
    ],
  },
  retention: {
    heading: 'Cuánto guardamos y por qué',
    body: 'Los plazos de conservación dependen del tipo de información y de las obligaciones aplicables. Las solicitudes sobre datos personales requieren evaluación conforme a la política vigente y a las obligaciones legales de conservación.',
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
        title: 'Disponibilidad del servicio',
        body: 'La experiencia puede variar según la conexión y la configuración del equipo. La caja puede seguir registrando ventas sin internet según su configuración y capacidad local.',
      },
      {
        title: 'Si la caja no cobra, respondemos en horas',
        body: 'En Enterprise, respuesta en 1 hora calendario (atención continua). En los demás planes, 4 horas hábiles. El canal oficial es soporte@kipuspay.com.',
      },
      {
        title: 'La caja y la facturación son funciones distintas',
        body: 'La continuidad del registro de ventas depende de la configuración local. Las funciones fiscales dependen de su propia habilitación y de las respuestas oficiales correspondientes.',
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
