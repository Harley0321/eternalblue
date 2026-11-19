import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { Camera } from 'lucide-react';
import { usePos } from '../state/PosContext';

export const BarcodeScannerModal: React.FC = () => {
  const { state, handleBarcodeDetected, closeScanner } = usePos();
  const [manualCode, setManualCode] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastScanRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });

  useEffect(() => {
    if (!state.scannerOpen) {
      controlsRef.current?.stop();
      controlsRef.current = null;
      setCameraActive(false);
      setCameraError(null);
      return;
    }

    let cancelled = false;
    const reader = new BrowserMultiFormatReader();

    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia || !videoRef.current) {
        setCameraError('Camera is unavailable in this browser. Use manual barcode entry below.');
        return;
      }
      try {
        setCameraError(null);
        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          (result) => {
            if (cancelled || !result) return;
            const raw = result.getText().trim();
            const now = Date.now();
            if (raw && (raw !== lastScanRef.current.code || now - lastScanRef.current.time > 1400)) {
              lastScanRef.current = { code: raw, time: now };
              handleBarcodeDetected(raw);
            }
          }
        );
        if (cancelled) {
          controls.stop();
        } else {
          controlsRef.current = controls;
          setCameraActive(true);
        }
      } catch {
        if (!cancelled) {
          setCameraError('Camera permission denied or no camera detected. Use manual entry below.');
        }
      }
    };

    void startCamera();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [state.scannerOpen, handleBarcodeDetected]);

  if (!state.scannerOpen) return null;

  const submitManual = () => {
    if (!manualCode.trim()) return;
    handleBarcodeDetected(manualCode);
    setManualCode('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-3 shadow-xl">
        <h3 className="font-extrabold text-lg text-[#0F172A]">Barcode Scanner</h3>

        <div className="relative w-full h-52 bg-[#0F172A] rounded-xl overflow-hidden flex items-center justify-center">
          <video
            ref={videoRef}
            className={`w-full h-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
            muted
            playsInline
          />
          {!cameraActive && (
            <div className="text-center px-4 space-y-2">
              <Camera className="mx-auto text-slate-400" size={28} />
              <p className="text-xs text-white">
                {cameraError ?? 'Starting camera for live barcode scanning…'}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-[11px] font-bold text-[#64748B]">
            Enter or Paste Barcode (EAN-13 / QR)
          </label>
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
              Lookup Barcode
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
