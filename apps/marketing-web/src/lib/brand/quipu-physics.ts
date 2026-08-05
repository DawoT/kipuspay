/**
 * Motor de Física Verlet en TypeScript Puro (Zero-Dependency)
 *
 * Simula la dinamica de masa-resorte de las cuerdas del Quipu.
 * No requiere librerias externas y corre en < 1 ms por frame.
 */

export interface PhysicsNode {
  x: number;
  y: number;
  oldX: number;
  oldY: number;
  pinned: boolean;
}

export interface Constraint {
  nodeA: PhysicsNode;
  nodeB: PhysicsNode;
  length: number;
}

export class QuipuPhysicsSystem {
  nodes: PhysicsNode[] = [];
  constraints: Constraint[] = [];

  addNode(x: number, y: number, pinned: boolean = false): PhysicsNode {
    const node: PhysicsNode = { x, y, oldX: x, oldY: y, pinned };
    this.nodes.push(node);
    return node;
  }

  addConstraint(nodeA: PhysicsNode, nodeB: PhysicsNode, length?: number): Constraint {
    const dist = length ?? Math.hypot(nodeB.x - nodeA.x, nodeB.y - nodeA.y);
    const constraint: Constraint = { nodeA, nodeB, length: dist };
    this.constraints.push(constraint);
    return constraint;
  }

  update(gravity: number = 0.25, dampening: number = 0.98, iterations: number = 4): void {
    // 1. Integración de Verlet para posicionamiento de nodos
    for (const node of this.nodes) {
      if (node.pinned) continue;
      const vx = (node.x - node.oldX) * dampening;
      const vy = (node.y - node.oldY) * dampening;
      node.oldX = node.x;
      node.oldY = node.y;
      node.x += vx;
      node.y += vy + gravity;
    }

    // 2. Resolver restricciones de distancia
    for (let iter = 0; iter < iterations; iter++) {
      for (const c of this.constraints) {
        const dx = c.nodeB.x - c.nodeA.x;
        const dy = c.nodeB.y - c.nodeA.y;
        const dist = Math.hypot(dx, dy) || 0.001;
        const diff = (dist - c.length) / dist;

        const offsetX = dx * diff * 0.5;
        const offsetY = dy * diff * 0.5;

        if (!c.nodeA.pinned && !c.nodeB.pinned) {
          c.nodeA.x += offsetX;
          c.nodeA.y += offsetY;
          c.nodeB.x -= offsetX;
          c.nodeB.y -= offsetY;
        } else if (!c.nodeA.pinned) {
          c.nodeA.x += offsetX * 2;
          c.nodeA.y += offsetY * 2;
        } else if (!c.nodeB.pinned) {
          c.nodeB.x -= offsetX * 2;
          c.nodeB.y -= offsetY * 2;
        }
      }
    }
  }

  applyImpulse(x: number, y: number, radius: number, forceX: number, forceY: number): void {
    for (const node of this.nodes) {
      if (node.pinned) continue;
      const dist = Math.hypot(node.x - x, node.y - y);
      if (dist < radius && dist > 0) {
        const factor = 1 - dist / radius;
        node.x += forceX * factor;
        node.y += forceY * factor;
      }
    }
  }

  reset(): void {
    this.nodes = [];
    this.constraints = [];
  }
}
