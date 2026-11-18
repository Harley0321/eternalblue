import React, { useMemo } from 'react';
import { encodeCode128Bars } from '../utils/opsMath';

interface BarcodeSvgProps {
  value: string;
  height?: number;
  className?: string;
}

export const BarcodeSvg: React.FC<BarcodeSvgProps> = ({ value, height = 38, className = '' }) => {
  const { rects, totalModules } = useMemo(() => {
    const encoded = encodeCode128Bars(value);
    const quiet = 6;
    let cursor = quiet;
    const out: { x: number; w: number }[] = [];
    for (let i = 0; i < encoded.widths.length; i++) {
      const w = encoded.widths[i];
      if (i % 2 === 0) {
        out.push({ x: cursor, w });
      }
      cursor += w;
    }
    return { rects: out, totalModules: encoded.totalModules + quiet * 2 };
  }, [value]);

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <svg
        viewBox={`0 0 ${totalModules} ${height}`}
        className="w-full h-9 bg-white"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Barcode ${value}`}
      >
        <rect x={0} y={0} width={totalModules} height={height} fill="#ffffff" />
        {rects.map((r, idx) => (
          <rect key={idx} x={r.x} y={0} width={r.w} height={height} fill="#0f172a" />
        ))}
      </svg>
      <div className="font-mono-num text-[9.5px] font-bold tracking-widest text-slate-700 mt-0.5 truncate max-w-full">
        {value || '0000'}
      </div>
    </div>
  );
};
