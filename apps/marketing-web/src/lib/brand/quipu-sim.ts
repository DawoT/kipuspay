/**
 * Simulacion Verlet del quipu de marca.
 *
 * Parte del estado de reposo que produce `buildRig` y lo anima con una cadena
 * de particulas: cada cordel es una sarta de nodos, los nudos pesan mas, y el
 * primer nodo queda anclado al cordel principal. Modulo puro (sin DOM) para
 * que la dinamica sea verificable por test.
 */

import type { QuipuCord, QuipuRig } from './quipu.js';

/** Bajo este umbral el bucle de dibujo puede detenerse. */
export const ENERGY_EPSILON = 0.08;

const SAMPLES = 24;
const ITERATIONS = 3;

export interface SimNode {
  x: number;
  y: number;
  /** Posicion en el fotograma anterior (Verlet). */
  px: number;
  py: number;
  /** Masa > 1 marca un nudo; el resto son segmentos de fibra. */
  mass: number;
  /** Posicion canonica en Y (para no abandonar el valor posicional). */
  restY: number;
  pinned: boolean;
}

export interface SimCord {
  readonly slug: string;
  readonly nodes: SimNode[];
  /** Distancia de reposo por arista (el cordel curvado no es uniforme). */
  readonly restLens: readonly number[];
}

export interface SimState {
  readonly cords: SimCord[];
  readonly primaryY: number;
}

export interface SimForces {
  /** Aceleracion hacia abajo (px / s^2), tipicamente 0.1..0.4. */
  readonly gravity: number;
  /** Empuje lateral global (viento / scroll). */
  readonly wind: number;
  /** Factor de amortiguacion por paso (0.9..1). */
  readonly damping: number;
}

function parsePathPoints(path: string): { x: number; y: number; mass: number }[] {
  // Path canónico: "M x,y L x,y L ..." — sin regex, para evitar el detector de RE2.
  const points: { x: number; y: number; mass: number }[] = [];
  let i = 0;
  while (i < path.length) {
    const cmd = path[i];
    if (cmd !== 'M' && cmd !== 'L') {
      i += 1;
      continue;
    }
    i += 1;
    let j = i;
    while (j < path.length && path[j] !== 'M' && path[j] !== 'L') j += 1;
    const pair = path.slice(i, j).split(',');
    const x = Number(pair[0]);
    const y = Number(pair[1]);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      points.push({ x, y, mass: 1 });
    }
    i = j;
  }
  return points;
}

function sampleCord(cord: QuipuCord): { x: number; y: number; mass: number }[] {
  const points = parsePathPoints(cord.path);
  if (points.length === 0) {
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      points.push({ x: cord.tip.x, y: cord.tip.y * t, mass: 1 });
    }
  }

  // Cada nudo debe ser un nodo exacto: si no cae en un sample, se inserta.
  for (const knot of cord.knots) {
    const near = points.find((p) => Math.hypot(p.x - knot.x, p.y - knot.y) < 1.5);
    if (near) {
      near.mass = Math.max(near.mass, 1 + knot.size / 8);
      near.x = knot.x;
      near.y = knot.y;
      continue;
    }
    // Insertar ordenado por Y para mantener la cadena.
    const node = { x: knot.x, y: knot.y, mass: 1 + knot.size / 8 };
    const idx = points.findIndex((p) => p.y > knot.y);
    if (idx === -1) points.push(node);
    else points.splice(idx, 0, node);
  }

  return points;
}

/** Construye el estado de simulacion a partir del aparejo en reposo. */
export function createSim(rig: QuipuRig): SimState {
  const cords: SimCord[] = rig.cords.map((cord) => {
    const samples = sampleCord(cord);
    const nodes: SimNode[] = samples.map((p, i) => ({
      x: p.x,
      y: p.y,
      px: p.x,
      py: p.y,
      mass: p.mass,
      restY: p.y,
      pinned: i === 0,
    }));
    const restLens: number[] = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      restLens.push(Math.hypot(nodes[i + 1].x - nodes[i].x, nodes[i + 1].y - nodes[i].y) || 1);
    }
    return { slug: cord.slug, nodes, restLens };
  });

  return { cords, primaryY: rig.primary.y };
}

export function kineticEnergy(sim: SimState): number {
  let e = 0;
  for (const cord of sim.cords) {
    for (const n of cord.nodes) {
      if (n.pinned) continue;
      const vx = n.x - n.px;
      const vy = n.y - n.py;
      e += 0.5 * n.mass * (vx * vx + vy * vy);
    }
  }
  return e;
}

/**
 * Impulso en un punto del cordel (t en [0,1] a lo largo del cordel).
 * dx/dy en pixeles por frame; se aplica como desplazamiento del nodo.
 */
export function applyImpulse(sim: SimState, slug: string, t: number, dx: number, dy: number): void {
  const cord = sim.cords.find((c) => c.slug === slug);
  if (!cord || cord.nodes.length < 2) return;
  const idx = Math.min(cord.nodes.length - 1, Math.max(1, Math.round(t * (cord.nodes.length - 1))));
  const n = cord.nodes[idx];
  if (n.pinned) return;
  n.x += dx;
  n.y += dy;
}

function satisfy(cord: SimCord): void {
  const { nodes, restLens } = cord;
  for (let k = 0; k < ITERATIONS; k++) {
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i];
      const b = nodes[i + 1];
      const restLen = restLens[i] ?? 1;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 1;
      const diff = (dist - restLen) / dist;
      const invA = a.pinned ? 0 : 1 / a.mass;
      const invB = b.pinned ? 0 : 1 / b.mass;
      const invSum = invA + invB;
      if (invSum === 0) continue;
      const corrX = dx * diff * 0.5;
      const corrY = dy * diff * 0.5;
      if (!a.pinned) {
        a.x += (corrX * invA) / invSum;
        a.y += (corrY * invA) / invSum;
      }
      if (!b.pinned) {
        b.x -= (corrX * invB) / invSum;
        b.y -= (corrY * invB) / invSum;
      }
    }
  }
}

/** Un paso de Verlet a dt segundos. Mutates `sim` in place. */
export function step(sim: SimState, dt: number, forces: SimForces): void {
  const dt2 = dt * dt;
  for (const cord of sim.cords) {
    for (const n of cord.nodes) {
      if (n.pinned) {
        n.px = n.x;
        n.py = n.y;
        continue;
      }
      const vx = (n.x - n.px) * forces.damping;
      const vy = (n.y - n.py) * forces.damping;
      n.px = n.x;
      n.py = n.y;
      // Resorte suave hacia la Y canonica: los nudos codifican un valor y no
      // pueden abandonar su altura de grupo (invariante de marca).
      const springY = n.mass > 1 ? (n.restY - n.y) * 0.04 : 0;
      n.x += vx + (forces.wind / n.mass) * dt2;
      n.y += vy + (forces.gravity / n.mass) * dt2 + springY;
    }
    satisfy(cord);
  }
}
