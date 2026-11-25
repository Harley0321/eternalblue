import React, { useCallback, useEffect, useRef, useState } from 'react';
import { HTMLCanvasElementLuminanceSource } from '@zxing/browser';
import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
} from '@zxing/library';
import { Camera, Flashlight, ImagePlus, RefreshCw, ScanLine, SwitchCamera } from 'lucide-react';
import { DeviceBridge } from '../hardware/deviceBridge';
import { usePos } from '../state/PosContext';

interface NativeBarcodeDetectorResult {
  rawValue?: string;
}

interface NativeBarcodeDetector {
  detect: (source: ImageBitmapSource) => Promise<NativeBarcodeDetectorResult[]>;
}

interface NativeBarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): NativeBarcodeDetector;
  getSupportedFormats?: () => Promise<string[]>;
}

const DESIRED_NATIVE_FORMATS = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'itf',
  'codabar',
  'qr_code',
  'data_matrix',
];

function createZxingReader(): MultiFormatReader {
  const reader = new MultiFormatReader();
  const hints = new Map<DecodeHintType, unknown>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.ITF,
    BarcodeFormat.CODABAR,
    BarcodeFormat.QR_CODE,
    BarcodeFormat.DATA_MATRIX,
  ]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  reader.setHints(hints);
  return reader;
}

async function createNativeDetector(): Promise<NativeBarcodeDetector | null> {
  const Ctor = (window as unknown as { BarcodeDetector?: NativeBarcodeDetectorConstructor })
    .BarcodeDetector;
  if (!Ctor) return null;
  try {
    if (typeof Ctor.getSupportedFormats === 'function') {
      const supported = await Ctor.getSupportedFormats();
      const formats = DESIRED_NATIVE_FORMATS.filter((f) => supported.includes(f));
      if (formats.length === 0) return null;
      return new Ctor({ formats });
    }
    return new Ctor({ formats: DESIRED_NATIVE_FORMATS });
  } catch {
    try {
      return new Ctor();
    } catch {
      return null;
    }
  }
}

async function acquireCameraStream(
  facingMode: 'environment' | 'user',
  isMobileDevice: boolean
): Promise<MediaStream> {
  const attempts: MediaStreamConstraints[] = isMobileDevice
    ? [
        {
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 640, max: 1280 },
            height: { ideal: 480, max: 720 },
            frameRate: { ideal: 15, max: 24 },
          },
          audio: false,
        },
        {
          video: {
            facingMode,
            width: { max: 1280 },
            height: { max: 720 },
            frameRate: { max: 24 },
          },
          audio: false,
        },
        {
          video: {
            width: { max: 1280 },
            height: { max: 720 },
            frameRate: { max: 24 },
          },
          audio: false,
        },
      ]
    : [
        {
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        },
        {
          video: { facingMode },
          audio: false,
        },
        {
          video: true,
          audio: false,
        },
      ];

  let lastErr: unknown = null;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

function formatCameraError(err: unknown): string {
  const name =
    err && typeof err === 'object' && 'name' in err ? String((err as { name: unknown }).name) : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Camera permission denied. Allow Camera in device/browser settings, or scan a photo / enter manually below.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No camera detected on this device. Use Scan Photo or manual barcode entry below.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Camera is busy in another app. Close other camera apps and tap Retry.';
  }
  return 'Could not start live camera. Tap Retry, use Scan Photo, or enter the barcode below.';
}

export const BarcodeScannerModal: React.FC = () => {
  const { state, handleBarcodeDetected, closeScanner } = usePos();
  const [manualCode, setManualCode] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStatus, setCameraStatus] = useState('Starting camera…');
  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [canSwitchCamera, setCanSwitchCamera] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [continuousScan, setContinuousScan] = useState(false);
  const [batchScanCount, setBatchScanCount] = useState(0);
  const [retrySeq, setRetrySeq] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const zxingReaderRef = useRef<MultiFormatReader | null>(null);
  const lastScanRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });
  const lastContinuousScanRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });
  const continuousScanRef = useRef(continuousScan);
  continuousScanRef.current = continuousScan;
  const scannerTargetRef = useRef(state.scannerTarget);
  scannerTargetRef.current = state.scannerTarget;
  const onDetectedRef = useRef(handleBarcodeDetected);
  onDetectedRef.current = handleBarcodeDetected;
  const isMobileDevice =
    DeviceBridge.isAndroidHost() ||
    DeviceBridge.isAndroidBrowser() ||
    DeviceBridge.isAppleMobileBrowser();

  const stopStream = useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) {
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore
        }
      }
    }
    const video = videoRef.current;
    if (video) {
      try {
        video.pause();
        video.srcObject = null;
      } catch {
        // ignore
      }
    }
    setTorchOn(false);
    setTorchSupported(false);
    setCameraActive(false);
  }, []);

  const emitCode = useCallback((rawText: string, allowContinuous = true) => {
    const raw = rawText.trim();
    if (!raw) return false;
    const now = Date.now();
    const keepOpen =
      allowContinuous && continuousScanRef.current && scannerTargetRef.current === 'pos';
    if (keepOpen) {
      const previous = lastContinuousScanRef.current;
      if (raw === previous.code && now - previous.time < 1200) {
        previous.time = now;
        return false;
      }
      lastContinuousScanRef.current = { code: raw, time: now };
      setBatchScanCount((count) => count + 1);
    } else if (raw === lastScanRef.current.code && now - lastScanRef.current.time <= 1400) {
      return false;
    }
    lastScanRef.current = { code: raw, time: now };
    onDetectedRef.current(raw, keepOpen);
    return true;
  }, []);

  const toggleContinuousScan = () => {
    const next = !continuousScanRef.current;
    continuousScanRef.current = next;
    lastContinuousScanRef.current = { code: '', time: 0 };
    setBatchScanCount(0);
    setContinuousScan(next);
  };

  useEffect(() => {
    if (!state.scannerOpen) {
      stopStream();
      setManualCode('');
      setCameraError(null);
      setContinuousScan(false);
      setBatchScanCount(0);
      lastScanRef.current = { code: '', time: 0 };
      lastContinuousScanRef.current = { code: '', time: 0 };
      return;
    }

    let cancelled = false;
    let scanTimer: ReturnType<typeof setTimeout> | null = null;

    const getCanvas = (w: number, h: number): HTMLCanvasElement => {
      if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas');
      }
      const maxDim = isMobileDevice ? 640 : 720;
      const scale = Math.min(1, maxDim / Math.max(w, h, 1));
      canvasRef.current.width = Math.max(1, Math.round(w * scale));
      canvasRef.current.height = Math.max(1, Math.round(h * scale));
      return canvasRef.current;
    };

    const startScanner = async () => {
      stopStream();
      setCameraError(null);
      setCameraStatus('Requesting camera permission…');

      const permitted = await DeviceBridge.ensureAndroidCameraPermission();
      if (cancelled) return;
      if (!permitted) {
        setCameraError(
          'Camera permission denied. Allow Camera in Android App Settings, or use Scan Photo / manual entry below.'
        );
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia || !videoRef.current) {
        setCameraError(
          'Live camera is unavailable in this browser. Use Scan Photo or manual barcode entry below.'
        );
        return;
      }

      try {
        setCameraStatus('Opening camera…');
        const stream = await acquireCameraStream(facingMode, isMobileDevice);
        if (cancelled) {
          stream.getTracks().forEach((t) => {
            try {
              t.stop();
            } catch {
              // ignore
            }
          });
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) {
          stopStream();
          return;
        }

        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        video.muted = true;

        try {
          await video.play();
        } catch {
          // Some WebViews start playback automatically via autoPlay
        }

        const readyStart = Date.now();
        while (!cancelled && (video.videoWidth === 0 || video.videoHeight === 0)) {
          if (Date.now() - readyStart > 4500) break;
          await new Promise((r) => setTimeout(r, 80));
        }

        if (cancelled) {
          stopStream();
          return;
        }

        const track = stream.getVideoTracks()[0];
        if (track && typeof track.getCapabilities === 'function') {
          try {
            const caps = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
            setTorchSupported(Boolean(caps?.torch));
          } catch {
            setTorchSupported(false);
          }
        }

        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoInputs = devices.filter((d) => d.kind === 'videoinput');
          setCanSwitchCamera(videoInputs.length > 1);
        } catch {
          setCanSwitchCamera(false);
        }

        setCameraActive(true);

        const nativeDetector = await createNativeDetector();
        if (!zxingReaderRef.current) {
          zxingReaderRef.current = createZxingReader();
        }
        const zxingReader = zxingReaderRef.current;

        const scanFrame = async () => {
          if (cancelled) return;
          const v = videoRef.current;
          if (v && v.readyState >= 2 && v.videoWidth > 0 && v.videoHeight > 0) {
            try {
              const canvas = getCanvas(v.videoWidth, v.videoHeight);
              const ctx = canvas.getContext('2d', { willReadFrequently: true });
              if (ctx) {
                ctx.drawImage(v, 0, 0, canvas.width, canvas.height);

                let detected = false;
                if (nativeDetector) {
                  try {
                    const results = await nativeDetector.detect(canvas);
                    for (const item of results) {
                      if (item.rawValue && emitCode(item.rawValue)) {
                        detected = true;
                        break;
                      }
                    }
                  } catch {
                    // Fall through to ZXing
                  }
                }

                if (!detected && !cancelled) {
                  try {
                    const source = new HTMLCanvasElementLuminanceSource(canvas);
                    const bitmap = new BinaryBitmap(new HybridBinarizer(source));
                    const res = zxingReader.decode(bitmap);
                    const text = res?.getText();
                    if (text) emitCode(text);
                  } catch {
                    // NotFoundException on frames without a barcode is normal
                  } finally {
                    zxingReader.reset();
                  }
                }
              }
            } catch {
              // Ignore transient frame decode error
            }
          }

          if (!cancelled) {
            scanTimer = setTimeout(() => {
              void scanFrame();
            }, isMobileDevice ? 300 : 160);
          }
        };

        scanTimer = setTimeout(() => {
          void scanFrame();
        }, isMobileDevice ? 250 : 120);
      } catch (err) {
        if (!cancelled) {
          stopStream();
          setCameraError(formatCameraError(err));
        }
      }
    };

    void startScanner();

    return () => {
      cancelled = true;
      if (scanTimer) clearTimeout(scanTimer);
      stopStream();
    };
  }, [state.scannerOpen, facingMode, retrySeq, emitCode, stopStream, isMobileDevice]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  };

  const handlePhotoScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Image load failed'));
        img.src = url;
      });

      const canvas = document.createElement('canvas');
      const maxDim = 1280;
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight, 1));
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Canvas unavailable');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const nativeDetector = await createNativeDetector();
      if (nativeDetector) {
        try {
          const hits = await nativeDetector.detect(canvas);
          const first = hits.find((h) => Boolean(h.rawValue?.trim()));
          if (first?.rawValue) {
            emitCode(first.rawValue, false);
            return;
          }
        } catch {
          // Fallback to ZXing below
        }
      }

      if (!zxingReaderRef.current) {
        zxingReaderRef.current = createZxingReader();
      }
      const reader = zxingReaderRef.current;
      try {
        const source = new HTMLCanvasElementLuminanceSource(canvas);
        const bitmap = new BinaryBitmap(new HybridBinarizer(source));
        const res = reader.decode(bitmap);
        const txt = res?.getText()?.trim();
        if (txt) {
          emitCode(txt, false);
          return;
        }
      } catch {
        // ZXing throws NotFoundException when no barcode is present in the image
      } finally {
        reader.reset();
      }

      setCameraError('No barcode found in that photo. Try a clearer close-up or enter manually.');
    } catch {
      setCameraError('Could not read barcode from photo. Try again or enter manually.');
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  if (!state.scannerOpen) return null;

  const submitManual = () => {
    if (!manualCode.trim()) return;
    handleBarcodeDetected(manualCode);
    setManualCode('');
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-3 shadow-xl">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="font-extrabold text-lg text-[#0F172A]">
              {state.scannerTarget === 'productForm' ? 'Scan Product Barcode' : 'Barcode Scanner'}
            </h3>
            {state.scannerTarget === 'productForm' && (
              <p className="text-[11px] text-[#64748B]">
                Scan or enter the barcode to fill the product form
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {torchSupported && cameraActive && (
              <button
                type="button"
                onClick={() => void toggleTorch()}
                aria-label="Toggle flashlight"
                className={`p-2 rounded-xl border text-xs font-semibold cursor-pointer ${
                  torchOn
                    ? 'bg-amber-50 border-amber-400 text-amber-700'
                    : 'bg-white border-[#E2E8F0] text-[#0F172A] hover:bg-slate-50'
                }`}
              >
                <Flashlight size={15} />
              </button>
            )}
            {canSwitchCamera && (
              <button
                type="button"
                onClick={() => setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))}
                aria-label="Switch camera"
                className="p-2 rounded-xl border border-[#E2E8F0] bg-white text-[#0F172A] hover:bg-slate-50 cursor-pointer"
              >
                <SwitchCamera size={15} />
              </button>
            )}
          </div>
        </div>

        <div className="relative w-full h-56 bg-[#0F172A] rounded-xl overflow-hidden flex items-center justify-center">
          <video
            ref={videoRef}
            className={`w-full h-full object-cover transition-opacity duration-200 ${
              cameraActive ? 'opacity-100' : 'opacity-0'
            }`}
            muted
            autoPlay
            playsInline
          />
          {cameraActive && (
            <div className="pointer-events-none absolute inset-x-8 top-1/2 -translate-y-1/2 h-24 border-2 border-[#34D399]/80 rounded-xl shadow-[0_0_0_9999px_rgba(15,23,42,0.22)]" />
          )}
          {!cameraActive && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 space-y-2.5">
              <Camera className="text-slate-400" size={28} />
              <p className="text-xs text-white leading-relaxed">
                {cameraError ?? cameraStatus}
              </p>
              {cameraError && (
                <button
                  type="button"
                  onClick={() => setRetrySeq((n) => n + 1)}
                  className="px-3 py-1.5 rounded-lg bg-[#059669] hover:bg-[#047857] text-white text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw size={12} />
                  <span>Retry Camera</span>
                </button>
              )}
            </div>
          )}
        </div>

        {state.scannerTarget === 'pos' && (
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={toggleContinuousScan}
              aria-pressed={continuousScan}
              className={`min-h-[36px] px-3 rounded-xl border text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer ${
                continuousScan
                  ? 'bg-[#ECFDF5] border-[#34D399] text-[#047857]'
                  : 'bg-white border-[#E2E8F0] text-[#334155] hover:bg-slate-50'
              }`}
            >
              <ScanLine size={14} />
              <span>{continuousScan ? 'Continuous scan: On' : 'Continuous scan'}</span>
            </button>
            {continuousScan && (
              <span className="text-[11px] font-semibold text-[#64748B]">
                Scanned: {batchScanCount}
              </span>
            )}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => void handlePhotoScan(e)}
        />

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label className="text-[11px] font-bold text-[#64748B]">
              Enter or Paste Barcode (EAN-13 / QR)
            </label>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-[11px] font-bold text-[#059669] hover:text-[#047857] inline-flex items-center gap-1 cursor-pointer"
            >
              <ImagePlus size={13} />
              <span>Scan Photo</span>
            </button>
          </div>
          <input
            type="text"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitManual();
            }}
            placeholder="e.g. 4800010000011"
            className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-[#E2E8F0] focus:outline-none focus:border-[#059669]"
          />
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={closeScanner}
              className="py-2 rounded-xl border border-[#E2E8F0] text-xs font-semibold text-[#0F172A] hover:bg-slate-50 cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              disabled={!manualCode.trim()}
              onClick={submitManual}
              className="py-2 rounded-xl bg-[#059669] hover:bg-[#047857] disabled:bg-slate-300 text-white text-xs font-bold cursor-pointer disabled:cursor-not-allowed"
            >
              {state.scannerTarget === 'productForm' ? 'Use Barcode' : 'Lookup Barcode'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
