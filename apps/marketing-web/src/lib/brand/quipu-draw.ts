/**
 * Dibujo del quipu simulado en Canvas 2D.
 * Separado de la fisica para que el renderer no toque el estado.
 */

import type { QuipuRig } from './quipu.js';
import type { SimCord, SimNode, SimState } from './quipu-sim.js';
import { AMBER_GLOW, CORD_COLORS, CORD_DEFAULT, INK, PRIMARY_CORD } from './quipu-colors.js';

export interface DrawOptions {
  readonly width: number;
  readonly height: number;
  readonly viewW: number;
  readonly viewH: number;
  /** Cordel activo: el resto se dibuja en penumbra. */
  readonly activeCord?: string | null;
  readonly strokeWidth?: number;
  /** Desplazamiento del glow (escritorio derecha / movil centro). */
  readonly glowX?: number;
  readonly glowY?: number;
  readonly glowR?: number;
  /** Lineas de ledger de fondo. */
  readonly rulesFromX?: number;
  /** Si hay video debajo, no se pinta la tinta opaca. */
  readonly transparent?: boolean;
}

function cordColor(slug: string): string {
  return CORD_COLORS[slug] ?? CORD_DEFAULT;
}

function isDimmed(activeCord: string | null | undefined, slug: string): boolean {
  return activeCord !== null && activeCord !== undefined && activeCord !== slug;
}

/** Pinta el fondo (tinta + glow + reglas). No-op si transparent. */
export function drawBackdrop(ctx: CanvasRenderingContext2D, opts: DrawOptions): void {
  const { width, height } = opts;
  ctx.clearRect(0, 0, width, height);
  if (opts.transparent) return;

  const glowX = opts.glowX ?? width * 0.82;
  const glowY = opts.glowY ?? height * 0.44;
  const glowR = opts.glowR ?? height * 0.55;

  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, width, height);

  const g = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, glowR);
  g.addColorStop(0, AMBER_GLOW);
  g.addColorStop(1, 'rgba(217, 154, 61, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);

  const fromX = opts.rulesFromX ?? width * 0.48;
  ctx.strokeStyle = 'rgba(243, 239, 230, 0.045)';
  ctx.lineWidth = 1;
  for (let y = height * 0.16; y < height; y += height * 0.11) {
    ctx.beginPath();
    ctx.moveTo(fromX, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function drawKnot(ctx: CanvasRenderingContext2D, n: SimNode, color: string, dim: boolean): void {
  const size = (n.mass - 1) * 8;
  const s = Math.max(8, size);
  ctx.save();
  ctx.translate(n.x, n.y);
  ctx.rotate(Math.PI / 4);

  ctx.fillStyle = color;
  ctx.globalAlpha = dim ? 0.08 : 0.15;
  ctx.fillRect(-s / 2 - 2.5, -s / 2 - 2.5, s + 5, s + 5);

  ctx.globalAlpha = dim ? 0.26 : 1;
  ctx.fillRect(-s / 2, -s / 2, s, s);

  ctx.fillStyle = '#fff';
  ctx.globalAlpha = dim ? 0.05 : 0.2;
  ctx.fillRect(-s / 2, -s / 2, s, s * 0.36);
  ctx.restore();
}

function drawCord(
  ctx: CanvasRenderingContext2D,
  cord: SimCord,
  color: string,
  sw: number,
  dim: boolean,
): void {
  ctx.globalAlpha = dim ? 0.26 : 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = sw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i < cord.nodes.length; i++) {
    const n = cord.nodes[i];
    if (!n) continue;
    if (i === 0) ctx.moveTo(n.x, n.y);
    else ctx.lineTo(n.x, n.y);
  }
  ctx.stroke();

  const tip = cord.nodes[cord.nodes.length - 1];
  if (tip) {
    ctx.globalAlpha = dim ? 0.12 : 0.45;
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(tip.x, tip.y + sw * 7);
    ctx.stroke();
  }

  ctx.globalAlpha = dim ? 0.26 : 1;
  for (const n of cord.nodes) {
    if (n.mass <= 1) continue;
    drawKnot(ctx, n, color, dim);
    ctx.globalAlpha = dim ? 0.26 : 1;
  }
}

/** Pinta el aparejo vivo a partir del estado de simulacion. */
export function drawSim(
  ctx: CanvasRenderingContext2D,
  sim: SimState,
  rig: QuipuRig,
  opts: DrawOptions,
): void {
  const sw = opts.strokeWidth ?? 3.2;
  const sx = opts.width / opts.viewW;
  const sy = opts.height / opts.viewH;

  ctx.save();
  ctx.scale(sx, sy);

  ctx.strokeStyle = PRIMARY_CORD;
  ctx.lineWidth = sw * 2.1;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(rig.primary.x1, rig.primary.y);
  ctx.lineTo(rig.primary.x2, rig.primary.y);
  ctx.stroke();

  for (const cord of sim.cords) {
    drawCord(ctx, cord, cordColor(cord.slug), sw, isDimmed(opts.activeCord, cord.slug));
  }

  ctx.restore();
}
