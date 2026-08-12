/**
 * Sprint 52 — Setup Checklist del "segundo día" (Arquitectura §5.3 regla 37a,
 * GTM §6.2). Cinco pasos: logo, impresora, invitar cajero, activar
 * facturación, subir catálogo. El checklist NUNCA bloquea la caja: es una
 * barra de completitud con nudge contextual. El estado server viene de D1
 * (tenants/logo, formalization, products, users); la impresora es local
 * (preflight del PrinterTransport, S25). Puro: sin D1, sin deps de red.
 */

export const SETUP_STEP_IDS = ['logo', 'printer', 'team', 'invoicing', 'catalog'] as const;

export type SetupStepId = (typeof SETUP_STEP_IDS)[number];

export interface SetupStepCopy {
  readonly title: string;
  readonly hint: string;
  readonly action: string;
}

/** Catálogo canónico de pasos (una sola fuente de verdad; GTM §6.2). */
export const SETUP_STEPS: Readonly<Record<SetupStepId, SetupStepCopy>> = {
  logo: {
    title: 'Sube el logo de tu negocio',
    hint: 'Aparece en tus tickets y en la pantalla de cobro.',
    action: 'Ir a Configuración',
  },
  printer: {
    title: 'Conecta tu impresora de tickets',
    hint: 'Se detecta sola cuando está conectada a esta computadora.',
    action: 'Revisar impresora',
  },
  team: {
    title: 'Invita a un cajero',
    hint: 'Cada operador recibe su PIN y su badge.',
    action: 'Ir a Equipo',
  },
  invoicing: {
    title: 'Activa la facturación electrónica',
    hint: 'Emite boletas y facturas con la firma de KipusPay.',
    action: 'Ir a Configuración',
  },
  catalog: {
    title: 'Sube tu catálogo',
    hint: 'Productos, precios y códigos de barras en minutos.',
    action: 'Ir a Catálogo',
  },
};

/** Estado server-side computado en D1 (endpoint setup-progress). */
export interface SetupServerState {
  readonly logo: boolean;
  readonly invoicing: boolean;
  readonly team: boolean;
  readonly catalog: boolean;
}

export interface SetupProgressStep {
  readonly id: SetupStepId;
  readonly done: boolean;
  readonly title: string;
  readonly hint: string;
  readonly action: string;
}

export interface SetupProgress {
  readonly steps: readonly SetupProgressStep[];
  readonly completedCount: number;
  readonly total: number;
  readonly percent: number;
  readonly isComplete: boolean;
  /** Nudge: el primer paso pendiente (null si todo completo). */
  readonly nextStepId: SetupStepId | null;
}

/**
 * Computa la completitud del checklist. `printerReady` es estado LOCAL del
 * navegador (preflight del transport de impresión); los demás vienen del
 * servidor. Nunca bloquea: solo informa.
 */
export function computeSetupProgress(
  server: SetupServerState,
  printerReady: boolean,
): SetupProgress {
  const states: Readonly<Record<SetupStepId, boolean>> = {
    logo: server.logo,
    printer: printerReady,
    team: server.team,
    invoicing: server.invoicing,
    catalog: server.catalog,
  };
  const steps = SETUP_STEP_IDS.map((id) => ({
    id,
    done: states[id],
    ...SETUP_STEPS[id],
  }));
  const completedCount = steps.filter((step) => step.done).length;
  const total = steps.length;
  const nextStepId = steps.find((step) => !step.done)?.id ?? null;
  return {
    steps,
    completedCount,
    total,
    percent: Math.round((completedCount / total) * 100),
    isComplete: completedCount === total,
    nextStepId,
  };
}

/** Clave de persistencia local para no mostrar el nudge una vez cerrado. */
export const CHECKLIST_DISMISSED_KEY = 'kipus:setup-checklist:dismissed';
