import React, { useEffect, useState } from 'react';
import {
  Cookie,
  Droplets,
  Leaf,
  Package,
  ReceiptText,
  ShoppingBag,
  ShoppingBasket,
  ShoppingCart,
  Snowflake,
  Store,
  Utensils,
  Wine,
} from 'lucide-react';
import { PaymentQr, type ResolvedQr } from '../domain/paymentQr';
import { PosMath } from '../domain/posMath';
import type { ToastItem } from '../types/pos';

export const GlowingEmeraldStoreName: React.FC<{
  text: string;
  className?: string;
}> = ({ text, className = 'text-[17px] sm:text-[19px]' }) => (
  <span className={`emerald-store-glow font-extrabold tracking-tight truncate block ${className}`}>
    {text}
  </span>
);

export const GlowingEmeraldDateTime: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const timeWithSecs = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
  const timeShort = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const dateFull = now.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const dateShort = now.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return (
    <div
      aria-label={`${timeWithSecs}, ${dateFull}`}
      title={`${timeWithSecs} · ${dateFull}`}
      className={`text-right leading-none select-none shrink-0 ${className}`}
    >
      <div className="emerald-store-glow font-mono font-extrabold tracking-tight text-[11px] sm:text-[13px] md:text-[14px] whitespace-nowrap">
        <span className="hidden sm:inline">{timeWithSecs}</span>
        <span className="sm:hidden">{timeShort}</span>
      </div>
      <div className="emerald-store-glow font-semibold tracking-tight text-[9px] sm:text-[10px] md:text-[11px] mt-0.5 whitespace-nowrap opacity-90">
        <span className="hidden sm:inline">{dateFull}</span>
        <span className="sm:hidden">{dateShort}</span>
      </div>
    </div>
  );
};

export const StoreEmblem: React.FC<{ iconKey?: string | null; size?: number }> = ({ iconKey, size = 36 }) => {
  if (iconKey === 'brand') {
    return (
      <img
        src="/eternalblue_pos_icon.jpg"
        alt="Store emblem"
        style={{ width: size, height: size }}
        className="rounded-[10px] object-cover border border-[#059669]/50 shrink-0"
      />
    );
  }
  const Icon =
    iconKey === 'store'
      ? Store
      : iconKey === 'bag'
      ? ShoppingBag
      : iconKey === 'receipt'
      ? ReceiptText
      : ShoppingBasket;
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-[10px] bg-[#059669]/20 border border-[#059669]/40 flex items-center justify-center shrink-0"
    >
      <Icon size={Math.round(size * 0.55)} className="text-[#34D399]" />
    </div>
  );
};

export const ProductCategoryBadge: React.FC<{ category: string; size?: number }> = ({ category, size = 36 }) => {
  const c = category.toLowerCase();
  let Icon = Package;
  let bg = 'bg-slate-100 border-slate-300/50';
  let fg = 'text-[#64748B]';

  if (c.includes('meat') || c.includes('frozen')) {
    Icon = Snowflake;
    bg = 'bg-rose-50 border-rose-500/20';
    fg = 'text-[#E11D48]';
  } else if (c.includes('rice') || c.includes('staple')) {
    Icon = Leaf;
    bg = 'bg-amber-50 border-amber-500/20';
    fg = 'text-[#D97706]';
  } else if (c.includes('canned') || c.includes('noodle')) {
    Icon = Utensils;
    bg = 'bg-indigo-50 border-indigo-500/20';
    fg = 'text-[#4F46E5]';
  } else if (c.includes('beverage') || c.includes('drink')) {
    Icon = Wine;
    bg = 'bg-sky-50 border-sky-500/20';
    fg = 'text-sky-600';
  } else if (c.includes('condiment')) {
    Icon = Droplets;
    bg = 'bg-amber-50 border-amber-500/20';
    fg = 'text-[#D97706]';
  } else if (c.includes('snack')) {
    Icon = Cookie;
    bg = 'bg-rose-50 border-rose-500/20';
    fg = 'text-[#E11D48]';
  } else if (c.includes('dairy')) {
    Icon = ShoppingCart;
    bg = 'bg-[#ECFDF5] border-[#047857]/20';
    fg = 'text-[#047857]';
  }

  return (
    <div
      style={{ width: size, height: size }}
      className={`${size <= 24 ? 'rounded-md' : 'rounded-[10px]'} border flex items-center justify-center shrink-0 ${bg}`}
    >
      <Icon size={Math.round(size * 0.54)} className={fg} />
    </div>
  );
};

export const KpiCard: React.FC<{
  title: string;
  value: string;
  sub?: string;
  valueClass?: string;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}> = ({ title, value, sub, valueClass = 'text-[#0F172A]', active = false, onClick, className = '' }) => {
  const interactive = Boolean(onClick);
  const Tag = interactive ? 'button' : 'div';
  return (
    <Tag
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      className={`text-left rounded-[14px] px-3 py-2.5 transition-colors ${
        active
          ? 'bg-[#ECFDF5] border-[1.5px] border-[#059669]'
          : 'bg-white border border-[#E2E8F0]'
      } ${interactive ? 'cursor-pointer hover:border-[#059669]/60' : ''} ${className}`}
    >
      <div className="text-[10px] font-bold uppercase tracking-wide text-[#64748B] truncate">{title}</div>
      <div className={`mt-0.5 text-[17px] font-extrabold font-mono truncate ${valueClass}`}>{value}</div>
      {sub && <div className="text-[11px] text-[#64748B] truncate">{sub}</div>}
    </Tag>
  );
};

export const QrBitmapCard: React.FC<{ qr: ResolvedQr; qrSize?: number }> = ({ qr, qrSize = 170 }) => {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!qr.qrPayload) {
      setDataUrl(null);
      return;
    }
    void PaymentQr.renderQrDataUrl(qr.qrPayload, 360).then((url) => {
      if (!cancelled) setDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [qr.qrPayload]);

  return (
    <div className="w-full rounded-2xl bg-[#EEF2FF] border border-[#C7D2FE] p-3.5 flex flex-col items-center text-center">
      <div className="flex items-center gap-1.5">
        <span className="bg-[#4F46E5] text-white text-[10px] font-bold px-2 py-0.5 rounded-md">
          {qr.channelLabel}
        </span>
        {qr.isDynamicAmount && (
          <span className="bg-[#ECFDF5] text-[#047857] text-[10px] font-bold px-2 py-0.5 rounded-md">
            Exact Amount
          </span>
        )}
      </div>
      <div className="mt-1.5 text-sm font-bold text-[#0F172A]">{qr.merchantName}</div>
      {qr.accountNumber && (
        <div className="text-xs font-mono text-[#64748B]">{qr.accountNumber}</div>
      )}
      <div className="mt-2.5">
        {dataUrl ? (
          <img
            src={dataUrl}
            alt="Payment QR"
            style={{ width: qrSize, height: qrSize }}
            className="rounded-xl bg-white p-1.5 mx-auto"
          />
        ) : qr.mode === 'MANUAL' ? (
          <div className="bg-white rounded-xl border border-[#C7D2FE] px-4 py-2.5">
            <div className="text-[11px] text-[#64748B]">Send via {qr.channelLabel}</div>
            <div className="font-mono font-extrabold text-base text-[#4F46E5]">{qr.accountNumber}</div>
          </div>
        ) : (
          <div className="text-xs text-[#D97706] px-2 py-1">
            Set up your QR Ph payload or mobile account number in Settings → Payment QR.
          </div>
        )}
      </div>
      {qr.amount > 0 && (
        <div className="mt-2 text-lg font-extrabold font-mono text-[#047857]">
          {PosMath.formatPeso(qr.amount)}
        </div>
      )}
    </div>
  );
};

export const ToastHostOverlay: React.FC<{ toasts: ToastItem[] }> = ({ toasts }) => {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed top-16 right-3 z-50 flex flex-col gap-1.5 pointer-events-none max-w-sm">
      {toasts.map((t) => {
        const bg =
          t.type === 'ERROR'
            ? 'bg-[#9F1239]'
            : t.type === 'WARNING'
            ? 'bg-[#92400E]'
            : 'bg-[#0F172A]';
        return (
          <div
            key={t.id}
            className={`${bg} text-white text-xs font-semibold px-3.5 py-2.5 rounded-xl shadow-lg pointer-events-auto`}
          >
            {t.message}
          </div>
        );
      })}
    </div>
  );
};
