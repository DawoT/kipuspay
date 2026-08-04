/** Sanitiza texto de impresora térmica (ASCII printable + espacios). */
export function sanitizePrinterText(value: string): string {
  return value.replace(/[^\x20-\x7EáéíóúÁÉÍÓÚñÑüÜ]/g, '?').trim();
}
