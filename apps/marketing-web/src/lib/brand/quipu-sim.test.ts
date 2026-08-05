import { describe, expect, it } from 'vitest';
import { buildRig } from './quipu.js';
import {
  ENERGY_EPSILON,
  applyImpulse,
  createSim,
  kineticEnergy,
  step,
  type SimForces,
} from './quipu-sim.js';

const CORDS = [
  { slug: 'restaurantes', value: 342 },
  { slug: 'farmacias', value: 213 },
  { slug: 'retail', value: 431 },
  { slug: 'servicios', value: 124 },
  { slug: 'cadenas', value: 232 },
];

const RIG = buildRig(CORDS, {
  originX: 100,
  originY: 40,
  spacing: 80,
  length: 400,
  drift: 12,
  overhang: 60,
});

const CALM: SimForces = { gravity: 0, wind: 0, damping: 1 };

describe('quipu-sim — estado de reposo', () => {
  it('el reposo inicial coincide con buildRig (anclas y nudos)', () => {
    const sim = createSim(RIG);
    expect(sim.cords).toHaveLength(RIG.cords.length);

    for (let i = 0; i < RIG.cords.length; i++) {
      const cord = sim.cords[i];
      const rest = RIG.cords[i];
      expect(cord.slug).toBe(rest.slug);
      // El primer nodo esta anclado al cordel principal (punta superior del path).
      expect(cord.nodes[0].pinned).toBe(true);
      expect(cord.nodes[0].y).toBeCloseTo(RIG.primary.y, 0);
      // Cada nudo canonicamente posicionado tiene un nodo con esa masa.
      for (const knot of rest.knots) {
        const node = cord.nodes.find((n) => Math.hypot(n.x - knot.x, n.y - knot.y) < 1.5);
        expect(node, `nudo en (${knot.x},${knot.y})`).toBeDefined();
        expect(node!.mass).toBeGreaterThan(1);
      }
    }
  });

  it('sin fuerzas, el sistema permanece quieto', () => {
    const sim = createSim(RIG);
    const before = sim.cords.map((c) => c.nodes.map((n) => ({ x: n.x, y: n.y })));
    step(sim, 1 / 60, CALM);
    step(sim, 1 / 60, CALM);
    for (let i = 0; i < sim.cords.length; i++) {
      for (let j = 0; j < sim.cords[i].nodes.length; j++) {
        expect(sim.cords[i].nodes[j].x).toBeCloseTo(before[i][j].x, 4);
        expect(sim.cords[i].nodes[j].y).toBeCloseTo(before[i][j].y, 4);
      }
    }
    expect(kineticEnergy(sim)).toBeLessThan(ENERGY_EPSILON);
  });
});

describe('quipu-sim — dinamica', () => {
  it('un impulso en el ancla llega a la punta', () => {
    const sim = createSim(RIG);
    const cord = sim.cords[0];
    const tipBefore = cord.nodes[cord.nodes.length - 1].x;
    applyImpulse(sim, cord.slug, 0.3, 40, 0);
    for (let i = 0; i < 45; i++) {
      step(sim, 1 / 60, { gravity: 0, wind: 0, damping: 0.98 });
    }
    const tipAfter = cord.nodes[cord.nodes.length - 1].x;
    expect(Math.abs(tipAfter - tipBefore)).toBeGreaterThan(2);
  });

  it('la energia cinetica decae de forma monotona bajo damping', () => {
    const sim = createSim(RIG);
    applyImpulse(sim, sim.cords[1].slug, 0.5, 30, 0);
    const energies: number[] = [];
    for (let i = 0; i < 90; i++) {
      step(sim, 1 / 60, { gravity: 0, wind: 0, damping: 0.96 });
      energies.push(kineticEnergy(sim));
    }
    // Media de la primera tercia > media de la ultima tercia.
    const early = energies.slice(0, 30).reduce((a, b) => a + b, 0) / 30;
    const late = energies.slice(-30).reduce((a, b) => a + b, 0) / 30;
    expect(early).toBeGreaterThan(late);
    expect(late).toBeLessThan(early * 0.4);
  });

  it('el sistema se detiene bajo el umbral de energia en menos de N pasos', () => {
    const sim = createSim(RIG);
    applyImpulse(sim, sim.cords[2].slug, 0.4, 25, 0);
    let steps = 0;
    while (kineticEnergy(sim) > ENERGY_EPSILON && steps < 600) {
      step(sim, 1 / 60, { gravity: 0, wind: 0, damping: 0.94 });
      steps++;
    }
    expect(steps).toBeLessThan(600);
    expect(kineticEnergy(sim)).toBeLessThanOrEqual(ENERGY_EPSILON);
  });

  it('los nudos oscilan alrededor de su posicion canonica, no la abandonan', () => {
    const sim = createSim(RIG);
    const cord = sim.cords[0];
    const knotNodes = cord.nodes.filter((n) => n.mass > 1);
    const restY = knotNodes.map((n) => n.restY);
    applyImpulse(sim, cord.slug, 0.5, 35, 0);
    for (let i = 0; i < 120; i++) {
      step(sim, 1 / 60, { gravity: 0.15, wind: 0, damping: 0.97 });
    }
    // Tras el impulso, ningun nudo se desvio mas de 40 px en Y del reposo.
    knotNodes.forEach((n, i) => {
      expect(Math.abs(n.y - restY[i])).toBeLessThan(40);
    });
  });
});
