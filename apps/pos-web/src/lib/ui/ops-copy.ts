/** Estados de operación en español de negocio (GTM §6.5, V-27). Cero enums al operador. */

export function saleStatusLabel(status: string): string {
  switch (status.trim().toUpperCase()) {
    case 'ANULADA':
    case 'VOIDED':
    case 'CANCELLED':
    case 'CANCELED':
      return 'Anulada';
    case 'COMPLETED':
    case 'PAID':
    case 'CHARGED':
      return 'Pagada';
    case 'PENDING':
      return 'Pendiente';
    case 'OPEN':
      return 'Abierta';
    default:
      return 'Registrada';
  }
}

export function kdsEventLabel(type: string): string {
  switch (type.trim().toUpperCase()) {
    case 'ITEM_FIRED':
    case 'FIRED':
    case 'ORDER_FIRED':
      return 'En cocina';
    case 'ORDER_READY':
    case 'READY':
      return 'Listo';
    case 'ORDER_OPEN':
    case 'OPEN':
      return 'Comanda abierta';
    case 'ORDER_PAID':
    case 'PAID':
      return 'Pagado';
    default:
      return 'Actualización';
  }
}

export function orderStatusLabel(status: string): string {
  switch (status.trim().toUpperCase()) {
    case 'OPEN':
      return 'Abierta';
    case 'PARTIAL':
      return 'Parcial';
    case 'FIRED':
      return 'En cocina';
    case 'READY':
      return 'Lista';
    case 'PAID':
    case 'CLOSED':
    case 'FULFILLED':
      return 'Cobrada';
    case 'EXPIRED':
      return 'Vencida';
    case 'CANCELLED':
    case 'CANCELED':
      return 'Cancelada';
    default:
      return 'En curso';
  }
}

export function paymentStatusLabel(status: string): string {
  switch (status.trim().toUpperCase()) {
    case 'PENDING':
    case 'OPEN':
      return 'Pendiente';
    case 'PAID':
    case 'SETTLED':
      return 'Pagado';
    case 'FAILED':
      return 'Fallido';
    case 'CAPTURED':
      return 'Cobrado';
    default:
      return 'En revisión';
  }
}

export function stockKindLabel(kind: string): string {
  switch (kind.trim().toUpperCase()) {
    case 'LOW':
    case 'LOW_STOCK':
      return 'Stock bajo';
    case 'STOCKOUT':
    case 'STOCKOUT_RISK':
      return 'Riesgo de quiebre';
    case 'REORDER_SUGGESTED':
    case 'REORDER':
      return 'Reponer';
    case 'EXPIRED':
    case 'FEFO':
      return 'Por vencer';
    default:
      return 'Alerta de stock';
  }
}

export function documentKindLabel(kind: string): string {
  switch (kind.trim().toUpperCase()) {
    case '01':
      return 'Factura';
    case '03':
      return 'Boleta';
    case '07':
    case 'NC':
      return 'Nota de crédito';
    case '08':
    case 'ND':
      return 'Nota de débito';
    case 'NV':
      return 'Nota de venta';
    case 'NV_RETURN':
      return 'Devolución';
    default:
      return 'Comprobante';
  }
}

export function ledgerSignLabel(sign: string): string {
  switch (sign.trim().toUpperCase()) {
    case 'CREDIT':
      return 'Abono';
    case 'DEBIT':
      return 'Cargo';
    default:
      return 'Movimiento';
  }
}

export function workflowStatusLabel(status: string): string {
  switch (status.trim().toUpperCase()) {
    case 'OPEN':
    case 'DRAFT':
      return 'Borrador';
    case 'PENDING':
      return 'Pendiente';
    case 'APPROVED':
      return 'Aprobado';
    case 'PAID':
      return 'Pagado';
    case 'CLOSED':
      return 'Cerrado';
    case 'CANCELLED':
    case 'CANCELED':
      return 'Cancelado';
    case 'ACTIVE':
      return 'Activa';
    case 'PAUSED':
      return 'En pausa';
    case 'DAMAGED':
      return 'Dañado';
    default:
      return 'En curso';
  }
}

export function uomLabel(code?: string | null): string {
  const raw = (code ?? '').trim();
  if (!raw || raw.toUpperCase() === 'BASE') return 'Unidad';
  return raw;
}

export function catalogItemLabel(item: unknown, index: number): string {
  if (item && typeof item === 'object') {
    const rec = item as Record<string, unknown>;
    if (typeof rec.name === 'string' && rec.name.trim()) return rec.name;
    if (typeof rec.sku === 'string' && rec.sku.trim()) return rec.sku;
  }
  return `Producto ${index + 1}`;
}

export function promoAppliesLabel(appliesTo: string): string {
  switch (appliesTo.trim().toUpperCase()) {
    case 'PRODUCT':
      return 'Producto';
    case 'CATEGORY':
      return 'Categoría';
    case 'LIST':
      return 'Lista';
    case 'CART':
      return 'Carrito';
    default:
      return 'Promoción';
  }
}

/** Etapa de formalización fiscal — copy de negocio, cero enums al operador (V-27). */
export function formalizationModeLabel(mode: string): string {
  switch (mode.trim().toUpperCase()) {
    case 'INTERNAL_CONTROL':
      return 'Solo notas de venta';
    case 'FORMALIZING':
      return 'Formalizando';
    case 'ELECTRONIC_ISSUER':
      return 'Emisión electrónica';
    default:
      return 'Etapa de formalización';
  }
}

/**
 * Errores de ventas/apartados/cotizaciones/cuotas/crédito de tienda — copy de
 * negocio, cero códigos técnicos al operador (F-5 / V-27). El server responde
 * { error: <CODE>, code: <CODE> }; la UI nunca imprime el código crudo.
 */
const SALES_ERROR_COPY: Record<string, string> = {
  PRODUCT_NOT_FOUND: 'El producto no existe en tu catálogo.',
  PRODUCT_NOT_SELLABLE: 'El producto no está activo para la venta.',
  UOM_NOT_FOUND: 'La unidad de medida no existe en tu catálogo.',
  PAYMENT_METHOD_NOT_FOUND: 'El método de pago no está disponible.',
  SESSION_NOT_FOUND: 'No hay una sesión de caja abierta. Abre la caja y reintenta.',
  CREDIT_LIMIT_EXCEEDED: 'El cliente superó el límite de crédito asignado.',
  OUTSIDE_WINDOW: 'La operación está fuera de la ventana permitida.',
  SERIAL_STOCK_EXISTS:
    'No se puede activar el rastreo: el producto tiene existencias sin rastrear. Descarga el stock primero.',
  SERIAL_MANIFEST_REQUIRED:
    'El producto requiere número de serie. Verifica que el ingreso indique cada serie.',
  SERIAL_DUPLICATE: 'La serie ya está registrada. Verifica los números ingresados.',
  SERIAL_CONTEXT_REQUIRED:
    'Falta información para la operación de serie. Verifica producto, sucursal y sesión.',
  SERIAL_NOT_FOUND: 'No encontramos esa serie. Verifica el número en el producto correcto.',
  SERIAL_LEASE_CONFLICT:
    'La serie está reservada por otro terminal. Libera la reserva e intenta de nuevo.',
  SERIAL_TRANSITION_INVALID:
    'La serie no permite esa acción en su estado actual. Revisa el estado del artículo y elige otra disposición.',
  ORDER_ITEM_INVALID:
    'La comanda ya cambió de estado (alguien más la marcó). Se actualiza la pantalla.',
  ORDER_REQUIRES_ITEMS: 'Agrega al menos un producto a la comanda.',
  PRODUCT_REQUIRED: 'Elige un producto del catálogo para la comanda.',
  ORDER_NOT_FOUND: 'No encontramos esa comanda. Verifica el número.',
  ORDER_INVALID_TRANSITION: 'La comanda no permite esa acción en su estado actual.',
  SERIAL_NOT_AVAILABLE: 'La serie no está disponible para reserva en este momento.',
  SERIAL_TERMINAL_BRANCH_INVALID:
    'La serie no corresponde a este terminal o sucursal. Verifica el ID del terminal.',
  SERIAL_DISPOSITION_INVALID: 'La disposición elegida no aplica al estado actual de la serie.',
  SERIAL_TRACKING_NOT_REQUIRED:
    'El producto no usa seguimiento por serie. Quita los números de serie e intenta de nuevo.',
  SERIAL_TRACKING_MODE_INVALID: 'El modo de seguimiento elegido no es válido.',
  LAYAWAY_NOT_FOUND: 'No encontramos el apartado. Verifica el ID.',
  LAYAWAY_ITEMS_REQUIRED: 'Agrega al menos un producto al apartado.',
  LAYAWAY_INVALID_AMOUNT: 'El monto ingresado no es válido.',
  LAYAWAY_DEPOSIT_EXCEEDS_BALANCE: 'El abono supera el saldo pendiente del apartado.',
  LAYAWAY_INVALID_STATUS: 'El apartado no permite esa acción en su estado actual.',
  LAYAWAY_INSUFFICIENT_DEPOSIT: 'El abono inicial no cubre el mínimo requerido.',
  LAYAWAY_ALREADY_CONVERTED: 'El apartado ya fue convertido a venta.',
  LAYAWAY_ALREADY_TERMINAL: 'El apartado ya fue convertido desde otro terminal.',
  LAYAWAY_FAILED: 'No se pudo crear el apartado. Reintenta o escribe a soporte@kipuspay.com.',
  QUOTE_NOT_FOUND: 'No encontramos la cotización. Verifica el ID.',
  QUOTE_EXPIRED: 'La cotización venció. Genera una nueva con precios actuales.',
  QUOTE_ALREADY_CONVERTED: 'La cotización ya fue convertida a venta.',
  QUOTE_ALREADY_TERMINAL: 'La cotización ya fue convertida desde otro terminal.',
  QUOTE_INVALID_AMOUNT: 'El monto ingresado no es válido.',
  QUOTE_FAILED: 'No se pudo completar la cotización. Reintenta o escribe a soporte@kipuspay.com.',
  INSTALLMENT_NOT_FOUND: 'No encontramos el plan de cuotas.',
  INSTALLMENT_ALREADY_PAID: 'Esta cuota ya fue pagada.',
  INSTALLMENT_AR_CLOSED: 'La cuenta por cobrar está cerrada.',
  INSTALLMENT_CUSTOMER_REQUIRED: 'Indica el cliente del plan de cuotas.',
  INSTALLMENT_FORBIDDEN: 'Solo Supervisor o Admin puede cobrar cuotas.',
  INSTALLMENT_IDEM_REQUIRED: 'Reintenta con el mismo identificador de la operación.',
  INSTALLMENT_INVALID_AMOUNT: 'El monto de la cuota no es válido.',
  INSTALLMENT_INVALID_STATUS: 'El plan no permite esa acción en su estado actual.',
  INSTALLMENT_PLAN_EXISTS: 'El cliente ya tiene un plan de cuotas abierto.',
  INSTALLMENT_PRINCIPAL_MISMATCH: 'La suma de cuotas no coincide con el principal.',
  INSTALLMENT_SALE_NOT_FOUND: 'No encontramos la venta origen del plan.',
  INSTALLMENT_SCHEDULE_REQUIRED: 'El cronograma de cuotas es obligatorio.',
  INSTALLMENT_FAILED:
    'No se pudo crear el plan de cuotas. Reintenta o escribe a soporte@kipuspay.com.',
  STORE_CREDIT_ACCOUNT_NOT_FOUND: 'No encontramos la cuenta de crédito de tienda.',
  STORE_CREDIT_AUTH_REQUIRED: 'La operación requiere autorización.',
  STORE_CREDIT_CUSTOMER_REQUIRED: 'Indica el cliente.',
  STORE_CREDIT_EXPIRED: 'El crédito de tienda venció.',
  STORE_CREDIT_FORBIDDEN: 'Tu rol no permite esta operación.',
  STORE_CREDIT_INSUFFICIENT: 'El cliente no tiene saldo suficiente en su crédito de tienda.',
  STORE_CREDIT_INVALID_AMOUNT: 'El monto ingresado no es válido.',
  STORE_CREDIT_FAILED: 'No se pudo completar la operación de crédito. Reintenta.',
};

const GENERIC_SALES_ERROR =
  'No se pudo completar la operación. Reintenta o escribe a soporte@kipuspay.com.';

export function salesErrorCopy(code: string | undefined): string {
  if (!code) return GENERIC_SALES_ERROR;
  const known = SALES_ERROR_COPY[code];
  if (known) return known;
  if (code.startsWith('FEATURE_')) return 'Esta función no está activa para tu negocio.';
  if (code.startsWith('DB_') || code.includes('SQLITE') || code.startsWith('D1_ERROR'))
    return 'El servicio está ocupado. Reintenta en unos segundos o escribe a soporte@kipuspay.com.';
  if (/^[A-Z0-9_]{6,}$/.test(code)) return GENERIC_SALES_ERROR;
  return code;
}

/** Códigos de compras/inventario (OC parcial, devolución proveedor, conteo y merma). */
const PURCHASING_ERROR_COPY: Record<string, string> = {
  RECEIVE_EXCEEDS_ORDERED: 'Recibes más de lo ordenado. Verifica la cantidad contra la orden.',
  PO_INVALID_TRANSITION: 'La orden de compra no permite esa acción en su estado actual.',
  RECEIPT_NOT_FOUND: 'No encontramos la recepción. Verifica el ID.',
  INVOICE_NOT_FOUND: 'No encontramos la factura del proveedor.',
  PRODUCT_NOT_ON_RECEIPT: 'El producto no está en la recepción de esta orden.',
  PRODUCT_NOT_ON_INVOICE: 'El producto no está en la factura del proveedor.',
  INVOICE_RECEIPT_MISMATCH: 'La factura no coincide con la recepción. Revisa cantidades y montos.',
  SERIAL_COUNT_DIFF_MISMATCH: 'La cantidad de series no coincide con la cantidad recibida.',
  SERIAL_COUNT_UNEXPECTED_IDENTITY: 'Una serie registrada no corresponde a este lote.',
  SERIAL_IDENTITY_INVALID: 'El identificador de serie no es válido.',
  SUPPLIER_RETURN_NOT_FOUND: 'No encontramos la devolución a proveedor.',
  SUPPLIER_RETURN_ITEMS_REQUIRED: 'Agrega al menos un producto a la devolución.',
  SUPPLIER_RETURN_QTY_EXCEEDED: 'La cantidad a devolver supera lo recibido.',
  SUPPLIER_RETURN_INVALID_AMOUNT: 'El monto de la devolución no es válido.',
  SUPPLIER_RETURN_COST_MISMATCH: 'El costo no coincide con el registrado en la recepción.',
  SUPPLIER_RETURN_INVALID_STATUS: 'La devolución no permite esa acción en su estado actual.',
  SUPPLIER_RETURN_ALREADY_CLOSED: 'La devolución ya fue cerrada.',
  SUPPLIER_RETURN_ALREADY_TERMINAL: 'La devolución ya está en su estado final.',
  SUPPLIER_RETURN_FAILED:
    'No se pudo procesar la devolución. Reintenta o escribe a soporte@kipuspay.com.',
  COUNT_INVALID: 'El conteo no es válido. Verifica las cantidades.',
  COUNT_INVALID_QUANTITY: 'La cantidad contada no es válida.',
  COUNT_PRODUCT_REQUIRED: 'Indica el producto del conteo.',
  COUNT_STOCK_NOT_FOUND: 'El producto no tiene stock registrado en esta sucursal.',
  INVALID_LOSS_QTY: 'La cantidad de merma no es válida.',
  LOSS_CONTEXT_REQUIRED: 'Indica la sucursal y el producto de la merma.',
  LOSS_REASON_REQUIRED: 'El motivo de la merma es obligatorio.',
  LOSS_REJECTED: 'La merma fue rechazada. Revisa el motivo y la evidencia.',
  INSUFFICIENT_STOCK: 'No hay stock suficiente para la operación.',
  BRANCH_MISMATCH: 'La sucursal no coincide con la operación.',
  AP_ALREADY_PAID: 'La cuenta por pagar ya fue pagada.',
  AP_INSUFFICIENT: 'El pago supera la cuenta por pagar pendiente.',
  AP_PAY_REJECTED: 'No se pudo registrar el pago a proveedor.',
  AP_CREATE_REJECTED: 'No se pudo crear la cuenta por pagar.',
  AR_PAY_REJECTED: 'No se pudo registrar el pago de la cuenta por cobrar.',
};

export function purchasingErrorCopy(code: string | undefined): string {
  if (!code) return GENERIC_SALES_ERROR;
  const known = PURCHASING_ERROR_COPY[code];
  if (known) return known;
  return salesErrorCopy(code);
}
