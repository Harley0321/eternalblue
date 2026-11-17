import React from 'react';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

export interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'warning' | 'error';
}

export const ToastContainer: React.FC<{ toasts: ToastItem[]; scannerOpen: boolean }> = ({
  toasts,
  scannerOpen,
}) => {
  if (!toasts.length) return null;

  return (
    <div
      className={`fixed z-[100] flex flex-col gap-1.5 pointer-events-none max-w-xs sm:max-w-sm items-end ${
        scannerOpen ? 'top-3 right-3' : 'top-14 right-3 sm:right-4'
      }`}
    >
      {toasts.map((t) => {
        const bg =
          t.type === 'warning'
            ? 'bg-amber-600 text-white border-amber-400'
            : t.type === 'error'
              ? 'bg-rose-600 text-white border-rose-400'
              : 'bg-slate-900 text-white border-emerald-500/50';
        const Icon =
          t.type === 'warning' ? AlertTriangle : t.type === 'error' ? XCircle : CheckCircle2;
        const iconColor =
          t.type === 'warning'
            ? 'text-amber-200'
            : t.type === 'error'
              ? 'text-rose-200'
              : 'text-emerald-400';

        return (
          <div
            key={t.id}
            role="status"
            className={`px-4 py-2.5 rounded-xl shadow-xl border text-xs font-bold flex items-center gap-2 ${bg}`}
          >
            <Icon className={`w-4 h-4 shrink-0 ${iconColor}`} />
            <span>{t.message}</span>
          </div>
        );
      })}
    </div>
  );
};
