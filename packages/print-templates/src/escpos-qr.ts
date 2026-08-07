/**
 * ESC/POS QR nativo GS ( k ) — zero-dep (§7.5).
 * Modelo 2, size 4, ECC M; la impresora dibuja el QR.
 */

/** Bytes de comando GS ( k para almacenar + imprimir QR. */
export function buildGsKQrCommands(payload: string): number[] {
  const data = new TextEncoder().encode(payload);
  if (data.length === 0) return [];
  if (data.length > 7089) {
    throw new Error('QR_PAYLOAD_TOO_LONG');
  }

  const cmd: number[] = [];
  // Function 165: model 2
  cmd.push(0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
  // Function 167: module size 4
  cmd.push(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x04);
  // Function 169: error correction M (49)
  cmd.push(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31);
  // Function 180: store data (pL pH = len+3)
  const storeLen = data.length + 3;
  const pL = storeLen & 0xff;
  const pH = (storeLen >> 8) & 0xff;
  cmd.push(0x1d, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30, ...data);
  // Function 181: print
  cmd.push(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);
  return cmd;
}
