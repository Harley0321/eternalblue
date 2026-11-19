import React, { useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Monitor,
  QrCode,
  Settings2,
  TabletSmartphone,
  X,
} from 'lucide-react';
import type { StoreSettings } from '../types';
import { buildCustomerDisplayUrl } from '../utils/customerDisplaySync';
import { resolveCheckoutQrState } from '../utils/paymentQr';

interface CustomerDisplayHubModalProps {
  open: boolean;
  settings: StoreSettings;
  onFlipToCustomerView: () => void;
  onOpenSettingsQr: () => void;
  onClose: () => void;
}

export const CustomerDisplayHubModal: React.FC<CustomerDisplayHubModalProps> = ({
  open,
  settings,
  onFlipToCustomerView,
  onOpenSettingsQr,
  onClose,
}) => {
  const [copiedUrl, setCopiedUrl] = useState(false);

  if (!open) return null;

  const displayUrl =
    typeof window !== 'undefined' ? buildCustomerDisplayUrl(window.location.href) : '?display=customer';
  const qrCheck = resolveCheckoutQrState(settings, 100);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(displayUrl);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 1800);
    } catch {
      // ignore clipboard restriction
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[1px] flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid="customer-display-hub-modal"
        className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Monitor className="w-4 h-4 text-emerald-600" />
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">2nd-Screen Customer Display</h3>
              <p className="text-[11px] text-slate-500">Live counter sync · Cash, Wholesale &amp; Instant Payment QR</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close customer display options"
            className="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center text-slate-600 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto text-xs">
          {/* Option 1: Single-device counter flip */}
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                  <TabletSmartphone className="w-4 h-4 text-emerald-600" />
                  <span>Flip This Screen to Customer View</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                  Ideal for a single tablet, laptop, or phone counter. Shows large basket totals and scannable payment QR facing your buyer.
                </p>
              </div>
            </div>
            <button
              type="button"
              data-testid="launch-flip-customer-display-btn"
              onClick={() => {
                onClose();
                onFlipToCustomerView();
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold cursor-pointer transition-colors"
            >
              Show Customer View Now
            </button>
          </div>

          {/* Option 2: Dual monitor / separate window */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2.5">
            <div>
              <div className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                <Monitor className="w-4 h-4 text-slate-700" />
                <span>Open 2nd-Monitor Customer Window</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                For PCs or tablets with a second screen in the same browser. Updates instantaneously offline as items are scanned or checked out.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={displayUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="open-customer-display-link"
                className="flex-1 min-w-[180px] inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-emerald-400 font-bold text-xs whitespace-nowrap"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open 2nd Window</span>
              </a>
              <button
                type="button"
                onClick={handleCopyUrl}
                className="inline-flex items-center gap-1.5 py-2 px-3 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs cursor-pointer whitespace-nowrap"
              >
                {copiedUrl ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Link</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Payment QR readiness status */}
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  qrCheck.mode !== 'unconfigured'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-amber-50 text-amber-700'
                }`}
              >
                <QrCode className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-slate-900 truncate">
                  {qrCheck.mode === 'emvco'
                    ? `Dynamic ${qrCheck.channelLabel} Ready`
                    : qrCheck.mode === 'image'
                      ? `Standee QR Image Saved (${qrCheck.channelLabel})`
                      : qrCheck.mode === 'manual'
                        ? `Wallet Details Ready (${qrCheck.channelLabel})`
                        : 'Merchant Payment QR Not Set Yet'}
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  {qrCheck.mode === 'emvco'
                    ? `${qrCheck.merchantName} · Auto-fills exact ₱ amount`
                    : qrCheck.mode !== 'unconfigured'
                      ? qrCheck.merchantName
                      : 'Configure QR Ph, GCash, or Maya once in Settings'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenSettingsQr();
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] shrink-0 cursor-pointer"
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>{qrCheck.mode === 'unconfigured' ? 'Set Up' : 'Configure'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
