import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../../routes/orders/customer/+page.svelte', import.meta.url),
  'utf8',
);

describe('Sprint 43 customer-order UI contract (RED)', () => {
  it('labels the flow as unpaid stock reservation, not quote, layaway, or food order', () => {
    expect(source).toContain('Pedido con retiro');
    expect(source).toContain('Sin pago al crear');
    expect(source).toContain('Reserva stock');
    expect(source).not.toMatch(/Cotización|Apartado|Comanda/);
  });

  it('shows partial quantities and exact reserved/fulfilled/released conservation', () => {
    expect(source).toContain('requestedQuantityMicrounits');
    expect(source).toContain('reservedQuantityMicrounits');
    expect(source).toContain('fulfilledQuantityMicrounits');
    expect(source).toContain('releasedQuantityMicrounits');
    expect(source).toContain('Cumplir parcialmente');
  });

  it('shows snapshot price, expiry repricing approval, and observable notice state', () => {
    expect(source).toContain('Precio reservado');
    expect(source).toContain('Requiere aprobación de supervisor');
    expect(source).toContain('notice.status');
    expect(source).toMatch(/Pendiente|Reintento|Escalado/);
    expect(source).not.toContain('Push garantizado');
  });

  it('does not gate or replace the ordinary checkout action', () => {
    expect(source).not.toMatch(/disabled=\{[^}]*requiresCustomerOrder/);
    expect(source).not.toMatch(/bloquear.*cobro/i);
  });

  it('has accessible statuses and minimum touch targets', () => {
    expect(source).toMatch(/aria-live="polite"/);
    expect(source).toMatch(/role="alert"/);
    expect(source).toMatch(/min-height:\s*44px/);
  });
});
