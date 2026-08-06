/**
 * Chaos QA S20 — conservación transfer + cancel restore.
 */
import { describe, expect, it } from 'vitest';
import {
  assertTransferLineConservation,
  planCancelInTransit,
  planReceiveStockDeltas,
  planShipStockDeltas,
} from './index.js';

describe('chaos transfers S20', () => {
  it('origen+destino+merma = enviado', () => {
    const sent = 10;
    const received = 7;
    const shrink = 3;
    expect(() =>
      assertTransferLineConservation({
        qtySent: sent,
        qtyReceived: received,
        qtyShrink: shrink,
      }),
    ).not.toThrow();
    const ship = planShipStockDeltas({
      originBranchId: 'o',
      lines: [{ productId: 'p1', quantity: sent }],
    });
    const recv = planReceiveStockDeltas({
      destinationBranchId: 'd',
      lines: [
        {
          productId: 'p1',
          qtyReceived: received,
          qtyShrink: shrink,
          shrinkReason: 'daño',
        },
      ],
    });
    expect(ship[0]!.qtyDelta).toBe(-sent);
    expect(recv.find((d) => d.movementType === 'TRANSFER_IN')!.qtyDelta).toBe(received);
  });

  it('cancel IN_TRANSIT restaura exactamente qty enviada', () => {
    const cancel = planCancelInTransit({
      originBranchId: 'o',
      status: 'IN_TRANSIT',
      lines: [
        { productId: 'p1', quantity: 4 },
        { productId: 'p2', quantity: 6 },
      ],
    });
    expect(cancel).toHaveLength(2);
    expect(cancel.reduce((n, d) => n + d.qtyDelta, 0)).toBe(10);
  });
});
