export const HOME = {
  brand: 'KipusPay',
  headline: 'El unico POS que no se cae contigo.',
  subheadline:
    'Vende, cobra y factura aunque se corte la luz, el internet, o sea tu dia de mas gente. Configuralo en minutos. Sin contratos largos, sin instalador, sin dolores de cabeza.',
  ctaPrimary: 'Empieza gratis',
  ctaSecondary: 'Ver como funciona',
  trustLine:
    'Comercios ya venden con KipusPay · Prueba con tus datos reales · Tus datos, siempre tuyos',
  pains: [
    {
      pain: 'Se me lleno la cola y el sistema se puso lento.',
      relief: 'Tu caja sigue al ritmo de tu local.',
    },
    {
      pain: 'Se corto el internet y perdi la venta.',
      relief: 'Sigues cobrando; se sincroniza despues.',
    },
    {
      pain: 'A fin de mes nadie explica el descuadre.',
      relief: 'Ves el dia con claridad, sin drama.',
    },
  ],
  steps: [
    {
      title: 'Cuentanos de tu negocio',
      body: 'Si ya tienes RUC, traemos tus datos. Si aun formalizas, empiezas con el nombre de tu negocio.',
    },
    {
      title: 'Elige tu rubro y tu etapa',
      body: 'Restaurante, farmacia, retail o servicios; y si hoy necesitas control interno o facturacion electronica.',
    },
    {
      title: 'Empieza a vender',
      body: 'Completa tu primera venta guiada. La impresora fisica se configura despues, nunca bloquea el cobro.',
    },
  ],
} as const;

export const STUBS = [
  {
    path: '/precios',
    title: 'Precios',
    unlockSprint: 11,
    blurb:
      'Los cuatro planes y el cupo se publican en el Sprint 11. Mientras tanto, empieza cuando el registro este listo.',
  },
  {
    path: '/seguridad',
    title: 'Seguridad',
    unlockSprint: 13,
    blurb: 'La pagina ampliada de confianza se entrega en el Sprint 13, con firmas de seguridad.',
  },
  {
    path: '/casos-de-exito',
    title: 'Casos de exito',
    unlockSprint: 12,
    blurb: 'El indice de testimonios llega con los growth loops del Sprint 12.',
  },
  {
    path: '/empezar',
    title: 'Empezar',
    unlockSprint: 11,
    blurb:
      'El registro y la primera venta guiada se entregan en el Sprint 11. Este no es un onboarding alternativo.',
  },
  {
    path: '/blog',
    title: 'Blog',
    unlockSprint: 12,
    blurb: 'El contenido de growth loops se publica a partir del Sprint 12.',
  },
  {
    path: '/ayuda',
    title: 'Ayuda',
    unlockSprint: 13,
    blurb: 'El centro de ayuda ampliado acompana la salida de confianza del Sprint 13.',
  },
] as const;
