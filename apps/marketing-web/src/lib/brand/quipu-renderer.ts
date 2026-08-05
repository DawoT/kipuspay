/**
 * Pipeline de Renderizado 2D Canvas para el Quipu Incandescente
 *
 * Dibuja cuerdas Beziér continuas, nudos posicionales (centenas, decenas, unidades)
 * y partículas incandescentes de transmisión de datos.
 */

import type { QuipuRig } from './quipu';
import type { QuipuPhysicsSystem } from './quipu-physics';

export interface DataParticle {
  cordIndex: number;
  progress: number; // 0..1
  speed: number;
  color: string;
  size: number;
}

export function drawQuipuCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  physics: QuipuPhysicsSystem,
  rigData: QuipuRig,
  particles: DataParticle[],
  dpr: number = 1,
  activeCordSlug: string | null = null,
): void {
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  // 1. Resplandor ambiental de fondo
  const glowGrad = ctx.createRadialGradient(
    width * 0.75,
    height * 0.4,
    10,
    width * 0.75,
    height * 0.4,
    width * 0.45,
  );
  glowGrad.addColorStop(0, 'rgba(217, 154, 61, 0.16)');
  glowGrad.addColorStop(1, 'rgba(20, 22, 28, 0)');
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, width, height);

  // 2. Dibujar cuerda principal horizontal
  const p = rigData.primary;
  ctx.beginPath();
  ctx.moveTo(p.x1, p.y);
  ctx.lineTo(p.x2, p.y);
  ctx.strokeStyle = '#3a4150';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.stroke();

  // 3. Dibujar cordeles colgantes y nudos
  rigData.cords.forEach((cord, idx) => {
    const isDim = activeCordSlug !== null && activeCordSlug !== cord.slug;
    ctx.globalAlpha = isDim ? 0.35 : 1.0;

    // Gradiente de cuerda
    const cordGrad = ctx.createLinearGradient(0, p.y, 0, cord.tip.y);
    cordGrad.addColorStop(0, '#eeb765');
    cordGrad.addColorStop(0.5, '#d99a3d');
    cordGrad.addColorStop(1, '#2e9e74');

    // Mapear nodos de física si existen
    const nodes = physics.nodes.slice(idx * 6, (idx + 1) * 6);
    ctx.beginPath();
    const firstNode = nodes[0];
    if (nodes.length >= 2 && firstNode) {
      ctx.moveTo(firstNode.x, firstNode.y);
      for (let i = 1; i < nodes.length - 1; i++) {
        const curr = nodes[i];
        const next = nodes[i + 1];
        if (curr && next) {
          const xc = (curr.x + next.x) / 2;
          const yc = (curr.y + next.y) / 2;
          ctx.quadraticCurveTo(curr.x, curr.y, xc, yc);
        }
      }
      const lastNode = nodes[nodes.length - 1];
      if (lastNode) {
        ctx.lineTo(lastNode.x, lastNode.y);
      }
    } else {
      ctx.moveTo(cord.tip.x, p.y);
      ctx.lineTo(cord.tip.x, cord.tip.y);
    }

    ctx.strokeStyle = cordGrad;
    ctx.lineWidth = 2.8;
    ctx.stroke();

    // Dibujar nudos posicionales
    cord.knots.forEach((knot) => {
      ctx.save();
      ctx.translate(knot.x, knot.y);
      ctx.rotate(Math.PI / 4);

      // Halo del nudo
      ctx.fillStyle =
        knot.tier === 'hundreds' ? '#eeb765' : knot.tier === 'tens' ? '#f3efe6' : '#2e9e74';
      ctx.shadowColor = '#d99a3d';
      ctx.shadowBlur = isDim ? 0 : 8;
      ctx.fillRect(-knot.size / 2, -knot.size / 2, knot.size, knot.size);

      // Brillo interior del nudo
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.fillRect(-knot.size / 2, -knot.size / 2, knot.size, knot.size * 0.35);

      ctx.restore();
    });
  });

  ctx.globalAlpha = 1.0;

  // 4. Dibujar partículas de transmisión de datos
  particles.forEach((part) => {
    const cord = rigData.cords[part.cordIndex];
    if (!cord) return;

    const startY = p.y;
    const endY = cord.tip.y;
    const currentY = startY + (endY - startY) * part.progress;
    const currentX = cord.tip.x;

    ctx.beginPath();
    ctx.arc(currentX, currentY, part.size, 0, Math.PI * 2);
    ctx.fillStyle = part.color;
    ctx.shadowColor = part.color;
    ctx.shadowBlur = 12;
    ctx.fill();
  });

  ctx.restore();
}
