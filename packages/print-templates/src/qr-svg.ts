/**
 * Matriz QR → SVG inline — zero-dep (invariante 10 / V-24).
 * La matriz la produce el código vendorizado MIT (apps/pos-web
 * src/lib/vendor/qrcode.mjs) o cualquier implementación ISO 18004; aquí solo
 * se convierte a geometría SVG con Web Platform APIs puro (string building).
 * Salida determinista row-major, XML-safe por construcción (sin datos).
 */
export interface QrMatrixLike {
  readonly size: number;
  readonly isDark: (row: number, col: number) => boolean;
}

export interface QrSvgOptions {
  /** Módulos de margen silencioso por lado (default 2, recomendación ISO). */
  readonly quietModules?: number;
}

/** Convierte una matriz de bits QR en un <svg> inline compacto. */
export function qrMatrixToSvg(matrix: QrMatrixLike, options?: QrSvgOptions): string {
  const quiet = Math.max(0, Math.floor(options?.quietModules ?? 2));
  const dim = matrix.size + quiet * 2;
  const parts: string[] = [];
  for (let row = 0; row < matrix.size; row++) {
    for (let col = 0; col < matrix.size; col++) {
      if (matrix.isDark(row, col) === true) {
        parts.push(`M${col + quiet} ${row + quiet}h1v1h-1z`);
      }
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" ` +
    'shape-rendering="crispEdges">' +
    `<rect width="${dim}" height="${dim}" fill="#ffffff"/>` +
    `<path fill="#000000" d="${parts.join('')}"/>` +
    '</svg>'
  );
}
