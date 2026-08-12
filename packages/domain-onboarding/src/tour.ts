/**
 * Sprint 52 — Product Tour (Arquitectura §5.3 regla 37a, GTM §6.2).
 *
 * El tour se activa EXCLUSIVAMENTE por capabilities del tenant (ADR-ARCH-002):
 * cada paso declara la capability que lo habilita. El rubro (vertical) solo
 * elige el copy ("Como eres restaurante, activamos las comandas de cocina…"),
 * jamás la activación — cero forks por vertical. El rol filtra la versión
 * (Dueño vs Cajero). Copy sin jerga: validado por el dominio (Staff Content).
 * Puro: sin D1, sin deps de red.
 */

export type TourCapability =
  | 'kds'
  | 'fefo'
  | 'scale'
  | 'promotions'
  | 'variants'
  | 'quick_add'
  | 'shift_handoff'
  | 'team_invite';

export type TourRole = 'owner' | 'cashier';

export interface TourStep {
  /** Selector del target en la UI: `[data-tour-target="<target>"]`. */
  readonly target: string;
  readonly title: string;
  readonly body: string;
  readonly capability: TourCapability;
  /** Rubros a los que aplica el copy; undefined = todos. */
  readonly verticals?: readonly string[];
  readonly roles?: readonly TourRole[];
}

/** Catálogo canónico del tour (una sola fuente de verdad; GTM §6.2). */
export const TOUR_STEPS: readonly TourStep[] = [
  {
    target: 'catalog',
    title: 'Tu catálogo está en el panel Catálogo',
    body: 'Agrega tus productos con el importador CSV o escanea el código de barras con la cámara de tu celular.',
    capability: 'quick_add',
  },
  {
    target: 'kds',
    title: 'Comandas en la cocina',
    body: 'Como eres restaurante, activamos las comandas de cocina: configura aquí tu pantalla de chef.',
    capability: 'kds',
    verticals: ['restaurant'],
  },
  {
    target: 'fefo',
    title: 'Vencimientos primero',
    body: 'Como farmacia, tus ventas despachan primero lo que vence antes: revisa las fechas de lote al recibir stock.',
    capability: 'fefo',
    verticals: ['pharmacy'],
  },
  {
    target: 'scale',
    title: 'Venta por peso',
    body: 'Conecta tu balanza para cobrar por peso: la caja registra el gramaje exacto del producto.',
    capability: 'scale',
  },
  {
    target: 'promotions',
    title: 'Ofertas en segundos',
    body: 'Crea promociones desde el panel Promociones y la caja las aplica sola al cobrar.',
    capability: 'promotions',
  },
  {
    target: 'variants',
    title: 'Tallas y sabores',
    body: 'Los productos con variantes (talla, sabor, presentación) se venden sin confundir stock.',
    capability: 'variants',
  },
  {
    target: 'shift',
    title: 'Cambio de turno sin cerrar caja',
    body: 'El turno cambia con un PIN de un solo uso: la caja sigue abierta y cada venta queda atribuida a su operador.',
    capability: 'shift_handoff',
    roles: ['owner'],
  },
  {
    target: 'team',
    title: 'Invita a tu equipo',
    body: 'Desde el panel Equipo invita cajeros y vendedores; cada uno recibe su PIN y su badge para identificarse.',
    capability: 'team_invite',
    roles: ['owner'],
  },
];

/** Términos prohibidos en el copy (Staff Content): jerga técnica del producto. */
export const JARGON_TERMS = [
  'WebUSB',
  'WSS',
  'D1',
  'PSE',
  'SKU',
  'batch',
  'backend',
  'API',
  'KV',
  'cron',
  'fiscal',
  'SUNAT',
  'UOM',
  'PMP',
  'FEFO',
];

export interface TourInput {
  readonly vertical: string;
  readonly role: TourRole;
  readonly capabilities: ReadonlySet<string>;
  /** true si el negocio ya vendió: el tour se omite (criterio S52). */
  readonly hasSold: boolean;
}

export function tourStepsFor(input: TourInput): readonly TourStep[] {
  if (input.hasSold) return [];
  return TOUR_STEPS.filter((step) => {
    if (!input.capabilities.has(step.capability)) return false;
    if (step.verticals && !step.verticals.includes(input.vertical)) return false;
    if (step.roles && !step.roles.includes(input.role)) return false;
    return true;
  });
}

/** Clave de persistencia local del tour por rubro (no re-aparece si se cierra). */
export function tourStorageKey(vertical: string): string {
  return `kipus:tour:${vertical}:state`;
}

export const TOUR_DISMISSED = 'dismissed';
export const TOUR_COMPLETED = 'completed';

export interface TourCopyValidationResult {
  readonly ok: boolean;
  readonly violations: readonly { readonly stepTarget: string; readonly term: string }[];
}

/** Detecta un término con límites de palabra sin construir RegExp dinámicos. */
export function containsJargon(text: string, term: string): boolean {
  const lower = text.toLowerCase();
  const target = term.toLowerCase();
  let index = lower.indexOf(target);
  while (index !== -1) {
    const before = index === 0 ? '' : lower[index - 1]!;
    const after = lower[index + target.length] ?? '';
    const boundary = (ch: string) => ch === '' || !/[a-z0-9]/.test(ch);
    if (boundary(before) && boundary(after)) return true;
    index = lower.indexOf(target, index + 1);
  }
  return false;
}

/** Valida que el copy del tour no contenga jerga técnica (criterio S52). */
export function validateTourCopy(
  steps: readonly TourStep[] = TOUR_STEPS,
): TourCopyValidationResult {
  const violations: { stepTarget: string; term: string }[] = [];
  for (const step of steps) {
    const text = `${step.title} ${step.body}`;
    for (const term of JARGON_TERMS) {
      if (containsJargon(text, term)) violations.push({ stepTarget: step.target, term });
    }
  }
  return { ok: violations.length === 0, violations };
}
