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
          'El tiempo de configuración depende de los datos y ajustes de tu negocio. Puedes preparar el catálogo con las herramientas disponibles y seguir la guía de inicio paso a paso.',
      },
      {
        id: 'activar-facturacion',
        question: '¿Cómo activo la emisión de boletas y facturas electrónicas?',
        availability: 'preparing',
        answer:
          'La emisión electrónica aún no está disponible para activación general. Las condiciones se informarán cuando el servicio y tu negocio estén habilitados; SUNAT determina la aceptación de cada comprobante.',
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
          'La continuidad depende de la configuración y el almacenamiento disponible en tu caja. Al recuperar la conexión, se sincronizan las ventas pendientes; no se promete envío fiscal automático.',
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
          'Esta opción aún no está disponible. Cuando se habilite, publicaremos los canales de aviso y las condiciones del pedido con retiro.',
      },
    ],
  },
  {
    id: 'hardware',
    title: 'Impresoras y Equipos compatibles',
    description:
      'La compatibilidad de impresoras, gavetas, balanzas y lectores depende del modelo y del equipo usado.',
    items: [
      {
        id: 'impresora-compatible',
        question: '¿Qué impresoras puedo usar para imprimir tickets?',
        answer:
          'La compatibilidad depende del modelo de impresora, la conexión y el sistema operativo. Confirma el modelo probado antes de comprar o conectar un periférico.',
      },
      {
        id: 'equipos-soporte',
        question: '¿Necesito comprar una máquina especial?',
        answer:
          'No necesariamente. Los equipos y navegadores compatibles dependen de sus características; verifica tu modelo antes de incorporarlo a la operación.',
      },
      {
        id: 'gaveta-dinero',
        question: '¿Cómo se conecta una gaveta de dinero con conexión RJ11?',
        answer:
          'Algunas impresoras permiten conectar una gaveta por RJ11. La compatibilidad y el comportamiento dependen de ambos modelos; confírmalos antes de comprar o conectar el equipo.',
      },
      {
        id: 'balanza-digital',
        question: '¿Cómo funcionan las balanzas digitales para venta por peso?',
        answer:
          'La lectura automática depende del modelo de balanza y de su conexión. El ingreso manual puede estar disponible según la configuración y los permisos del negocio.',
      },
      {
        id: 'lector-codigos',
        question: '¿Qué lectores de código de barras son compatibles?',
        answer:
          'La compatibilidad depende del modelo del lector, el sistema operativo y el navegador del equipo. Confirma el modelo probado antes de comprar o conectar un periférico.',
      },
    ],
  },
  {
    id: 'sunat',
    title: 'Facturación Electrónica y SUNAT',
    description:
      'Información sobre documentos internos y opciones de facturación sujetas a habilitación.',
    items: [
      {
        id: 'boleta-vs-factura',
        question: '¿Emite boletas y facturas válidas para SUNAT?',
        answer:
          'Las opciones de facturación electrónica aún no están disponibles para activación general. Una nota de venta es un documento de control interno, no un comprobante autorizado por SUNAT.',
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
          'Las opciones de anulación y nota de crédito dependen de la habilitación fiscal del negocio. No se debe considerar un comprobante aceptado sin la respuesta oficial correspondiente.',
      },
      {
        id: 'certificado-digital',
        question: '¿Necesito comprar un certificado digital para emitir comprobantes electrónicos?',
        availability: 'preparing',
        answer:
          'La certificación aún no está disponible para activación. Las condiciones y requisitos se comunicarán cuando la facturación electrónica esté habilitada; no afirmamos que un certificado esté incluido ni que no tenga costo.',
      },
      {
        id: 'envio-sunat-offline',
        question: '¿Qué pasa si se corta el internet y no se envían mis boletas?',
        answer:
          'Puedes seguir registrando ventas según la configuración de tu caja. Al volver la conexión, los datos pendientes se sincronizan; los envíos fiscales y sus plazos dependen de la habilitación del servicio y de las reglas aplicables.',
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
    description:
      'Herramientas para registrar productos, existencias, variantes y compras a proveedores.',
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
          'Puedes registrar lotes y vencimientos cuando estas funciones estén habilitadas en tu plan. La disponibilidad y el flujo de selección se muestran en la caja según la configuración activa.',
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
    description:
      'Consulta las opciones de reportes, gestión de plan y funciones disponibles en cada etapa.',
    items: [
      {
        id: 'modo-dueno',
        question: '¿Cómo funciona el Modo Dueño desde mi celular?',
        answer:
          'Desde tu teléfono puedes consultar la información disponible de ventas y caja. Los datos se actualizan a medida que las sucursales sincronizan. Es una vista de consulta y su fecha de actualización puede variar.',
      },
      {
        id: 'exportacion-contable',
        question: '¿Qué formatos de exportación puedo consultar para mi contador?',
        answer:
          'La disponibilidad de reportes y formatos depende de las funciones habilitadas en tu plan. Revisa el archivo disponible con tu contador antes de incorporarlo a otro sistema.',
      },
      {
        id: 'diario-contable',
        question: '¿Mi contador puede ver el diario?',
        answer:
          'La disponibilidad del diario y de formatos de exportación depende de las funciones habilitadas en tu plan. Revisa cualquier archivo con tu contador antes de incorporarlo a otro sistema.',
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
        availability: 'preparing',
        answer:
          'La exportación self-serve al cancelar aún no está disponible. Publicaremos los formatos, alcance y procedimiento cuando esta función esté habilitada.',
      },
      {
        id: 'anonimizacion',
        question: '¿Qué pasa si un cliente pide borrar sus datos personales?',
        availability: 'preparing',
        answer:
          'El flujo self-serve de solicitudes y anonimización aún no está disponible. Para ejercer derechos sobre datos personales, usa el canal de contacto publicado en la política de privacidad; la atención debe considerar las obligaciones legales de conservación.',
      },
      {
        id: 'insights-diario',
        question: '¿Cómo funciona el asistente de insights diarios?',
        availability: 'preparing',
        answer:
          'Esta opción aún no está disponible. Se informará su alcance y disponibilidad cuando se habilite.',
      },
      {
        id: 'membresias',
        question: '¿Cómo funcionan las membresías y las ventas recurrentes?',
        availability: 'preparing',
        answer:
          'Esta opción aún no está disponible. No genera cobros ni ventas periódicas en este momento.',
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
