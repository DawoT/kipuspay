import { describe, expect, it } from 'vitest';
import {
  customerOrderAccess,
  showCashOperatingNavigation,
  showCustomerOrderNavigation,
} from './customer-order-access.js';

describe('customer-order role gates', () => {
  it.each(['cashier', 'supervisor'] as const)('%s can read and operate pickup orders', (role) => {
    expect(customerOrderAccess(role)).toEqual({
      canRead: true,
      canCreate: true,
      canFulfill: true,
      canCancel: role === 'supervisor',
      canApproveReprice: role === 'supervisor',
      showNavigation: true,
    });
  });

  it('admin can read and manage cancellation without cash fulfillment controls', () => {
    expect(customerOrderAccess('admin')).toMatchObject({
      canRead: true,
      canCreate: false,
      canFulfill: false,
      canCancel: true,
      canApproveReprice: false,
      showNavigation: true,
    });
  });

  it('owner never receives cash-operating controls', () => {
    expect(customerOrderAccess('owner')).toEqual({
      canRead: true,
      canCreate: false,
      canFulfill: false,
      canCancel: false,
      canApproveReprice: false,
      showNavigation: true,
    });
  });

  it('hides the surface from unknown roles', () => {
    expect(customerOrderAccess('auditor')).toMatchObject({ canRead: false, showNavigation: false });
  });

  it('shows navigation only with public flag and an allowed read role', () => {
    expect(showCustomerOrderNavigation({ enabled: false, role: 'cashier' })).toBe(false);
    expect(showCustomerOrderNavigation({ enabled: true, role: 'cashier' })).toBe(true);
    expect(showCustomerOrderNavigation({ enabled: true, role: 'owner' })).toBe(true);
    expect(showCustomerOrderNavigation({ enabled: true, role: 'auditor' })).toBe(false);
  });

  it('never exposes app-shell cash controls to owner or absent sessions', () => {
    expect(showCashOperatingNavigation('owner')).toBe(false);
    expect(showCashOperatingNavigation('')).toBe(false);
    expect(showCashOperatingNavigation('cashier')).toBe(true);
    expect(showCashOperatingNavigation('supervisor')).toBe(true);
    expect(showCashOperatingNavigation('admin')).toBe(true);
  });
});
