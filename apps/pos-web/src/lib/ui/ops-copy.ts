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
