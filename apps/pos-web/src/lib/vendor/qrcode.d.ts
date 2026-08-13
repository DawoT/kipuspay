interface QrGenerator {
  (typeNumber: number, errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H'): QrCode;
  stringToBytes(s: string): number[];
}

interface QrCode {
  addData(data: string): void;
  make(): void;
  getModuleCount(): number;
  isDark(row: number, col: number): boolean;
}

declare const qrcode: QrGenerator;
export default qrcode;
export const stringToBytes: (s: string) => number[];
