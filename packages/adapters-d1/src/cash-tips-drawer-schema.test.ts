import { describe, expect, it } from 'vitest';
import down0048 from '../migrations-down/0048_sprint_p2_cash_tips_drawer.sql?raw';
import migration0048 from '../migrations/0048_sprint_p2_cash_tips_drawer.sql?raw';
import { DOWN_0048_SPRINT_P2_CASH_TIPS_DRAWER } from './migrations-down.js';

describe('P2 cash tips/drawer schema', () => {
  it('añade tip_cents a sale_payments (default 0) sin tocar el CHECK de montos', () => {
    expect(migration0048).toContain(
      'ALTER TABLE sale_payments ADD COLUMN tip_cents INTEGER NOT NULL DEFAULT 0',
    );
    expect(migration0048).not.toContain('CREATE TABLE sale_payments');
  });

  it('políticas del tenant: tope de propina 25% y apertura de cajón default on', () => {
    expect(migration0048).toContain('tip_max_percent INTEGER NOT NULL DEFAULT 25');
    expect(migration0048).toContain('open_drawer_on_cash INTEGER NOT NULL DEFAULT 1');
  });

  it('down espejo con guard contra propinas ya cobradas', () => {
    expect(DOWN_0048_SPRINT_P2_CASH_TIPS_DRAWER).toBe(down0048);
    expect(down0048).toContain('TIPS_DRAWER_DOWN_PROTECTED');
    expect(down0048).toContain('ALTER TABLE sale_payments DROP COLUMN tip_cents');
    expect(down0048).toContain(
      'ALTER TABLE tenant_discount_policies DROP COLUMN open_drawer_on_cash',
    );
  });
});
