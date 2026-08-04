/**
 * Geometria del quipu de marca.
 *
 * Un quipu codifica cifras por posicion: cada cordel colgante lleva tres grupos
 * de nudos y la altura del grupo dice si son centenas, decenas o unidades. Aqui
 * se respeta esa regla, asi que la cantidad y la altura de los nudos no son
 * decoracion: son el numero que cuelga de ese cordel.
 *
 * Modulo puro (sin DOM) para que el dibujo sea verificable por test.
 */

export type QuipuTier = 'hundreds' | 'tens' | 'units';

export interface QuipuKnot {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly tier: QuipuTier;
}

export interface QuipuCord {
  readonly slug: string;
  readonly value: number;
  /** Path del cordel colgante, con pathLength normalizado a 1. */
  readonly path: string;
  readonly knots: readonly QuipuKnot[];
  /** Punta del cordel: donde remata la borla. */
  readonly tip: { readonly x: number; readonly y: number };
}

export interface QuipuRig {
  readonly primary: { readonly x1: number; readonly x2: number; readonly y: number };
  readonly cords: readonly QuipuCord[];
}

export interface RigOptions {
  /** x del primer cordel colgante. */
  readonly originX: number;
  /** y del cordel principal (horizontal). */
  readonly originY: number;
  readonly spacing: number;
  readonly length: number;
  /** Amplitud del vaiven lateral del cordel. */
  readonly drift: number;
  /** Escala de los nudos. */
  readonly knotScale?: number;
  /** Cuanto sobresale el cordel principal a cada lado del ultimo colgante. */
  readonly overhang?: number;
}

interface TierSpec {
  readonly tier: QuipuTier;
  /** Posicion del grupo a lo largo del cordel, en fraccion de su largo. */
  readonly at: number;
  readonly size: number;
}

const TIERS: readonly TierSpec[] = [
  { tier: 'hundreds', at: 0.18, size: 17 },
  { tier: 'tens', at: 0.45, size: 14 },
  { tier: 'units', at: 0.72, size: 11 },
];

const SAMPLES = 24;

/*
 * Un quipu tejido a mano no tiene dos cordeles iguales: cada uno cae con su
 * largo y su curvatura. Sin estas variaciones el dibujo lee como cortina de
 * cuentas en vez de como instrumento de registro.
 */
const LENGTH_JITTER = [1, 0.84, 1.08, 0.76, 0.94];
const DRIFT_PHASE = [1, -0.72, 0.58, -1, 0.82];

/** Descompone un valor de 0..999 en centenas, decenas y unidades. */
export function digitsOf(value: number): readonly [number, number, number] {
  const n = Math.min(999, Math.max(0, Math.trunc(value)));
  return [Math.floor(n / 100), Math.floor((n % 100) / 10), n % 10];
}

/** Desvio lateral del cordel en la fraccion t de su largo. */
export function offsetAt(t: number, drift: number): number {
  return Math.sin(t * Math.PI * 1.15) * drift;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function cordPath(originX: number, originY: number, length: number, drift: number): string {
  const points: string[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const x = round(originX + offsetAt(t, drift));
    const y = round(originY + t * length);
    points.push(`${i === 0 ? 'M' : 'L'}${x},${y}`);
  }
  return points.join(' ');
}

function knotsFor(
  value: number,
  opts: Required<RigOptions>,
  originX: number,
  length: number,
  drift: number,
): QuipuKnot[] {
  const digits = digitsOf(value);
  const knots: QuipuKnot[] = [];

  for (const [index, spec] of TIERS.entries()) {
    const count = digits[index] ?? 0;
    const size = spec.size * opts.knotScale;
    const gap = size * 1.35;

    for (let i = 0; i < count; i++) {
      const t = spec.at + (i * gap) / length;
      knots.push({
        x: round(originX + offsetAt(t, drift)),
        y: round(opts.originY + t * length),
        size: round(size),
        tier: spec.tier,
      });
    }
  }

  return knots;
}

/**
 * Construye el aparejo completo: cordel principal horizontal + un colgante por
 * slug, cada uno con los nudos de su valor.
 */
export function buildRig(
  entries: readonly { readonly slug: string; readonly value: number }[],
  options: RigOptions,
): QuipuRig {
  const opts: Required<RigOptions> = {
    knotScale: 1,
    overhang: options.spacing * 0.55,
    ...options,
  };

  const cords = entries.map((entry, index) => {
    const originX = opts.originX + index * opts.spacing;
    const length = opts.length * (LENGTH_JITTER[index % LENGTH_JITTER.length] ?? 1);
    const drift = opts.drift * (DRIFT_PHASE[index % DRIFT_PHASE.length] ?? 1);

    return {
      slug: entry.slug,
      value: entry.value,
      path: cordPath(originX, opts.originY, length, drift),
      knots: knotsFor(entry.value, opts, originX, length, drift),
      tip: {
        x: round(originX + offsetAt(1, drift)),
        y: round(opts.originY + length),
      },
    };
  });

  const lastX = opts.originX + Math.max(0, entries.length - 1) * opts.spacing;

  return {
    primary: {
      x1: round(opts.originX - opts.overhang),
      x2: round(lastX + opts.overhang),
      y: opts.originY,
    },
    cords,
  };
}
