import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  Banknote,
  BookOpen,
  CheckCircle2,
  CreditCard,
  Smartphone,
  Split,
  UserPlus,
  X,
} from 'lucide-react';
import type { CartTotals, PaymentMethod, StoreSettings, SukiCustomer } from '../types';
import { computeLoyaltyPointsEarned, computePointsRedemption } from '../utils/opsMath';
import { formatPeso, round2 } from '../utils/posMath';

interface CheckoutModalProps {
  open: boolean;
  totals: CartTotals;
  itemCount: number;
  customers: SukiCustomer[];
  settings: StoreSettings;
  onQuickAddCustomer: (data: {
    name: string;
    phone?: string;
    creditLimit: number;
  }) => SukiCustomer;
  onClose: () => void;
  onCompleteSale: (payload: {
    paymentMethod: PaymentMethod;
    tendered: number;
    change: number;
    refNo?: string;
    seniorId?: string;
    customerId?: string;
    pointsRedeemed?: number;
    pointsDiscount?: number;
    utangDueDate?: string;
    allowOverLimit?: boolean;
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
  customers,
  settings,
  onQuickAddCustomer,
  onClose,
  onCompleteSale,
}) => {
  const [method, setMethod] = useState<PaymentMethod>('Cash');
  const [tenderedStr, setTenderedStr] = useState('');
  const [refNo, setRefNo] = useState('');
  const [seniorId, setSeniorId] = useState('');
  const [splitCashStr, setSplitCashStr] = useState('');
  const [splitDigitalMethod, setSplitDigitalMethod] = useState<'GCash' | 'Card'>('GCash');

  // Suki & Utang state
  const [customerId, setCustomerId] = useState('');
  const [redeemPoints, setRedeemPoints] = useState(false);
  const [utangDueDate, setUtangDueDate] = useState('');
  const [allowOverLimit, setAllowOverLimit] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [quickLimitStr, setQuickLimitStr] = useState('1000');

  const [error, setError] = useState('');

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId) || null,
    [customers, customerId],
  );

  const pesoPerPoint = Number(settings.loyaltyPesoPerPoint) > 0 ? Number(settings.loyaltyPesoPerPoint) : 50;
  const pointValue = Number(settings.loyaltyPointValue) > 0 ? Number(settings.loyaltyPointValue) : 1;

  const redemption = useMemo(() => {
    if (!selectedCustomer || !redeemPoints) {
      return { pointsUsed: 0, discountPeso: 0 };
    }
    return computePointsRedemption(
      selectedCustomer.points,
      selectedCustomer.points,
      pointValue,
      totals.grandTotal,
    );
  }, [selectedCustomer, redeemPoints, pointValue, totals.grandTotal]);

  const finalDue = round2(Math.max(0, totals.grandTotal - redemption.discountPeso));
  const pointsWillEarn = selectedCustomer ? computeLoyaltyPointsEarned(finalDue, pesoPerPoint) : 0;

  useEffect(() => {
    if (!open) return;
    const defDue = new Date(Date.now() + 7 * 86400000).toLocaleDateString('en-CA');
    setMethod('Cash');
    setTenderedStr(totals.grandTotal > 0 ? totals.grandTotal.toFixed(2) : '0.00');
    setRefNo('');
    setSeniorId('');
    setSplitCashStr('');
    setSplitDigitalMethod('GCash');
    setCustomerId('');
    setRedeemPoints(false);
    setUtangDueDate(defDue);
    setAllowOverLimit(false);
    setShowQuickAdd(false);
    setQuickName('');
    setQuickPhone('');
    setQuickLimitStr('1000');
    setError('');
  }, [open, totals.grandTotal]);

  // Keep cash tendered synced when toggling Suki points redemption if cashier hasn't entered custom cash
  useEffect(() => {
    if (!open) return;
    if (method === 'Cash') {
      setTenderedStr(finalDue > 0 ? finalDue.toFixed(2) : '0.00');
    }
  }, [finalDue, method, open]);

  const quickAmounts = useMemo(() => {
    const g = finalDue;
    const set = new Set<number>([round2(g)]);
    [20, 50, 100, 200, 500, 1000].forEach((bill) => {
      if (bill >= g) set.add(bill);
    });
    if (g > 100) {
      set.add(Math.ceil(g / 50) * 50);
      set.add(Math.ceil(g / 100) * 100);
    }
    return Array.from(set).sort((a, b) => a - b).slice(0, 6);
  }, [finalDue]);

  if (!open) return null;

  const tenderedNum = parseFloat(tenderedStr) || 0;
  const cashChange = round2(tenderedNum - finalDue);
  const splitCash = round2(parseFloat(splitCashStr) || 0);
  const splitDigital = round2(Math.max(0, finalDue - splitCash));

  const addBillToTendered = (bill: number) => {
    const current = parseFloat(tenderedStr) || 0;
    const base = Math.abs(current - finalDue) < 0.001 ? 0 : current;
    setTenderedStr(round2(base + bill).toFixed(2));
    setError('');
  };

  const handleCreateQuickSuki = () => {
    const cleanName = quickName.trim();
    if (!cleanName) {
      setError('Enter the Suki customer name first.');
      return;
    }
    const created = onQuickAddCustomer({
      name: cleanName,
      phone: quickPhone.trim() || undefined,
      creditLimit: Math.max(0, parseFloat(quickLimitStr) || 0),
    });
    setCustomerId(created.id);
    setShowQuickAdd(false);
    setQuickName('');
    setQuickPhone('');
    setError('');
  };

  const projectedUtangBalance = selectedCustomer ? round2(selectedCustomer.balance + finalDue) : 0;
  const isOverCreditLimit = Boolean(
    method === 'Utang' &&
      selectedCustomer &&
      selectedCustomer.creditLimit > 0 &&
      projectedUtangBalance > selectedCustomer.creditLimit + 1e-6,
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (totals.seniorDiscount > 0 && !seniorId.trim()) {
      setError('Senior Citizen / PWD ID number is required when discount is applied.');
      return;
    }

    const sukiMeta = {
      customerId: selectedCustomer?.id,
      pointsRedeemed: redemption.pointsUsed > 0 ? redemption.pointsUsed : undefined,
      pointsDiscount: redemption.discountPeso > 0 ? redemption.discountPeso : undefined,
    };

    if (method === 'Utang') {
      if (!selectedCustomer) {
        setError('Select or add a Suki customer account for Utang checkout.');
        return;
      }
      if (isOverCreditLimit && !allowOverLimit) {
        setError(
          `${selectedCustomer.name}'s projected balance (${formatPeso(projectedUtangBalance)}) exceeds credit limit (${formatPeso(selectedCustomer.creditLimit)}). Tick "Allow override" to proceed.`,
        );
        return;
      }
      onCompleteSale({
        paymentMethod: 'Utang',
        tendered: finalDue,
        change: 0,
        seniorId: seniorId.trim() || undefined,
        utangDueDate: utangDueDate || undefined,
        allowOverLimit,
        ...sukiMeta,
      });
      return;
    }

    if (method === 'Cash') {
      if (tenderedNum + 1e-6 < finalDue) {
        setError(`Cash tendered is short by ${formatPeso(finalDue - tenderedNum)}.`);
        return;
      }
      onCompleteSale({
        paymentMethod: 'Cash',
        tendered: round2(tenderedNum),
        change: Math.max(0, cashChange),
        seniorId: seniorId.trim() || undefined,
        ...sukiMeta,
      });
      return;
    }

    if (method === 'Split') {
      if (splitCash <= 0 || splitCash >= finalDue) {
        setError('In Split Payment, Cash portion must be greater than ₱0 and less than the Amount Due.');
        return;
      }
      onCompleteSale({
        paymentMethod: 'Split',
        tendered: finalDue,
        change: 0,
        refNo: refNo.trim() || undefined,
        seniorId: seniorId.trim() || undefined,
        splitDetails: {
          cash: splitCash,
          digital: splitDigital,
          digitalMethod: splitDigitalMethod,
        },
        ...sukiMeta,
      });
      return;
    }

    onCompleteSale({
      paymentMethod: method,
      tendered: finalDue,
      change: 0,
      refNo: refNo.trim() || undefined,
      seniorId: seniorId.trim() || undefined,
      ...sukiMeta,
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
        className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col"
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

        <div className="p-4 space-y-3.5 overflow-y-auto">
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
            {redemption.discountPeso > 0 && (
              <div className="flex justify-between text-emerald-700 font-semibold">
                <span>Suki Points Redeemed ({redemption.pointsUsed} pts)</span>
                <span className="font-mono-num">−{formatPeso(redemption.discountPeso)}</span>
              </div>
            )}
            <div className="flex justify-between items-baseline pt-1.5 border-t border-slate-200">
              <span className="text-sm font-extrabold text-slate-900">Amount Due</span>
              <span className="text-2xl font-extrabold font-mono-num text-emerald-700" data-testid="checkout-grand-total">
                {formatPeso(finalDue)}
              </span>
            </div>
          </div>

          {/* Optional Suki / Loyalty attachment */}
          <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-[11px] font-extrabold text-slate-700 flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-emerald-600" />
                <span>
                  Suki Account {method === 'Utang' ? <span className="text-rose-600">*</span> : '(Optional · Earn Points)'}
                </span>
              </label>
              <button
                type="button"
                onClick={() => setShowQuickAdd((v) => !v)}
                className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1 cursor-pointer"
              >
                <UserPlus className="w-3 h-3" />
                <span>{showQuickAdd ? 'Cancel' : '+ New Suki'}</span>
              </button>
            </div>

            {showQuickAdd ? (
              <div className="bg-white border border-slate-200 rounded-lg p-2 space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                  <input
                    type="text"
                    placeholder="Customer Name *"
                    data-testid="quick-suki-name"
                    value={quickName}
                    onChange={(e) => setQuickName(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs"
                  />
                  <input
                    type="tel"
                    placeholder="Mobile (optional)"
                    value={quickPhone}
                    onChange={(e) => setQuickPhone(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-mono-num"
                  />
                  <input
                    type="number"
                    min="0"
                    placeholder="Credit Limit ₱"
                    value={quickLimitStr}
                    onChange={(e) => setQuickLimitStr(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-mono-num"
                  />
                </div>
                <button
                  type="button"
                  data-testid="quick-suki-save"
                  onClick={handleCreateQuickSuki}
                  className="w-full py-1.5 rounded-lg bg-slate-900 text-emerald-400 text-xs font-bold cursor-pointer"
                >
                  Save &amp; Select Suki
                </button>
              </div>
            ) : (
              <select
                value={customerId}
                data-testid="checkout-suki-select"
                onChange={(e) => {
                  setCustomerId(e.target.value);
                  setRedeemPoints(false);
                  setError('');
                }}
                className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-800"
              >
                <option value="">Walk-in Customer (No Suki Account)</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · Bal: {formatPeso(c.balance)} · {c.points} pts
                  </option>
                ))}
              </select>
            )}

            {selectedCustomer && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
                <div className="text-slate-600">
                  Bal: <strong className="font-mono-num text-slate-900">{formatPeso(selectedCustomer.balance)}</strong>
                  {' · '}Points:{' '}
                  <strong className="font-mono-num text-emerald-700">{selectedCustomer.points} pts</strong>
                  {pointsWillEarn > 0 && (
                    <span className="text-emerald-600 font-semibold"> (+{pointsWillEarn} on sale)</span>
                  )}
                </div>
                {selectedCustomer.points > 0 && (
                  <label className="inline-flex items-center gap-1.5 font-bold text-emerald-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={redeemPoints}
                      onChange={(e) => setRedeemPoints(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-600"
                    />
                    <span>Redeem pts (−{formatPeso(computePointsRedemption(selectedCustomer.points, selectedCustomer.points, pointValue, totals.grandTotal).discountPeso)})</span>
                  </label>
                )}
              </div>
            )}
          </div>

          {/* Payment method tabs */}
          <div>
            <div className="text-xs font-bold text-slate-700 mb-1.5">Payment Method</div>
            <div className="grid grid-cols-5 gap-1.5">
              {(
                [
                  { id: 'Cash', label: 'Cash', Icon: Banknote },
                  { id: 'GCash', label: 'GCash', Icon: Smartphone },
                  { id: 'Card', label: 'Card', Icon: CreditCard },
                  { id: 'Split', label: 'Split', Icon: Split },
                  { id: 'Utang', label: 'Utang', Icon: BookOpen },
                ] as const
              ).map(({ id, label, Icon }) => {
                const active = method === id;
                return (
                  <button
                    key={id}
                    type="button"
                    data-testid={`pay-method-${id.toLowerCase()}`}
                    onClick={() => {
                      setMethod(id);
                      setError('');
                    }}
                    className={`flex flex-col items-center justify-center gap-1 py-2.5 px-1.5 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
                      active
                        ? id === 'Utang'
                          ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                          : 'bg-slate-900 text-emerald-400 border-slate-900 shadow-xs'
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
                    {amt === round2(finalDue) ? 'Exact' : formatPeso(amt).replace('.00', '')}
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

          {/* Utang details */}
          {method === 'Utang' && (
            <div className="space-y-2.5 bg-amber-50/70 border border-amber-200 rounded-xl p-3 text-xs">
              <div className="flex items-center justify-between">
                <label className="font-bold text-amber-950">Promised Due Date</label>
                <input
                  type="date"
                  value={utangDueDate}
                  onChange={(e) => setUtangDueDate(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-amber-300 bg-white font-mono-num text-xs font-bold text-slate-800"
                />
              </div>
              {selectedCustomer && (
                <div className="flex items-center justify-between text-[11px] text-amber-900">
                  <span>Projected Balance after Sale:</span>
                  <span className="font-mono-num font-extrabold">
                    {formatPeso(projectedUtangBalance)}{' '}
                    {selectedCustomer.creditLimit > 0 ? `/ ${formatPeso(selectedCustomer.creditLimit)}` : '(No Limit)'}
                  </span>
                </div>
              )}
              {isOverCreditLimit && (
                <label className="flex items-center gap-2 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowOverLimit}
                    onChange={(e) => setAllowOverLimit(e.target.checked)}
                  />
                  <span>Credit limit exceeded — allow manager override for this charge</span>
                </label>
              )}
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
            Complete Sale ({formatPeso(finalDue)})
          </button>
        </div>
      </form>
    </div>
  );
};
