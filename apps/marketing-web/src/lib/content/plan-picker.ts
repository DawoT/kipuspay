/**
 * Picker "¿Qué plan te conviene?" (M5A) — lógica pura y testeada.
 * Premium UX: 3 preguntas simples, cero vendedor de por medio.
 */

import type { PlanId } from './pricing.js';

export type PickerCapability = 'modo-dueno' | 'comandas' | 'multi-local' | 'api' | 'sla';

export interface PlanPickerInput {
  readonly locales: number;
  readonly cajas: number;
  readonly capacidades: readonly PickerCapability[];
}

const CADENA_CAPS: ReadonlySet<PickerCapability> = new Set(['comandas', 'multi-local', 'api']);

export function recommendPlan(input: PlanPickerInput): PlanId {
  if (input.capacidades.includes('sla') || input.locales >= 30) return 'enterprise';
  if (input.locales >= 4 || input.capacidades.some((c) => CADENA_CAPS.has(c))) {
    return 'cadena';
  }
  if (input.cajas > 1 || input.locales > 1 || input.capacidades.includes('modo-dueno')) {
    return 'crece';
  }
  return 'arranque';
}
