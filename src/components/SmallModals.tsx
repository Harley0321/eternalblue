import React, { useEffect, useState } from 'react';
import { AlertTriangle, Lock, PauseCircle, RotateCcw, Scale, ShieldCheck, Trash2, X } from 'lucide-react';
import type { HeldOrder, Product, SaleRecord, StoreSettings } from '../types';
import { formatPeso, round2 } from '../utils/posMath';
import { isWeakPin, storePinInSettings, verifyPinWithSettings } from '../utils/pinSecurity';

/* -------------------------------------------------------------------------- */
/* 1. WeightModal                                                             */
/* -------------------------------------------------------------------------- */
interface WeightModalProps {
  product: Product | null;
  unitPrice: number;
  onClose: () => void;
  onConfirm: (productId: string, weightKg: number) => void;
}

export const WeightModal: React.FC<WeightModalProps> = ({
  product,
  unitPrice,
  onClose,
  onConfirm,
}) => {
  const [weightStr, setWeightStr] = useState('1.000');
  const [error, setError] = useState('');

  useEffect(() => {
    if (product) {
      setWeightStr('1.000');
      setError('');
    }
  }, [product]);

  if (!product) return null;

  const qty = parseFloat(weightStr) || 0;
  const est = round2(qty * unitPrice);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!(qty > 0)) {
      setError('Enter a weight greater than 0 kg.');
      return;
    }
    onConfirm(product.id, Number(qty.toFixed(3)));
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-xl border border-slate-200 overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-extrabold text-slate-900">Enter Weight (kg)</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center text-slate-600 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <div className="font-bold text-slate-900 text-sm">{product.name}</div>
            <div className="text-xs text-slate-500">
              {formatPeso(unitPrice)} / kg · Stock: {product.stock} kg
            </div>
          </div>

          <div className="grid grid-cols-6 gap-1.5">
            {[0.25, 0.5, 1, 1.5, 2, 5].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setWeightStr(String(preset))}
                className="py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold font-mono-num cursor-pointer"
              >
                {preset}kg
              </button>
            ))}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Weight in Kilograms (kg)</label>
            <input
              type="number"
              step="0.001"
              min="0.001"
              autoFocus
              value={weightStr}
              onChange={(e) => setWeightStr(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-lg font-extrabold font-mono-num focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 flex items-center justify-between text-xs">
            <span className="font-semibold text-blue-800">Line Total</span>
            <span className="text-base font-extrabold font-mono-num text-blue-700">{formatPeso(est)}</span>
          </div>

          {error && <div className="text-xs text-red-600 font-semibold">{error}</div>}
        </div>

        <div className="px-4 py-3 border-t border-slate-200 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold cursor-pointer"
          >
            Add to Basket
          </button>
        </div>
      </form>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 2. HoldCartModal (optional customer label when parking)                    */
/* -------------------------------------------------------------------------- */
interface HoldCartModalProps {
  open: boolean;
  itemCount: number;
  total: number;
  onClose: () => void;
  onConfirmHold: (label?: string) => void;
}

export const HoldCartModal: React.FC<HoldCartModalProps> = ({
  open,
  itemCount,
  total,
  onClose,
  onConfirmHold,
}) => {
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (open) setLabel('');
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onConfirmHold(label.trim() || undefined);
        }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PauseCircle className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-extrabold text-slate-900">Park / Hold Order</h3>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3 text-xs">
          <div className="text-slate-600">
            Parking <span className="font-bold text-slate-900">{itemCount} item(s)</span> totaling{' '}
            <span className="font-bold font-mono-num text-slate-900">{formatPeso(total)}</span>.
          </div>
          <div>
            <label className="block font-bold text-slate-700 mb-1">Customer Name / Note (optional)</label>
            <input
              type="text"
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Ate Maria - Blue Shirt"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>
        </div>
        <div className="px-4 py-3 border-t border-slate-200 flex gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 cursor-pointer">
            Cancel
          </button>
          <button type="submit" className="flex-1 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-extrabold cursor-pointer">
            Park Order
          </button>
        </div>
      </form>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 3. HeldOrdersModal                                                         */
/* -------------------------------------------------------------------------- */
interface HeldOrdersModalProps {
  open: boolean;
  heldOrders: HeldOrder[];
  onClose: () => void;
  onRecall: (id: string) => void;
  onDeleteHeld: (id: string) => void;
}

export const HeldOrdersModal: React.FC<HeldOrdersModalProps> = ({
  open,
  heldOrders,
  onClose,
  onRecall,
  onDeleteHeld,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl border border-slate-200 overflow-hidden max-h-[85vh] flex flex-col"
      >
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-slate-900">Parked / Held Orders ({heldOrders.length})</h3>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-2.5">
          {heldOrders.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-400">No parked orders right now.</div>
          ) : (
            heldOrders.map((h) => (
              <div key={h.id} className="border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold text-sm text-slate-900 truncate">
                    {h.label ? h.label : `Order ${h.id}`}
                  </div>
                  <div className="text-xs text-slate-500">
                    {h.time} · {h.items.length} line(s) ·{' '}
                    <span className="font-mono-num font-bold text-slate-800">{formatPeso(h.total)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onRecall(h.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Recall
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteHeld(h.id)}
                    aria-label="Delete held order"
                    className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 flex items-center justify-center cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 4. PinModal (Set first-time PIN or Verify PIN to unlock)                   */
/* -------------------------------------------------------------------------- */
interface PinModalProps {
  open: boolean;
  mode: 'unlock' | 'setup';
  title?: string;
  subtitle?: string;
  settings: StoreSettings;
  onClose: () => void;
  onSuccess: (updatedSettings?: StoreSettings) => void;
}

export const PinModal: React.FC<PinModalProps> = ({
  open,
  mode,
  title,
  subtitle,
  settings,
  onClose,
  onSuccess,
}) => {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [allowWeak, setAllowWeak] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setPin('');
      setConfirmPin('');
      setAllowWeak(false);
      setError('');
    }
  }, [open, mode]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'setup') {
        if (!/^\d{4,8}$/.test(pin)) {
          setError('PIN must be 4 to 8 digits.');
          return;
        }
        if (pin !== confirmPin) {
          setError('PIN entries do not match.');
          return;
        }
        const weak = isWeakPin(pin);
        if (weak && !allowWeak) {
          setError('PIN is weak (repeated or sequential). Choose a stronger PIN or check the confirmation box.');
          return;
        }
        const next = await storePinInSettings(settings, pin, weak);
        onSuccess(next);
        return;
      }

      const res = await verifyPinWithSettings(pin, settings);
      if (!res.ok) {
        setError(res.error || 'Incorrect PIN.');
        return;
      }
      onSuccess(res.upgradedSettings);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/55 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xs bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {mode === 'setup' ? (
              <ShieldCheck className="w-4 h-4 text-blue-600" />
            ) : (
              <Lock className="w-4 h-4 text-slate-700" />
            )}
            <h3 className="text-sm font-extrabold text-slate-900">
              {title || (mode === 'setup' ? 'Create Manager PIN' : 'Enter Manager PIN')}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 text-xs">
          <p className="text-slate-600">
            {subtitle ||
              (mode === 'setup'
                ? 'Protect Store Settings, Voids, and Data Reset with a 4–8 digit Manager PIN.'
                : 'Enter your Manager PIN to continue.')}
          </p>

          <div>
            <label className="block font-bold text-slate-700 mb-1">
              {mode === 'setup' ? 'New PIN (4–8 digits)' : 'Manager PIN'}
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={8}
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-center text-lg tracking-[0.35em] font-mono-num focus:border-blue-600 focus:outline-none"
            />
          </div>

          {mode === 'setup' && (
            <>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Confirm PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-center text-lg tracking-[0.35em] font-mono-num focus:border-blue-600 focus:outline-none"
                />
              </div>
              {pin.length >= 4 && isWeakPin(pin) && (
                <label className="flex items-start gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowWeak}
                    onChange={(e) => setAllowWeak(e.target.checked)}
                    className="mt-0.5 accent-amber-600"
                  />
                  <span>Weak PIN warning. Check to confirm anyway.</span>
                </label>
              )}
            </>
          )}

          {error && <div className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-2">{error}</div>}
        </div>

        <div className="px-4 py-3 border-t border-slate-200 flex gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 cursor-pointer">
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold cursor-pointer disabled:opacity-50"
          >
            {busy ? 'Checking…' : mode === 'setup' ? 'Save PIN' : 'Unlock'}
          </button>
        </div>
      </form>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 5. VoidSaleModal (PIN-protected void with reason)                          */
/* -------------------------------------------------------------------------- */
interface VoidSaleModalProps {
  sale: SaleRecord | null;
  settings: StoreSettings;
  onClose: () => void;
  onConfirmVoid: (receiptNo: string, reason: string, upgradedSettings?: StoreSettings) => void;
}

export const VoidSaleModal: React.FC<VoidSaleModalProps> = ({
  sale,
  settings,
  onClose,
  onConfirmVoid,
}) => {
  const [reason, setReason] = useState('Customer returned / wrong item');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (sale) {
      setReason('Customer returned / wrong item');
      setPin('');
      setError('');
    }
  }, [sale]);

  if (!sale) return null;

  const hasPin = !!(settings.adminPinHash || settings.adminPin);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      let upgraded: StoreSettings | undefined;
      if (hasPin) {
        const res = await verifyPinWithSettings(pin, settings);
        if (!res.ok) {
          setError(res.error || 'Incorrect Manager PIN');
          return;
        }
        upgraded = res.upgradedSettings;
      }
      onConfirmVoid(sale.receiptNo, reason.trim() || 'Voided by manager', upgraded);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/55 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-red-200 bg-red-50 flex items-center justify-between">
          <div className="flex items-center gap-2 text-red-900">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <h3 className="text-sm font-extrabold">Void Receipt {sale.receiptNo}</h3>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-red-100 flex items-center justify-center cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 text-xs">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
            <div className="font-bold text-slate-900">
              {formatPeso(sale.grandTotal)} · {sale.paymentMethod}
            </div>
            <div className="text-slate-500">
              {sale.dateFormatted} · {sale.items.length} item(s) will be restored to stock.
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Reason for Void</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:border-blue-600 focus:outline-none"
            />
          </div>

          {hasPin && (
            <div>
              <label className="block font-bold text-slate-700 mb-1">Manager PIN</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                autoFocus
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-center text-base tracking-[0.35em] font-mono-num"
              />
            </div>
          )}

          {error && <div className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-2">{error}</div>}
        </div>

        <div className="px-4 py-3 border-t border-slate-200 flex gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 cursor-pointer">
            Keep Sale
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold cursor-pointer disabled:opacity-50"
          >
            {busy ? 'Voiding…' : 'Confirm Void & Restore Stock'}
          </button>
        </div>
      </form>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 6. ConfirmModal (Replaces browser confirm() cleanly inside iframe)         */
/* -------------------------------------------------------------------------- */
interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  requirePin?: boolean;
  settings?: StoreSettings;
  onClose: () => void;
  onConfirm: (upgradedSettings?: StoreSettings) => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  requirePin = false,
  settings,
  onClose,
  onConfirm,
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setPin('');
      setError('');
    }
  }, [open]);

  if (!open) return null;

  const hasPin = requirePin && settings && !!(settings.adminPinHash || settings.adminPin);

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (hasPin && settings) {
      setBusy(true);
      try {
        const res = await verifyPinWithSettings(pin, settings);
        if (!res.ok) {
          setError(res.error || 'Incorrect Manager PIN');
          return;
        }
        onConfirm(res.upgradedSettings);
        return;
      } finally {
        setBusy(false);
      }
    }
    onConfirm();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/55 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleConfirm}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-slate-900">{title}</h3>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 text-xs text-slate-700">
          <p>{message}</p>
          {hasPin && (
            <div>
              <label className="block font-bold text-slate-700 mb-1">Enter Manager PIN to confirm</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                autoFocus
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-center text-base tracking-[0.35em] font-mono-num"
              />
            </div>
          )}
          {error && <div className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-2">{error}</div>}
        </div>

        <div className="px-4 py-3 border-t border-slate-200 flex gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 cursor-pointer">
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className={`flex-1 py-2 rounded-xl text-white text-xs font-extrabold cursor-pointer disabled:opacity-50 ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {busy ? 'Checking…' : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
};
