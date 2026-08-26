import { describe, expect, it } from 'vitest';
import {
  filterHistoryByPlate,
  formatPlateDisplay,
  historyCacheKey,
  isValidPlate,
  normalizePlate,
  parseHistoryPayload,
  sortHistoryByDate,
  summarizeHistory,
} from './quote-history.js';

describe('taller plate history (premium servicios, TDD RED)', () => {
  it('normalizePlate: mayúsculas, sin guiones ni espacios', () => {
    expect(normalizePlate(' abc-123 ')).toBe('ABC123');
    expect(normalizePlate('ab 1234')).toBe('AB1234');
    expect(normalizePlate('  ')).toBe('');
  });

  it('isValidPlate: acepta 6-7 alfanuméricos', () => {
    expect(isValidPlate('ABC123')).toBe(true);
    expect(isValidPlate('ABC1234')).toBe(true);
    expect(isValidPlate('AB-1234')).toBe(true);
    expect(isValidPlate('ABC12345')).toBe(false);
    expect(isValidPlate('')).toBe(false);
    expect(isValidPlate('AB@123')).toBe(false);
  });

  it('formatPlateDisplay: presenta con guión para lectura', () => {
    expect(formatPlateDisplay('ABC123')).toBe('ABC-123');
    expect(formatPlateDisplay('ABC1234')).toBe('ABC-1234');
    // ya normalizada
    expect(formatPlateDisplay('ABC-123')).toBe('ABC-123');
  });

  it('historyCacheKey: clave namespaced por tenant+plate', () => {
    expect(historyCacheKey('t1', 'ABC123')).toBe('taller_history/t1/ABC123');
    expect(historyCacheKey('t1', 'abc-123')).toBe('taller_history/t1/ABC123');
  });

  it('sortHistoryByDate: más reciente primero', () => {
    const entries = [
      { id: '1', plate: 'ABC123', dateIso: '2026-08-10T10:00:00.000Z', concept: 'Frenos', totalCents: 15000 },
      { id: '2', plate: 'ABC123', dateIso: '2026-08-12T10:00:00.000Z', concept: 'Aceite', totalCents: 8000 },
    ];
    expect(sortHistoryByDate(entries)[0]?.id).toBe('2');
  });

  it('filterHistoryByPlate: filtra y normaliza', () => {
    const entries = [
      { id: '1', plate: 'ABC123', dateIso: '2026-08-12T10:00:00.000Z', concept: 'A', totalCents: 1000 },
      { id: '2', plate: 'XYZ999', dateIso: '2026-08-12T10:00:00.000Z', concept: 'B', totalCents: 2000 },
    ];
    expect(filterHistoryByPlate(entries, 'abc-123')).toHaveLength(1);
    expect(filterHistoryByPlate(entries, 'ABC123')[0]?.id).toBe('1');
  });

  it('summarizeHistory: cuenta, suma y última fecha', () => {
    const entries = [
      { id: '1', plate: 'ABC123', dateIso: '2026-08-10T10:00:00.000Z', concept: 'A', totalCents: 1000 },
      { id: '2', plate: 'ABC123', dateIso: '2026-08-12T10:00:00.000Z', concept: 'B', totalCents: 2000 },
    ];
    const s = summarizeHistory(entries);
    expect(s.count).toBe(2);
    expect(s.totalCents).toBe(3000);
    expect(s.lastAt).toBe('2026-08-12T10:00:00.000Z');
  });

  it('parseHistoryPayload: valida cents enteros y descarta basura', () => {
    const raw = {
      items: [
        { id: '1', plate: 'ABC123', dateIso: '2026-08-12T10:00:00.000Z', concept: 'Aceite', totalCents: 8000 },
        { id: 'bad', plate: 'ABC123', dateIso: 'bad', concept: 'X', totalCents: 1.5 },
        { id: '', plate: 'ABC123', dateIso: '2026-08-12T10:00:00.000Z', concept: 'X', totalCents: 1000 },
      ],
    };
    const parsed = parseHistoryPayload(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.id).toBe('1');
  });

  it('feedback <100ms simulado para historial plate (premium UX)', async () => {
    const start = performance.now();
    const plate = normalizePlate('abc-123');
    const valid = isValidPlate(plate);
    const display = formatPlateDisplay(plate);
    const ms = performance.now() - start;
    expect(valid).toBe(true);
    expect(display).toBe('ABC-123');
    expect(ms).toBeLessThan(100);
  });
});
