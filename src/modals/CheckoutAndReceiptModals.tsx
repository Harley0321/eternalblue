import React, { useEffect, useMemo, useRef, useState } from 'react';
import { QrBitmapCard } from '../components/CommonGraphics';
import { OpsMath } from '../domain/opsMath';
import { PaymentQr } from '../domain/paymentQr';
import { PosMath } from '../domain/posMath';
import { DeviceBridge } from '../hardware/deviceBridge';
import { EscPosPrinter } from '../hardware/escPosPrinter';
import { usePos } from '../state/PosContext';

export const CheckoutModal: React.FC = () => {
  const { state, cartTotals, closeCheckout, completeCheckout } = usePos();
  const [method, setMethod] = useState<'Cash' | 'GCash' | 'Card' | 'Split' | 'Utang'>('Cash');
  const [tenderedStr, setTenderedStr] = useState(String(cartTotals.grandTotal));
  const [refNo, setRefNo] = useState('');
  const [splitCashStr, setSplitCashStr] = useState(
    String(PosMath.fromCents(Math.round(PosMath.toCents(cartTotals.grandTotal) / 2)))
  );
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [redeemPointsStr, setRedeemPointsStr] = useState('0');
  const [dueDate, setDueDate] = useState(() => PosMath.addDaysYmd(7));
  const wasOpenRef = useRef(false);

  const selectedSuki = useMemo(() => {
    if (selectedCustomerId) {
      return state.sukiCustomers.find((c) => c.id === selectedCustomerId) ?? null;
    }
    if (method === 'Utang') {
      return state.sukiCustomers[0] ?? null;
    }
    return null;
  }, [selectedCustomerId, state.sukiCustomers, method]);

  const ptVal = state.settings.loyaltyPointValue > 0 ? state.settings.loyaltyPointValue : 1;
  const ptValC = PosMath.toCents(ptVal);
  const grandC = PosMath.toCents(cartTotals.grandTotal);

  const maxRedeemablePoints = useMemo(() => {
    if (!selectedSuki || method === 'Utang' || ptValC <= 0) return 0;
    const maxByTotal = Math.floor(grandC / ptValC);
    return Math.max(0, Math.min(selectedSuki.points, maxByTotal));
  }, [selectedSuki, method, ptValC, grandC]);

  const appliedPoints = Math.max(
    0,
    Math.min(maxRedeemablePoints, parseInt(redeemPointsStr || '0', 10) || 0)
  );
  const pointsDiscountC = Math.min(grandC, appliedPoints * ptValC);
  const payableC = Math.max(0, grandC - pointsDiscountC);
  const pointsDiscount = PosMath.fromCents(pointsDiscountC);
  const payable = PosMath.fromCents(payableC);
  const pointsToEarn =
    selectedSuki && method !== 'Utang'
      ? OpsMath.computeLoyaltyPointsEarned(payable, state.settings.loyaltyPesoPerPoint)
      : 0;

  useEffect(() => {
    if (!state.checkoutOpen) {
      wasOpenRef.current = false;
      return;
    }
    const justOpened = !wasOpenRef.current;
    wasOpenRef.current = true;
    const initC = PosMath.toCents(cartTotals.grandTotal);
    setTenderedStr(String(PosMath.fromCents(initC)));
    setSplitCashStr(String(PosMath.fromCents(Math.round(initC / 2))));
    if (justOpened) {
      setMethod('Cash');
      setSelectedCustomerId('');
      setDueDate(PosMath.addDaysYmd(7));
      setRefNo('');
      setRedeemPointsStr('0');
    }
  }, [state.checkoutOpen, cartTotals.grandTotal]);

  useEffect(() => {
    if (state.checkoutOpen) {
      setTenderedStr(String(payable));
      setSplitCashStr(String(PosMath.fromCents(Math.round(payableC / 2))));
    }
  }, [payable, payableC, state.checkoutOpen]);

  const resolvedQr = useMemo(
    () => PaymentQr.resolveCheckoutQr(state.settings, payable),
    [state.settings, payable]
  );

  if (!state.checkoutOpen) return null;

  const tenderedRaw = parseFloat(tenderedStr);
  const tenderedC = Number.isFinite(tenderedRaw) ? PosMath.toCents(tenderedRaw) : -1;
  const tendered = tenderedC >= 0 ? PosMath.fromCents(tenderedC) : 0;
  const change = PosMath.fromCents(Math.max(0, tenderedC - payableC));
  const splitCashParsed = parseFloat(splitCashStr);
  const splitCashC = Number.isFinite(splitCashParsed) ? PosMath.toCents(splitCashParsed) : -1;
  const splitValid = Number.isFinite(splitCashParsed) && splitCashC >= 0 && splitCashC <= payableC;
  const cashValid = Number.isFinite(tenderedRaw) && tenderedC >= payableC;
  const splitDigitalDisplay = PosMath.fromCents(
    Math.max(0, payableC - (splitCashC >= 0 ? Math.min(payableC, splitCashC) : 0))
  );

  const todayYmd = PosMath.todayYmd();
  const dueDateInvalid = method === 'Utang' && (!dueDate || dueDate < todayYmd);

  const canConfirm =
    method === 'Cash'
      ? cashValid
      : method === 'Split'
      ? splitValid
      : method === 'Utang'
      ? selectedSuki !== null && !dueDateInvalid
      : true;

  const handleConfirm = () => {
    const sCashC = Number.isFinite(splitCashParsed) ? Math.max(0, Math.min(payableC, splitCashC)) : 0;
    const sDigC = Math.max(0, payableC - sCashC);
    completeCheckout({
      paymentMethod: method,
      tendered,
      refNo,
      splitCash: PosMath.fromCents(sCashC),
      splitDigital: PosMath.fromCents(sDigC),
      customerId: selectedSuki?.id ?? null,
      utangDueDate: dueDate,
      redeemPoints: appliedPoints,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden shadow-xl">
        <div className="px-5 pt-5 pb-3.5 border-b border-[#E2E8F0] flex items-baseline justify-between gap-2">
          <div>
            <div className="text-[11px] font-semibold text-[#64748B]">Amount Due</div>
            <h3 className="font-extrabold text-2xl text-[#0F172A] font-mono tabular-nums">
              {PosMath.formatPeso(payable)}
            </h3>
            {pointsDiscount > 0 && (
              <div className="text-[11px] font-semibold text-[#047857] mt-0.5 tabular-nums">
                Gross {PosMath.formatPeso(cartTotals.grandTotal)} − {PosMath.formatPeso(pointsDiscount)} ({appliedPoints} pts)
              </div>
            )}
          </div>
          <span className="text-xs font-semibold text-[#64748B]">Checkout</span>
        </div>

        <div className="p-5 overflow-y-auto space-y-3.5">
          <div className="grid grid-cols-5 gap-1 p-1 rounded-xl bg-slate-100">
            {(['Cash', 'GCash', 'Card', 'Split', 'Utang'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMethod(m);
                  if (m === 'Utang') setRedeemPointsStr('0');
                }}
                className={`min-h-[38px] px-2 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all duration-150 cursor-pointer ${
                  method === m
                    ? 'bg-white text-[#047857] shadow-sm'
                    : 'text-[#475569] hover:text-[#0F172A]'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {/* Suki Loyalty CRM Attach */}
          {state.sukiCustomers.length > 0 && (
            <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-[#0F172A]">
                  Suki Loyalty Member {method === 'Utang' ? '(Required)' : '(Optional)'}
                </span>
                {selectedSuki && pointsToEarn > 0 && (
                  <span className="text-[11px] font-bold text-[#4F46E5] tabular-nums">
                    +{pointsToEarn} pts
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                {method !== 'Utang' && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCustomerId('');
                      setRedeemPointsStr('0');
                    }}
                    className={`min-h-[34px] px-3 py-1 rounded-lg text-[11px] font-bold border whitespace-nowrap cursor-pointer ${
                      !selectedSuki
                        ? 'bg-[#0F172A] border-[#0F172A] text-white'
                        : 'bg-white border-[#E2E8F0] text-[#64748B]'
                    }`}
                  >
                    Walk-in
                  </button>
                )}
                {state.sukiCustomers.map((c) => {
                  const active = selectedSuki?.id === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setSelectedCustomerId(c.id);
                        setRedeemPointsStr('0');
                      }}
                      className={`min-h-[34px] px-3 py-1 rounded-lg text-[11px] font-bold border whitespace-nowrap cursor-pointer ${
                        active
                          ? 'bg-[#059669] border-[#059669] text-white'
                          : 'bg-white border-[#E2E8F0] text-[#64748B]'
                      }`}
                    >
                      {c.name} ({c.points} pts{c.balance > 0 ? ` · ${PosMath.formatPeso(c.balance)}` : ''})
                    </button>
                  );
                })}
              </div>

              {selectedSuki && method !== 'Utang' && maxRedeemablePoints > 0 && (
                <div className="flex items-center gap-2 pt-1.5 border-t border-[#E2E8F0]">
                  <span className="text-[11px] font-semibold text-[#64748B] whitespace-nowrap">
                    Redeem pts (max {maxRedeemablePoints}):
                  </span>
                  <input
                    type="number"
                    min="0"
                    max={maxRedeemablePoints}
                    value={redeemPointsStr}
                    onChange={(e) => setRedeemPointsStr(e.target.value.replace(/\D/g, ''))}
                    className="w-20 px-2.5 py-1.5 text-xs font-mono rounded-lg border border-[#E2E8F0] bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setRedeemPointsStr(String(maxRedeemablePoints))}
                    className="px-2.5 py-1.5 rounded-lg bg-[#EEF2FF] text-[#4F46E5] text-[11px] font-bold cursor-pointer"
                  >
                    Use Max
                  </button>
                </div>
              )}
            </div>
          )}

          {method === 'Cash' && (
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-[#64748B]">Cash Tendered (₱)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={tenderedStr}
                  onChange={(e) => setTenderedStr(e.target.value)}
                  className="w-full mt-1 px-3.5 py-2.5 text-lg font-extrabold font-mono tabular-nums rounded-xl border border-[#E2E8F0] focus:outline-none focus:border-[#059669]"
                />
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                {[
                  [payable, 'Exact'],
                  [50, '₱50'],
                  [100, '₱100'],
                  [200, '₱200'],
                  [500, '₱500'],
                  [1000, '₱1,000'],
                ].map(([amt, lbl]) => (
                  <button
                    key={String(lbl)}
                    type="button"
                    onClick={() => setTenderedStr(String(amt))}
                    className="min-h-[40px] px-2 py-1.5 rounded-xl border border-[#E2E8F0] bg-white hover:bg-slate-50 active:scale-[0.97] text-xs font-bold font-mono tabular-nums text-[#0F172A] whitespace-nowrap cursor-pointer transition-all"
                  >
                    {lbl}
                  </button>
                ))}
              </div>
              <div
                className={`rounded-xl p-3.5 flex items-center justify-between border ${
                  cashValid
                    ? 'bg-[#ECFDF5] border-[#059669]/25'
                    : 'bg-[#FFF1F2] border-[#E11D48]/25'
                }`}
              >
                <span className={`font-bold text-sm ${cashValid ? 'text-[#047857]' : 'text-[#E11D48]'}`}>
                  {cashValid ? 'Change Due' : 'Shortfall'}
                </span>
                <span className={`font-extrabold font-mono tabular-nums text-lg ${cashValid ? 'text-[#047857]' : 'text-[#E11D48]'}`}>
                  {cashValid
                    ? PosMath.formatPeso(change)
                    : `-${PosMath.formatPeso(PosMath.fromCents(Math.max(0, payableC - Math.max(0, tenderedC))))}`}
                </span>
              </div>
            </div>
          )}

          {method === 'GCash' && (
            <div className="space-y-2.5">
              <QrBitmapCard qr={resolvedQr} />
              <input
                type="text"
                value={refNo}
                onChange={(e) => setRefNo(e.target.value)}
                placeholder="GCash / QR Ph Reference #"
                className="w-full px-3 py-2 text-xs rounded-xl border border-[#E2E8F0]"
              />
            </div>
          )}

          {method === 'Card' && (
            <input
              type="text"
              value={refNo}
              onChange={(e) => setRefNo(e.target.value)}
              placeholder="Terminal Approval / Reference #"
              className="w-full px-3 py-2 text-xs rounded-xl border border-[#E2E8F0]"
            />
          )}

          {method === 'Split' && (
            <div className="space-y-2.5">
              <div>
                <label className="text-[11px] font-bold text-[#64748B]">Cash Portion (₱)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={splitCashStr}
                  onChange={(e) => setSplitCashStr(e.target.value)}
                  className={`w-full mt-1 px-3 py-2 text-sm font-mono rounded-xl border ${
                    splitValid ? 'border-[#E2E8F0]' : 'border-[#E11D48]'
                  }`}
                />
              </div>
              {!splitValid && (
                <p className="text-[11px] font-semibold text-[#E11D48]">
                  Cash portion must be between ₱0.00 and {PosMath.formatPeso(payable)}
                </p>
              )}
              <div className="font-bold text-[13px] text-[#4F46E5]">
                Remaining Digital (GCash): {PosMath.formatPeso(splitDigitalDisplay)}
              </div>
              <input
                type="text"
                value={refNo}
                onChange={(e) => setRefNo(e.target.value)}
                placeholder="Digital Ref #"
                className="w-full px-3 py-2 text-xs rounded-xl border border-[#E2E8F0]"
              />
            </div>
          )}

          {method === 'Utang' && (
            <div className="space-y-2.5">
              {state.sukiCustomers.length === 0 ? (
                <p className="text-xs text-[#E11D48]">
                  No Suki customers yet. Add one under Ops &amp; Suki.
                </p>
              ) : (
                <div>
                  <label className="text-[11px] font-bold text-[#64748B]">Due Date (YYYY-MM-DD)</label>
                  <input
                    type="date"
                    min={todayYmd}
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full mt-1 px-3 py-2 text-xs rounded-xl border border-[#E2E8F0]"
                  />
                  {dueDateInvalid && (
                    <p className="mt-1 text-[11px] font-semibold text-[#E11D48]">
                      Select today or a future due date.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-[#E2E8F0] flex justify-end gap-2">
          <button
            type="button"
            onClick={closeCheckout}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-[#64748B] hover:bg-slate-100 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={handleConfirm}
            className="px-5 py-2 rounded-xl bg-[#059669] hover:bg-[#047857] disabled:bg-slate-300 text-white text-xs font-extrabold cursor-pointer disabled:cursor-not-allowed"
          >
            Complete Sale
          </button>
        </div>
      </div>
    </div>
  );
};

export const ReceiptModal: React.FC = () => {
  const { state, closeReceipt, requestVoidSale, toast } = usePos();
  const sale = state.receiptModalSale;

  const receiptText = useMemo(
    () => (sale ? EscPosPrinter.formatReceiptText(sale, state.settings) : ''),
    [sale, state.settings]
  );

  if (!sale) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden shadow-xl">
        <div className="px-5 pt-5 pb-3 border-b border-[#E2E8F0] flex items-center justify-between">
          <h3 className="font-extrabold text-base text-[#0F172A]">Receipt {sale.receiptNo}</h3>
          {sale.voided && (
            <span className="bg-[#FFF1F2] text-[#E11D48] text-[11px] font-bold px-2 py-0.5 rounded-md">
              VOIDED
            </span>
          )}
        </div>

        <div className="p-5 overflow-y-auto space-y-3">
          <pre
            id="printable-receipt"
            className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-[10px] p-3 font-mono text-[11px] leading-relaxed whitespace-pre overflow-x-auto text-[#0F172A]"
          >
            {receiptText}
          </pre>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={async () => {
                await DeviceBridge.copyText(receiptText);
                toast('Receipt copied to clipboard');
              }}
              className="py-2 rounded-xl border border-[#E2E8F0] text-xs font-semibold text-[#0F172A] hover:bg-slate-50 cursor-pointer"
            >
              Copy Text
            </button>
            <button
              type="button"
              onClick={() => void DeviceBridge.shareOrDownloadTextFile(`${sale.receiptNo}.txt`, receiptText)}
              className="py-2 rounded-xl border border-[#E2E8F0] text-xs font-semibold text-[#0F172A] hover:bg-slate-50 cursor-pointer"
            >
              Download
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="py-2 rounded-xl border border-[#E2E8F0] text-xs font-semibold text-[#0F172A] hover:bg-slate-50 cursor-pointer"
            >
              Print
            </button>
          </div>

          {!sale.voided && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => requestVoidSale(sale)}
                className="text-xs font-bold text-[#E11D48] hover:underline cursor-pointer"
              >
                Void Receipt & Restore Stock
              </button>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-[#E2E8F0] flex justify-end">
          <button
            type="button"
            onClick={closeReceipt}
            className="px-5 py-2 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs font-bold cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
