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
    expect(source).toContain('api.approveReprice');
    expect(source).toContain('api.repriceHandoff');
    expect(source).toContain('notice.status');
    expect(source).toMatch(/Pendiente|Reintento|Escalado/);
    expect(source).not.toContain('Push garantizado');
    expect(source).toContain('WhatsApp solo si está disponible');
    expect(source).toContain('Push estará disponible desde el Sprint 45');
  });

  it('does not gate or replace the ordinary checkout action', () => {
    expect(source).not.toMatch(/disabled=\{[^}]*requiresCustomerOrder/);
    expect(source).not.toMatch(/bloquear.*cobro/i);
  });

  it('has accessible statuses and minimum touch targets', () => {
    expect(source).toMatch(/aria-live="polite"/);
    expect(source).toMatch(/role="alert"/);
    expect(source).toMatch(/min-height:\s*44px/);
    expect(source).toMatch(/prefers-reduced-motion/);
    expect(source).toMatch(/overflow-x:\s*hidden/);
  });

  it('exposes a dense searchable queue and honest offline recovery', () => {
    expect(source).toContain('Buscar por código o cliente');
    expect(source).toContain('Tiempo restante');
    expect(source).toContain('Datos locales desactualizados');
    expect(source).toContain('Cumplimiento pendiente');
    expect(source).toContain('Reintentar envío');
    expect(source).toContain('Crear desde carrito');
    expect(source).toContain('Sin lease vigente');
  });

  it('uses explicit durable notice and no-CPE copy', () => {
    expect(source).toContain('no cobra nada ni emite CPE');
    expect(source).toContain('El aviso queda registrado de forma durable');
  });

  it('always lists the trusted current branch for cash roles', () => {
    expect(source).toContain("['cashier', 'supervisor'].includes");
    expect(source).toContain('api.list({ branchId: session.branchId })');
  });
});
