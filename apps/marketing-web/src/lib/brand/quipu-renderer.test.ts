import { describe, expect, it, vi } from 'vitest';
import { buildRig } from './quipu';
import { QuipuPhysicsSystem } from './quipu-physics';
import { drawQuipuCanvas, type DataParticle } from './quipu-renderer';

describe('drawQuipuCanvas', () => {
  it('ejecuta los comandos de dibujado en Canvas 2D sin lanzar errores', () => {
    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      arc: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      quadraticCurveTo: vi.fn(),
      createLinearGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
      createRadialGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
      globalAlpha: 1,
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      lineCap: 'butt',
      shadowColor: '',
      shadowBlur: 0,
    } as unknown as CanvasRenderingContext2D;

    const physics = new QuipuPhysicsSystem();
    const rig = buildRig(
      [
        { slug: 'restaurantes', value: 342 },
        { slug: 'farmacias', value: 213 },
      ],
      { originX: 200, originY: 50, spacing: 100, length: 300, drift: 10 },
    );

    const particles: DataParticle[] = [
      { cordIndex: 0, progress: 0.5, speed: 0.01, color: '#eeb765', size: 4 },
    ];

    expect(() => {
      drawQuipuCanvas(mockCtx, 800, 600, physics, rig, particles, 1.0, null);
    }).not.toThrow();
  });
});
