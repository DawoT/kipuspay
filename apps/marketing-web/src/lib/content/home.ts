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
      q: '¿Puedo devolver una venta y que se ajuste lo que me deben?',
      a: 'Si. Dentro de la ventana de dias que configures, la devolucion genera nota de credito o nota de venta de devolucion, restaura stock cuando aplica y, si fue a credito, rebaja lo pendiente en la misma operacion. El comprobante de devolucion cuenta en tu cupo; no se reembolsa el del original.',
    },
    {
      q: '¿Puedo controlar las compras a proveedores?',
      a: 'En el plan Cadena, si: armás la orden de compra, recibís (incluso en partes) y cruzás la factura del proveedor. Si no cuadra cantidad o precio, el sistema pide corrección o una autorizacion auditada. El saldo a pagar se abre al confirmar la factura, no al recibir mercaderia.',
    },
    {
      q: '¿Puedo armar promociones u ofertas?',
      a: 'Si, en el plan Crece: 2x1, porcentaje, umbrales y precios por tramo. La caja solo elige la promocion; el precio final siempre lo calcula KipusPay en el servidor, con anti-apilamiento configurable.',
    },
    {
      q: '¿Maneja tallas, colores, cajas y packs?',
      a: 'Si, en el plan Crece. Cada variante tiene stock, lotes y precio propios; las cajas, packs y fracciones se convierten con factores exactos en el servidor. Una presentacion editada no cambia tickets ni devoluciones anteriores.',
    },
    {
      q: '¿Puedo apartar mercaderia y cobrar un adelanto?',
      a: 'Si, en el plan Crece. El apartado reserva el producto y registra abonos; el comprobante se emite solo cuando conviertes a venta. Si cancelas, se reembolsa lo abonado sin nota de credito.',
    },
    {
      q: '¿Puedo devolver mercaderia al proveedor?',
      a: 'Si, en el plan Cadena. La devolucion revierte stock y costo promedio, baja lo que debes si la factura ya estaba abierta y no emite una nota de credito SUNAT tuya: la NC es del proveedor. Distinto de devolver una venta al cliente.',
    },
    {
      q: '¿Puedo vender vales o gift cards?',
      a: 'Si, en Crece/Cadena. Vender un vale es una venta (comprobante y cupo). Al canjearlo KipusPay aplica el saldo en el servidor, no el monto que teclea la caja. Si el cliente devuelve sin reembolso en efectivo, puede pasar a credito de tienda con su consentimiento.',
    },
    {
      q: '¿Puedo cobrar una venta a credito en cuotas?',
      a: 'Si, en Crece/Cadena. Armas un plan sobre la cuenta por cobrar: solo el capital baja lo que te deben; el interes se registra aparte. Si se atrasa una cuota, el Dueño lo ve y la caja sigue vendiendo. No es un apartado ni un vale.',
    },
    {
      q: '¿Puedo emitir cotizaciones o presupuestos?',
      a: 'Si. La cotizacion congela el precio que calcula KipusPay y no emite comprobante ni reserva stock. Al convertir a venta se respeta ese precio aunque la lista haya cambiado; si vencio, hay que recotizar.',
    },
    {
      q: '¿Mi contador puede ver el diario?',
      a: 'En el plan Cadena, si: el diario se genera solo con cada venta, cobro y arqueo. La pantalla es de lectura; el export Contasis/Concar usa los mismos asientos.',
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
    path: '/ayuda',
    title: 'Ayuda',
    unlockSprint: 13,
    blurb:
      'El centro de ayuda se publica junto con el registro, con guias cortas y respuestas de personas reales, en espanol.',
    meanwhile: [{ label: 'Ver preguntas frecuentes', href: '/#preguntas' }],
  },
] as const;
