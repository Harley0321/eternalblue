import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Flashlight,
  ImagePlus,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  ScanBarcode,
  X,
  Zap,
  ZoomIn,
} from 'lucide-react';
import type { CartLine, Product, ScannerMode } from '../types';
import {
  buildBarcodeIndex,
  createScanConsensusState,
  evaluateScanCandidate,
  extractScanPayload,
  findProductByBarcodeIndexed,
  formatPeso,
  normalizeBarcodeFormat,
} from '../utils/posMath';
import {
  decodePhotoFile,
  detectImageDataWithWasm,
  detectWithNative,
  getNativeBarcodeDetector,
  warmUpScannerEngine,
} from '../utils/scannerEngine';
import { loadScanPrefs, saveScanPrefs } from '../utils/storage';
import type { WorkerPoint } from '../workers/barcodeWorker';

interface BarcodeScannerModalProps {
  open: boolean;
  mode: ScannerMode;
  initialContinuous?: boolean;
  products: Product[];
  cart: CartLine[];
  cartTotal: number;
  beepEnabled: boolean;
  vibrateEnabled: boolean;
  onClose: () => void;
  onScanProduct: (product: Product, qty?: number) => void;
  onUnknownBarcode: (barcode: string, mode: ScannerMode) => void;
  onPopulateFormBarcode: (barcode: string) => void;
  onChangeCartQty: (productId: string, delta: number) => void;
  onProceedCheckout: () => void;
}

interface CameraDeviceOption {
  deviceId: string;
  label: string;
}

function pickBestRearCamera(devices: MediaDeviceInfo[]): string | undefined {
  if (!devices.length) return undefined;
  const rear = devices.filter((d) => /back|rear|environment/i.test(d.label));
  if (rear.length === 0) return devices[0].deviceId;
  // Prefer primary main lens over ultra-wide / macro / telephoto when multiple rear cameras exist
  const main = rear.find((d) => !/ultra|wide|0\.5|macro|tele|depth/i.test(d.label));
  return (main || rear[0]).deviceId;
}

const SCAN_MULTIPLIERS = [1, 2, 5, 6, 12] as const;

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  open,
  mode,
  initialContinuous,
  products,
  cart,
  cartTotal,
  beepEnabled,
  vibrateEnabled,
  onClose,
  onScanProduct,
  onUnknownBarcode,
  onPopulateFormBarcode,
  onChangeCartQty,
  onProceedCheckout,
}) => {
  const [continuous, setContinuous] = useState(() => loadScanPrefs().continuous);
  const [scanMultiplier, setScanMultiplier] = useState<number>(1);
  const [statusMsg, setStatusMsg] = useState('Initializing scanner…');
  const [cameraError, setCameraError] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [zoomCaps, setZoomCaps] = useState<{ min: number; max: number } | null>(null);
  const [darkAlert, setDarkAlert] = useState(false);
  const [focusRing, setFocusRing] = useState<{ x: number; y: number } | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [lastScanned, setLastScanned] = useState<{
    code: string;
    name?: string;
    productId?: string;
    format?: string;
  } | null>(null);
  const [unknownCode, setUnknownCode] = useState<string | null>(null);
  const [sessionHistory, setSessionHistory] = useState<Array<{ id: string; qty: number }>>([]);
  const [lockFlash, setLockFlash] = useState(false);
  const [cameras, setCameras] = useState<CameraDeviceOption[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined);
  const [activeDeviceId, setActiveDeviceId] = useState<string | undefined>(undefined);

  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const viewfinderRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const timerRef = useRef<number | null>(null);
  const consensusRef = useRef(createScanConsensusState());
  const pinchStartRef = useRef<{ dist: number; zoom: number } | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const overlayClearTimerRef = useRef<number | null>(null);

  const barcodeIndex = useMemo(() => buildBarcodeIndex(products), [products]);
  const continuousRef = useRef(continuous);
  continuousRef.current = continuous;
  const scanMultiplierRef = useRef(scanMultiplier);
  scanMultiplierRef.current = scanMultiplier;

  const playFeedback = useCallback(() => {
    if (vibrateEnabled && typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(40);
      } catch {
        // ignore
      }
    }
    if (beepEnabled) {
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
          audioCtxRef.current = new AudioCtx();
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1180, ctx.currentTime);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.085);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.09);
      } catch {
        // ignore audio context errors
      }
    }
  }, [beepEnabled, vibrateEnabled]);

  const drawDetectedBox = useCallback(
    (
      points: WorkerPoint[] | undefined,
      cropRect: { sx: number; sy: number; sw: number; sh: number; cw: number; ch: number },
    ) => {
      const canvas = overlayCanvasRef.current;
      const vid = videoRef.current;
      const container = viewfinderRef.current;
      if (!canvas || !vid || !container) return;

      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      canvas.width = Math.round(rect.width);
      canvas.height = Math.round(rect.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (points && points.length >= 3 && vid.videoWidth > 0 && vid.videoHeight > 0) {
        // Map cropped canvas coordinates -> full video coordinates -> object-cover viewport coordinates
        const scaleX = cropRect.sw / cropRect.cw;
        const scaleY = cropRect.sh / cropRect.ch;
        const coverScale = Math.max(rect.width / vid.videoWidth, rect.height / vid.videoHeight);
        const offsetX = (rect.width - vid.videoWidth * coverScale) / 2;
        const offsetY = (rect.height - vid.videoHeight * coverScale) / 2;

        ctx.save();
        ctx.strokeStyle = '#34d399';
        ctx.fillStyle = 'rgba(16, 185, 129, 0.18)';
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        points.forEach((pt, idx) => {
          const vx = cropRect.sx + pt.x * scaleX;
          const vy = cropRect.sy + pt.y * scaleY;
          const dx = vx * coverScale + offsetX;
          const dy = vy * coverScale + offsetY;
          if (idx === 0) ctx.moveTo(dx, dy);
          else ctx.lineTo(dx, dy);
        });
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      if (overlayClearTimerRef.current !== null) {
        window.clearTimeout(overlayClearTimerRef.current);
      }
      overlayClearTimerRef.current = window.setTimeout(() => {
        const c = overlayCanvasRef.current;
        const cctx = c?.getContext('2d');
        if (c && cctx) cctx.clearRect(0, 0, c.width, c.height);
      }, 480);
    },
    [],
  );

  const processBarcode = useCallback(
    (
      raw: string,
      options: {
        format?: string;
        source: 'camera' | 'photo' | 'manual';
        decodeMs?: number;
        cornerPoints?: WorkerPoint[];
        cropRect?: { sx: number; sy: number; sw: number; sh: number; cw: number; ch: number };
      },
    ) => {
      const payload = extractScanPayload(raw);
      const effectiveCode = payload.code || raw;

      const verdict = evaluateScanCandidate(consensusRef.current, effectiveCode, {
        format: options.format,
        source: options.source,
        cooldownMs: continuousRef.current ? 650 : 1200,
      });

      if (!verdict.accept) return false;

      if (options.cropRect) {
        drawDetectedBox(options.cornerPoints, options.cropRect);
      }
      setLockFlash(true);
      window.setTimeout(() => setLockFlash(false), 260);

      playFeedback();
      const fmtLabel = normalizeBarcodeFormat(options.format).replace('_', '-').toUpperCase();

      if (mode === 'product-form') {
        onPopulateFormBarcode(verdict.code);
        return true;
      }

      let found = findProductByBarcodeIndexed(verdict.code, barcodeIndex);
      if (!found && options.source === 'manual' && payload.rawQuery.length >= 2) {
        const lower = payload.rawQuery.toLowerCase();
        found = products.find((p) => p.name.toLowerCase() === lower);
        if (!found) {
          const nameMatches = products.filter((p) => p.name.toLowerCase().includes(lower));
          if (nameMatches.length === 1) {
            found = nameMatches[0];
          }
        }
      }

      if (found) {
        const activeMult = scanMultiplierRef.current;
        const effectiveQty = Number(
          (payload.qty !== 1 ? payload.qty : activeMult).toFixed(3),
        );
        setUnknownCode(null);
        setLastScanned({
          code: found.barcode || verdict.code,
          name: found.name,
          productId: found.id,
          format: fmtLabel || undefined,
        });
        setSessionHistory((prev) => [{ id: found.id, qty: effectiveQty }, ...prev.slice(0, 19)]);
        onScanProduct(found, effectiveQty);
        if (activeMult !== 1) {
          setScanMultiplier(1);
        }
        const qtyPrefix = effectiveQty !== 1 ? `${effectiveQty}× ` : '';
        const speedSuffix = options.decodeMs !== undefined ? ` (${options.decodeMs}ms)` : '';
        setStatusMsg(`Added ${qtyPrefix}${found.name}${speedSuffix}`);
        if (!continuous || mode === 'inventory') {
          onClose();
        }
      } else {
        setUnknownCode(verdict.code);
        setLastScanned({ code: verdict.code, format: fmtLabel || undefined });
        setStatusMsg(`Unknown barcode: ${verdict.code}`);
        if (mode === 'inventory') {
          onUnknownBarcode(verdict.code, mode);
        }
      }
      return true;
    },
    [
      barcodeIndex,
      continuous,
      drawDetectedBox,
      mode,
      onClose,
      onPopulateFormBarcode,
      onScanProduct,
      onUnknownBarcode,
      playFeedback,
      products,
    ],
  );

  const processBarcodeRef = useRef(processBarcode);
  processBarcodeRef.current = processBarcode;

  const stopCamera = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (overlayClearTimerRef.current !== null) {
      window.clearTimeout(overlayClearTimerRef.current);
      overlayClearTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    trackRef.current = null;
    setTorchOn(false);
    setTorchSupported(false);
    setZoomCaps(null);
    setZoomLevel(1);
    setDarkAlert(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (initialContinuous !== undefined) {
      setContinuous(initialContinuous);
    } else {
      setContinuous(loadScanPrefs().continuous);
    }
    setScanMultiplier(1);
    setManualCode('');
  }, [open, initialContinuous]);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      stopCamera();
      consensusRef.current = createScanConsensusState();
      setUnknownCode(null);
      setLastScanned(null);
      setSessionHistory([]);
      setCameraError('');
      return;
    }

    let cancelled = false;
    setCameraError('');
    setStatusMsg('Starting high-speed camera…');

    const startScanner = async () => {
      // Pre-warm ZXing-C++ WASM Web Worker in parallel with camera startup
      const engineWarmPromise = warmUpScannerEngine();

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        await engineWarmPromise;
        if (!cancelled) {
          setCameraError('Camera access is not available here. You can type a barcode or scan from a photo.');
          setStatusMsg('Manual / Photo mode ready');
        }
        return;
      }

      try {
        const videoConstraints: MediaTrackConstraints = selectedDeviceId
          ? {
              deviceId: { exact: selectedDeviceId },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            }
          : {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            };

        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        trackRef.current = track;

        // Enumerate cameras once permission is granted for lens switching
        try {
          const allDevs = await navigator.mediaDevices.enumerateDevices();
          const videoDevs = allDevs
            .filter((d) => d.kind === 'videoinput')
            .map((d, idx) => ({
              deviceId: d.deviceId,
              label: d.label || `Camera ${idx + 1}`,
            }));
          if (!cancelled) {
            setCameras(videoDevs);
            const activeId = track.getSettings?.().deviceId;
            if (activeId) setActiveDeviceId(activeId);
            if (!selectedDeviceId && videoDevs.length > 1) {
              const bestId = pickBestRearCamera(allDevs.filter((d) => d.kind === 'videoinput'));
              if (bestId && activeId && bestId !== activeId) {
                setSelectedDeviceId(bestId);
                return;
              }
            }
          }
        } catch {
          // ignore enumeration error
        }

        // Apply continuous autofocus & exposure if supported by hardware camera
        if (track && typeof track.getCapabilities === 'function') {
          const caps = track.getCapabilities() as MediaTrackCapabilities & {
            torch?: boolean;
            zoom?: { min: number; max: number };
            focusMode?: string[];
            exposureMode?: string[];
          };
          setTorchSupported(!!caps.torch);
          if (caps.zoom && caps.zoom.max > caps.zoom.min) {
            setZoomCaps({ min: caps.zoom.min, max: caps.zoom.max });
          } else {
            setZoomCaps(null);
          }

          const adv: Record<string, unknown> = {};
          if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
            adv.focusMode = 'continuous';
          }
          if (Array.isArray(caps.exposureMode) && caps.exposureMode.includes('continuous')) {
            adv.exposureMode = 'continuous';
          }
          if (Object.keys(adv).length > 0) {
            track
              .applyConstraints({ advanced: [adv as unknown as MediaTrackConstraintSet] })
              .catch(() => {});
          }
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const engineStatus = await engineWarmPromise;
        if (cancelled) return;

        setStatusMsg(
          engineStatus.nativeAvailable
            ? 'Align barcode in frame · Hybrid Hardware + WASM active'
            : 'Align barcode in frame · ZXing WASM Worker active',
        );

        // Pooled canvases for ROI fast-pass and periodic full-frame deep-pass
        const roiCanvas = document.createElement('canvas');
        const roiCtx = roiCanvas.getContext('2d', { willReadFrequently: true });
        const deepCanvas = document.createElement('canvas');
        const deepCtx = deepCanvas.getContext('2d', { willReadFrequently: true });
        const lumaCanvas = document.createElement('canvas');
        lumaCanvas.width = 48;
        lumaCanvas.height = 48;
        const lumaCtx = lumaCanvas.getContext('2d', { willReadFrequently: true });

        let cycle = 0;
        let lastLumaCheck = 0;
        let inFlight = false;
        const hasNative = !!getNativeBarcodeDetector();

        const runCycle = async () => {
          if (cancelled) return;
          const vid = videoRef.current;

          if (!vid || vid.readyState < 2 || vid.videoWidth === 0 || vid.videoHeight === 0) {
            timerRef.current = window.setTimeout(runCycle, 70);
            return;
          }

          if (!inFlight) {
            inFlight = true;
            try {
              const vw = vid.videoWidth;
              const vh = vid.videoHeight;
              const phase = cycle % 4;
              const isFast1d = phase === 0 || phase === 1;
              const isDeepCycle = phase === 3;
              cycle += 1;

              // Tiered scan crop:
              // - fast-1d (cycles 0,1): tight center strip (68% x 36%, max 560px) for laser-like retail 1D speed
              // - fast (cycle 2): wider ROI (76% x 46%, max 680px) with rotation/invert & 2D support
              // - deep (cycle 3): full frame (max 960px) with denoising & inverted fallback
              const sx = isDeepCycle ? 0 : Math.round(vw * (isFast1d ? 0.16 : 0.12));
              const sy = isDeepCycle ? 0 : Math.round(vh * (isFast1d ? 0.32 : 0.27));
              const sw = isDeepCycle ? vw : Math.round(vw * (isFast1d ? 0.68 : 0.76));
              const sh = isDeepCycle ? vh : Math.round(vh * (isFast1d ? 0.36 : 0.46));

              const targetW = isDeepCycle
                ? Math.min(960, sw)
                : isFast1d
                  ? Math.min(560, sw)
                  : Math.min(680, sw);
              const targetH = Math.max(1, Math.round((sh * targetW) / sw));

              const targetCanvas = isDeepCycle ? deepCanvas : roiCanvas;
              const targetCtx = isDeepCycle ? deepCtx : roiCtx;

              if (targetCanvas.width !== targetW) targetCanvas.width = targetW;
              if (targetCanvas.height !== targetH) targetCanvas.height = targetH;

              if (targetCtx) {
                const tStart = performance.now();
                targetCtx.drawImage(vid, sx, sy, sw, sh, 0, 0, targetW, targetH);

                // 1. Hardware BarcodeDetector pass (sub-10ms when available)
                let handled = false;
                if (hasNative) {
                  const nativeHits = await detectWithNative(targetCanvas);
                  if (!cancelled && nativeHits.length > 0) {
                    handled = processBarcodeRef.current(nativeHits[0].rawValue, {
                      format: nativeHits[0].format,
                      source: 'camera',
                      decodeMs: Math.round(performance.now() - tStart),
                      cornerPoints: nativeHits[0].cornerPoints,
                      cropRect: { sx, sy, sw, sh, cw: targetW, ch: targetH },
                    });
                  }
                }

                // 2. ZXing-C++ WASM Web Worker pass (fast-1d first, escalating to full 2D & deep passes)
                if (!handled && (!hasNative || isDeepCycle || phase === 2)) {
                  const imgData = targetCtx.getImageData(0, 0, targetW, targetH);
                  const wasmMode = isDeepCycle ? 'deep' : isFast1d ? 'fast-1d' : 'fast';
                  const wasmHits = await detectImageDataWithWasm(imgData, wasmMode);
                  if (!cancelled && wasmHits.length > 0) {
                    processBarcodeRef.current(wasmHits[0].rawValue, {
                      format: wasmHits[0].format,
                      source: 'camera',
                      decodeMs: Math.round(performance.now() - tStart),
                      cornerPoints: wasmHits[0].cornerPoints,
                      cropRect: { sx, sy, sw, sh, cw: targetW, ch: targetH },
                    });
                  }
                }
              }

              // Low-light check every 1.6s
              const now = Date.now();
              if (lumaCtx && now - lastLumaCheck > 1600) {
                lastLumaCheck = now;
                try {
                  lumaCtx.drawImage(vid, 0, 0, 48, 48);
                  const data = lumaCtx.getImageData(12, 12, 24, 24).data;
                  let sum = 0;
                  for (let i = 0; i < data.length; i += 4) {
                    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                  }
                  setDarkAlert(sum / (data.length / 4) < 42);
                } catch {
                  // ignore
                }
              }
            } finally {
              inFlight = false;
            }
          }

          if (!cancelled) {
            // Adaptive pacing: faster 18ms cadence in Rapid Multi mode, smooth 28ms default
            timerRef.current = window.setTimeout(runCycle, continuousRef.current ? 18 : 28);
          }
        };

        timerRef.current = window.setTimeout(runCycle, 50);
      } catch {
        await engineWarmPromise;
        if (!cancelled) {
          setCameraError(
            'Could not access camera (permission denied or no camera detected). Type a barcode or upload a photo.',
          );
          setStatusMsg('Manual / Photo mode ready');
        }
      }
    };

    startScanner();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open, selectedDeviceId, stopCamera]);

  const applyZoom = async (target: number) => {
    const track = trackRef.current;
    if (!track || !zoomCaps) return;
    const clamped = Math.max(zoomCaps.min, Math.min(zoomCaps.max, target));
    try {
      await track.applyConstraints({
        advanced: [{ zoom: clamped } as unknown as MediaTrackConstraintSet],
      });
      setZoomLevel(Number(clamped.toFixed(1)));
    } catch {
      // unsupported
    }
  };

  const toggleTorch = async () => {
    const track = trackRef.current;
    if (!track || !torchSupported) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as unknown as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      // ignore
    }
  };

  const cycleZoom = () => {
    if (!zoomCaps) return;
    const steps = [1, 1.5, 2, 3].filter((z) => z <= zoomCaps.max + 0.05);
    const idx = steps.findIndex((z) => z > zoomLevel + 0.1);
    applyZoom(idx >= 0 ? steps[idx] : zoomCaps.min);
  };

  const switchCamera = () => {
    if (cameras.length < 2) return;
    const currentId = selectedDeviceId || activeDeviceId;
    const idx = cameras.findIndex((c) => c.deviceId === currentId);
    const next = cameras[(idx + 1) % cameras.length];
    if (next) {
      setSelectedDeviceId(next.deviceId);
    }
  };

  const handleTapFocus = async (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setFocusRing({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    window.setTimeout(() => setFocusRing(null), 650);
    const track = trackRef.current;
    if (!track) return;
    try {
      await track.applyConstraints({
        advanced: [{ focusMode: 'single-shot' } as unknown as MediaTrackConstraintSet],
      });
    } catch {
      // ignore if unsupported
    }
  };

  const handlePhotoPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setStatusMsg('Decoding photo with ZXing WASM…');
    try {
      const hits = await decodePhotoFile(file);
      if (hits.length > 0) {
        processBarcode(hits[0].rawValue, {
          format: hits[0].format,
          source: 'photo',
        });
      } else {
        setStatusMsg('No barcode detected in that photo');
      }
    } catch {
      setStatusMsg('No barcode detected in that photo');
    }
  };

  const handleUndoLast = () => {
    const lastEntry = sessionHistory[0];
    if (!lastEntry) return;
    const prod = products.find((p) => p.id === lastEntry.id);
    if (prod && prod.unit === 'kg') {
      // Weight items step by 0.25kg on handleChangeCartQty; undo whole unit steps if integer
      const steps = Math.max(1, Math.round(lastEntry.qty / 0.25));
      for (let i = 0; i < steps; i++) onChangeCartQty(lastEntry.id, -1);
    } else {
      onChangeCartQty(lastEntry.id, -lastEntry.qty);
    }
    setSessionHistory((prev) => prev.slice(1));
  };

  if (!open) return null;

  const totalQty = cart.reduce((s, l) => s + (l.unit === 'kg' ? 1 : l.qty), 0);
  const manualPayload = extractScanPayload(manualCode);
  const manualQuickMatches =
    mode === 'pos' && manualPayload.rawQuery.length >= 2
      ? products
          .filter((p) => {
            const q = manualPayload.rawQuery.toLowerCase();
            return (
              p.stock > 0 &&
              (p.name.toLowerCase().includes(q) || p.barcode.toLowerCase().includes(q))
            );
          })
          .slice(0, 3)
      : [];

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/85 flex items-center justify-center p-0 sm:p-4"
      onClick={onClose}
      data-testid="barcode-scanner-modal"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full h-full sm:h-auto sm:max-w-lg bg-slate-900 text-white sm:rounded-2xl shadow-2xl border border-slate-800 overflow-hidden flex flex-col max-h-screen sm:max-h-[92vh]"
      >
        {/* Header */}
        <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <ScanBarcode className="w-5 h-5 text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold text-white truncate">Barcode Scanner</h3>
              <p className="text-[11px] text-slate-400 truncate" data-testid="scanner-status-msg">
                {statusMsg}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {mode === 'pos' && (
              <button
                type="button"
                onClick={() => {
                  const next = !continuous;
                  setContinuous(next);
                  saveScanPrefs(next);
                }}
                aria-pressed={continuous}
                className={`px-3 min-h-[40px] rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer transition-colors ${
                  continuous
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                }`}
              >
                Multi {continuous ? 'ON' : 'OFF'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close scanner"
              className="w-11 h-11 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Camera viewfinder */}
        <div
          ref={viewfinderRef}
          className="relative bg-black flex-1 min-h-[260px] sm:min-h-[300px] flex items-center justify-center overflow-hidden select-none"
          onClick={handleTapFocus}
          onTouchStart={(e) => {
            if (e.touches.length === 2 && zoomCaps) {
              const dx = e.touches[0].clientX - e.touches[1].clientX;
              const dy = e.touches[0].clientY - e.touches[1].clientY;
              pinchStartRef.current = { dist: Math.hypot(dx, dy), zoom: zoomLevel };
            }
          }}
          onTouchMove={(e) => {
            if (e.touches.length === 2 && pinchStartRef.current && zoomCaps) {
              const dx = e.touches[0].clientX - e.touches[1].clientX;
              const dy = e.touches[0].clientY - e.touches[1].clientY;
              const ratio = Math.hypot(dx, dy) / Math.max(1, pinchStartRef.current.dist);
              applyZoom(pinchStartRef.current.zoom * ratio);
            }
          }}
          onTouchEnd={() => {
            pinchStartRef.current = null;
          }}
        >
          <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />

          {/* Detected barcode polygon overlay */}
          <canvas
            ref={overlayCanvasRef}
            className="pointer-events-none absolute inset-0 w-full h-full"
          />

          {/* Scan guide reticle */}
          {!cameraError && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div
                className={`w-64 sm:w-72 h-36 sm:h-40 rounded-xl shadow-[0_0_0_9999px_rgba(2,6,23,0.48)] relative transition-colors duration-150 border-2 ${
                  lockFlash ? 'border-emerald-300 bg-emerald-400/10' : 'border-emerald-400/80'
                }`}
              >
                <div className="absolute inset-x-3 top-1/2 h-0.5 bg-emerald-400/70" />
              </div>
            </div>
          )}

          {focusRing && (
            <div
              className="pointer-events-none absolute w-12 h-12 -ml-6 -mt-6 rounded-full border-2 border-amber-400"
              style={{ left: focusRing.x, top: focusRing.y }}
            />
          )}

          {cameraError && (
            <div className="absolute inset-0 bg-slate-900/95 flex flex-col items-center justify-center p-6 text-center gap-3">
              <Camera className="w-9 h-9 text-slate-400" />
              <div className="text-xs text-slate-200 max-w-xs leading-relaxed">{cameraError}</div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  photoInputRef.current?.click();
                }}
                className="px-4 py-2.5 min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
              >
                <ImagePlus className="w-4 h-4" />
                <span>Choose Barcode Photo</span>
              </button>
            </div>
          )}

          {/* Low light quick action */}
          {darkAlert && torchSupported && !torchOn && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleTorch();
              }}
              className="absolute top-3 left-3 px-3.5 py-2 min-h-[40px] rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold shadow-lg cursor-pointer"
            >
              Low light — Tap for Flash
            </button>
          )}

          {/* Camera controls overlay (44x44px hitboxes) */}
          <div
            className="absolute top-3 right-3 flex flex-col gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            {torchSupported && (
              <button
                type="button"
                onClick={toggleTorch}
                aria-label="Toggle flash"
                title="Toggle Flash"
                className={`w-11 h-11 rounded-full flex items-center justify-center shadow-lg cursor-pointer ${
                  torchOn
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-slate-900/85 text-white border border-slate-700 hover:bg-slate-800'
                }`}
              >
                <Flashlight className="w-4 h-4" />
              </button>
            )}
            {zoomCaps && (
              <button
                type="button"
                onClick={cycleZoom}
                aria-label={`Cycle zoom (${zoomLevel}x)`}
                title="Cycle Zoom"
                className="w-11 h-11 rounded-full bg-slate-900/85 hover:bg-slate-800 text-white border border-slate-700 flex items-center justify-center gap-0.5 text-[11px] font-bold shadow-lg cursor-pointer"
              >
                <ZoomIn className="w-3.5 h-3.5" />
                <span>{zoomLevel}x</span>
              </button>
            )}
            {cameras.length > 1 && (
              <button
                type="button"
                onClick={switchCamera}
                aria-label="Switch camera lens"
                title="Switch Camera"
                className="w-11 h-11 rounded-full bg-slate-900/85 hover:bg-slate-800 text-white border border-slate-700 flex items-center justify-center shadow-lg cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              aria-label="Scan barcode from photo"
              title="Scan from Photo"
              className="w-11 h-11 rounded-full bg-slate-900/85 hover:bg-slate-800 text-white border border-slate-700 flex items-center justify-center shadow-lg cursor-pointer"
            >
              <ImagePlus className="w-4 h-4" />
            </button>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoPick}
              data-testid="scanner-photo-input"
              className="hidden"
            />
          </div>
        </div>

        {/* Unknown barcode prompt */}
        {unknownCode && (
          <div className="px-4 py-2.5 bg-amber-950/90 border-t border-amber-700 flex items-center justify-between gap-2 text-xs">
            <div className="min-w-0">
              <div className="font-bold text-amber-200 truncate">
                Barcode not found: <span className="font-mono-num">{unknownCode}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const c = unknownCode;
                  setUnknownCode(null);
                  onUnknownBarcode(c, mode);
                }}
                className="px-3 min-h-[38px] rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold whitespace-nowrap cursor-pointer"
              >
                + Add Product
              </button>
              <button
                type="button"
                onClick={() => setUnknownCode(null)}
                className="px-3 min-h-[38px] rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 whitespace-nowrap cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Live in-camera scan session strip (POS mode) */}
        {mode === 'pos' && (lastScanned?.productId || cart.length > 0) && (
          <div className="px-4 py-2 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-2 text-xs">
            <div className="min-w-0">
              <div className="font-bold text-emerald-300 truncate">
                {lastScanned?.name || `${totalQty} item(s) in basket`}
              </div>
              <div className="text-slate-400 font-mono-num truncate">
                {lastScanned?.code ? `${lastScanned.code} · ` : ''}
                {lastScanned?.format ? `${lastScanned.format} · ` : ''}
                Basket: {totalQty} item(s) · {formatPeso(cartTotal)}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {lastScanned?.productId && (
                <>
                  <button
                    type="button"
                    onClick={() => onChangeCartQty(lastScanned.productId!, -1)}
                    aria-label="Decrease last scanned"
                    className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center cursor-pointer"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeCartQty(lastScanned.productId!, 1)}
                    aria-label="Increase last scanned"
                    className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
              {sessionHistory.length > 0 && (
                <button
                  type="button"
                  onClick={handleUndoLast}
                  title="Undo last scan"
                  className="px-2.5 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 inline-flex items-center gap-1 font-bold whitespace-nowrap cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Undo</span>
                </button>
              )}
              <button
                type="button"
                onClick={onProceedCheckout}
                className="px-3 h-9 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Checkout</span>
              </button>
            </div>
          </div>
        )}

        {/* Quick-Scan Qty Multiplier Bar (POS mode) */}
        {mode === 'pos' && (
          <div className="px-4 py-1.5 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between gap-2 text-[11px]">
            <span className="text-slate-400 font-semibold flex items-center gap-1 shrink-0">
              <Zap className="w-3 h-3 text-emerald-400" />
              <span>Scan Qty</span>
            </span>
            <div className="flex items-center gap-1" role="group" aria-label="Scan quantity multiplier">
              {SCAN_MULTIPLIERS.map((m) => (
                <button
                  key={m}
                  type="button"
                  data-testid={`scanner-mult-${m}`}
                  aria-pressed={scanMultiplier === m}
                  onClick={() => setScanMultiplier(m)}
                  className={`px-2.5 py-1 min-h-[28px] rounded-lg font-mono-num font-extrabold cursor-pointer transition-colors ${
                    scanMultiplier === m
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  ×{m}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Instant name/barcode quick-pick chips while typing */}
        {manualQuickMatches.length > 0 && (
          <div className="px-4 py-1.5 bg-slate-900 border-t border-slate-800 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {manualQuickMatches.map((prod) => (
              <button
                key={prod.id}
                type="button"
                data-testid={`scanner-quick-match-${prod.id}`}
                onClick={() => {
                  const targetCode = prod.barcode || prod.name;
                  const commandInput =
                    manualPayload.qty !== 1 ? `${manualPayload.qty}*${targetCode}` : targetCode;
                  processBarcode(commandInput, { source: 'manual' });
                  setManualCode('');
                }}
                className="px-2.5 py-1 min-h-[30px] rounded-lg bg-slate-800 hover:bg-emerald-900/60 border border-slate-700 hover:border-emerald-500/60 text-left flex items-center gap-2 shrink-0 cursor-pointer"
              >
                <span className="text-[11px] font-bold text-white truncate max-w-[160px]">
                  {prod.name}
                </span>
                <span className="text-[10px] font-mono-num font-bold text-emerald-400">
                  {formatPeso(prod.retailPrice)}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Manual barcode / qty*code / name fallback */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const val = manualCode.trim();
            if (!val) return;
            processBarcode(val, { source: 'manual' });
            setManualCode('');
          }}
          className="px-4 py-2.5 bg-slate-900 border-t border-slate-800 flex items-center gap-2"
        >
          <input
            type="text"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="Barcode, 5*code, or item name…"
            aria-label="Manual barcode entry"
            className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white font-mono-num placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none"
          />
          <button
            type="submit"
            className="px-4 py-2 min-h-[40px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold whitespace-nowrap cursor-pointer"
          >
            Enter
          </button>
        </form>
      </div>
    </div>
  );
};
