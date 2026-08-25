import { describe, expect, it } from 'vitest';
// Invariante 10 (AGENTS.md): el Edge NO renderiza QR con librerías npm.
// La matriz la produce el código vendorizado MIT (pos-web); este módulo solo
// convierte matriz→SVG con Web Platform APIs puro (zero-dep, V-24/CAL-06).
import { qrMatrixToSvg } from './qr-svg.js';

function stubMatrix(rows: readonly string[]): {
  size: number;
  isDark: (row: number, col: number) => boolean;
} {
  return {
    size: rows.length,
    isDark: (row, col) => rows[row]?.[col] === '#',
  };
}

describe('qrMatrixToSvg (zero-dep, matriz→SVG)', () => {
  it('emite un <path> por módulos oscuros en orden row-major determinista', () => {
    const svg = qrMatrixToSvg(stubMatrix(['#.', '.#']));
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="0 0 6 6"'); // 2 módulos + quiet zone 2 por lado
    // Oscuros en (0,0) y (1,1): coordenadas desplazadas por quiet zone.
    expect(svg).toContain('d="M2 2h1v1h-1zM3 3h1v1h-1z"');
  });

  it('matriz toda clara produce path vacío y fondo blanco', () => {
    const svg = qrMatrixToSvg(stubMatrix(['..', '..']));
    expect(svg).toContain('<rect');
    expect(svg).toContain('d=""');
  });

  it('finder pattern 7×7 conocido produce los módulos esperados', () => {
    const finder = ['#######', '#.....#', '#.###.#', '#.###.#', '#.###.#', '#.....#', '#######'];
    const svg = qrMatrixToSvg(stubMatrix(finder));
    const darkCount = finder.join('').split('#').length - 1;
    const pathModules = (svg.match(/h1v1h-1z/g) ?? []).length;
    expect(pathModules).toBe(darkCount);
  });

  it('quiet zone configurable (impresoras térmicas con margen propio)', () => {
    const svg = qrMatrixToSvg(stubMatrix(['#']), { quietModules: 0 });
    expect(svg).toContain('viewBox="0 0 1 1"');
    expect(svg).toContain('M0 0h1v1h-1z');
  });

  it('salida es XML-safe por construcción (solo geometría, sin datos del payload)', () => {
    const svg = qrMatrixToSvg(stubMatrix(['#.']));
    expect(svg).not.toContain('&');
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
  });
});
