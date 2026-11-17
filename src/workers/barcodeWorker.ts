import {
  prepareZXingModule,
  readBarcodes,
  type ReadInputBarcodeFormat,
  type ReaderOptions,
  type ReadResult,
} from 'zxing-wasm/reader';
import zxingReaderWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

const POS_FORMATS: ReadInputBarcodeFormat[] = [
  'EAN13',
  'EAN8',
  'UPCA',
  'UPCE',
  'Code128',
  'Code39',
  'Code93',
  'ITF',
  'DataBar',
  'DataBarExp',
  'QRCode',
  'DataMatrix',
];

function resolveWasmUrl(): string {
  try {
    return new URL(zxingReaderWasmUrl, self.location.origin).href;
  } catch {
    return zxingReaderWasmUrl;
  }
}

let wasmReadyPromise: Promise<void> | null = null;

function ensureWasmReady(): Promise<void> {
  if (!wasmReadyPromise) {
    const resolved = resolveWasmUrl();
    wasmReadyPromise = prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? resolved : prefix + path),
      },
      fireImmediately: true,
    })
      .then(() => undefined)
      .catch((err) => {
        wasmReadyPromise = null;
        throw err;
      });
  }
  return wasmReadyPromise;
}

export interface WorkerPoint {
  x: number;
  y: number;
}

export interface WorkerDetection {
  rawValue: string;
  format: string;
  cornerPoints?: WorkerPoint[];
}

export type WorkerRequest =
  | { type: 'warmup'; id: number }
  | {
      type: 'scan-frame';
      id: number;
      buffer: ArrayBuffer;
      width: number;
      height: number;
      mode: 'fast' | 'deep';
    }
  | {
      type: 'scan-image';
      id: number;
      buffer: ArrayBuffer;
      mimeType: string;
    };

export type WorkerResponse =
  | { type: 'ready'; id: number; ok: boolean; error?: string }
  | {
      type: 'result';
      id: number;
      detections: WorkerDetection[];
      elapsedMs: number;
      error?: string;
    };

function mapReadResults(results: ReadResult[]): WorkerDetection[] {
  const out: WorkerDetection[] = [];
  for (const r of results) {
    if (!r.isValid || !r.text) continue;
    const pos = r.position;
    const cornerPoints = pos
      ? [pos.topLeft, pos.topRight, pos.bottomRight, pos.bottomLeft]
      : undefined;
    out.push({
      rawValue: r.text,
      format: r.format,
      cornerPoints,
    });
  }
  return out;
}

const FAST_OPTIONS: ReaderOptions = {
  formats: POS_FORMATS,
  tryHarder: true,
  tryRotate: true,
  tryInvert: true,
  tryDownscale: false,
  tryDenoise: false,
  binarizer: 'LocalAverage',
  maxNumberOfSymbols: 3,
  textMode: 'Plain',
};

const DEEP_OPTIONS: ReaderOptions = {
  formats: POS_FORMATS,
  tryHarder: true,
  tryRotate: true,
  tryInvert: true,
  tryDownscale: true,
  tryDenoise: true,
  binarizer: 'GlobalHistogram',
  maxNumberOfSymbols: 4,
  textMode: 'Plain',
};

function invertRgbaInPlace(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255 - data[i];
    data[i + 1] = 255 - data[i + 1];
    data[i + 2] = 255 - data[i + 2];
  }
}

async function decodeInvertedBlobInWorker(blob: Blob): Promise<ReadResult[]> {
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') {
    return [];
  }
  const bmp = await createImageBitmap(blob);
  try {
    const maxDim = 1600;
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height, 1));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return [];
    ctx.drawImage(bmp, 0, 0, w, h);
    const imgData = ctx.getImageData(0, 0, w, h);
    invertRgbaInPlace(imgData.data);
    let results = await readBarcodes(imgData, { ...DEEP_OPTIONS, binarizer: 'LocalAverage' });
    if (results.length === 0) {
      results = await readBarcodes(imgData, DEEP_OPTIONS);
    }
    return results;
  } finally {
    bmp.close();
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (msg.type === 'warmup') {
    try {
      await ensureWasmReady();
      const resp: WorkerResponse = { type: 'ready', id: msg.id, ok: true };
      self.postMessage(resp);
    } catch (err) {
      const resp: WorkerResponse = {
        type: 'ready',
        id: msg.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
      self.postMessage(resp);
    }
    return;
  }

  const started = performance.now();
  try {
    await ensureWasmReady();

    if (msg.type === 'scan-frame') {
      const rgba = new Uint8ClampedArray(msg.buffer);
      const imgData = new ImageData(rgba, msg.width, msg.height);
      const opts = msg.mode === 'deep' ? DEEP_OPTIONS : FAST_OPTIONS;
      let results = await readBarcodes(imgData, opts);
      if (results.length === 0 && msg.mode === 'deep') {
        results = await readBarcodes(imgData, { ...DEEP_OPTIONS, binarizer: 'LocalAverage' });
      }
      if (results.length === 0 && msg.mode === 'deep') {
        invertRgbaInPlace(rgba);
        results = await readBarcodes(imgData, { ...DEEP_OPTIONS, binarizer: 'LocalAverage' });
      }
      const resp: WorkerResponse = {
        type: 'result',
        id: msg.id,
        detections: mapReadResults(results),
        elapsedMs: Math.round(performance.now() - started),
      };
      self.postMessage(resp);
      return;
    }

    if (msg.type === 'scan-image') {
      const blob = new Blob([msg.buffer], { type: msg.mimeType || 'image/png' });
      let results = await readBarcodes(blob, {
        ...DEEP_OPTIONS,
        binarizer: 'LocalAverage',
      });
      if (results.length === 0) {
        results = await readBarcodes(blob, DEEP_OPTIONS);
      }
      if (results.length === 0) {
        results = await decodeInvertedBlobInWorker(blob);
      }
      const resp: WorkerResponse = {
        type: 'result',
        id: msg.id,
        detections: mapReadResults(results),
        elapsedMs: Math.round(performance.now() - started),
      };
      self.postMessage(resp);
    }
  } catch (err) {
    const resp: WorkerResponse = {
      type: 'result',
      id: msg.id,
      detections: [],
      elapsedMs: Math.round(performance.now() - started),
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(resp);
  }
};
