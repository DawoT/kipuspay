export const HOME = {
  brand: 'KipusPay',
  eyebrow: 'POS y facturacion para comercios del Peru',
  headline: 'El unico POS que no se cae contigo.',
  subheadline:
    'Vende, cobra y factura aunque se corte la luz, el internet, o sea tu dia de mas gente. Configuralo en minutos. Sin contratos largos, sin instalador, sin dolores de cabeza.',
  ctaPrimary: 'Empieza gratis',
  ctaSecondary: 'Ver como funciona',
  trustLine: 'Sin contratos largos · Tus datos, siempre tuyos · Configuralo en minutos',
  activation: 'Tu primera venta en menos de 5 minutos',
  pains: [
    {
      icon: 'reloj',
      pain: 'Se me lleno la cola y el sistema se puso lento.',
      relief: 'Tu caja sigue al ritmo de tu local.',
    },
    {
      icon: 'senal',
      pain: 'Se corto el internet y perdi la venta.',
      relief: 'Sigues cobrando; se sincroniza despues.',
    },
    {
      icon: 'balanza',
      pain: 'A fin de mes nadie explica el descuadre.',
      relief: 'Ves el dia con claridad, sin drama.',
    },
  ],
  steps: [
    {
      title: 'Cuentanos de tu negocio',
      body: 'Dinos tu rubro y tu etapa: control interno o facturacion electronica. El registro completo con tu RUC se habilita cuando abra la creacion de cuentas.',
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
  product: {
    eyebrow: 'La caja por dentro',
    headline: 'Esto es lo que ve tu cajero.',
    body: 'Una pantalla que se aprende en un turno: el producto, el total grande y el boton de cobrar. Arriba, el documento que emite tu negocio segun tu etapa. Abajo, la costura que avisa que la venta ya esta guardada y se termina de enviar sola.',
    points: [
      'El total manda: es lo unico que se mira antes de cobrar',
      'El documento correcto para tu etapa, sin confundir nota de venta con boleta',
      'La venta se guarda primero y se envia despues, sin bloquear la caja',
    ],
    demo: {
      documentLabel: 'Boleta electronica',
      register: 'Caja 1',
      syncState: 'pending',
      caption: 'Ejemplo de pantalla: la venta ya esta cobrada.',
      lines: [
        { qty: 2, name: 'Pan frances', amount_cents: 300 },
        { qty: 1, name: 'Leche entera 1L', amount_cents: 560 },
        { qty: 3, name: 'Yogurt de fresa', amount_cents: 1170 },
      ],
    },
  },
  offline: {
    eyebrow: 'Offline de verdad',
    headline: 'El internet se corta. Tus ventas, no.',
    body: 'Si tu conexion falla, KipusPay sigue funcionando exactamente igual: cobras, imprimes y sigues atendiendo. Cuando la señal regresa, todo se sincroniza solo — el envio de comprobantes y el resumen diario incluidos — y te avisa si algo se acerca al plazo legal.',
    withOthers: 'Dejas de vender',
    withKipus: 'Sigues cobrando; se sincroniza despues',
  },
  ledger: {
    eyebrow: 'Control antiperdidas',
    headline: 'Se acabaron los descuadres que nadie puede explicar.',
    body: 'KipusPay descuenta el inventario exacto en el momento exacto de cada venta. Si un producto salio de tu tienda, quedo registrado. Al cerrar caja, ves en un vistazo si algo no cuadra, y por que.',
    points: [
      'Cada venta queda registrada, sin huecos ni ventas fantasma',
      'Cierre de caja claro: la diferencia se explica sola',
      'El inventario descuenta en el instante, no al final del dia',
    ],
  },
  owner: {
    eyebrow: 'Modo Dueno',
    headline: 'Sabe como te va, sin estar ahi.',
    body: 'Desde tu celular, ve las ventas de todos tus locales y cuanto ganaste hoy, actualizado a medida que las cajas sincronizan — antes de que termine el dia. Como revisar tu cuenta bancaria, pero de tu negocio.',
    note: 'Los reportes avanzados dependen de tu plan.',
  },
  trust: {
    eyebrow: 'Confianza',
    headline: 'Tan seguro como tu banco. Tan simple como tu celular.',
    items: [
      {
        icon: 'candado',
        title: 'Tu informacion va cifrada, siempre.',
        body: 'Nunca viaja ni se guarda en texto plano.',
      },
      {
        icon: 'documento',
        title: 'Tus datos son tuyos. Punto.',
        body: 'La exportacion y los derechos de privacidad se habilitan con cada avance del producto.',
      },
      {
        icon: 'sello',
        title: 'Acompanamiento para SUNAT.',
        body: 'Guiamos el envio, los plazos y los estados; la aceptacion final siempre depende de SUNAT.',
      },
      {
        icon: 'personas',
        title: 'Soporte real, en espanol.',
        body: 'Con personas reales, no un bot que te deja esperando.',
      },
    ],
  },
  faq: [
    {
      q: '¿Necesito internet para usarlo?',
      a: 'Solo la primera vez, para configurarlo. Despues funciona sin conexion cuando la necesites: sigues cobrando y, al volver la señal, KipusPay sincroniza solo y te avisa si algo se acerca al plazo de declaracion.',
    },
    {
      q: '¿Emite boletas y facturas validas para SUNAT?',
      a: 'Cuando activas facturacion electronica, KipusPay se encarga del envio y te acompana en el proceso; la aceptacion final siempre depende de SUNAT. Si aun te formalizas, empiezas con nota de venta de control interno, claramente etiquetada.',
    },
    {
      q: '¿Que es una nota de venta y en que se diferencia de una boleta?',
      a: 'La nota de venta es tu control interno de caja e inventario: no es un comprobante autorizado por SUNAT. La boleta y la factura si lo son. KipusPay nunca confunde las dos.',
    },
    {
      q: '¿Cuando me piden el DNI del cliente?',
      a: 'En boletas de S/ 700 o mas es obligatorio registrar el documento y el nombre. En montos menores es opcional, salvo que el cliente lo pida. En facturas siempre se pide RUC.',
    },
    {
      q: '¿Puedo usar KipusPay si aun no estoy formalizado?',
      a: 'Si. Eliges control interno, cobras con nota de venta y activas facturacion desde Configuracion cuando estes listo, sin perder historial.',
    },
    {
      q: '¿Como subo todos mis productos?',
      a: 'Puedes importar tu catalogo desde un archivo CSV y empezar a cobrar el mismo dia.',
    },
    {
      q: '¿Que pasa si se corta el internet y no se envian mis boletas?',
      a: 'Sigues cobrando. KipusPay reintenta el envio y el resumen diario al volver la señal, y te avisa si se acerca el plazo legal. No apagamos la caja.',
    },
    {
      q: '¿Puedo cambiar de plan cuando crezca mi negocio?',
      a: 'Si, sin perder configuracion ni historial. Nunca apagamos tu caja por volumen: subes de plan cuando tu negocio pide mas.',
    },
    {
      q: '¿Que pasa si se me pasa la fecha de pago?',
      a: 'Nunca te apagamos en plena venta. Tienes dias de gracia para actualizar tu metodo de pago y sigues cobrando con normalidad.',
    },
    {
      q: '¿Necesito comprar un equipo especial?',
      a: 'No. Funciona en la tablet, el celular o la computadora que ya tienes. Conectar una impresora termica es opcional y se configura despues de tu primera venta.',
    },
  ],
  finalCta: {
    headline: 'Tu proxima venta puede ser la primera con KipusPay.',
    cta: 'Empieza gratis ahora',
    microcopy: '30 días de prueba real · Cancela cuando quieras · Sin letra chica',
  },
} as const;

export const STUBS = [
  {
    path: '/precios',
    title: 'Precios',
    unlockSprint: 11,
    blurb:
      'Estamos afinando los planes para publicarlos con el detalle que mereces: que incluye cada uno, hasta donde llega y sin letra chica. No queremos publicar un numero que despues cambie.',
    meanwhile: [
      { label: 'Ver que cambia en tu caja', href: '/comparar/bsale' },
      { label: 'Ver tu rubro', href: '/para/retail' },
    ],
  },
  {
    path: '/seguridad',
    title: 'Seguridad',
    unlockSprint: 13,
    blurb:
      'La pagina completa de seguridad y privacidad se publica junto con la revision independiente que la respalda. Lo esencial ya esta dicho en el inicio: tu informacion va cifrada y es tuya.',
    meanwhile: [{ label: 'Leer los compromisos de confianza', href: '/#confianza' }],
  },
  {
    path: '/casos-de-exito',
    title: 'Casos de exito',
    unlockSprint: 12,
    blurb:
      'Preferimos publicar casos reales cuando tengamos meses de operacion que mostrar, con nombre del negocio y numeros verificables. Testimonios de lanzamiento no le sirven a nadie.',
    meanwhile: [{ label: 'Ver como funciona', href: '/#como' }],
  },
  {
    path: '/empezar',
    title: 'Empezar',
    unlockSprint: 11,
    blurb:
      'El registro abre en los proximos dias. Cuando abra, la promesa es simple: contestas tres preguntas sobre tu negocio, cargas tus productos y cobras. Tu primera venta en menos de 5 minutos.',
    meanwhile: [
      { label: 'Ver tu rubro', href: '/para/restaurantes' },
      { label: 'Ver la comparativa', href: '/comparar/bsale' },
    ],
  },
  {
    path: '/blog',
    title: 'Blog',
    unlockSprint: 12,
    blurb:
      'Estamos escribiendo guias practicas para comercios: como cuadrar tu caja sin pelearte con el cuaderno, que cambia cuando te formalizas y como controlar el inventario sin volverte loco.',
    meanwhile: [{ label: 'Volver al inicio', href: '/' }],
  },
  {
    path: '/ayuda',
    title: 'Ayuda',
    unlockSprint: 13,
    blurb:
      'El centro de ayuda se publica junto con el registro, con guias cortas y respuestas de personas reales, en espanol.',
    meanwhile: [{ label: 'Ver preguntas frecuentes', href: '/#preguntas' }],
  },
] as const;
