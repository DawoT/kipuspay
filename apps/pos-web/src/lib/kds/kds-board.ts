/**
 * KDS premium — vista kanban 3 estados para restaurante (capability orders.kds).
 * Zero-dependency, puro, offline-first. Copy de negocio sin jerga (V-27).
 */

export type KdsColumnId = 'pending' | 'preparing' | 'ready';

export interface KdsItem {
  readonly id: string;
  readonly productName: string | null;
  readonly quantity: number;
  readonly status: string;
  readonly firedAtMs?: number | null;
}

export interface KdsOrder {
  readonly id: string;
  readonly tableLabel: string | null;
  readonly firedAtMs?: number | null;
  readonly firedAt?: string | null;
  readonly items: readonly KdsItem[];
}

export interface KdsGrouped {
  readonly pending: readonly KdsOrder[];
  readonly preparing: readonly KdsOrder[];
  readonly ready: readonly KdsOrder[];
}

export interface KdsElapsed {
  readonly minutes: number;
  readonly text: string;
  readonly level: 'normal' | 'warn' | 'urgent';
}

/** Copy premium de negocio para cada columna (V-27). */
export function kdsColumnLabel(column: KdsColumnId): string {
  if (column === 'pending') return 'Por hacer';
  if (column === 'preparing') return 'En preparación';
  return 'Listo para servir';
}

/** Normaliza el estado crudo del backend a columna premium. */
// eslint-disable-next-line complexity
export function normalizeKdsItemStatus(raw: string): KdsColumnId | 'other' {
  const s = raw.trim().toUpperCase();
  if (s === 'FIRED' || s === 'PENDING' || s === 'OPEN' || s === 'ITEM_FIRED' || s === 'FIRED_AT') return 'pending';
  if (s === 'PREPARING' || s === 'COOKING' || s === 'IN_PROGRESS' || s === 'PREPARACION' || s === 'EN_PREPARACION') return 'preparing';
  if (s === 'READY' || s === 'LISTO' || s === 'DONE' || s === 'ORDER_READY' || s === 'ITEM_READY') return 'ready';
  return 'other';
}

function orderColumn(order: KdsOrder): KdsColumnId {
  if (order.items.length === 0) return 'pending';
  const normalized = order.items.map((i) => normalizeKdsItemStatus(i.status));
  const allReady = normalized.every((n) => n === 'ready');
  if (allReady) return 'ready';
  const anyPreparing = normalized.some((n) => n === 'preparing');
  if (anyPreparing) return 'preparing';
  return 'pending';
}

export function groupKdsOrders(orders: readonly KdsOrder[]): KdsGrouped {
  const pending: KdsOrder[] = [];
  const preparing: KdsOrder[] = [];
  const ready: KdsOrder[] = [];
  for (const order of orders) {
    const col = orderColumn(order);
    if (col === 'pending') pending.push(order);
    else if (col === 'preparing') preparing.push(order);
    else ready.push(order);
  }
  return { pending, preparing, ready };
}

/** Tiempo en cocina: texto humano + nivel de urgencia por semáforo. */
export function formatKdsElapsed(firedAtMs: number | null | undefined, nowMs: number): KdsElapsed {
  if (firedAtMs == null || !Number.isFinite(firedAtMs)) {
    return { minutes: 0, text: 'Recién llegada', level: 'normal' };
  }
  const diffMs = Math.max(0, nowMs - firedAtMs);
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes <= 0) return { minutes: 0, text: 'Hace instantes', level: 'normal' };
  if (minutes === 1) {
    const level: KdsElapsed['level'] = minutes >= 13 ? 'urgent' : minutes >= 8 ? 'warn' : 'normal';
    return { minutes, text: '1 min', level };
  }
  const text = `${minutes} min`;
  let level: KdsElapsed['level'] = 'normal';
  if (minutes >= 13) level = 'urgent';
  else if (minutes >= 8) level = 'warn';
  return { minutes, text, level };
}

/** Ordena comandas por antigüedad: la más antigua (más urgente) primero. */
export function sortKdsOrdersByUrgency(orders: readonly KdsOrder[], nowMs: number): KdsOrder[] {
  return [...orders].sort((a, b) => {
    const aMs = a.firedAtMs ?? (a.firedAt ? Date.parse(a.firedAt) : nowMs);
    const bMs = b.firedAtMs ?? (b.firedAt ? Date.parse(b.firedAt) : nowMs);
    const aTime = Number.isFinite(aMs) ? aMs : nowMs;
    const bTime = Number.isFinite(bMs) ? bMs : nowMs;
    return aTime - bTime;
  });
}

/** Alias para compatibilidad con naming comercial del vertical. */
export function kdsOrderElapsed(order: KdsOrder, nowMs: number): KdsElapsed {
  const fired = order.firedAtMs ?? (order.firedAt ? Date.parse(order.firedAt) : null);
  return formatKdsElapsed(fired, nowMs);
}
