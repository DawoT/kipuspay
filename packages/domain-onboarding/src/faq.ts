/**
 * Sprint 52 — FAQ in-product contextual (Arquitectura §5.3 regla 37a).
 * Solo se ofrecen preguntas de capabilities habilitadas del tenant; el copy
 * es sin jerga (mismo estándar del tour, Staff Content). Puro.
 */

import { containsJargon, JARGON_TERMS, type TourCapability } from './tour.js';

export interface FaqItem {
  readonly id: string;
  readonly question: string;
  readonly answer: string;
  readonly capability: TourCapability;
}

/** Catálogo canónico de FAQ (una sola fuente de verdad). */
export const FAQ_ITEMS: readonly FaqItem[] = [
  {
    id: 'faq-kds',
    question: '¿Cómo llega un pedido a la cocina?',
    answer:
      'El pedido se envía a la pantalla de la cocina en cuanto se cobra; la cocina marca cada plato listo y el salón lo recibe.',
    capability: 'kds',
  },
  {
    id: 'faq-fefo',
    question: '¿Qué hago con los productos que vencen?',
    answer:
      'Al registrar lotes con fecha de vencimiento, la caja despacha primero lo que vence antes, así no se queda mercadería vencida en el estante.',
    capability: 'fefo',
  },
  {
    id: 'faq-scale',
    question: '¿Cómo vendo por peso?',
    answer:
      'Conecta tu balanza a la caja: pesas el producto y el precio se calcula solo con el gramaje real.',
    capability: 'scale',
  },
  {
    id: 'faq-promotions',
    question: '¿Cómo hago una oferta?',
    answer:
      'Crea la promoción en el panel Promociones (2x1, descuento por cantidad) y la caja la aplica automáticamente.',
    capability: 'promotions',
  },
  {
    id: 'faq-variants',
    question: '¿Puedo vender tallas y sabores por separado?',
    answer: 'Sí: crea variantes de un mismo producto y cada presentación lleva su propio stock.',
    capability: 'variants',
  },
  {
    id: 'faq-quick-add',
    question: '¿Tengo que escribir todos mis productos a mano?',
    answer:
      'No: importa tu lista desde un archivo o escanea los códigos de barras con la cámara para agregarlos al instante.',
    capability: 'quick_add',
  },
  {
    id: 'faq-shift',
    question: '¿Cómo cambio de turno sin cortar la caja?',
    answer:
      'El operador saliente genera un PIN temporal; el entrante lo ingresa y la sesión continúa abierta con la venta atribuida a quien corresponde.',
    capability: 'shift_handoff',
  },
  {
    id: 'faq-team',
    question: '¿Cómo doy acceso a mi equipo?',
    answer:
      'Invita por correo desde el panel Equipo: cada persona recibe su PIN y su badge para identificarse en la caja.',
    capability: 'team_invite',
  },
];

export interface FaqInput {
  readonly capabilities: ReadonlySet<string>;
}

export function faqFor(input: FaqInput): readonly FaqItem[] {
  return FAQ_ITEMS.filter((item) => input.capabilities.has(item.capability));
}

export interface FaqCopyValidationResult {
  readonly ok: boolean;
  readonly violations: readonly { readonly faqId: string; readonly term: string }[];
}

/** Valida que el copy de las FAQ no contenga jerga técnica. */
export function validateFaqCopy(items: readonly FaqItem[] = FAQ_ITEMS): FaqCopyValidationResult {
  const violations: { faqId: string; term: string }[] = [];
  for (const item of items) {
    const text = `${item.question} ${item.answer}`;
    for (const term of JARGON_TERMS) {
      if (containsJargon(text, term)) violations.push({ faqId: item.id, term });
    }
  }
  return { ok: violations.length === 0, violations };
}
