import React, { useEffect, useMemo, useState } from 'react';
import { Banknote, CheckCircle2, CreditCard, Smartphone, Split, X } from 'lucide-react';
import type { CartTotals, PaymentMethod } from '../types';
import { formatPeso, round2 } from '../utils/posMath';

interface CheckoutModalProps {
  open: boolean;
  totals: CartTotals;
  itemCount: number;
  onClose: () => void;
  onCompleteSale: (payload: {
    paymentMethod: PaymentMethod;
    tendered: number;
    change: number;
    refNo?: string;
    seniorId?: string;
    splitDetails?: {
      cash: number;
      digital: number;
      digitalMethod: 'GCash' | 'Card';
    };
  }) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  open,
  totals,
  itemCount,
  onClose,
  onCompleteSale,
}) => {
  const [method, setMethod] = useState<PaymentMethod>('Cash');
  const [tenderedStr, setTenderedStr] = useState('');
  const [refNo, setRefNo] = useState('');
  const [seniorId, setSeniorId] = useState('');
  const [splitCashStr, setSplitCashStr] = useState('');
  const [splitDigitalMethod, setSplitDigitalMethod] = useState<'GCash' | 'Card'>('GCash');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setMethod('Cash');
    setTenderedStr(totals.grandTotal > 0 ? totals.grandTotal.toFixed(2) : '0.00');
    setRefNo('');
    setSeniorId('');
    setSplitCashStr('');
    setSplitDigitalMethod('GCash');
    setError('');
  }, [open, totals.grandTotal]);

  const quickAmounts = useMemo(() => {
    const g = totals.grandTotal;
    const set = new Set<number>([round2(g)]);
    [20, 50, 100, 200, 500, 1000].forEach((bill) => {
      if (bill >= g) set.add(bill);
    });
    if (g > 100) {
      set.add(Math.ceil(g / 50) * 50);
      set.add(Math.ceil(g / 100) * 100);
    }
    return Array.from(set).sort((a, b) => a - b).slice(0, 6);
  }, [totals.grandTotal]);

  if (!open) return null;

  const tenderedNum = parseFloat(tenderedStr) || 0;
  const cashChange = round2(tenderedNum - totals.grandTotal);
  const splitCash = round2(parseFloat(splitCashStr) || 0);
  const splitDigital = round2(Math.max(0, totals.grandTotal - splitCash));

  const addBillToTendered = (bill: number) => {
    const current = parseFloat(tenderedStr) || 0;
    const base = Math.abs(current - totals.grandTotal) < 0.001 ? 0 : current;
    setTenderedStr(round2(base + bill).toFixed(2));
    setError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (totals.seniorDiscount > 0 && !seniorId.trim()) {
      setError('Senior Citizen / PWD ID number is required when discount is applied.');
      return;
    }

    if (method === 'Cash') {
      if (tenderedNum + 1e-6 < totals.grandTotal) {
        setError(`Cash tendered is short by ${formatPeso(totals.grandTotal - tenderedNum)}.`);
        return;
      }
      onCompleteSale({
        paymentMethod: 'Cash',
        tendered: round2(tenderedNum),
        change: Math.max(0, cashChange),
        seniorId: seniorId.trim() || undefined,
      });
      return;
    }

    if (method === 'Split') {
      if (splitCash <= 0 || splitCash >= totals.grandTotal) {
        setError('In Split Payment, Cash portion must be greater than ₱0 and less than the Grand Total.');
        return;
      }
      onCompleteSale({
        paymentMethod: 'Split',
        tendered: totals.grandTotal,
        change: 0,
        refNo: refNo.trim() || undefined,
        seniorId: seniorId.trim() || undefined,
        splitDetails: {
          cash: splitCash,
          digital: splitDigital,
          digitalMethod: splitDigitalMethod,
        },
      });
      return;
    }

    onCompleteSale({
      paymentMethod: method,
      tendered: totals.grandTotal,
      change: 0,
      refNo: refNo.trim() || undefined,
      seniorId: seniorId.trim() || undefined,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[1px] flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">Complete Payment</h3>
            <p className="text-[11px] text-slate-500">{itemCount} line item(s) in basket</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close checkout"
            className="w-9 h-9 rounded-lg hover:bg-slate-200 flex items-center justify-center text-slate-600 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          {/* Totals summary box */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Retail Subtotal</span>
              <span className="font-mono-num">{formatPeso(totals.retailSubtotal)}</span>
            </div>
            {totals.wholesaleSavings > 0 && (
              <div className="flex justify-between text-indigo-700 font-semibold">
                <span>Wholesale Savings</span>
                <span className="font-mono-num">−{formatPeso(totals.wholesaleSavings)}</span>
              </div>
            )}
            {totals.seniorDiscount > 0 && (
              <div className="flex justify-between text-amber-700 font-semibold">
                <span>SC / PWD 5% Discount</span>
                <span className="font-mono-num">−{formatPeso(totals.seniorDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between items-baseline pt-1.5 border-t border-slate-200">
              <span className="text-sm font-extrabold text-slate-900">Amount Due</span>
              <span className="text-2xl font-extrabold font-mono-num text-emerald-700" data-testid="checkout-grand-total">
                {formatPeso(totals.grandTotal)}
              </span>
            </div>
          </div>

          {/* Payment method tabs */}
          <div>
            <div className="text-xs font-bold text-slate-700 mb-1.5">Payment Method</div>
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  { id: 'Cash', label: 'Cash', Icon: Banknote },
                  { id: 'GCash', label: 'GCash', Icon: Smartphone },
                  { id: 'Card', label: 'Card', Icon: CreditCard },
                  { id: 'Split', label: 'Split', Icon: Split },
                ] as const
              ).map(({ id, label, Icon }) => {
                const active = method === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setMethod(id);
                      setError('');
                    }}
                    className={`flex flex-col items-center justify-center gap-1 py-2.5 px-2 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
                      active
                        ? 'bg-slate-900 text-emerald-400 border-slate-900 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cash input */}
          {method === 'Cash' && (
            <div className="space-y-2.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Cash Tendered (₱)</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  autoFocus
                  onFocus={(e) => e.target.select()}
                  value={tenderedStr}
                  onChange={(e) => {
                    setTenderedStr(e.target.value);
                    if (error) setError('');
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-lg font-extrabold font-mono-num text-slate-900 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {quickAmounts.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => {
                      setTenderedStr(amt.toFixed(2));
                      setError('');
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-800 text-xs font-bold font-mono-num cursor-pointer"
                  >
                    {amt === round2(totals.grandTotal) ? 'Exact' : formatPeso(amt).replace('.00', '')}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="text-slate-500 font-semibold mr-0.5">Add bill:</span>
                {[20, 50, 100, 500, 1000].map((bill) => (
                  <button
                    key={bill}
                    type="button"
                    onClick={() => addBillToTendered(bill)}
                    className="px-2 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-mono-num font-bold cursor-pointer"
                  >
                    +₱{bill}
                  </button>
                ))}
              </div>

              <div
                className={`rounded-xl px-3 py-2.5 flex items-center justify-between border ${
                  cashChange >= 0
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                <span className="text-xs font-bold">{cashChange >= 0 ? 'Change Due' : 'Shortfall'}</span>
                <span className="text-lg font-extrabold font-mono-num">
                  {formatPeso(Math.abs(cashChange))}
                </span>
              </div>
            </div>
          )}

          {/* GCash / Card */}
          {(method === 'GCash' || method === 'Card') && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {method} Reference / Approval # (optional)
              </label>
              <input
                type="text"
                autoFocus
                value={refNo}
                onChange={(e) => setRefNo(e.target.value)}
                placeholder={method === 'GCash' ? 'e.g. 1002348912' : 'e.g. APPR-4421'}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-mono-num focus:border-emerald-600 focus:outline-none"
              />
            </div>
          )}

          {/* Split payment */}
          {method === 'Split' && (
            <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Cash Amount (₱)</label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    autoFocus
                    onFocus={(e) => e.target.select()}
                    value={splitCashStr}
                    onChange={(e) => {
                      setSplitCashStr(e.target.value);
                      if (error) setError('');
                    }}
                    placeholder="0.00"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-bold font-mono-num bg-white focus:border-emerald-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Remaining Digital</label>
                  <div className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-extrabold font-mono-num text-emerald-700">
                    {formatPeso(splitDigital)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="font-bold text-slate-700">Digital via:</span>
                {(['GCash', 'Card'] as const).map((dm) => (
                  <button
                    key={dm}
                    type="button"
                    onClick={() => setSplitDigitalMethod(dm)}
                    className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer ${
                      splitDigitalMethod === dm
                        ? 'bg-slate-900 text-emerald-400'
                        : 'bg-white border border-slate-300 text-slate-700'
                    }`}
                  >
                    {dm}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={refNo}
                onChange={(e) => setRefNo(e.target.value)}
                placeholder={`${splitDigitalMethod} Reference # (optional)`}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono-num bg-white"
              />
            </div>
          )}

          {/* Senior/PWD ID */}
          {totals.seniorDiscount > 0 && (
            <div>
              <label className="block text-xs font-bold text-amber-900 mb-1">
                Senior Citizen / PWD ID Number <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                value={seniorId}
                onChange={(e) => {
                  setSeniorId(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Enter OSCA / PWD ID #"
                className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-amber-50/40 text-sm font-mono-num focus:border-emerald-600 focus:outline-none"
              />
            </div>
          )}

          {error && (
            <div className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 pb-safe border-t border-slate-200 bg-white flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            data-testid="confirm-complete-sale"
            className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-extrabold cursor-pointer transition-colors"
          >
            <CheckCircle2 className="w-4 h-4" />
            Complete Sale ({formatPeso(totals.grandTotal)})
          </button>
        </div>
      </form>
    </div>
  );
};
