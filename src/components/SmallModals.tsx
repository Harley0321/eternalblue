import React, { useEffect, useState } from 'react';
import { AlertTriangle, Delete, Fingerprint, Lock, PauseCircle, RotateCcw, Scale, ShieldCheck, Trash2, X } from 'lucide-react';
import type { HeldOrder, Product, SaleRecord, StoreSettings } from '../types';
import { formatPeso, round2 } from '../utils/posMath';
import { fmtWait, getPinSecurityMeta, isValidPinOrPassword, isWeakPin, MAX_PIN_LENGTH, pinLockedFor, storePinInSettings, verifyPinWithSettings } from '../utils/pinSecurity';
import { isPasskeySupported, verifyLocalPasskey } from '../utils/cryptoVault';
import { ProductIconBadge } from './ProductIconBadge';
import { StoreEmblem } from './StoreEmblem';

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
            <Scale className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-extrabold text-slate-900">Enter Weight (kg)</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close weight modal"
            className="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center text-slate-600 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2.5">
            <ProductIconBadge product={product} size="md" />
            <div className="min-w-0">
              <div className="font-bold text-slate-900 text-sm truncate">{product.name}</div>
              <div className="text-xs text-slate-500">
                {formatPeso(unitPrice)} / kg · Stock: {product.stock} kg
              </div>
            </div>
          </div>

          <div className="grid grid-cols-6 gap-1.5">
            {[0.25, 0.5, 1, 1.5, 2, 5].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setWeightStr(String(preset))}
                className="py-1.5 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-800 text-xs font-bold font-mono-num cursor-pointer"
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
              onFocus={(e) => e.target.select()}
              value={weightStr}
              onChange={(e) => setWeightStr(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-lg font-extrabold font-mono-num focus:border-emerald-600 focus:outline-none"
            />
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 flex items-center justify-between text-xs">
            <span className="font-semibold text-emerald-800">Line Total</span>
            <span className="text-base font-extrabold font-mono-num text-emerald-700">{formatPeso(est)}</span>
          </div>

          {error && <div className="text-xs text-rose-600 font-semibold">{error}</div>}
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
            className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold cursor-pointer"
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
          <button
            type="button"
            onClick={onClose}
            aria-label="Close hold modal"
            className="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center cursor-pointer"
          >
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
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:border-emerald-600 focus:outline-none"
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
          <button
            type="button"
            onClick={onClose}
            aria-label="Close parked orders"
            className="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-2.5">
          {heldOrders.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-400">No parked orders right now.</div>
          ) : (
            heldOrders.map((h) => {
              const preview = h.items
                .slice(0, 3)
                .map((it) => `${it.name} ×${it.qty}`)
                .join(', ');
              const extra = h.items.length > 3 ? ` +${h.items.length - 3} more` : '';
              return (
                <div key={h.id} className="border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-slate-900 truncate">
                      {h.label ? h.label : `Order ${h.id}`}
                    </div>
                    <div className="text-xs text-slate-500">
                      {h.time} · {h.items.length} line(s) ·{' '}
                      <span className="font-mono-num font-bold text-emerald-700">{formatPeso(h.total)}</span>
                      {h.isSeniorPwd && <span className="text-amber-700 font-semibold"> · SC/PWD</span>}
                      {h.priceMode === 'wholesale' && (
                        <span className="text-indigo-700 font-semibold"> · Wholesale</span>
                      )}
                    </div>
                    {preview && (
                      <div className="text-[11px] text-slate-500 truncate mt-0.5">
                        {preview}
                        {extra}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onRecall(h.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Recall
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteHeld(h.id)}
                      aria-label={`Delete held order ${h.label || h.id}`}
                      className="w-8 h-8 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 4. PinModal (Set first-time PIN, Verify PIN, or Lockscreen Mode)           */
/* -------------------------------------------------------------------------- */
interface PinModalProps {
  open: boolean;
  mode: 'unlock' | 'setup';
  persistent?: boolean;
  title?: string;
  subtitle?: string;
  settings: StoreSettings;
  onClose: () => void;
  onSuccess: (updatedSettings?: StoreSettings, meta?: { viaPasskey?: boolean; upgradedAlgo?: boolean }) => void;
  onPinFail?: (lockedOutNow?: boolean, context?: string) => void;
}

export const PinModal: React.FC<PinModalProps> = ({
  open,
  mode,
  persistent = false,
  title,
  subtitle,
  settings,
  onClose,
  onSuccess,
  onPinFail,
}) => {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [allowWeak, setAllowWeak] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [lockRemainingSec, setLockRemainingSec] = useState(0);

  useEffect(() => {
    if (open) {
      setPin('');
      setConfirmPin('');
      setAllowWeak(false);
      setError('');
      setLockRemainingSec(pinLockedFor());
    }
  }, [open, mode]);

  useEffect(() => {
    if (!open || mode !== 'unlock') return;
    const tid = window.setInterval(() => {
      setLockRemainingSec(pinLockedFor());
    }, 1000);
    return () => window.clearInterval(tid);
  }, [open, mode]);

  if (!open) return null;

  const pinMeta = getPinSecurityMeta(settings);
  const hasPasskey =
    mode === 'unlock' &&
    Boolean(settings.passkeyCredId && settings.passkeyPubKeySpki) &&
    isPasskeySupported();

  const handlePasskeyUnlock = async () => {
    if (!settings.passkeyCredId || !settings.passkeyPubKeySpki) return;
    setError('');
    setBusy(true);
    try {
      const ok = await verifyLocalPasskey(settings.passkeyCredId, settings.passkeyPubKeySpki);
      if (!ok) {
        setError('Biometric / Passkey verification did not pass.');
        onPinFail?.(false, 'Passkey verification failed');
        return;
      }
      onSuccess(undefined, { viaPasskey: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Passkey prompt cancelled or unavailable.';
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'setup') {
        if (!isValidPinOrPassword(pin)) {
          setError('PIN / Password must be 4 to 15 characters (no spaces).');
          return;
        }
        if (pin !== confirmPin) {
          setError('PIN entries do not match.');
          return;
        }
        const weak = isWeakPin(pin);
        if (weak && !allowWeak) {
          setError('PIN is weak (repeated, year, or sequential). Choose a stronger PIN or check the confirmation box.');
          return;
        }
        const next = await storePinInSettings(settings, pin, weak);
        onSuccess(next);
        return;
      }

      const res = await verifyPinWithSettings(pin, settings);
      if (!res.ok) {
        setError(res.error || 'Incorrect PIN.');
        onPinFail?.(res.lockedOutNow, persistent ? 'Terminal lockscreen' : 'Settings unlock');
        return;
      }
      onSuccess(res.upgradedSettings, { upgradedAlgo: res.upgradedAlgo });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${
        persistent ? 'bg-slate-950/95 backdrop-blur-md' : 'bg-slate-900/55'
      }`}
      onClick={() => {
        if (!persistent) onClose();
      }}
    >
      <form
        data-testid={persistent ? 'terminal-lock-modal' : 'pin-modal'}
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xs bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden"
      >
        {persistent && (
          <div className="px-4 py-2.5 bg-slate-900 text-white flex items-center gap-2.5 border-b border-slate-800">
            <StoreEmblem storeName={settings.storeName} storeIcon={settings.storeIcon} size="sm" />
            <div className="min-w-0">
              <div className="font-extrabold text-xs text-white truncate">{settings.storeName}</div>
              {settings.storeTagline && (
                <div className="text-[10px] text-slate-400 truncate">{settings.storeTagline}</div>
              )}
            </div>
          </div>
        )}
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {mode === 'setup' ? (
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
            ) : (
              <Lock className="w-4 h-4 text-slate-700" />
            )}
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 leading-tight">
                {title || (mode === 'setup' ? 'Create Manager PIN' : persistent ? 'POS Terminal Locked' : 'Enter Manager PIN')}
              </h3>
              <div className="text-[10px] font-semibold text-emerald-700 font-mono-num">
                {mode === 'setup'
                  ? 'PBKDF2-SHA512 · 310,000 rounds'
                  : pinMeta.isLatestAlgo
                    ? 'PBKDF2-SHA512 · 310k'
                    : pinMeta.hasPin
                      ? `${pinMeta.algo} · Auto-Upgrades`
                      : 'Security Setup'}
              </div>
            </div>
          </div>
          {!persistent && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close PIN modal"
              className="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="p-4 space-y-3 text-xs">
          <p className="text-slate-600">
            {subtitle ||
              (mode === 'setup'
                ? 'Protect Store Settings, Voids, and Data Reset with a PBKDF2-SHA512 encrypted Manager PIN.'
                : persistent
                  ? 'Enter your Manager PIN or verify with Passkey to resume register operations.'
                  : 'Enter your Manager PIN to continue.')}
          </p>

          <div>
            <label className="block font-bold text-slate-700 mb-1">
              {mode === 'setup' ? 'New PIN / Password (4–15 chars)' : 'Manager PIN / Password'}
            </label>
            <input
              data-testid="pin-modal-input"
              type="password"
              maxLength={MAX_PIN_LENGTH}
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\s+/g, '').slice(0, MAX_PIN_LENGTH))}
              placeholder="••••"
              className={`w-full px-3 py-2.5 rounded-xl border border-slate-300 text-center font-mono-num focus:border-emerald-600 focus:outline-none ${
                pin.length > 10 ? 'text-sm tracking-[0.15em]' : 'text-lg tracking-[0.3em]'
              }`}
            />
          </div>

          {mode === 'setup' && (
            <>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Confirm PIN / Password</label>
                <input
                  type="password"
                  maxLength={MAX_PIN_LENGTH}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\s+/g, '').slice(0, MAX_PIN_LENGTH))}
                  placeholder="••••"
                  className={`w-full px-3 py-2.5 rounded-xl border border-slate-300 text-center font-mono-num focus:border-emerald-600 focus:outline-none ${
                    confirmPin.length > 10 ? 'text-sm tracking-[0.15em]' : 'text-lg tracking-[0.3em]'
                  }`}
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
                  <span>Weak PIN / Password warning. Check to confirm anyway.</span>
                </label>
              )}
            </>
          )}

          {mode === 'unlock' && (
            <div data-testid="pin-keypad" className="grid grid-cols-3 gap-1.5 pt-1">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  disabled={busy}
                  data-testid={`pin-key-${digit}`}
                  onClick={() => setPin((prev) => (prev.length < MAX_PIN_LENGTH ? prev + digit : prev))}
                  className="min-h-[44px] rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-[0.97] text-slate-900 font-mono-num font-extrabold text-base cursor-pointer disabled:opacity-45"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                disabled={busy || pin.length === 0}
                onClick={() => setPin('')}
                className="min-h-[44px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs cursor-pointer disabled:opacity-45"
              >
                Clear
              </button>
              <button
                type="button"
                disabled={busy}
                data-testid="pin-key-0"
                onClick={() => setPin((prev) => (prev.length < MAX_PIN_LENGTH ? prev + '0' : prev))}
                className="min-h-[44px] rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-[0.97] text-slate-900 font-mono-num font-extrabold text-base cursor-pointer disabled:opacity-45"
              >
                0
              </button>
              <button
                type="button"
                disabled={busy || pin.length === 0}
                aria-label="Backspace PIN"
                onClick={() => setPin((prev) => prev.slice(0, -1))}
                className="min-h-[44px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer disabled:opacity-45"
              >
                <Delete className="w-4 h-4" />
              </button>
            </div>
          )}

          {mode === 'unlock' && lockRemainingSec > 0 && (
            <div className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
              PIN cooldown active: wait {fmtWait(lockRemainingSec)} before trying again.
            </div>
          )}

          {hasPasskey && (
            <button
              type="button"
              disabled={busy}
              onClick={handlePasskeyUnlock}
              className="w-full py-2.5 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-800 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Fingerprint className="w-4 h-4 text-indigo-600" />
              Unlock with Biometric / Passkey
            </button>
          )}

          {error && <div className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-2">{error}</div>}
        </div>

        <div className="px-4 py-3 border-t border-slate-200 flex gap-2">
          {!persistent && (
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 cursor-pointer">
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={busy}
            className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold cursor-pointer disabled:opacity-50"
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
  onPinFail?: (lockedOutNow?: boolean, context?: string) => void;
}

export const VoidSaleModal: React.FC<VoidSaleModalProps> = ({
  sale,
  settings,
  onClose,
  onConfirmVoid,
  onPinFail,
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
          onPinFail?.(res.lockedOutNow, `Void ${sale.receiptNo}`);
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
        <div className="px-4 py-3 border-b border-rose-200 bg-rose-50 flex items-center justify-between">
          <div className="flex items-center gap-2 text-rose-900">
            <AlertTriangle className="w-4 h-4 text-rose-600" />
            <h3 className="text-sm font-extrabold">Void Receipt {sale.receiptNo}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close void modal"
            className="w-8 h-8 rounded-lg hover:bg-rose-100 flex items-center justify-center cursor-pointer"
          >
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
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:border-emerald-600 focus:outline-none"
            />
          </div>

          {hasPin && (
            <div>
              <label className="block font-bold text-slate-700 mb-1">Manager PIN / Password</label>
              <input
                type="password"
                maxLength={MAX_PIN_LENGTH}
                autoFocus
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\s+/g, '').slice(0, MAX_PIN_LENGTH))}
                placeholder="••••"
                className={`w-full px-3 py-2 rounded-xl border border-slate-300 text-center font-mono-num ${
                  pin.length > 10 ? 'text-sm tracking-[0.15em]' : 'text-base tracking-[0.3em]'
                }`}
              />
            </div>
          )}

          {error && <div className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-2">{error}</div>}
        </div>

        <div className="px-4 py-3 border-t border-slate-200 flex gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 cursor-pointer">
            Keep Sale
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold cursor-pointer disabled:opacity-50"
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
  onPinFail?: (lockedOutNow?: boolean, context?: string) => void;
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
  onPinFail,
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
          onPinFail?.(res.lockedOutNow, title);
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
          <button
            type="button"
            onClick={onClose}
            aria-label="Close confirmation"
            className="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 text-xs text-slate-700">
          <p>{message}</p>
          {hasPin && (
            <div>
              <label className="block font-bold text-slate-700 mb-1">Enter Manager PIN / Password to confirm</label>
              <input
                type="password"
                maxLength={MAX_PIN_LENGTH}
                autoFocus
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\s+/g, '').slice(0, MAX_PIN_LENGTH))}
                placeholder="••••"
                className={`w-full px-3 py-2 rounded-xl border border-slate-300 text-center font-mono-num ${
                  pin.length > 10 ? 'text-sm tracking-[0.15em]' : 'text-base tracking-[0.3em]'
                }`}
              />
            </div>
          )}
          {error && <div className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-2">{error}</div>}
        </div>

        <div className="px-4 py-3 border-t border-slate-200 flex gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 cursor-pointer">
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className={`flex-1 py-2 rounded-xl text-white text-xs font-extrabold cursor-pointer disabled:opacity-50 ${
              danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-500'
            }`}
          >
            {busy ? 'Checking…' : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
};
