import React, { useMemo } from 'react';
import QRCode from 'qrcode';
import { decodePhotoFile } from '../utils/scannerEngine';

interface QrCodeGraphicProps {
  value: string;
  size?: number;
  className?: string;
  label?: string;
  testId?: string;
}

export const QrCodeGraphic: React.FC<QrCodeGraphicProps> = ({
  value,
  size = 200,
  className = '',
  label = 'Payment QR Code',
  testId = 'payment-qr-svg',
}) => {
  const matrixData = useMemo(() => {
    const text = String(value || '').trim();
    if (!text) return null;
    try {
      const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
      const count = qr.modules.size;
      const data = qr.modules.data;
      const rects: { x: number; y: number }[] = [];
      for (let y = 0; y < count; y++) {
        for (let x = 0; x < count; x++) {
          if (data[y * count + x]) {
            rects.push({ x, y });
          }
        }
      }
      return { count, rects };
    } catch {
      return null;
    }
  }, [value]);

  if (!matrixData) {
    return (
      <div
        className={`flex items-center justify-center bg-slate-100 text-slate-500 text-xs rounded-xl border border-slate-200 ${className}`}
        style={{ width: size, height: size }}
      >
        Invalid QR data
      </div>
    );
  }

  const quietZone = 3;
  const total = matrixData.count + quietZone * 2;
  const pathData = matrixData.rects
    .map((r) => `M${r.x + quietZone},${r.y + quietZone}h1v1h-1z`)
    .join('');

  return (
    <svg
      viewBox={`0 0 ${total} ${total}`}
      width={size}
      height={size}
      role="img"
      aria-label={label}
      data-testid={testId}
      data-qr-payload={value}
      className={`bg-white rounded-xl border border-slate-200 block ${className}`}
      shapeRendering="crispEdges"
    >
      <rect x={0} y={0} width={total} height={total} fill="#ffffff" />
      <path d={pathData} fill="#0f172a" />
    </svg>
  );
};

/**
 * Compresses an uploaded QR standee image for compact localStorage storage while
 * simultaneously attempting to decode any embedded QR Ph / EMVCo string offline.
 */
export async function processUploadedQrImage(file: File): Promise<{
  dataUrl: string;
  decodedPayload?: string;
}> {
  let decodedPayload: string | undefined;
  try {
    const detections = await decodePhotoFile(file);
    const qrHit = detections.find((d) => Boolean(d.rawValue));
    if (qrHit?.rawValue) {
      decodedPayload = qrHit.rawValue.trim();
    }
  } catch {
    // non-fatal: fall back to compressed image display
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const img = new Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const maxDim = 360;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height, 1));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(objUrl);
          reject(new Error('Could not process image on this browser'));
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const out = canvas.toDataURL('image/webp', 0.85);
        URL.revokeObjectURL(objUrl);
        resolve(out.startsWith('data:image/') ? out : canvas.toDataURL('image/png'));
      } catch (err) {
        URL.revokeObjectURL(objUrl);
        reject(err instanceof Error ? err : new Error('Failed to resize QR image'));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      reject(new Error('Could not read uploaded image file'));
    };
    img.src = objUrl;
  });

  return { dataUrl, decodedPayload };
}
