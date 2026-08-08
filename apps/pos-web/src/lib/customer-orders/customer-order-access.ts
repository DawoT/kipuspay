export type CustomerOrderRole = string;

export interface CustomerOrderAccess {
  readonly canRead: boolean;
  readonly canCreate: boolean;
  readonly canFulfill: boolean;
  readonly canCancel: boolean;
  readonly canApproveReprice: boolean;
  readonly showNavigation: boolean;
}

export function customerOrderAccess(role: CustomerOrderRole): CustomerOrderAccess {
  const normalized = role.trim().toLowerCase();
  const canRead = ['cashier', 'supervisor', 'admin', 'owner'].includes(normalized);
  return {
    canRead,
    canCreate: normalized === 'cashier' || normalized === 'supervisor',
    canFulfill: normalized === 'cashier' || normalized === 'supervisor',
    canCancel: normalized === 'supervisor' || normalized === 'admin',
    canApproveReprice: normalized === 'supervisor',
    showNavigation: canRead,
  };
}

export function showCustomerOrderNavigation(input: {
  readonly enabled: boolean;
  readonly role: CustomerOrderRole;
}): boolean {
  return input.enabled && customerOrderAccess(input.role).showNavigation;
}

export function showCashOperatingNavigation(role: CustomerOrderRole): boolean {
  return ['cashier', 'supervisor', 'admin'].includes(role.trim().toLowerCase());
}
