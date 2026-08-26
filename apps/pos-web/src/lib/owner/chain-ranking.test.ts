import { describe, expect, it } from 'vitest';

import { buildChainRanking } from './chain-ranking';

describe('chain ranking premium — Modo Dueño multi-local', () => {
  it('ordena por ventas y asigna podium con etiquetas premium sin jerga', () => {
    const ranked = buildChainRanking([
      { branchId: 'b-sur', netSalesCents: 120_00, docCount: 3 },
      { branchId: 'b-centro', netSalesCents: 980_00, docCount: 12 },
      { branchId: 'b-norte', netSalesCents: 450_00, docCount: 7 },
    ]);
    expect(ranked[0].branchId).toBe('b-centro');
    expect(ranked[0].rank).toBe(1);
    expect(ranked[0].badgeLabel).toBe('Líder');
    expect(ranked[0].badgeTone).toBe('lider');
    expect(ranked[1].rank).toBe(2);
    expect(ranked[1].badgeLabel).toBe('En alza');
    expect(ranked[2].badgeLabel).toBe('Estable');
    expect(ranked.every((r) => r.netSalesCents >= 0)).toBe(true);
    // premium copy sin jerga técnica visible
    for (const r of ranked) {
      expect(r.badgeLabel).not.toMatch(/capability|tenant|branchId|cents|snapshot|demo/i);
    }
  });
});
