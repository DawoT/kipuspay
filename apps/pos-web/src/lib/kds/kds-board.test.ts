import { describe, expect, it } from 'vitest';
import {
  formatKdsElapsed,
  groupKdsOrders,
  kdsColumnLabel,
  normalizeKdsItemStatus,
  sortKdsOrdersByUrgency,
} from './kds-board.js';

describe('KDS premium board — capability orders.kds', () => {
  it('expone 3 columnas premium con copy de negocio (V-27)', () => {
    expect(kdsColumnLabel('pending')).toBe('Por hacer');
    expect(kdsColumnLabel('preparing')).toBe('En preparación');
    expect(kdsColumnLabel('ready')).toBe('Listo para servir');
    // copy sin jerga técnica
    for (const col of ['pending', 'preparing', 'ready'] as const) {
      expect(kdsColumnLabel(col)).not.toMatch(/FIRED|READY|PENDING/);
    }
  });

  it('normaliza estados de ítem a columna premium', () => {
    expect(normalizeKdsItemStatus('FIRED')).toBe('pending');
    expect(normalizeKdsItemStatus('PENDING')).toBe('pending');
    expect(normalizeKdsItemStatus('PREPARING')).toBe('preparing');
    expect(normalizeKdsItemStatus('COOKING')).toBe('preparing');
    expect(normalizeKdsItemStatus('READY')).toBe('ready');
    expect(normalizeKdsItemStatus('LISTO')).toBe('ready');
  });

  it('agrupa comandas por estado dominante (pendiente / en preparación / listo)', () => {
    const orders = [
      {
        id: 'o1',
        tableLabel: '4',
        firedAtMs: Date.now() - 2 * 60 * 1000,
        items: [{ id: 'i1', productName: 'Café', quantity: 1, status: 'FIRED' }],
      },
      {
        id: 'o2',
        tableLabel: '7',
        firedAtMs: Date.now() - 5 * 60 * 1000,
        items: [
          { id: 'i2', productName: 'Lomo', quantity: 1, status: 'PREPARING' },
          { id: 'i3', productName: 'Arroz', quantity: 1, status: 'FIRED' },
        ],
      },
      {
        id: 'o3',
        tableLabel: '2',
        firedAtMs: Date.now() - 1 * 60 * 1000,
        items: [{ id: 'i4', productName: 'Sopa', quantity: 1, status: 'READY' }],
      },
    ];
    const grouped = groupKdsOrders(orders);
    expect(grouped.pending.map((o) => o.id)).toEqual(['o1']);
    expect(grouped.preparing.map((o) => o.id)).toEqual(['o2']);
    expect(grouped.ready.map((o) => o.id)).toEqual(['o3']);
  });

  it('calcula tiempo en cocina con urgencia por semáforo (normal / aviso / urgente)', () => {
    const now = Date.now();
    const justNow = formatKdsElapsed(now - 2 * 60 * 1000, now);
    expect(justNow.text).toMatch(/2 min/);
    expect(justNow.level).toBe('normal');

    const warn = formatKdsElapsed(now - 10 * 60 * 1000, now);
    expect(warn.level).toBe('warn');

    const urgent = formatKdsElapsed(now - 15 * 60 * 1000, now);
    expect(urgent.text).toMatch(/15 min/);
    expect(urgent.level).toBe('urgent');
  });

  it('ordena comandas por antigüedad (más urgentes primero)', () => {
    const now = Date.now();
    const orders = [
      { id: 'a', tableLabel: '1', firedAtMs: now - 1 * 60 * 1000, items: [{ id: 'i1', productName: 'X', quantity: 1, status: 'FIRED' }] },
      { id: 'b', tableLabel: '2', firedAtMs: now - 12 * 60 * 1000, items: [{ id: 'i2', productName: 'Y', quantity: 1, status: 'FIRED' }] },
      { id: 'c', tableLabel: '3', firedAtMs: now - 5 * 60 * 1000, items: [{ id: 'i3', productName: 'Z', quantity: 1, status: 'FIRED' }] },
    ];
    const sorted = sortKdsOrdersByUrgency(orders, now);
    expect(sorted.map((o) => o.id)).toEqual(['b', 'c', 'a']);
  });

  it('no expone estados técnicos en copy visible (V-27)', () => {
    const grouped = groupKdsOrders([
      { id: 'o1', tableLabel: '1', items: [{ id: 'i1', productName: 'P', quantity: 1, status: 'FIRED' }] },
    ]);
    // El agrupado solo usa copy premium, no IDs técnicos.
    expect(kdsColumnLabel('pending')).not.toMatch(/FIRED/);
    expect(grouped.pending).toHaveLength(1);
  });
});
