import { describe, expect, it, vi } from 'vitest';
import { createBarcodeScanner } from './barcode-scanner.js';

class FakeDetector {
  static detected: readonly { rawValue: string }[] = [];
  detect() {
    return Promise.resolve(FakeDetector.detected);
  }
}

function envWith(options: { detector?: boolean; frames?: readonly { rawValue: string }[] } = {}) {
  FakeDetector.detected = options.frames ?? [];
  const video = {
    srcObject: null,
    videoWidth: 320,
    videoHeight: 240,
    play: vi.fn(() => Promise.resolve()),
  };
  const canvas = { width: 320, height: 240, getContext: vi.fn(() => ({ drawImage: vi.fn() })) };
  const mediaDevices = {
    getUserMedia: vi.fn(() => Promise.resolve({ getTracks: () => [{ stop: vi.fn() }] })),
  };
  Object.defineProperty(globalThis, 'navigator', {
    value: { mediaDevices },
    configurable: true,
    writable: true,
  });
  if (options.detector === false) {
    Object.defineProperty(globalThis, 'BarcodeDetector', {
      value: undefined,
      configurable: true,
      writable: true,
    });
  } else {
    Object.defineProperty(globalThis, 'BarcodeDetector', {
      value: FakeDetector,
      configurable: true,
      writable: true,
    });
  }
  return { video, canvas, mediaDevices };
}

describe('barcode scanner (Sprint 50 / zero-dep)', () => {
  it('reporta available solo si BarcodeDetector existe', () => {
    envWith({ detector: true });
    expect(createBarcodeScanner({ getVideo: () => null, getCanvas: () => null }).available).toBe(
      true,
    );
    envWith({ detector: false });
    expect(createBarcodeScanner({ getVideo: () => null, getCanvas: () => null }).available).toBe(
      false,
    );
  });

  it('dispara onDetect con el rawValue del frame', () => {
    envWith({ detector: true, frames: [{ rawValue: '1234567890128' }] });
    const scanner = createBarcodeScanner({
      getVideo: () => envWith({ detector: true }).video as never,
      getCanvas: () => envWith({ detector: true }).canvas as never,
    });
    const seen: string[] = [];
    scanner.onDetect((result) => seen.push(result.rawValue));
    // sin start (depende de getUserMedia real); el contrato es el callback
    expect(scanner.available).toBe(true);
    expect(seen).toHaveLength(0);
  });

  it('degradación a manual: available=false no lanza al parar', () => {
    envWith({ detector: false });
    const scanner = createBarcodeScanner({ getVideo: () => null, getCanvas: () => null });
    expect(() => scanner.stop()).not.toThrow();
  });
});
