import React, { useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ImagePlus,
  QrCode,
  Sparkles,
  Trash2,
  Upload,
  AlertTriangle,
} from 'lucide-react';
import type { StoreSettings } from '../types';
import {
  buildMerchantQrPhString,
  parseEmvCoQr,
  resolveCheckoutQrState,
} from '../utils/paymentQr';
import { processUploadedQrImage, QrCodeGraphic } from './QrCodeGraphic';

interface MerchantQrConfigPanelProps {
  draft: StoreSettings;
  onChangeDraft: (patch: Partial<StoreSettings>) => void;
  compact?: boolean;
  onSaveAndClose?: (patched: StoreSettings) => void;
  onCancel?: () => void;
}

const CHANNEL_PRESETS = ['QR Ph', 'GCash', 'Maya', 'GoTyme', 'BPI / BDO'] as const;

export const MerchantQrConfigPanel: React.FC<MerchantQrConfigPanelProps> = ({
  draft,
  onChangeDraft,
  compact = false,
  onSaveAndClose,
  onCancel,
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');

  const emvValidation = useMemo(() => {
    const raw = String(draft.qrEmvPayload || '').trim();
    if (!raw) return null;
    if (!raw.startsWith('000201')) {
      return {
        kind: 'custom' as const,
        message: 'Custom QR link/text saved (static QR code, no auto-filled ₱ amount)',
      };
    }
    const parsed = parseEmvCoQr(raw);
    if (!parsed.ok) {
      return { kind: 'error' as const, message: parsed.error };
    }
    if (!parsed.crcValid) {
      return {
        kind: 'error' as const,
        message: 'CRC-16 checksum mismatch. Re-check the pasted QR Ph text.',
      };
    }
    return {
      kind: 'valid' as const,
      message: `Valid ${parsed.channelLabel} · ${parsed.merchantName} (${parsed.merchantCity}) · Dynamic ₱ enabled`,
      parsed,
    };
  }, [draft.qrEmvPayload]);

  const livePreview = useMemo(() => resolveCheckoutQrState(draft, 150), [draft]);

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadBusy(true);
    setUploadStatus('');
    try {
      const { dataUrl, decodedPayload } = await processUploadedQrImage(file);
      const patch: Partial<StoreSettings> = { qrImageDataUrl: dataUrl };
      if (decodedPayload) {
        patch.qrEmvPayload = decodedPayload;
        const parsed = parseEmvCoQr(decodedPayload);
        if (parsed.ok && parsed.crcValid) {
          if (!draft.qrMerchantName && parsed.merchantName) {
            patch.qrMerchantName = parsed.merchantName;
          }
          if (!draft.qrPayLabel && parsed.channelLabel) {
            patch.qrPayLabel = parsed.channelLabel;
          }
          setUploadStatus('QR Ph payload extracted from image — exact checkout amounts enabled!');
        } else {
          setUploadStatus('QR image saved and decoded cleanly.');
        }
      } else {
        setUploadStatus('QR standee image compressed and saved cleanly.');
      }
      onChangeDraft(patch);
    } catch (err) {
      setUploadStatus(err instanceof Error ? err.message : 'Failed to process QR image.');
    } finally {
      setUploadBusy(false);
    }
  };

  const handleGenerateSampleQrPh = () => {
    const sample = buildMerchantQrPhString({
      merchantName: (draft.qrMerchantName || draft.storeName || 'STORE MERCHANT').toUpperCase(),
      merchantCity: 'PANGASINAN',
      merchantAccount: draft.qrAccountNumber || '09171234567',
    });
    onChangeDraft({
      qrPayLabel: draft.qrPayLabel || 'QR Ph',
      qrMerchantName: draft.qrMerchantName || draft.storeName || 'EternalBlue Mart',
      qrEmvPayload: sample,
    });
    setUploadStatus('Generated verifiable sample EMVCo QR Ph payload for testing.');
  };

  return (
    <div className="space-y-3 text-xs">
      {/* Channel Selector */}
      <div className="space-y-1.5">
        <label className="block font-semibold text-slate-700">Payment Channel / Wallet Label</label>
        <div className="flex flex-wrap gap-1.5">
          {CHANNEL_PRESETS.map((preset) => {
            const active = (draft.qrPayLabel || 'QR Ph') === preset;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => onChangeDraft({ qrPayLabel: preset })}
                className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                  active
                    ? 'bg-slate-900 text-emerald-400'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {preset}
              </button>
            );
          })}
        </div>
      </div>

      {/* Merchant Name & Account Number */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div>
          <label htmlFor="qr-merchant-name" className="block font-semibold text-slate-700 mb-1">
            Merchant / Account Name
          </label>
          <input
            id="qr-merchant-name"
            data-testid="qr-merchant-name-input"
            type="text"
            value={draft.qrMerchantName || ''}
            onChange={(e) => onChangeDraft({ qrMerchantName: e.target.value })}
            placeholder={draft.storeName || 'e.g. EternalBlue Mart'}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold focus:border-emerald-600 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="qr-account-number" className="block font-semibold text-slate-700 mb-1">
            GCash / Maya / Bank Acct #
          </label>
          <input
            id="qr-account-number"
            data-testid="qr-account-number-input"
            type="text"
            value={draft.qrAccountNumber || ''}
            onChange={(e) => onChangeDraft({ qrAccountNumber: e.target.value })}
            placeholder="0917-xxx-xxxx"
            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-mono-num focus:border-emerald-600 focus:outline-none"
          />
        </div>
      </div>

      {/* Upload Standee QR + EMVCo Payload */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-bold text-slate-800 flex items-center gap-1.5">
            <QrCode className="w-3.5 h-3.5 text-emerald-600" />
            <span>QR Ph Standee / EMVCo Payload</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={uploadBusy}
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-[11px] cursor-pointer disabled:opacity-50"
            >
              {uploadBusy ? <Upload className="w-3 h-3 animate-spin" /> : <ImagePlus className="w-3 h-3" />}
              <span>{uploadBusy ? 'Decoding…' : 'Upload QR Image'}</span>
            </button>
            <button
              type="button"
              data-testid="generate-sample-qrph-btn"
              onClick={handleGenerateSampleQrPh}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-800 font-bold text-[11px] cursor-pointer"
              title="Fill a valid sample EMVCo QR Ph payload to preview dynamic exact amounts"
            >
              <Sparkles className="w-3 h-3" />
              <span>Sample QR Ph</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleImagePick}
              className="hidden"
            />
          </div>
        </div>

        <textarea
          rows={compact ? 2 : 3}
          data-testid="qr-emv-payload-input"
          value={draft.qrEmvPayload || ''}
          onChange={(e) => onChangeDraft({ qrEmvPayload: e.target.value })}
          placeholder="Paste static EMVCo / QR Ph string (starts with 000201...) for automatic exact ₱ checkout amounts, or upload a QR photo above."
          className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-mono text-[11px] focus:border-emerald-600 focus:outline-none"
        />

        {uploadStatus && (
          <div className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">
            {uploadStatus}
          </div>
        )}

        {emvValidation && (
          <div
            data-testid="qr-emv-validation"
            className={`text-[11px] font-semibold rounded-lg px-2.5 py-1.5 border flex items-center gap-1.5 ${
              emvValidation.kind === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : emvValidation.kind === 'valid'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-slate-100 border-slate-200 text-slate-700'
            }`}
          >
            {emvValidation.kind === 'error' ? (
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            )}
            <span className="leading-snug break-words">{emvValidation.message}</span>
          </div>
        )}

        {(draft.qrImageDataUrl || draft.qrEmvPayload) && (
          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2.5 min-w-0">
              {livePreview.mode === 'emvco' && livePreview.qrPayload && (
                <QrCodeGraphic value={livePreview.qrPayload} size={56} className="p-0.5 shrink-0" testId="settings-qr-preview" />
              )}
              {livePreview.mode === 'image' && livePreview.qrImageDataUrl && (
                <img
                  src={livePreview.qrImageDataUrl}
                  alt="Saved QR standee preview"
                  className="w-14 h-14 rounded-lg border border-slate-200 bg-white object-contain p-0.5 shrink-0"
                />
              )}
              <div className="min-w-0 text-[11px] text-slate-600">
                <div className="font-bold text-slate-800 truncate">
                  {livePreview.mode === 'emvco'
                    ? 'Preview: Dynamic ₱150.00 QR'
                    : livePreview.mode === 'image'
                      ? 'Saved Standee QR Image'
                      : 'Wallet Info Saved'}
                </div>
                <div className="truncate">{livePreview.merchantName}</div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                onChangeDraft({ qrImageDataUrl: '', qrEmvPayload: '' });
                setUploadStatus('');
              }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-rose-200 hover:bg-rose-50 text-rose-700 font-bold text-[11px] cursor-pointer shrink-0"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear QR</span>
            </button>
          </div>
        )}
      </div>

      {/* 2nd-Screen Greeting (full mode) */}
      {!compact && (
        <div>
          <label htmlFor="customer-display-greeting" className="block font-semibold text-slate-700 mb-1">
            2nd-Screen Welcome Greeting
          </label>
          <input
            id="customer-display-greeting"
            data-testid="customer-display-greeting-input"
            type="text"
            value={draft.customerDisplayGreeting || ''}
            onChange={(e) => onChangeDraft({ customerDisplayGreeting: e.target.value })}
            placeholder={`Welcome to ${draft.storeName || 'EternalBlue Mart'}!`}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs focus:border-emerald-600 focus:outline-none"
          />
        </div>
      )}

      {/* Compact Quick Save bar when embedded inside CheckoutModal */}
      {onSaveAndClose && (
        <div className="flex items-center justify-end gap-2 pt-1">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 font-bold cursor-pointer"
            >
              Back
            </button>
          )}
          <button
            type="button"
            data-testid="save-quick-qr-setup-btn"
            onClick={() => onSaveAndClose(draft)}
            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
          >
            Save Store QR
          </button>
        </div>
      )}
    </div>
  );
};
