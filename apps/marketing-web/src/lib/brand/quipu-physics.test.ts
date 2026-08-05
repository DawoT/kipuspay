import { describe, expect, it } from 'vitest';
import { QuipuPhysicsSystem } from './quipu-physics';

describe('QuipuPhysicsSystem', () => {
  it('se inicializa vacio', () => {
    const sys = new QuipuPhysicsSystem();
    expect(sys.nodes).toHaveLength(0);
    expect(sys.constraints).toHaveLength(0);
  });

  it('agrega nodos y fija posiciones ancladas', () => {
    const sys = new QuipuPhysicsSystem();
    const p1 = sys.addNode(100, 50, true);
    const p2 = sys.addNode(100, 100, false);

    expect(p1.pinned).toBe(true);
    expect(p2.pinned).toBe(false);
    expect(sys.nodes).toHaveLength(2);
  });

  it('aplica gravedad a nodos no anclados', () => {
    const sys = new QuipuPhysicsSystem();
    const p1 = sys.addNode(100, 50, true);
    const p2 = sys.addNode(100, 100, false);

    sys.update(1.0, 0.98, 0); // test gravity step without constraint tightening

    expect(p1.y).toBe(50); // Pinned node stays fixed
    expect(p2.y).toBe(101); // Unpinned node falls under gravity
  });

  it('mantiene la restriccion de distancia entre nodos', () => {
    const sys = new QuipuPhysicsSystem();
    const p1 = sys.addNode(100, 50, true);
    const p2 = sys.addNode(100, 100, false);
    sys.addConstraint(p1, p2, 50);

    // Apply strong impulse to stretch
    sys.applyImpulse(100, 100, 30, 20, 20);
    sys.update(0.1, 0.98, 6);

    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    expect(Math.abs(dist - 50)).toBeLessThan(5); // Distance constrained near 50px
  });
});
