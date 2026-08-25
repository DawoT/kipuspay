/**
 * Centro de ayuda — Categorías y preguntas frecuentes para el dueño del comercio.
 * Copys en lenguaje claro de negocio, sin jerga técnica (GTM §1 / Rule V-26).
 * Claims congelados (PUBLIC_CLAIMS / GTM freeze) se marcan 'preparing' y se
 * muestran como "En preparación", igual que en /precios (guía Q1/Q7/§6).
 */

export interface HelpItem {
  readonly id: string;
  readonly question: string;
  readonly answer: string;
  readonly availability?: 'preparing';
}

export interface HelpCategory {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly items: readonly HelpItem[];
}

export const HELP_CATEGORIES: readonly HelpCategory[] = [
  {
    id: 'inicio',
    title: 'Primeros pasos e inicio rápido',
    description:
      'Configura tu cuenta, empieza a cobrar y opera con total fluidez desde el primer día.',
    items: [
      {
        id: 'primeros-pasos',
        question: '¿Cómo empiezo a vender con KipusPay y cuánto demora?',
        answer:
          'Creas tu cuenta, eliges tu rubro e importas tu catálogo de productos. En menos de 5 minutos estás listo para emitir tu primera venta desde cualquier celular, tablet o computadora.',
      },
      {
        id: 'activar-facturacion',
        question: '¿Cómo activo la emisión de boletas y facturas electrónicas?',
        availability: 'preparing',
        answer:
          'Ingresas tu RUC y datos del negocio en la configuración. KipusPay se encarga del envío automático a SUNAT por ti. No necesitas comprar certificados adicionales.',
      },
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
      {
        id: 'no-formalizado',
        question: '¿Puedo usar KipusPay si aún no estoy formalizado?',
        answer:
          'Sí. Puedes empezar con notas de venta para tu control interno de caja e inventario. Cuando obtengas tu RUC, activas facturación electrónica sin perder tu historial ni tus productos cargados.',
      },
      {
        id: 'pedidos-whatsapp',
        question: '¿Cómo funcionan los pedidos con retiro por WhatsApp?',
        availability: 'preparing',
        answer:
          'Tu cliente reserva sin pagar y recibe un aviso por WhatsApp cuando su pedido está listo para recoger. El pago se hace en tienda al momento de la entrega.',
      },
    ],
  },
  {
    id: 'hardware',
    title: 'Impresoras y Equipos compatibles',
    description:
      'Compatibilidad con impresoras térmicas 58/80mm, gavetas de dinero, balanzas y lectores.',
    items: [
      {
        id: 'impresora-compatible',
        question: '¿Qué impresoras puedo usar para imprimir tickets?',
        answer:
          'Funciona con impresoras térmicas Bluetooth, USB y de red (Ethernet/Wi-Fi) de 58mm y 80mm de marcas estándar como Epson, Xprinter y compatibles. También puedes enviar tickets por WhatsApp directamente al cliente.',
      },
      {
        id: 'equipos-soporte',
        question: '¿Necesito comprar una máquina especial?',
        answer:
          'No. Puedes usar cualquier celular, tablet o computadora con navegador web. El sistema se adapta a la pantalla que ya tienes sin requerir terminales costosos ni licencias por equipo.',
      },
      {
        id: 'gaveta-dinero',
        question: '¿Cómo se conecta una gaveta de dinero con conexión RJ11?',
        answer:
          'La gaveta se conecta directamente al puerto RJ11 de tu impresora térmica. Cada vez que registras un cobro en efectivo o abres turno, la señal de impresión abre la gaveta de forma automática.',
      },
      {
        id: 'balanza-digital',
        question: '¿Cómo funcionan las balanzas digitales para venta por peso?',
        answer:
          'Puedes conectar una balanza digital compatible para lectura automática del peso al colocar el producto, o ingresar el peso manualmente en pantalla con autorización asistida y cálculo instantáneo del precio.',
      },
      {
        id: 'lector-codigos',
        question: '¿Qué lectores de código de barras son compatibles?',
        answer:
          'Cualquier lector de código de barras USB o Bluetooth (pistolas láser 1D y lectores 2D para códigos QR) funciona de forma nativa sin drivers especiales al conectarlo a tu computadora, tablet o celular.',
      },
    ],
  },
  {
    id: 'sunat',
    title: 'Facturación Electrónica y SUNAT',
    description:
      'Emisión de boletas, facturas, notas de crédito y cumplimiento tributario sin complicaciones.',
    items: [
      {
        id: 'boleta-vs-factura',
        question: '¿Emite boletas y facturas válidas para SUNAT?',
        answer:
          'Cuando activas facturación electrónica, KipusPay se encarga del envío y te acompaña en el proceso; la aceptación final siempre depende de SUNAT. Si aún te formalizas, empiezas con nota de venta de control interno, claramente etiquetada.',
      },
      {
        id: 'nota-de-venta-vs-boleta',
        question: '¿Qué es una nota de venta y en qué se diferencia de una boleta?',
        answer:
          'La nota de venta es tu control interno de caja e inventario: no es un comprobante autorizado por SUNAT. La boleta y la factura sí lo son. KipusPay nunca confunde las dos.',
      },
      {
        id: 'dni-cliente',
        question: '¿Cuándo me piden el DNI del cliente?',
        answer:
          'En boletas de S/ 700 o más es obligatorio registrar el documento y el nombre. En montos menores es opcional, salvo que el cliente lo pida. En facturas siempre se pide RUC.',
      },
      {
        id: 'comprobantes-anulados',
        question: '¿Cómo anulo una venta o hago una nota de crédito?',
        answer:
          'Desde el historial de ventas seleccionas la transacción y eliges anular o emitir nota de crédito. El ajuste se envía a SUNAT de forma automática.',
      },
      {
        id: 'certificado-digital',
        question: '¿Necesito comprar un certificado digital para emitir comprobantes electrónicos?',
        answer:
          'No. KipusPay incluye el certificado digital tributario sin costo adicional para emitir boletas y facturas legalmente ante SUNAT, ahorrándote trámites notariales y renovaciones anuales.',
      },
      {
        id: 'envio-sunat-offline',
        question: '¿Qué pasa si se corta el internet y no se envían mis boletas?',
        answer:
          'Sigues cobrando. KipusPay reintenta el envío y el resumen diario al volver la señal, y te avisa si se acerca el plazo legal. No apagamos la caja.',
      },
    ],
  },
  {
    id: 'caja',
    title: 'Operaciones de Caja y Mostrador',
    description: 'Apertura y cierre de turno, arqueo ciego, cobros digitales y cuentas por cobrar.',
    items: [
      {
        id: 'cierre-caja',
        question: '¿Cómo hago el cierre de caja al final del día?',
        answer:
          'En la sección de Caja seleccionas "Cerrar Turno". El sistema compara el efectivo esperado con el contado y genera el reporte consolidado con detalle de pagos en efectivo, tarjeta y billeteras.',
      },
      {
        id: 'arqueo-ciego',
        question: '¿Cómo funciona el arqueo ciego para evitar descuadres en caja?',
        answer:
          'El cajero cuenta y declara el efectivo físico sin ver el monto teórico esperado por el sistema. El administrador o dueño ve la diferencia real en el reporte consolidado, previniendo manipulaciones.',
      },
      {
        id: 'cobro-digital',
        question: '¿Cómo registro pagos con Yape, Plin y tarjetas en el mostrador?',
        answer:
          'Al cobrar, seleccionas el medio de pago (Yape, Plin, tarjeta o efectivo) o combinas varios en una misma venta dividida. El sistema desglosa cada canal para que el cuadre de caja coincida sol a sol.',
      },
      {
        id: 'credito-clientes',
        question: '¿Puedo dar crédito a mis clientes sin perder el control de la caja?',
        answer:
          'Sí. Asignas un límite de crédito por cliente y cada venta a crédito queda registrada como cuenta por cobrar, con cuotas o abonos que vas cobrando después.',
      },
      {
        id: 'devolucion-credito',
        question: '¿Qué pasa si devuelven una compra que fue a crédito?',
        answer:
          'Al procesar la devolución con su nota de crédito, el saldo pendiente de la cuenta por cobrar se reduce automáticamente en el momento.',
      },
      {
        id: 'vales-giftcards',
        question: '¿Puedo vender vales o gift cards?',
        answer:
          'Sí, en Crece/Cadena. Vender un vale es una venta (comprobante y cupo). Al canjearlo KipusPay aplica el saldo en el servidor, no el monto que teclea la caja. Si el cliente devuelve sin reembolso en efectivo, puede pasar a crédito de tienda con su consentimiento.',
      },
      {
        id: 'apartados-adelantos',
        question: '¿Puedo apartar mercadería y cobrar un adelanto?',
        answer:
          'Sí, en el plan Crece. El apartado reserva el producto y registra abonos; el comprobante se emite solo cuando conviertes a venta. Si cancelas, se reembolsa lo abonado sin nota de crédito.',
      },
      {
        id: 'cotizaciones-presupuestos',
        question: '¿Puedo emitir cotizaciones o presupuestos?',
        answer:
          'Sí. La cotización congela el precio que calcula KipusPay y no emite comprobante ni reserva stock. Al convertir a venta se respeta ese precio aunque la lista haya cambiado; si venció, hay que recotizar.',
      },
      {
        id: 'comisiones-vendedores',
        question: '¿Puedo pagar comisiones a mis vendedores?',
        answer:
          'Sí, en el plan Crece. Configuras la tasa por vendedor; KipusPay calcula el monto al vender y una nota de crédito revierte el devengo. El payout lo arma Admin o Dueño. No es nómina ni planilla.',
      },
      {
        id: 'varios-cajeros',
        question: '¿Puedo tener varios cajeros o vendedores en el mismo local?',
        answer:
          'Sí. Puedes asignar permisos para que cada vendedor registre sus ventas sin modificar precios ni ver los reportes globales del negocio.',
      },
    ],
  },
  {
    id: 'inventario',
    title: 'Inventario y Gestión de Productos',
    description: 'Control de stock en tiempo real, variantes, lotes FEFO y compras a proveedores.',
    items: [
      {
        id: 'importar-catalogo',
        question: '¿Cómo subo todos mis productos?',
        answer:
          'Puedes importar tu catálogo desde un archivo CSV y empezar a cobrar el mismo día con categorías, precios y stock inicial mapeados en minutos.',
      },
      {
        id: 'alertas-stock',
        question: '¿Cómo funcionan las alertas de stock mínimo?',
        answer:
          'Defines un umbral mínimo por producto. Cuando las existencias bajan de ese nivel por ventas en mostrador, el sistema muestra alertas preventivas para evitar quiebres de inventario.',
      },
      {
        id: 'variantes-presentaciones',
        question: '¿Maneja tallas, colores, cajas y packs?',
        answer:
          'Sí, en el plan Crece. Cada variante tiene stock, lotes y precio propios; las cajas, packs y fracciones se convierten con factores exactos en el servidor. Una presentación editada no cambia tickets ni devoluciones anteriores.',
      },
      {
        id: 'lotes-vencimientos-fefo',
        question: '¿Cómo controlo los lotes y vencimientos de productos (FEFO)?',
        answer:
          'El sistema permite registrar número de lote y fecha de expiración, priorizando la venta del lote más próximo a vencer (criterio FEFO) y descontando stock en tiempo real.',
      },
      {
        id: 'tres-way',
        question: '¿Qué es la recepción de compras contra factura y para qué sirve?',
        answer:
          'Compara automáticamente tu orden de compra, la recepción de mercadería y la factura del proveedor, para que no pagues facturas con sobreprecio o cantidades que no recibiste.',
      },
      {
        id: 'devolucion-proveedor',
        question: '¿Puedo devolver mercadería al proveedor?',
        answer:
          'Sí, en el plan Cadena. La devolución revierte stock y costo promedio, baja lo que debes si la factura ya estaba abierta y no emite una nota de crédito SUNAT tuya: la NC es del proveedor. Distinto de devolver una venta al cliente.',
      },
      {
        id: 'ubicaciones-racks',
        question: '¿Puedo saber en qué rack está cada producto?',
        answer:
          'Sí, en el plan Cadena. Organizas ubicaciones por sucursal, cuentas y transfieres stock entre racks, recibes una ruta de picking por vencimiento y descargas el detalle en CSV. Mover entre racks nunca cambia el total de la sucursal.',
      },
      {
        id: 'promociones-ofertas',
        question: '¿Puedo armar promociones u ofertas?',
        answer:
          'Sí, en el plan Crece: 2x1, porcentaje, umbrales y precios por tramo. La caja solo elige la promoción; el precio final siempre lo calcula KipusPay en el servidor, con anti-apilamiento configurable.',
      },
      {
        id: 'balanza-manual',
        question: '¿Puedo vender por peso sin una balanza digital conectada?',
        answer:
          'Sí. Conectas una balanza compatible para la lectura automática o ingresas el peso manualmente con autorización en pantalla.',
      },
    ],
  },
  {
    id: 'planes',
    title: 'Planes, Modo Dueño y Exportación Contable',
    description: 'Monitoreo en vivo desde tu celular, reportes contables y gestión de suscripción.',
    items: [
      {
        id: 'modo-dueno',
        question: '¿Cómo funciona el Modo Dueño desde mi celular?',
        answer:
          'Desde tu teléfono revisas en tiempo real las ventas totales, el arqueo de cada caja y las ganancias del día a medida que las sucursales sincronizan, sin necesidad de estar físicamente en el local.',
      },
      {
        id: 'exportacion-contable',
        question: '¿Puedo exportar mis ventas a sistemas contables como Concar, SIRE o Contasis?',
        answer:
          'Sí. Puedes descargar tus reportes en formatos estructurados CSV y Excel compatibles con los formatos del SIRE y los principales sistemas contables como Concar y Contasis, facilitando el trabajo mensual de tu contador.',
      },
      {
        id: 'diario-contable',
        question: '¿Mi contador puede ver el diario?',
        answer:
          'En el plan Cadena, sí: el diario se genera solo con cada venta, cobro y arqueo. La pantalla es de lectura; el export Contasis/Concar usa los mismos asientos.',
      },
      {
        id: 'cambio-plan',
        question: '¿Puedo cambiar de plan cuando crezca mi negocio?',
        answer:
          'Sí, sin perder configuración ni historial. Nunca apagamos tu caja por volumen: subes de plan cuando tu negocio pide más.',
      },
      {
        id: 'fecha-pago',
        question: '¿Qué pasa si se me pasa la fecha de pago?',
        answer:
          'Nunca te apagamos en plena venta. Tienes días de gracia para actualizar tu método de pago y sigues cobrando con normalidad.',
      },
      {
        id: 'exportar-cancelar',
        question: '¿Puedo llevarme mis datos si decido cancelar?',
        answer:
          'Tus datos son tuyos: exportas todo tu catálogo y tus ventas en CSV antes o al momento de cancelar. El borrado de datos personales respeta la retención fiscal que exige SUNAT.',
      },
      {
        id: 'anonimizacion',
        question: '¿Qué pasa si un cliente pide borrar sus datos personales?',
        answer:
          'Anonimizamos su nombre, correo, teléfono y dirección. El comprobante fiscal se conserva sin su nombre durante los 5 años que exige SUNAT.',
      },
      {
        id: 'insights-diario',
        question: '¿Cómo funciona el asistente de insights diarios?',
        availability: 'preparing',
        answer:
          'En Enterprise, cada mañana recibes un resumen breve de tu negocio: ventas, productos por agotarse y excepciones de caja, calculado sobre tus números reales. Puedes hacerle preguntas en lenguaje natural sobre tu operación.',
      },
      {
        id: 'membresias',
        question: '¿Cómo funcionan las membresías y las ventas recurrentes?',
        availability: 'preparing',
        answer:
          'Defines el ciclo (semanal o mensual) y el sistema genera la venta periódica con su comprobante y su cuenta por cobrar, con un periodo de gracia para el cliente.',
      },
    ],
  },
];

export const HELP_SECTIONS = HELP_CATEGORIES;

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
