import React, { useState } from 'react';
import { Check, Copy, QrCode, Settings2, Smartphone } from 'lucide-react';
import type { ResolvedCheckoutQr } from '../utils/paymentQr';
import { formatPeso } from '../utils/posMath';
import { QrCodeGraphic } from './QrCodeGraphic';

interface MerchantQrCardProps {
  qr: ResolvedCheckoutQr;
  size?: 'compact' | 'large';
  onOpenSetup?: () => void;
}

export const MerchantQrCard: React.FC<MerchantQrCardProps> = ({
  qr,
  size = 'compact',
  onOpenSetup,
}) => {
  const [copiedAcct, setCopiedAcct] = useState(false);

  const handleCopyAccount = async () => {
    if (!qr.accountNumber) return;
    try {
      await navigator.clipboard.writeText(qr.accountNumber);
      setCopiedAcct(true);
      window.setTimeout(() => setCopiedAcct(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const qrSize = size === 'large' ? 236 : 164;

  if (qr.mode === 'unconfigured') {
    return (
      <div
        data-testid="merchant-qr-unconfigured"
        className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-center space-y-2"
      >
        <div className="w-10 h-10 rounded-xl bg-slate-200/80 text-slate-600 flex items-center justify-center mx-auto">
          <QrCode className="w-5 h-5" />
        </div>
        <div>
          <div className="text-xs font-bold text-slate-800">Store Payment QR Not Configured</div>
          <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
            {qr.error || 'Add your GCash, Maya, or QR Ph standee once to display scannable checkout QR codes automatically.'}
          </p>
        </div>
        {onOpenSetup && (
          <button
            type="button"
            data-testid="checkout-setup-qr-btn"
            onClick={onOpenSetup}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-emerald-400 text-xs font-bold cursor-pointer"
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span>Set Up Store QR</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid="merchant-qr-card"
      data-qr-mode={qr.mode}
      className={`rounded-2xl border border-slate-200 bg-white ${
        size === 'large' ? 'p-5 space-y-4' : 'p-3.5 space-y-2.5'
      }`}
    >
      {/* Top Merchant Line */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
        <div className="min-w-0 text-left">
          <div className="text-[11px] font-bold text-emerald-700 truncate">{qr.channelLabel}</div>
          <div className={`font-extrabold text-slate-900 truncate ${size === 'large' ? 'text-base' : 'text-xs'}`}>
            {qr.merchantName}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] font-semibold text-slate-500">Exact Amount</div>
          <div
            data-testid="merchant-qr-amount"
            className={`font-mono-num font-extrabold text-emerald-700 ${
              size === 'large' ? 'text-2xl' : 'text-base'
            }`}
          >
            {formatPeso(qr.amount)}
          </div>
        </div>
      </div>

      {/* QR Graphic or Standee Image or Wallet Slip */}
      <div className="flex flex-col items-center justify-center gap-2">
        {qr.mode === 'emvco' && qr.qrPayload && (
          <>
            <QrCodeGraphic
              value={qr.qrPayload}
              size={qrSize}
              label={`${qr.channelLabel} QR for ${formatPeso(qr.amount)}`}
              className="p-2 shadow-xs"
            />
            <div className="text-[11px] font-semibold text-slate-600 text-center">
              {qr.isDynamicAmount
                ? `Exact ${formatPeso(qr.amount)} encoded in QR — scan with GCash, Maya, or Bank app`
                : 'Scan with your e-wallet or banking app and enter the exact amount'}
            </div>
          </>
        )}

        {qr.mode === 'image' && qr.qrImageDataUrl && (
          <>
            <img
              src={qr.qrImageDataUrl}
              alt={`${qr.channelLabel} merchant payment QR`}
              data-testid="merchant-qr-image"
              className="rounded-xl border border-slate-200 bg-white object-contain p-1.5"
              style={{ width: qrSize, height: qrSize }}
            />
            <div className="text-[11px] font-semibold text-slate-600 text-center">
              Scan merchant QR and confirm exact amount <span className="font-mono-num font-bold text-slate-900">{formatPeso(qr.amount)}</span>
            </div>
          </>
        )}

        {qr.mode === 'manual' && (
          <div className="w-full rounded-xl bg-slate-50 border border-slate-200 p-3 text-center space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <Smartphone className="w-4 h-4 text-emerald-600" />
              <span>Send via {qr.channelLabel}</span>
            </div>
            <div className="text-lg font-mono-num font-extrabold text-slate-900 tracking-wide">
              {qr.accountNumber}
            </div>
            <div className="text-[11px] text-slate-500">Account Name: {qr.merchantName}</div>
          </div>
        )}
      </div>

      {/* Account Number + Copy + Quick Edit Footer */}
      {(qr.accountNumber || onOpenSetup) && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 text-[11px]">
          {qr.accountNumber ? (
            <button
              type="button"
              onClick={handleCopyAccount}
              className="inline-flex items-center gap-1.5 font-mono-num font-bold text-slate-700 hover:text-slate-900 cursor-pointer"
              title="Copy account number"
            >
              {copiedAcct ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700">Copied {qr.accountNumber}</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                  <span>Acct: {qr.accountNumber}</span>
                </>
              )}
            </button>
          ) : (
            <span className="text-slate-400">QR Ph Active</span>
          )}

          {onOpenSetup && (
            <button
              type="button"
              onClick={onOpenSetup}
              className="text-emerald-700 hover:text-emerald-800 font-bold cursor-pointer"
            >
              Edit QR
            </button>
          )}
        </div>
      )}
    </div>
  );
};
