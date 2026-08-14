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
  lede: 'Tu caja es tu dinero. Aqui solo afirmamos lo que ya esta construido y probado — nada de sellos inventados.',
  pillars: [
    {
      id: 'encryption',
      title: 'Tu informacion va cifrada, siempre.',
      body: 'El trafico hacia KipusPay usa HTTPS. No guardamos secretos de pago ni claves privadas en texto plano en el dispositivo de caja.',
    },
    {
      id: 'ownership',
      title: 'Tus datos son tuyos.',
      body: 'Puedes exportar tu catalogo y tus ventas cuando quieras, incluso al momento de cancelar. El borrado de datos personales respeta la retencion fiscal que exige SUNAT: anonimizamos y conservamos el comprobante sin tu nombre.',
    },
    {
      id: 'sunat',
      title: 'Acompanamiento para SUNAT.',
      body: 'Cuando activas facturacion, KipusPay guia el envio y los plazos. La aceptacion final la decide SUNAT; nunca afirmamos "aceptado" antes de la respuesta oficial.',
    },
    {
      id: 'support',
      title: 'Soporte real, en espanol.',
      body: 'Personas reales segun tu plan. El soporte prioritario Enterprise queda definido en el contrato de servicio de tu plan.',
    },
  ] as const satisfies readonly SecurityPillar[],
  disclaimers: [
    'No publicamos badges de "cumple normativa" ni logos de terceros sin autorizacion y evidencia vigente.',
    'La nota de venta de control interno no es comprobante autorizado por SUNAT.',
    'Nunca apagamos la caja por un ticket de soporte o un pago de suscripcion en periodo de gracia.',
  ] as const,
  /** Proceso real de envío — los pasos sí son una secuencia (numeración válida). */
  sunatFlow: {
    eyebrow: 'Asi funciona el envio',
    heading: 'De tu caja a SUNAT, paso a paso.',
    steps: [
      {
        title: 'Vendes y el documento se genera',
        body: 'La venta queda registrada al instante, con o sin internet. El comprobante nace en el momento del cobro, no despues.',
      },
      {
        title: 'KipusPay lo envia por ti',
        body: 'Al activar la facturacion, el envio a SUNAT ocurre solo: las facturas se envian de inmediato y las boletas se agrupan en el resumen del dia.',
      },
      {
        title: 'Se acerca un plazo y te avisamos',
        body: 'Si algo esta por vencer (envios pendientes o bajas), la caja y el Modo Dueno te avisan antes de que el plazo te gane.',
      },
      {
        title: 'SUNAT responde y eso es lo que cuenta',
        body: 'La aceptacion la decide SUNAT. KipusPay muestra el estado real de cada comprobante: pendiente, aceptado o rechazado. Nada de "aceptado" anticipado.',
      },
    ],
  },
  retention: {
    heading: 'Cuanto guardamos y por que',
    body: 'Los comprobantes fiscales se conservan alrededor de 5 anos, como exige SUNAT. Si un cliente pide borrar sus datos, anonimizamos su nombre, correo, telefono y direccion; los comprobantes se conservan sin su nombre. El borrado no es "cuando quieras": la retencion fiscal va primero y siempre lo decimos.',
  },
  sla: {
    heading: 'Soporte segun tu plan',
    body: 'Arranque y Crece incluyen soporte por chat, en espanol, con personas reales. Cadena incluye account manager dedicado. Enterprise firma un contrato de servicio con soporte prioritario y tiempos definidos; Crece no lo promete.',
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
