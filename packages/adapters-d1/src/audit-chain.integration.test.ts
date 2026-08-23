/**
 * M1 anti-fork — evidencia contra D1 real (patrón dr-restore.integration).
 * RED: el read-then-insert legacy SÍ forkea bajo interleaving forzado.
 * GREEN: el puerto appendAuditEvent (CAS audit_chain_heads + guard en la
 * misma db.batch) sostiene 8 escritores × 5 eventos sin un solo fork.
 */
import { env } from 'cloudflare:workers';
import {
  judgeAuditChainFork,
  runLegacyConcurrentAuditAppends,
  runPortConcurrentAuditAppends,
} from '@kipuspay/chaos-harness';
import { describe, expect, it } from 'vitest';
import { appendAuditEvent } from './audit-chain.js';

const WRITERS = 8;
const EVENTS_PER_WRITER = 5;

describe('M1 audit chain anti-fork (chaos, D1 real)', () => {
  it('RED: read-then-insert separado forkea bajo interleaving', async () => {
    const stats = await runLegacyConcurrentAuditAppends(env.DB, {
      tenantId: 't-chain-red',
      writers: WRITERS,
      eventsPerWriter: EVENTS_PER_WRITER,
    });
    expect(stats.rows).toBe(WRITERS * EVENTS_PER_WRITER);
    expect(stats.forks).toBeGreaterThan(0);
  });

  it('GREEN: puerto con CAS — 8×5 concurrentes, cero forks, cabeza==punta', async () => {
    const stats = await runPortConcurrentAuditAppends(env.DB, appendAuditEvent, {
      tenantId: 't-chain-green',
      writers: WRITERS,
      eventsPerWriter: EVENTS_PER_WRITER,
    });
    expect(stats.rows).toBe(WRITERS * EVENTS_PER_WRITER);
    console.log('STATS_GREEN', JSON.stringify(stats));
    expect(stats.forks).toBe(0);
    expect(stats.unreachable).toBe(0);
    expect(stats.headMatchesTip).toBe(true);
    expect(judgeAuditChainFork(stats)).toBe('PASS');
  });

  it('GREEN génesis concurrente: primer evento de un tenant nuevo sin fork', async () => {
    const stats = await runPortConcurrentAuditAppends(env.DB, appendAuditEvent, {
      // Ningún escritor leyó cabeza previa: todos compiten el génesis.
      tenantId: 't-chain-genesis',
      writers: WRITERS,
      eventsPerWriter: 1,
    });
    expect(judgeAuditChainFork(stats)).toBe('PASS');
  });
});
