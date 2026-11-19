import React, { useEffect, useState } from 'react';
import { Check, Delete, Lock } from 'lucide-react';
import { GlowingEmeraldStoreName } from '../components/CommonGraphics';
import { PosMath } from '../domain/posMath';
import { SecurityManager } from '../security/securityManager';
import { usePos } from '../state/PosContext';

const SecurePinPad: React.FC<{
  pin: string;
  isSettingPin: boolean;
  busy: boolean;
  error: string | null;
  lockoutUntilMs: number;
  onDigit: (d: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onSubmit: () => void;
}> = ({ pin, isSettingPin, busy, error, lockoutUntilMs, onDigit, onBackspace, onClear, onSubmit }) => {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setNowMs(Date.now());
    if (Date.now() >= lockoutUntilMs) return;
    const id = setInterval(() => {
      const cur = Date.now();
      setNowMs(cur);
      if (cur >= lockoutUntilMs) clearInterval(id);
    }, 500);
    return () => clearInterval(id);
  }, [lockoutUntilMs]);

  const remainingMs = Math.max(0, lockoutUntilMs - nowMs);
  const lockoutSecs = remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
  const lockedOut = lockoutSecs > 0;
  const slots = Math.min(8, Math.max(4, pin.length));

  return (
    <div className="w-full flex flex-col items-center">
      {/* Masked PIN dots */}
      <div
        className={`w-full bg-[#F8FAFC] border rounded-[14px] py-3.5 px-3 flex items-center ${
          error ? 'border-[#E11D48]' : 'border-[#E2E8F0]'
        }`}
      >
        <div className="flex-1 flex items-center justify-center gap-2.5">
          {Array.from({ length: slots }).map((_, i) => (
            <span
              key={i}
              className={`w-3.5 h-3.5 rounded-full transition-colors ${
                i < pin.length ? 'bg-[#059669]' : 'bg-[#CBD5E1]'
              }`}
            />
          ))}
        </div>
        {pin.length > 0 && !busy && (
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] font-bold text-[#64748B] hover:text-[#0F172A] px-1 cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>

      <div className="mt-2 min-h-[18px] text-center">
        {lockedOut ? (
          <span className="text-xs font-bold text-[#E11D48]">
            Locked for {lockoutSecs}s after repeated wrong PINs
          </span>
        ) : error ? (
          <span className="text-xs font-semibold text-[#E11D48]">{error}</span>
        ) : isSettingPin && pin.length >= 4 && SecurityManager.isPinWeak(pin) ? (
          <span className="text-[11px] font-semibold text-[#D97706]">
            Weak PIN pattern — consider a less common code
          </span>
        ) : (
          <span className="text-[11px] text-[#64748B]">
            {isSettingPin ? `Enter 4–8 digits (${pin.length}/8)` : 'Enter your 4–8 digit Manager PIN'}
          </span>
        )}
      </div>

      <div className="w-full mt-2.5 space-y-2">
        {[
          ['1', '2', '3'],
          ['4', '5', '6'],
          ['7', '8', '9'],
        ].map((row, rIdx) => (
          <div key={rIdx} className="grid grid-cols-3 gap-2.5">
            {row.map((digit) => (
              <button
                key={digit}
                type="button"
                disabled={busy || lockedOut || pin.length >= 8}
                onClick={() => onDigit(digit)}
                className="h-[52px] rounded-[14px] bg-[#F1F5F9] hover:bg-slate-200 disabled:bg-[#F8FAFC] border border-[#E2E8F0] font-mono font-extrabold text-xl text-[#0F172A] disabled:text-[#64748B] cursor-pointer disabled:cursor-not-allowed"
              >
                {digit}
              </button>
            ))}
          </div>
        ))}

        <div className="grid grid-cols-3 gap-2.5">
          <button
            type="button"
            disabled={busy || pin.length === 0}
            onClick={onBackspace}
            aria-label="Backspace"
            className="h-[52px] rounded-[14px] border border-[#E2E8F0] bg-white hover:bg-slate-50 disabled:opacity-40 flex items-center justify-center text-[#0F172A] cursor-pointer disabled:cursor-not-allowed"
          >
            <Delete size={20} />
          </button>
          <button
            type="button"
            disabled={busy || lockedOut || pin.length >= 8}
            onClick={() => onDigit('0')}
            className="h-[52px] rounded-[14px] bg-[#F1F5F9] hover:bg-slate-200 disabled:bg-[#F8FAFC] border border-[#E2E8F0] font-mono font-extrabold text-xl text-[#0F172A] disabled:text-[#64748B] cursor-pointer disabled:cursor-not-allowed"
          >
            0
          </button>
          <button
            type="button"
            disabled={busy || lockedOut || pin.length < 4}
            onClick={onSubmit}
            aria-label="Submit PIN"
            className="h-[52px] rounded-[14px] bg-[#059669] hover:bg-[#047857] disabled:bg-slate-300 flex items-center justify-center text-white cursor-pointer disabled:cursor-not-allowed"
          >
            {busy ? (
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Check size={22} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export const SmallModalsHost: React.FC = () => {
  const {
    state,
    setHoldCartOpen,
    holdCurrentCart,
    setHeldOrdersOpen,
    recallHeldOrder,
    deleteHeldOrder,
    closeVoidSale,
    confirmVoidSale,
    closePinModal,
    clearPinError,
    setAdminPin,
    verifyAndUnlock,
    dismissScannedPrompt,
    openProductModal,
  } = usePos();

  const [holdLabel, setHoldLabel] = useState('');
  const [voidReason, setVoidReason] = useState('');
  const [modalPin, setModalPin] = useState('');
  const [lockPin, setLockPin] = useState('');

  useEffect(() => {
    setModalPin('');
  }, [state.pinModalMode]);

  useEffect(() => {
    if (!state.holdCartModalOpen) setHoldLabel('');
  }, [state.holdCartModalOpen]);

  useEffect(() => {
    if (!state.voidSaleTarget) setVoidReason('');
  }, [state.voidSaleTarget]);

  return (
    <>
      {/* Hold Cart Modal */}
      {state.holdCartModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-3 shadow-xl">
            <h3 className="font-bold text-base text-[#0F172A]">Park / Hold Order</h3>
            <input
              type="text"
              value={holdLabel}
              onChange={(e) => setHoldLabel(e.target.value)}
              placeholder="Customer / Table Label"
              className="w-full px-3 py-2 text-xs rounded-xl border border-[#E2E8F0]"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setHoldCartOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#64748B] hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => holdCurrentCart(holdLabel)}
                className="px-4 py-2 rounded-xl bg-[#059669] text-white text-xs font-bold cursor-pointer"
              >
                Park Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Held Orders Modal */}
      {state.heldOrdersModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-3 shadow-xl">
            <h3 className="font-bold text-base text-[#0F172A]">
              Parked Orders ({state.heldOrders.length})
            </h3>
            {state.heldOrders.length === 0 ? (
              <p className="text-xs text-[#64748B]">No parked orders.</p>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-2">
                {state.heldOrders.map((h) => (
                  <div
                    key={h.id}
                    className="rounded-[10px] border border-[#E2E8F0] p-2.5 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-[13px] text-[#0F172A] truncate">
                        {h.label || h.id}
                      </div>
                      <div className="text-[11px] text-[#047857] font-mono">
                        {h.items.length} items · {PosMath.formatPeso(h.total)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => recallHeldOrder(h)}
                        className="px-3 py-1.5 rounded-lg bg-[#059669] text-white text-[11px] font-bold cursor-pointer"
                      >
                        Recall
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteHeldOrder(h.id)}
                        className="px-2 py-1.5 rounded-lg text-[#E11D48] font-bold text-sm hover:bg-rose-50 cursor-pointer"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setHeldOrdersOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-[#059669] hover:bg-emerald-50 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Void Sale Modal */}
      {state.voidSaleTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-3 shadow-xl">
            <h3 className="font-bold text-base text-[#E11D48]">
              Void Receipt {state.voidSaleTarget.receiptNo}?
            </h3>
            <p className="text-xs text-[#64748B]">
              Total {PosMath.formatPeso(state.voidSaleTarget.grandTotal)} will be voided and stock returned to inventory.
            </p>
            <input
              type="text"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Void Reason"
              className="w-full px-3 py-2 text-xs rounded-xl border border-[#E2E8F0]"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeVoidSale}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#64748B] hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmVoidSale(voidReason)}
                className="px-4 py-2 rounded-xl bg-[#E11D48] text-white text-xs font-bold cursor-pointer"
              >
                Confirm Void
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manager PIN Modal */}
      {state.pinModalMode && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[22px] w-full max-w-[360px] p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Lock size={19} className="text-[#059669]" />
                <span className="font-extrabold text-[17px] text-[#0F172A]">
                  {state.pinModalMode === 'setPin'
                    ? 'Set Manager PIN'
                    : state.pinModalMode === 'unlockVoid'
                    ? 'Authorize Void (PIN)'
                    : 'Manager PIN'}
                </span>
              </div>
              <button
                type="button"
                onClick={closePinModal}
                className="text-xs font-bold text-[#64748B] hover:text-[#0F172A] cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <SecurePinPad
              pin={modalPin}
              isSettingPin={state.pinModalMode === 'setPin'}
              busy={state.pinBusy}
              error={state.pinError}
              lockoutUntilMs={state.pinLockoutUntilMs}
              onDigit={(d) => {
                if (modalPin.length < 8) {
                  setModalPin((p) => p + d);
                  clearPinError();
                }
              }}
              onBackspace={() => {
                if (modalPin.length > 0) {
                  setModalPin((p) => p.slice(0, -1));
                  clearPinError();
                }
              }}
              onClear={() => {
                setModalPin('');
                clearPinError();
              }}
              onSubmit={() => {
                const entered = modalPin;
                setModalPin('');
                if (state.pinModalMode === 'setPin') void setAdminPin(entered);
                else if (state.pinModalMode) void verifyAndUnlock(entered, state.pinModalMode);
              }}
            />
          </div>
        </div>
      )}

      {/* Unknown Scanned Barcode Prompt */}
      {state.scannedProductPromptCode && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-3 shadow-xl">
            <h3 className="font-bold text-base text-[#0F172A]">Unknown Barcode</h3>
            <p className="text-xs text-[#64748B]">
              Barcode "{state.scannedProductPromptCode}" was not found in your catalog. Create a new product with this code?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={dismissScannedPrompt}
                className="px-4 py-2 rounded-xl border border-[#E2E8F0] text-xs font-semibold text-[#0F172A] cursor-pointer"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={() => {
                  const code = state.scannedProductPromptCode!;
                  dismissScannedPrompt();
                  openProductModal(null, code);
                }}
                className="px-4 py-2 rounded-xl bg-[#059669] text-white text-xs font-bold cursor-pointer"
              >
                Add New Product
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Terminal Locked Overlay */}
      {state.terminalLocked && (
        <div className="fixed inset-0 z-50 bg-[#020617]/97 flex items-center justify-center p-5">
          <div className="bg-white rounded-[24px] w-full max-w-[360px] p-5 flex flex-col items-center shadow-2xl">
            <div className="w-11 h-11 rounded-full bg-[#ECFDF5] flex items-center justify-center">
              <Lock size={20} className="text-[#059669]" />
            </div>
            <div className="mt-2.5 rounded-xl bg-[#07110C] border border-[#34D399]/45 px-3.5 py-1.5">
              <GlowingEmeraldStoreName text={state.settings.storeName} className="text-[17px]" />
            </div>
            <div className="mt-1.5 font-extrabold text-[15px] text-[#0F172A]">Terminal Locked</div>
            <div className="text-xs text-[#64748B] mb-3">Tap your 4–8 digit Manager PIN</div>

            <SecurePinPad
              pin={lockPin}
              isSettingPin={false}
              busy={state.pinBusy}
              error={state.pinError}
              lockoutUntilMs={state.pinLockoutUntilMs}
              onDigit={(d) => {
                if (lockPin.length < 8) {
                  setLockPin((p) => p + d);
                  clearPinError();
                }
              }}
              onBackspace={() => {
                if (lockPin.length > 0) {
                  setLockPin((p) => p.slice(0, -1));
                  clearPinError();
                }
              }}
              onClear={() => {
                setLockPin('');
                clearPinError();
              }}
              onSubmit={() => {
                const entered = lockPin;
                setLockPin('');
                void verifyAndUnlock(entered, 'unlockTerminal');
              }}
            />
          </div>
        </div>
      )}
    </>
  );
};
