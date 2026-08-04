import { describe, expect, it } from 'vitest';
import { aggregateImportsPerSource } from './index.js';

describe('aggregateImportsPerSource', () => {
  it('cuenta importaciones por origen', () => {
    const counts = aggregateImportsPerSource([
      { source: 'excel' },
      { source: 'excel' },
      { source: 'csv' },
    ]);
    expect(counts.get('excel')).toBe(2);
    expect(counts.get('csv')).toBe(1);
  });

  it('devuelve mapa vacío sin entradas', () => {
    expect(aggregateImportsPerSource([]).size).toBe(0);
  });
});
