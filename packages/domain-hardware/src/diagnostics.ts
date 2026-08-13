/**
 * Diagnóstico de hardware — regla 37b (Arquitectura §5.3, FASE 6G Sprint 53,
 * ADR-0033). Dominio puro: report canónico con causa comprensible + paso
 * siguiente, sin jerga técnica. El copy vive UNA vez aquí (DRY); la UI y el
 * servidor lo referencian, nunca lo re-escriben.
 */

export const DIAGNOSTIC_TARGETS = [
  'printer_usb',
  'printer_network',
  'scale',
  'vitrina',
  'cash_drawer',
] as const;
export type DiagnosticTarget = (typeof DIAGNOSTIC_TARGETS)[number];

/**
 * Términos técnicos prohibidos en el copy visible al usuario (criterio de
 * aceptación "0 conceptos técnicos"): WebUSB/WSS/IP y la escalera §7.5.
 * El botón "Probar impresora USB" es copy normativo del roadmap y queda fuera
 * de esta lista (aplica a estados y pasos siguientes).
 */
export const HARDWARE_JARGON_TERMS = [
  'WebUSB',
  'WSS',
  'Web Bluetooth',
  'Bluetooth',
  'IP',
  'LAN',
  'ESC/POS',
  'ESC POS',
  'puerto',
  'driver',
  'firmware',
  'protocolo',
  'navegador',
  'browser',
] as const;

export type DiagnosticCauseCode =
  | 'OK'
  | 'PRINTER_NOT_FOUND'
  | 'PRINTER_ACCESS_DENIED'
  | 'PRINTER_ACCESS_PENDING'
  | 'PRINTER_COMM_FAILED'
  | 'NETWORK_PRINTER_NOT_FOUND'
  | 'NETWORK_PRINTER_UNREACHABLE'
  | 'NETWORK_PRINTER_ACCESS_DENIED'
  | 'SCALE_NOT_FOUND'
  | 'SCALE_UNSTABLE'
  | 'SCALE_COMM_FAILED'
  | 'VITRINA_NO_SCREEN'
  | 'VITRINA_COMM_FAILED'
  | 'DRAWER_NOT_FOUND'
  | 'DRAWER_COMM_FAILED';

export interface DiagnosticCause {
  readonly label: string;
  readonly nextStepId: string | null;
}

export const DIAGNOSTIC_CAUSES: Readonly<Record<DiagnosticCauseCode, DiagnosticCause>> = {
  OK: {
    label: 'Todo funciona correctamente.',
    nextStepId: null,
  },
  PRINTER_NOT_FOUND: {
    label: 'No encontramos una impresora conectada por cable.',
    nextStepId: 'Conecta la impresora con su cable y vuelve a probar.',
  },
  PRINTER_ACCESS_DENIED: {
    label: 'El equipo rechazó el permiso para la impresora.',
    nextStepId: 'Permite el acceso cuando el equipo lo pida y vuelve a probar.',
  },
  PRINTER_ACCESS_PENDING: {
    label: 'El equipo está esperando tu permiso para la impresora.',
    nextStepId: 'Acepta la solicitud que apareció en pantalla para continuar.',
  },
  PRINTER_COMM_FAILED: {
    label: 'La impresora no respondió la prueba.',
    nextStepId: 'Revisa el cable, confirma que la impresora esté encendida y vuelve a probar.',
  },
  NETWORK_PRINTER_NOT_FOUND: {
    label: 'No encontramos impresoras en tu red.',
    nextStepId: 'Confirma que la impresora esté encendida y conectada a la misma red Wi-Fi.',
  },
  NETWORK_PRINTER_UNREACHABLE: {
    label: 'La impresora no respondió desde tu red.',
    nextStepId: 'Acerca el equipo a la impresora o reinicia el equipo de red y vuelve a probar.',
  },
  NETWORK_PRINTER_ACCESS_DENIED: {
    label: 'La impresora de tu red no aceptó la conexión.',
    nextStepId: 'Reinicia la impresora y vuelve a probar.',
  },
  SCALE_NOT_FOUND: {
    label: 'No encontramos la balanza conectada.',
    nextStepId: 'Conecta la balanza por cable y vuelve a probar.',
  },
  SCALE_UNSTABLE: {
    label: 'La balanza no entregó una lectura estable.',
    nextStepId: 'Quita lo que esté sobre la balanza, deja que marque cero y vuelve a probar.',
  },
  SCALE_COMM_FAILED: {
    label: 'La balanza no respondió la prueba.',
    nextStepId: 'Revisa el cable, confirma que la balanza esté encendida y vuelve a probar.',
  },
  VITRINA_NO_SCREEN: {
    label: 'Ninguna pantalla de vitrina está activa.',
    nextStepId: 'Abre la vitrina en otra pantalla y vuelve a probar.',
  },
  DRAWER_NOT_FOUND: {
    label: 'No encontramos un cajón de efectivo conectado.',
    nextStepId: 'Conecta el cajón a la impresora y vuelve a probar.',
  },
  DRAWER_COMM_FAILED: {
    label: 'El cajón no respondió al impulso de apertura.',
    nextStepId: 'Revisa el cable del cajón y el modelo de impresora.',
  },
  VITRINA_COMM_FAILED: {
    label: 'La vitrina no respondió la prueba.',
    nextStepId: 'Recarga la pantalla de vitrina y vuelve a probar.',
  },
};

export interface DiagnosticReport {
  readonly target: DiagnosticTarget;
  readonly ok: boolean;
  readonly causeCode: DiagnosticCauseCode;
  readonly nextStepId: string | null;
  readonly durationMs: number;
  readonly testedAtIso: string;
  readonly paperWidthMm?: 58 | 80;
  readonly valid: boolean;
}

export function buildDiagnosticReport(input: {
  readonly target: DiagnosticTarget;
  readonly ok: boolean;
  readonly causeCode: DiagnosticCauseCode;
  readonly durationMs: number;
  readonly testedAtIso: string;
  readonly paperWidthMm?: 58 | 80;
}): DiagnosticReport {
  const cause = DIAGNOSTIC_CAUSES[input.causeCode];
  const consistentOk = input.ok === (input.causeCode === 'OK');
  const report: DiagnosticReport = {
    target: input.target,
    ok: input.ok,
    causeCode: input.causeCode,
    nextStepId: cause?.nextStepId ?? null,
    durationMs: input.durationMs,
    testedAtIso: input.testedAtIso,
    valid: Boolean(cause) && consistentOk,
    ...(input.paperWidthMm !== undefined ? { paperWidthMm: input.paperWidthMm } : {}),
  };
  return report;
}

export function causeLabel(code: DiagnosticCauseCode): string {
  return DIAGNOSTIC_CAUSES[code].label;
}

export function nextStepFor(code: DiagnosticCauseCode): string | null {
  return DIAGNOSTIC_CAUSES[code].nextStepId;
}

/**
 * Valida copy contra jerga técnica prohibida (criterio "0 conceptos
 * técnicos"). Matching por palabra completa (word boundaries manuales, sin
 * RegExp dinámico): "IP" no dispara dentro de "permiso"/"chip", pero sí como
 * término suelto.
 */
export function findJargonViolations(
  entries: readonly { readonly id: string; readonly text: string }[],
): string[] {
  const violations: string[] = [];
  for (const entry of entries) {
    for (const term of HARDWARE_JARGON_TERMS) {
      if (containsTerm(entry.text, term)) {
        violations.push(`${entry.id}: "${entry.text}" contiene "${term}"`);
      }
    }
  }
  return violations;
}

function containsTerm(text: string, term: string): boolean {
  const lower = text.toLowerCase();
  const t = term.toLowerCase();
  let idx = lower.indexOf(t);
  while (idx !== -1) {
    const beforeOk = idx === 0 || !isWordChar(lower.charAt(idx - 1));
    const afterOk = idx + t.length >= lower.length || !isWordChar(lower.charAt(idx + t.length));
    if (beforeOk && afterOk) return true;
    idx = lower.indexOf(t, idx + 1);
  }
  return false;
}

function isWordChar(ch: string): boolean {
  return /[a-z0-9]/.test(ch);
}
