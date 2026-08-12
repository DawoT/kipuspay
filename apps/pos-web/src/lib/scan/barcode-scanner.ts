/**
 * Sprint 50 — lector de barcode compartido (regla 34/36), zero-dependency.
 * Usa BarcodeDetector de la Web Platform cuando existe y degrada a captura
 * manual por teclado/input (gama baja). El clasificador de namespace vive en
 * @kipuspay/domain-catalog (edge 1A); este módulo solo captura frames.
 */

export interface BarcodeScanResult {
  readonly rawValue: string;
}

export interface BarcodeScannerPort {
  readonly available: boolean;
  readonly start: () => Promise<void>;
  readonly stop: () => void;
  readonly onDetect: (callback: (result: BarcodeScanResult) => void) => void;
}

type BarcodeDetectorLike = new (options?: { readonly formats?: string[] }) => {
  detect(source: ImageBitmapSource): Promise<readonly { rawValue: string }[]>;
};

const barcodeDetectorCtor = (): BarcodeDetectorLike | null => {
  const ctor = (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector;
  return typeof ctor === 'function' ? (ctor as BarcodeDetectorLike) : null;
};

export interface ScannerDependencies {
  readonly getVideo: () => HTMLVideoElement | null;
  readonly getCanvas: () => HTMLCanvasElement | null;
  readonly detector?: BarcodeDetectorLike | null;
}

/** Scanner por frames de cámara (BarcodeDetector) con fallback a entrada manual. */
export function createBarcodeScanner(dependencies: ScannerDependencies): BarcodeScannerPort {
  const Detector = dependencies.detector ?? barcodeDetectorCtor();
  const available = Detector !== null;
  let stream: MediaStream | null = null;
  const raf = 0;
  let frameTimer = 0;
  let listener: ((result: BarcodeScanResult) => void) | null = null;
  const video = dependencies.getVideo();
  const canvas = dependencies.getCanvas();

  return {
    available,
    async start() {
      if (!available || !video || !canvas) return;
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const detect = async () => {
        if (!listener || !video || !canvas || !ctx || video.videoWidth === 0) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const detector = new Detector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'],
        });
        const codes = await detector.detect(canvas);
        for (const code of codes) {
          if (code.rawValue) {
            listener({ rawValue: code.rawValue });
            this.stop();
            return;
          }
        }
        frameTimer = window.setTimeout(() => void detect(), 120);
      };
      cancelAnimationFrame(raf);
      frameTimer = window.setTimeout(() => void detect(), 120);
    },
    stop() {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
      if (frameTimer && typeof window !== 'undefined') window.clearTimeout(frameTimer);
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
    },
    onDetect(callback) {
      listener = callback;
    },
  };
}
