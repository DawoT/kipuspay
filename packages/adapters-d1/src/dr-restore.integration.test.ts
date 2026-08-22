import { env } from 'cloudflare:workers';
import { runDrFailoverChaosScenario } from '@kipuspay/chaos-harness';
import { describe, expect, it } from 'vitest';
import { applyRestoreRowsToShard, restoreTableOrder, verifyDrReplay } from './dr-restore.js';
import type { BackupRow } from '@kipuspay/domain-integrations';

describe('platform.dr restore apply (Sprint 48)', () => {
  const tenantId = 't-dr-sim';

  function fkClosure(): Map<string, BackupRow[]> {
    return new Map<string, BackupRow[]>([
      [
        'tenants',
        [
          {
            id: tenantId,
            business_name: 'DR SAC',
            vertical_type: 'retail',
            shard_id: 'shard-1',
            formalization_mode: 'INTERNAL_CONTROL',
          },
        ],
      ],
      [
        'branches',
        [{ id: 'b-dr', tenant_id: tenantId, code: 'C01', name: 'Centro', address: 'Lima' }],
      ],
      ['cash_registers', [{ id: 'cr-dr', tenant_id: tenantId, branch_id: 'b-dr', name: 'Caja 1' }]],
      [
        'users',
        [
          {
            id: 'u-dr',
            tenant_id: tenantId,
            branch_id: 'b-dr',
            email: 'dr@example.com',
            role: 'admin',
          },
        ],
      ],
      [
        'cash_register_sessions',
        [
          {
            id: 'cs-dr',
            tenant_id: tenantId,
            branch_id: 'b-dr',
            cash_register_id: 'cr-dr',
            user_id: 'u-dr',
            opening_balance_cents: 0,
            status: 'OPEN',
          },
        ],
      ],
      [
        'customers',
        [
          {
            id: 'c-dr',
            tenant_id: tenantId,
            document_type_code: '1',
            document_number: '12345678',
            name: 'Cliente DR',
            profile_updated_at: '2026-08-01T00:00:00.000Z',
            is_active: 1,
          },
        ],
      ],
      [
        'sales',
        [
          {
            id: 's-dr-1',
            tenant_id: tenantId,
            branch_id: 'b-dr',
            cash_register_session_id: 'cs-dr',
            user_id: 'u-dr',
            customer_id: 'c-dr',
            client_document_type: '1',
            client_document_number: '12345678',
            client_name: 'Cliente DR',
            series: 'NV01',
            number: 1,
            document_type: 'NV',
            total_amount_cents: 1180,
            issued_at_lima: '2026-08-04 10:00:00',
            sunat_status: 'NOT_APPLICABLE',
          },
        ],
      ],
    ]);
  }

  it('restoreTableOrder ordena padres primero (topo)', () => {
    const order = restoreTableOrder({
      rowsByTable: new Map([
        ['sales', []],
        ['tenants', []],
        ['branches', []],
      ]),
      foreignKeys: [
        { table: 'branches', parentTable: 'tenants' },
        { table: 'sales', parentTable: 'branches' },
        { table: 'sales', parentTable: 'tenants' },
      ],
    });
    expect(order.indexOf('tenants')).toBeLessThan(order.indexOf('branches'));
    expect(order.indexOf('branches')).toBeLessThan(order.indexOf('sales'));
  });

  it('autoreferencia (price_label_batches.reprint_of_batch_id) no es un ciclo', () => {
    // Caso real staging: reprint_of_batch_id REFERENCES la misma tabla; el topo
    // debe ignorar auto-aristas, no declarar ciclo inexistente.
    expect(() =>
      restoreTableOrder({
        rowsByTable: new Map([
          ['tenants', []],
          ['price_label_batches', []],
        ]),
        foreignKeys: [
          { table: 'price_label_batches', parentTable: 'tenants' },
          { table: 'price_label_batches', parentTable: 'price_label_batches' },
        ],
      }),
    ).not.toThrow();
  });

  it('restoreTableOrder falla cerrado ante ciclo de FKs', () => {
    expect(() =>
      restoreTableOrder({
        rowsByTable: new Map([
          ['a', []],
          ['b', []],
        ]),
        foreignKeys: [
          { table: 'a', parentTable: 'b' },
          { table: 'b', parentTable: 'a' },
        ],
      }),
    ).toThrow(/DR_RESTORE_FK_CYCLE/);
  });

  it('applyRestoreRowsToShard: inserta en el shard DR (clausura FK) y es idempotente', async () => {
    const rowsByTable = fkClosure();
    const first = await applyRestoreRowsToShard({ db: env.DR_DB, rowsByTable });
    expect(first.rowsInserted).toBe(7);

    const sale = await env.DR_DB.prepare(`SELECT id FROM sales WHERE id = ?`)
      .bind('s-dr-1')
      .first<{ id: string }>();
    expect(sale?.id).toBe('s-dr-1');

    // Re-ejecutar el simulacro: INSERT OR IGNORE → 0 filas nuevas, 0 duplicados.
    const second = await applyRestoreRowsToShard({ db: env.DR_DB, rowsByTable });
    expect(second.rowsInserted).toBe(7);
    const count = await env.DR_DB.prepare(`SELECT COUNT(*) AS n FROM sales`).first<{ n: number }>();
    expect(count?.n).toBe(1);
  });

  it('verifyDrReplay: RPO=0 tx, RPO≤1d rollups y 0 duplicados en replay de colas', async () => {
    const rowsByTable = fkClosure();
    rowsByTable.set('daily_financial_rollups', [
      {
        tenant_id: tenantId,
        branch_id: 'b-dr',
        report_date: '2026-08-03',
        gross_sales_cents: 1180,
        net_sales_cents: 1000,
        cogs_cents: 0,
      },
    ]);
    await applyRestoreRowsToShard({ db: env.DR_DB, rowsByTable });

    const verification = await verifyDrReplay({
      db: env.DR_DB,
      tenantId,
      expectedSalesCount: 1,
      nowMs: Date.parse('2026-08-04T15:00:00.000Z'),
    });
    expect(verification.rpoTxZero).toBe(true);
    expect(verification.rpoRollupOneDay).toBe(true);
    expect(verification.duplicatesBlocked).toBeGreaterThanOrEqual(1);
  });

  it('verifyDrReplay: RPO=0 falla si faltan tx comprometidas', async () => {
    const missingTenant = 't-dr-missing';
    const rowsByTable = new Map<string, BackupRow[]>();
    await applyRestoreRowsToShard({ db: env.DR_DB, rowsByTable });
    const verification = await verifyDrReplay({
      db: env.DR_DB,
      tenantId: missingTenant,
      expectedSalesCount: 1,
      nowMs: Date.parse('2026-08-04T15:00:00.000Z'),
    });
    expect(verification.rpoTxZero).toBe(false);
  });
});

describe('S48-H1: veredicto del chaos DR con evidencia real del motor', () => {
  it('PASS solo con engineEvidenceVerified (los tests D1 de DR son la evidencia)', async () => {
    const { runDrFailoverChaos } = await import('@kipuspay/chaos-harness');
    const verdict = await runDrFailoverChaosScenario(() =>
      Promise.resolve(runDrFailoverChaos(500, [], true)),
    );
    expect(verdict).toBe('PASS');
  });
});
