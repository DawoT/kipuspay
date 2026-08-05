/**
 * Página /seguridad — GTM §5.7.1 / Sprint 13.
 * Claims ≤ lo implementado y probado en Fases 1–2 (+ gates ya cerrados).
 * Prohibido: export/LPDP pleno (GTM-09), badges sin evidencia (GTM-12), aceptación SUNAT garantizada.
 */

export interface SecurityPillar {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  /** Referencia normativa o sprint de evidencia (no jerga en UI). */
  readonly evidenceRef: string;
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
      evidenceRef: 'Arquitectura seguridad transporte + ASVS L2 (Sprint 2)',
    },
    {
      id: 'ownership',
      title: 'Tus datos son tuyos.',
      body: 'Puedes operar y exportar lo que el producto ya habilita hoy. La exportacion completa y los derechos de borrado/LPDP se publican cuando cierren sus Quality Gates (Sprints 42 y 47) — no prometemos “cuando quieras” antes de eso.',
      evidenceRef: 'GTM-09 · Sprints 42/47',
    },
    {
      id: 'sunat',
      title: 'Acompanamiento para SUNAT.',
      body: 'Cuando activas facturacion, KipusPay guia el envio y los plazos. La aceptacion final la decide SUNAT; nunca afirmamos “aceptado” antes de la respuesta oficial.',
      evidenceRef: 'GTM-08 · ADR-FISCAL-001 · Sprints 5/5b',
    },
    {
      id: 'support',
      title: 'Soporte real, en espanol.',
      body: 'Personas reales segun tu plan. El soporte prioritario Enterprise esta definido en el contrato operativo de SLA (GTM-02).',
      evidenceRef: 'docs/ops/support_sla_enterprise.md · GTM-02',
    },
  ] as const satisfies readonly SecurityPillar[],
  disclaimers: [
    'No publicamos badges de “cumple normativa” ni logos de terceros sin autorizacion y evidencia vigente (GTM-12).',
    'La nota de venta de control interno no es comprobante autorizado por SUNAT (GTM-07).',
    'Nunca apagamos la caja por un ticket de soporte o un pago de suscripcion en gracia (GTM §4.3).',
  ] as const,
} as const;

/** Textos prohibidos en copy de /seguridad (anti-engaño). */
export const SECURITY_FORBIDDEN = [
  /contingencia/i,
  /aceptad[oa] por SUNAT(?!.*depende)/i,
  /sin limite de retencion/i,
  /borramos todo cuando quieras/i,
  /certificad[oa] SUNAT/i,
] as const;
