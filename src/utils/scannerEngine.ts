import {
  prepareZXingModule,
  readBarcodes,
  type ReadInputBarcodeFormat,
} from 'zxing-wasm/reader';
import zxingReaderWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import type { WorkerDetection, WorkerPoint, WorkerResponse } from '../workers/barcodeWorker';

export interface ScanDetection {
  rawValue: string;
  format?: string;
  engine: 'native' | 'zxing-wasm';
  cornerPoints?: WorkerPoint[];
}

interface NativeDetectorInstance {
  detect: (
    source: ImageBitmapSource,
  ) => Promise<Array<{ rawValue: string; format?: string; cornerPoints?: WorkerPoint[] }>>;
}

const NATIVE_FORMATS = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'code_93',
  'itf',
  'qr_code',
  'data_matrix',
] as const;

const ZXING_FALLBACK_FORMATS: ReadInputBarcodeFormat[] = [
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

let workerInstance: Worker | null = null;
let workerFailed = false;
let workerWarmed = false;
let reqSeq = 1;
const pending = new Map<
  number,
  {
    resolve: (res: WorkerResponse) => void;
    reject: (err: Error) => void;
  }
>();

let nativeDetectorCache: NativeDetectorInstance | null | undefined;
let inlineWasmPrepared = false;

function resolveLocalWasmUrl(): string {
  try {
    if (typeof window !== 'undefined') {
      return new URL(zxingReaderWasmUrl, window.location.origin).href;
    }
  } catch {
    // ignore
  }
  return zxingReaderWasmUrl;
}

async function ensureInlineZxingReady(): Promise<void> {
  if (inlineWasmPrepared) return;
  const resolved = resolveLocalWasmUrl();
  await prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? resolved : prefix + path),
    },
    fireImmediately: true,
  });
  inlineWasmPrepared = true;
}

export function getNativeBarcodeDetector(): NativeDetectorInstance | null {
  if (nativeDetectorCache !== undefined) return nativeDetectorCache;
  if (typeof window === 'undefined') {
    nativeDetectorCache = null;
    return null;
  }
  const Ctor = (
    window as unknown as {
      BarcodeDetector?: new (opts?: { formats?: readonly string[] }) => NativeDetectorInstance;
    }
  ).BarcodeDetector;
  if (!Ctor) {
    nativeDetectorCache = null;
    return null;
  }
  try {
    nativeDetectorCache = new Ctor({ formats: NATIVE_FORMATS });
  } catch {
    try {
      nativeDetectorCache = new Ctor();
    } catch {
      nativeDetectorCache = null;
    }
  }
  return nativeDetectorCache;
}

function getWorker(): Worker | null {
  if (workerFailed || typeof Worker === 'undefined') return null;
  if (workerInstance) return workerInstance;
  try {
    const w = new Worker(new URL('../workers/barcodeWorker.ts', import.meta.url), {
      type: 'module',
    });
    w.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      const entry = pending.get(msg.id);
      if (entry) {
        pending.delete(msg.id);
        entry.resolve(msg);
      }
    };
    w.onerror = () => {
      workerFailed = true;
      for (const [, entry] of pending) {
        entry.reject(new Error('Barcode worker failed'));
      }
      pending.clear();
      try {
        w.terminate();
      } catch {
        // ignore
      }
      workerInstance = null;
    };
    workerInstance = w;
    return w;
  } catch {
    workerFailed = true;
    return null;
  }
}

function postToWorker(
  payload: Record<string, unknown>,
  transfer: Transferable[] = [],
  timeoutMs = 6000,
): Promise<WorkerResponse> {
  const w = getWorker();
  if (!w) return Promise.reject(new Error('Worker unavailable'));
  const id = reqSeq++;
  return new Promise<WorkerResponse>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Barcode worker timeout'));
    }, timeoutMs);

    pending.set(id, {
      resolve: (res) => {
        clearTimeout(timer);
        resolve(res);
      },
      reject: (err) => {
        clearTimeout(timer);
        reject(err);
      },
    });

    try {
      w.postMessage({ ...payload, id }, transfer);
    } catch (err) {
      clearTimeout(timer);
      pending.delete(id);
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

export async function warmUpScannerEngine(): Promise<{
  nativeAvailable: boolean;
  wasmReady: boolean;
}> {
  const nativeAvailable = !!getNativeBarcodeDetector();
  if (workerWarmed) {
    return { nativeAvailable, wasmReady: true };
  }
  try {
    const resp = await postToWorker({ type: 'warmup' }, [], 8000);
    if (resp.type === 'ready' && resp.ok) {
      workerWarmed = true;
      return { nativeAvailable, wasmReady: true };
    }
  } catch {
    // Fallback to preparing inline WASM on main thread
  }
  try {
    await ensureInlineZxingReady();
    return { nativeAvailable, wasmReady: true };
  } catch {
    return { nativeAvailable, wasmReady: false };
  }
}

export async function detectWithNative(source: ImageBitmapSource): Promise<ScanDetection[]> {
  const native = getNativeBarcodeDetector();
  if (!native) return [];
  try {
    const hits = await native.detect(source);
    return hits
      .filter((h) => !!h.rawValue)
      .map((h) => ({
        rawValue: h.rawValue,
        format: h.format,
        engine: 'native' as const,
        cornerPoints: h.cornerPoints,
      }));
  } catch {
    return [];
  }
}

export async function detectImageDataWithWasm(
  imageData: ImageData,
  mode: 'fast-1d' | 'fast' | 'deep' = 'fast',
): Promise<ScanDetection[]> {
  // Clone/transfer cleanly so caller buffer isn't detached unexpectedly if reused
  const copy = new Uint8ClampedArray(imageData.data);
  const buffer = copy.buffer;

  try {
    const resp = await postToWorker(
      {
        type: 'scan-frame',
        buffer,
        width: imageData.width,
        height: imageData.height,
        mode,
      },
      [buffer],
      3500,
    );
    if (resp.type === 'result' && resp.detections.length > 0) {
      return resp.detections.map((d: WorkerDetection) => ({
        rawValue: d.rawValue,
        format: d.format,
        engine: 'zxing-wasm' as const,
        cornerPoints: d.cornerPoints,
      }));
    }
    return [];
  } catch {
    // Inline fallback if worker failed
    try {
      await ensureInlineZxingReady();
      const is1d = mode === 'fast-1d';
      const results = await readBarcodes(imageData, {
        formats: is1d ? ['EAN13', 'EAN8', 'UPCA', 'UPCE', 'Code128'] : ZXING_FALLBACK_FORMATS,
        tryHarder: !is1d,
        tryRotate: !is1d,
        tryInvert: !is1d,
        tryDownscale: mode === 'deep',
        tryDenoise: mode === 'deep',
        binarizer: mode === 'deep' ? 'GlobalHistogram' : 'LocalAverage',
        maxNumberOfSymbols: is1d ? 1 : 3,
        textMode: 'Plain',
      });
      return results
        .filter((r) => r.isValid && r.text)
        .map((r) => ({
          rawValue: r.text,
          format: r.format,
          engine: 'zxing-wasm' as const,
          cornerPoints: r.position
            ? [
                r.position.topLeft,
                r.position.topRight,
                r.position.bottomRight,
                r.position.bottomLeft,
              ]
            : undefined,
        }));
    } catch {
      return [];
    }
  }
}

export async function decodePhotoFile(file: File): Promise<ScanDetection[]> {
  // 1. Try ZXing-C++ WASM first inside Web Worker on full raw image bytes (handles 90° rotation, inverted codes, glare, GS1)
  try {
    const buf = await file.arrayBuffer();
    const resp = await postToWorker(
      {
        type: 'scan-image',
        buffer: buf,
        mimeType: file.type || 'image/png',
      },
      [buf],
      8000,
    );
    if (resp.type === 'result' && resp.detections.length > 0) {
      return resp.detections.map((d: WorkerDetection) => ({
        rawValue: d.rawValue,
        format: d.format,
        engine: 'zxing-wasm' as const,
        cornerPoints: d.cornerPoints,
      }));
    }
  } catch {
    // Fallback to inline WASM below
  }

  // 2. Try native BarcodeDetector via createImageBitmap if available
  const native = getNativeBarcodeDetector();
  if (native && typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file);
      try {
        const hits = await native.detect(bmp);
        if (hits.length > 0) {
          return hits
            .filter((h) => !!h.rawValue)
            .map((h) => ({
              rawValue: h.rawValue,
              format: h.format,
              engine: 'native' as const,
              cornerPoints: h.cornerPoints,
            }));
        }
      } finally {
        bmp.close();
      }
    } catch {
      // ignore
    }
  }

  // 3. Inline ZXing-C++ WASM fallback (e.g., if Worker was blocked in strict WebView)
  try {
    await ensureInlineZxingReady();
    let results = await readBarcodes(file, {
      formats: ZXING_FALLBACK_FORMATS,
      tryHarder: true,
      tryRotate: true,
      tryInvert: true,
      tryDownscale: true,
      tryDenoise: true,
      binarizer: 'LocalAverage',
      maxNumberOfSymbols: 4,
      textMode: 'Plain',
    });
    if (results.length === 0) {
      results = await readBarcodes(file, {
        formats: ZXING_FALLBACK_FORMATS,
        tryHarder: true,
        tryRotate: true,
        tryInvert: true,
        tryDownscale: true,
        tryDenoise: true,
        binarizer: 'GlobalHistogram',
        maxNumberOfSymbols: 4,
        textMode: 'Plain',
      });
    }
    if (results.length === 0 && typeof document !== 'undefined' && typeof createImageBitmap === 'function') {
      const bmp = await createImageBitmap(file);
      try {
        const maxDim = 1600;
        const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height, 1));
        const w = Math.max(1, Math.round(bmp.width * scale));
        const h = Math.max(1, Math.round(bmp.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(bmp, 0, 0, w, h);
          const imgData = ctx.getImageData(0, 0, w, h);
          const d = imgData.data;
          for (let i = 0; i < d.length; i += 4) {
            d[i] = 255 - d[i];
            d[i + 1] = 255 - d[i + 1];
            d[i + 2] = 255 - d[i + 2];
          }
          results = await readBarcodes(imgData, {
            formats: ZXING_FALLBACK_FORMATS,
            tryHarder: true,
            tryRotate: true,
            tryInvert: true,
            tryDownscale: true,
            tryDenoise: true,
            binarizer: 'LocalAverage',
            maxNumberOfSymbols: 4,
            textMode: 'Plain',
          });
        }
      } finally {
        bmp.close();
      }
    }
    return results
      .filter((r) => r.isValid && r.text)
      .map((r) => ({
        rawValue: r.text,
        format: r.format,
        engine: 'zxing-wasm' as const,
      }));
  } catch {
    return [];
  }
}
