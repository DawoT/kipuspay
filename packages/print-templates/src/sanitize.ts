/** Sanitiza texto de impresora térmica (ASCII printable de 7 bits sin mojibake). */
export function sanitizePrinterText(value: string): string {
  const norm = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ñ/g, 'n')
    .replace(/Ñ/g, 'N');
  return norm.replace(/[^\x20-\x7E]/g, '?').trim();
}
