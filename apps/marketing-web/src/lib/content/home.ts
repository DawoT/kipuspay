export const HOME = {
  brand: 'KipusPay',
  eyebrow: 'PUNTO DE VENTA Y GESTIÓN COMERCIAL · PERÚ',
  headline: 'Atiende más rápido, organiza tu caja y controla tu negocio desde el celular.',
  subheadline:
    'Una solución de caja y gestión para el comercio peruano. Cobra con efectivo, tarjetas y billeteras digitales; Modo Dueño muestra datos actualizados a medida que tus cajas sincronizan. Las opciones de facturación electrónica dependen de su habilitación y SUNAT determina la aceptación de cada comprobante. Configura tu negocio con una guía paso a paso, a tu ritmo.',
  ctaPrimary: 'Probar gratis ahora',
  ctaSecondary: 'Ver cómo funciona',
  trustLine: 'La aceptación de comprobantes depende de SUNAT · Sin contratos de permanencia',
  activation: 'Configuración guiada, paso a paso',
  heroBadges: [
    {
      icon: 'lightning',
      title: 'Cobro en segundos',
      description: 'Efectivo, tarjetas y Yape / Plin sin demoras',
    },
    {
      icon: 'smartphone',
      title: 'Control de tu negocio',
      description: 'Ventas, caja y stock según la última sincronización',
    },
    {
      icon: 'shield-check',
      title: 'Facturación según habilitación',
      description: 'SUNAT determina la aceptación de cada comprobante',
    },
    {
      icon: 'sync',
      title: 'Continúa atendiendo si falla la conexión',
      description: 'Las ventas pendientes se sincronizan cuando vuelve internet',
    },
  ],
  pillars: [
    {
      key: 'speed',
      icon: 'reloj',
      eyebrow: 'Agilidad en caja',
      title: 'Atención ágil en segundos: Cero colas en tu hora punta.',
      description:
        'Tus clientes no tienen que esperar. Cobra en un toque con efectivo, tarjeta o billeteras digitales (Yape/Plin), imprime o envía el ticket al instante y atiende al ritmo que tu local merece.',
    },
    {
      key: 'continuity',
      icon: 'senal',
      eyebrow: 'Confiabilidad total',
      title: 'Continúa atendiendo cuando la conexión falla.',
      description:
        'Puedes seguir registrando ventas y consultar su estado en pantalla. Al volver internet, la información pendiente se sincroniza en segundo plano.',
    },
    {
      key: 'control',
      icon: 'balanza',
      eyebrow: 'Modo Dueño y formalización',
      title: 'Cuentas claras y tranquilidad total: Cada sol en su lugar.',
      description:
        'Cierra el día en un clic con arqueos automáticos y revisa tus ingresos desde el celular con Modo Dueño, actualizados a medida que las cajas sincronizan. Las opciones de facturación electrónica dependen de su habilitación; SUNAT determina la aceptación de cada comprobante.',
    },
  ],
  steps: [
    {
      title: 'Cuéntanos de tu negocio',
      body: 'Dinos tu rubro y tu etapa: control interno o facturación electrónica. El registro completo con tu RUC se habilita cuando abra la creación de cuentas.',
    },
    {
      title: 'Elige tu rubro y tu etapa',
      body: 'Restaurante, farmacia, retail o servicios; y si hoy necesitas control interno o facturación electrónica.',
    },
    {
      title: 'Empieza a vender',
      body: 'Completa tu primera venta guiada. La impresora física se configura después, nunca bloquea el cobro.',
    },
  ],
  product: {
    eyebrow: 'La caja por dentro',
    headline: 'Esto es lo que ve tu cajero.',
    body: 'Una pantalla que organiza la venta: el producto, el total grande y el botón de cobrar. El documento disponible depende de la etapa y habilitación de tu negocio. La venta queda guardada y su estado se muestra en pantalla.',
    points: [
      'El total manda: es lo único que se mira antes de cobrar',
      'El documento correcto para tu etapa, sin confundir nota de venta con boleta',
      'La venta se guarda primero y se envía después, sin bloquear la caja',
    ],
    demo: {
      documentLabel: 'Nota de venta',
      register: 'Caja 1',
      syncState: 'pending',
      caption: 'Ejemplo de pantalla: la venta ya está cobrada.',
      lines: [
        { qty: 2, name: 'Pan francés', amount_cents: 300 },
        { qty: 1, name: 'Leche entera 1L', amount_cents: 560 },
        { qty: 3, name: 'Yogurt de fresa', amount_cents: 1170 },
      ],
    },
  },
  offline: {
    eyebrow: 'Confiabilidad total',
    headline: 'El internet se corta. Tus ventas, no.',
    body: 'Si tu conexión falla, puedes seguir registrando ventas según la configuración de tu caja. Cuando la señal regresa, la información pendiente se sincroniza. Las funciones fiscales dependen de la habilitación de tu negocio y de las respuestas de SUNAT.',
    withOthers: 'Dejas de vender',
    withKipus: 'Sigues cobrando; se sincroniza después',
  },
  ledger: {
    eyebrow: 'Control financiero',
    headline: 'Control financiero transparente sol a sol.',
    body: 'Inspirado en los quipus: cada venta, ingreso o cobro queda registrado de forma ordenada, inmutable y clara para ti y tu contador.',
    points: [
      'Cada venta queda registrada, sin huecos ni ventas fantasma',
      'Cierre de caja claro: la diferencia se explica sola',
      'El inventario descuenta en el instante, no al final del día',
    ],
  },
  owner: {
    eyebrow: 'Modo Dueño',
    headline: 'Sabe cómo te va, sin estar ahí.',
    body: 'Consulta desde tu celular las ventas registradas de tus locales y la información financiera disponible. Los datos se actualizan cuando sincronizan las cajas; la antigüedad de la información puede variar.',
    note: 'Los reportes avanzados dependen de tu plan.',
  },
  trust: {
    eyebrow: 'Confianza',
    headline: 'Tan seguro como tu banco. Tan simple como tu celular.',
    items: [
      {
        icon: 'candado',
        title: 'Tu información va cifrada, siempre.',
        body: 'Nunca viaja ni se guarda en texto plano.',
      },
      {
        icon: 'documento',
        title: 'Tus datos son tuyos. Punto.',
        body: 'La exportación y los derechos de privacidad se habilitan con cada avance del producto.',
      },
      {
        icon: 'sello',
        title: 'Facturación según habilitación.',
        body: 'Las opciones dependen de la habilitación de tu negocio; SUNAT determina la aceptación de cada comprobante.',
      },
      {
        icon: 'personas',
        title: 'Soporte real, en español.',
        body: 'Con personas reales, no un bot que te deja esperando.',
      },
    ],
  },
  faq: [
    {
      q: '¿Necesito internet para usarlo?',
      a: 'Si la conexión se interrumpe, puedes seguir registrando ventas según la configuración de tu caja. Al volver internet, los datos pendientes se sincronizan; las funciones fiscales dependen de la habilitación de tu negocio.',
    },
    {
      q: '¿Emite boletas y facturas válidas para SUNAT?',
      a: 'Las opciones de facturación electrónica dependen de su habilitación y de tu configuración fiscal; SUNAT determina la aceptación de cada comprobante. Si aún te formalizas, puedes usar una nota de venta de control interno, claramente etiquetada.',
    },
    {
      q: '¿Qué es una nota de venta y en qué se diferencia de una boleta?',
      a: 'La nota de venta es tu control interno de caja e inventario: no es un comprobante autorizado por SUNAT. La boleta y la factura sí lo son. KipusPay nunca confunde las dos.',
    },
    {
      q: '¿Cuándo me piden el DNI del cliente?',
      a: 'En boletas de S/ 700 o más es obligatorio registrar el documento y el nombre. En montos menores es opcional, salvo que el cliente lo pida. En facturas siempre se pide RUC.',
    },
    {
      q: '¿Puedo usar KipusPay si aún no estoy formalizado?',
      a: 'Sí. Puedes empezar con una nota de venta para control interno. Las opciones de facturación electrónica aún no están disponibles para activación general.',
    },
    {
      q: '¿Cómo subo todos mis productos?',
      a: 'Puedes importar tu catálogo desde un archivo CSV y empezar a cobrar el mismo día.',
    },
    {
      q: '¿Qué pasa si se corta internet durante una venta?',
      a: 'Puedes seguir registrando ventas según la configuración de tu caja. Al volver internet, los datos pendientes se sincronizan. Las opciones de facturación dependen de la habilitación de tu negocio; SUNAT determina la aceptación de cada comprobante.',
    },
    {
      q: '¿Puedo cambiar de plan cuando crezca mi negocio?',
      a: 'Sí, sin perder configuración ni historial. Nunca apagamos tu caja por volumen: subes de plan cuando tu negocio pide más.',
    },
    {
      q: '¿Qué pasa si se me pasa la fecha de pago?',
      a: 'Nunca te apagamos en plena venta. Tienes días de gracia para actualizar tu método de pago y sigues cobrando con normalidad.',
    },
    {
      q: '¿Puedo devolver una venta y que se ajuste lo que me deben?',
      a: 'Sí. Dentro de la ventana de días que configures, la devolución genera nota de crédito o nota de venta de devolución, restaura stock cuando aplica y, si fue a crédito, rebaja lo pendiente en la misma operación. El comprobante de devolución cuenta en tu cupo; no se reembolsa el del original.',
    },
    {
      q: '¿Puedo controlar las compras a proveedores?',
      a: 'En el plan Cadena, sí: creas la orden, recibes la mercadería (incluso en partes) y cotejas la factura del proveedor. Si no cuadra cantidad o precio, el sistema pide corrección o una autorización auditada. El saldo a pagar se abre al confirmar la factura, no al recibir mercadería.',
    },
    {
      q: '¿Puedo armar promociones u ofertas?',
      a: 'Sí, en el plan Crece: 2x1, porcentaje, umbrales y precios por tramo. La caja solo elige la promoción; el precio final siempre lo calcula KipusPay en el servidor, con anti-apilamiento configurable.',
    },
    {
      q: '¿Maneja tallas, colores, cajas y packs?',
      a: 'Sí, en el plan Crece. Cada variante tiene stock, lotes y precio propios; las cajas, packs y fracciones se convierten con factores exactos en el servidor. Una presentación editada no cambia tickets ni devoluciones anteriores.',
    },
    {
      q: '¿Puedo apartar mercadería y cobrar un adelanto?',
      a: 'Sí, en el plan Crece. El apartado reserva el producto y registra abonos; el comprobante se emite solo cuando conviertes a venta. Si cancelas, se reembolsa lo abonado sin nota de crédito.',
    },
    {
      q: '¿Puedo devolver mercadería al proveedor?',
      a: 'Sí, en el plan Cadena. La devolución revierte stock y costo promedio, baja lo que debes si la factura ya estaba abierta y no emite una nota de crédito SUNAT tuya: la NC es del proveedor. Distinto de devolver una venta al cliente.',
    },
    {
      q: '¿Puedo vender vales o gift cards?',
      a: 'Sí, en Crece/Cadena. Vender un vale es una venta (comprobante y cupo). Al canjearlo KipusPay aplica el saldo en el servidor, no el monto que teclea la caja. Si el cliente devuelve sin reembolso en efectivo, puede pasar a crédito de tienda con su consentimiento.',
    },
    {
      q: '¿Puedo cobrar una venta a crédito en cuotas?',
      a: 'Sí, en Crece/Cadena. Armas un plan sobre la cuenta por cobrar: solo el capital baja lo que te deben; el interés se registra aparte. Si se atrasa una cuota, el Dueño lo ve y la caja sigue vendiendo. No es un apartado ni un vale.',
    },
    {
      q: '¿Puedo pagar comisiones a mis vendedores?',
      a: 'Sí, en el plan Crece. Configuras la tasa por vendedor; KipusPay calcula el monto al vender y una nota de crédito revierte el devengo. El payout lo arma Admin o Dueño. No es nómina ni planilla.',
    },
    {
      q: '¿Puedo saber en qué rack está cada producto?',
      a: 'Sí, en el plan Cadena. Organizas ubicaciones por sucursal, cuentas y transfieres stock entre racks, recibes una ruta de picking por vencimiento y descargas el detalle en CSV. Mover entre racks nunca cambia el total de la sucursal. Números de serie, balanza, etiquetas y copia de seguridad siguen en el roadmap.',
    },
    {
      q: '¿Puedo emitir cotizaciones o presupuestos?',
      a: 'Sí. La cotización congela el precio que calcula KipusPay y no emite comprobante ni reserva stock. Al convertir a venta se respeta ese precio aunque la lista haya cambiado; si venció, hay que recotizar.',
    },
    {
      q: '¿Mi contador puede ver el diario?',
      a: 'La disponibilidad del diario y de formatos de exportación depende de las funciones habilitadas en tu plan. Revisa cualquier archivo con tu contador antes de incorporarlo a otro sistema.',
    },
    {
      q: '¿Necesito comprar un equipo especial?',
      a: 'No. Funciona en la tablet, el celular o la computadora que ya tienes. Conectar una impresora térmica es opcional y se configura después de tu primera venta.',
    },
    {
      q: '¿Puedo llevarme mis datos si decido cancelar?',
      a: 'La exportación self-serve al cancelar y el flujo de borrado aún no están disponibles. Publicaremos el alcance y el procedimiento cuando esas funciones estén habilitadas.',
    },
    {
      q: '¿Puedo vender al crédito?',
      a: 'Sí. Asignas un límite de crédito por cliente y la venta a crédito queda como cuenta por cobrar; cobras cuotas o abonos después sin descuadrar la caja. Si hay devolución, la nota de crédito rebaja el saldo pendiente automáticamente.',
    },
  ],
  finalCta: {
    headline: 'Tu próxima venta puede ser la primera con KipusPay.',
    cta: 'Probar gratis ahora',
    microcopy: '30 días de prueba real · Cancela cuando quieras · Sin letra chica',
  },
} as const;
