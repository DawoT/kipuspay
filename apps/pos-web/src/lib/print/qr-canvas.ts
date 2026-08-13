import qrcode from '$lib/vendor/qrcode.mjs';

export interface QrMatrix {
  readonly size: number;
  readonly isDark: (row: number, col: number) => boolean;
}

export function qrMatrix(payload: string): QrMatrix {
  const qr = qrcode(0, 'M');
  qr.addData(payload);
  qr.make();
  const size = qr.getModuleCount();
  return { size, isDark: (row, col) => qr.isDark(row, col) === true };
}

export function renderQrToCanvas(
  canvas: HTMLCanvasElement,
  payload: string,
  sizePx = 120,
): void {
  const { size, isDark } = qrMatrix(payload);
  const scale = Math.max(1, Math.floor(sizePx / size));
  canvas.width = size * scale;
  canvas.height = size * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000000';
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (isDark(row, col)) ctx.fillRect(col * scale, row * scale, scale, scale);
    }
  }
}
