/**
 * S9-A2 — banner ámbar de pago (GTM §4.3 anti-apagado).
 * La caja NUNCA se bloquea por billing; el mensaje solo informa al dueño.
 */
import type { AdminAuthenticatedSession } from './authenticated-session.js';

export type BillingSnapshot = NonNullable<AdminAuthenticatedSession['billing']>;

export function billingNoticeText(
  billing: BillingSnapshot | null | undefined,
): string {
  if (!billing) return '';
  if (billing.subscriptionStatus === 'past_due' || billing.subscriptionStatus === 'canceled') {
    return billing.pastGracePeriod
      ? 'Tu suscripción está inactiva: la caja sigue operando, pero las herramientas de gestión están pausadas. Regulariza tu pago para reactivarlas.'
      : 'Actualiza tu método de pago en los próximos 3 días. La caja sigue operando con normalidad.';
  }
  return '';
}
