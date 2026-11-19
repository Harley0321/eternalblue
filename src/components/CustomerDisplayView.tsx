import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Award,
  CheckCircle2,
  Receipt,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';
import type { StoreSettings } from '../types';
import { formatPeso, formatQty } from '../utils/posMath';
import {
  readStoredCustomerDisplaySnapshot,
  subscribeCustomerDisplaySnapshot,
  type CustomerDisplaySnapshot,
} from '../utils/customerDisplaySync';
import { StoreEmblem } from './StoreEmblem';
import { MerchantQrCard } from './MerchantQrCard';

interface CustomerDisplayViewProps {
  /**
   * When rendered inline as single-device "Flip to Customer" mode, App passes live snapshot & exit handler.
   * When omitted (?display=customer standalone window), component listens via BroadcastChannel + localStorage.
   */
  liveSnapshot?: CustomerDisplaySnapshot | null;
  fallbackSettings: StoreSettings;
  onExitFlipMode?: () => void;
}

export const CustomerDisplayView: React.FC<CustomerDisplayViewProps> = ({
  liveSnapshot,
  fallbackSettings,
  onExitFlipMode,
}) => {
  const [syncedSnapshot, setSyncedSnapshot] = useState<CustomerDisplaySnapshot | null>(() =>
    readStoredCustomerDisplaySnapshot(),
  );
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (liveSnapshot) return;
    setSyncedSnapshot(readStoredCustomerDisplaySnapshot());
    return subscribeCustomerDisplaySnapshot((snap) => {
      setSyncedSnapshot(snap);
    });
  }, [liveSnapshot]);

  const snap: CustomerDisplaySnapshot = liveSnapshot || syncedSnapshot || {
    updatedAt: Date.now(),
    status: 'idle',
    storeName: fallbackSettings.storeName,
    storeTagline: fallbackSettings.storeTagline,
    greeting:
      String(fallbackSettings.customerDisplayGreeting || '').trim() ||
      `Welcome to ${fallbackSettings.storeName}!`,
    priceMode: 'retail',
    isSeniorPwd: false,
    items: [],
    totals: {
      retailSubtotal: 0,
      wholesaleSavings: 0,
      seniorDiscount: 0,
      grandTotal: 0,
      isSeniorPwd: false,
      seniorBase: 0,
      seniorCapped: false,
      seniorCap: Number(fallbackSettings.scDiscountCap) || 125,
      scKinds: 0,
      scOtherLines: 0,
    },
    checkout: null,
    completedSale: null,
  };

  const clockStr = now.toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const dateStr = now.toLocaleDateString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div
      data-testid="customer-display-view"
      data-display-status={snap.status}
      className="h-[100dvh] flex flex-col bg-slate-100 text-slate-900 overflow-hidden"
    >
      {/* Top Counter Header */}
      <header className="bg-slate-950 text-white px-4 sm:px-6 py-3 flex items-center justify-between gap-4 shrink-0 border-b border-slate-800">
        <div className="flex items-center gap-3 min-w-0">
          <StoreEmblem storeName={snap.storeName} size="sm" />
          <div className="min-w-0">
            <h1 className="text-base sm:text-xl font-bold tracking-tight text-white truncate">
              {snap.storeName}
            </h1>
            <p className="text-xs text-slate-400 truncate">
              {snap.greeting}
              {snap.cashierName ? ` · Cashier: ${snap.cashierName}` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right hidden sm:block leading-tight">
            <div className="font-mono-num text-sm font-bold text-emerald-400">{clockStr}</div>
            <div className="text-[11px] text-slate-400">{dateStr}</div>
          </div>

          {onExitFlipMode && (
            <button
              type="button"
              data-testid="exit-customer-flip-btn"
              onClick={onExitFlipMode}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] sm:text-xs font-bold text-white cursor-pointer whitespace-nowrap"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-emerald-400" />
              <span>Back to Cashier</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Customer Viewport */}
      <main className="flex-1 min-h-0 overflow-y-auto scroll-contain p-4 sm:p-6">
        <div className="max-w-6xl mx-auto h-full">
          {/* 1. IDLE / WELCOME STATE */}
          {snap.status === 'idle' && (
            <div
              data-testid="customer-display-idle"
              className="h-full min-h-[380px] flex flex-col items-center justify-center text-center bg-white border border-slate-200 rounded-2xl p-6 sm:p-10 space-y-5"
            >
              <StoreEmblem storeName={snap.storeName} size="lg" />
              <div className="space-y-2 max-w-xl">
                <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight text-balance">
                  {snap.greeting}
                </h2>
                <p className="text-sm sm:text-base text-slate-500">
                  Your items, discounts, and payment total will appear here automatically as they are scanned.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-semibold text-slate-600 pt-2">
                <span>Cash Accepted</span>
                <span aria-hidden="true">·</span>
                <span>{fallbackSettings.qrPayLabel || 'QR Ph / GCash / Maya'} Ready</span>
                <span aria-hidden="true">·</span>
                <span>Wholesale &amp; SC/PWD Supported</span>
              </div>
            </div>
          )}

          {/* 2. SCANNING / ACTIVE BASKET STATE */}
          {snap.status === 'scanning' && (
            <div
              data-testid="customer-display-scanning"
              className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 h-full items-start"
            >
              {/* Itemized List */}
              <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-11rem)]">
                <div className="px-4 sm:px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-emerald-600" />
                    <h2 className="text-sm sm:text-base font-extrabold text-slate-900">Your Basket</h2>
                  </div>
                  <span className="text-xs font-mono-num font-bold text-slate-500">
                    {snap.items.length} line{snap.items.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="overflow-y-auto divide-y divide-slate-100">
                  {snap.items.map((item) => (
                    <div
                      key={item.productId}
                      className="px-4 sm:px-5 py-3 flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm sm:text-base font-bold text-slate-900 truncate">
                          {item.name}
                        </div>
                        <div className="text-xs sm:text-sm font-mono-num text-slate-500 mt-0.5">
                          {formatQty(item.qty, item.unit)} × {formatPeso(item.unitPrice)}
                          {item.priceType === 'wholesale' && (
                            <span className="ml-2 font-sans text-xs font-bold text-indigo-700">
                              · Wholesale Applied
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-base sm:text-lg font-mono-num font-extrabold text-slate-900 shrink-0">
                        {formatPeso(item.lineTotal)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Running Total Panel */}
              <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Order Summary</div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Retail Subtotal</span>
                    <span className="font-mono-num font-semibold">{formatPeso(snap.totals.retailSubtotal)}</span>
                  </div>
                  {snap.totals.wholesaleSavings > 0 && (
                    <div className="flex justify-between text-indigo-700 font-semibold">
                      <span>Wholesale Savings</span>
                      <span className="font-mono-num">−{formatPeso(snap.totals.wholesaleSavings)}</span>
                    </div>
                  )}
                  {snap.totals.seniorDiscount > 0 && (
                    <div className="flex justify-between text-amber-700 font-semibold">
                      <span>SC / PWD 5% Discount</span>
                      <span className="font-mono-num">−{formatPeso(snap.totals.seniorDiscount)}</span>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-200 space-y-1">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Total Due</div>
                  <div
                    data-testid="customer-display-total-due"
                    className="text-3xl sm:text-4xl font-mono-num font-extrabold text-emerald-700"
                  >
                    {formatPeso(snap.totals.grandTotal)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 3. CHECKOUT / INSTANT PAYMENT QR STATE */}
          {snap.status === 'checkout' && snap.checkout && (
            <div
              data-testid="customer-display-checkout"
              className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start"
            >
              {/* Left Recap */}
              <div className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h2 className="text-base font-extrabold text-slate-900">Order Breakdown</h2>
                    <p className="text-xs text-slate-500">
                      {snap.items.length} item{snap.items.length === 1 ? '' : 's'}
                      {snap.checkout.customerName ? ` · Suki: ${snap.checkout.customerName}` : ''}
                    </p>
                  </div>
                  <span className="text-xs font-bold text-slate-700">{snap.checkout.method}</span>
                </div>

                <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 pr-1">
                  {snap.items.map((item) => (
                    <div key={item.productId} className="py-2 flex items-center justify-between gap-3 text-xs sm:text-sm">
                      <span className="text-slate-800 font-medium truncate">
                        {formatQty(item.qty, item.unit)} × {item.name}
                      </span>
                      <span className="font-mono-num font-bold text-slate-900 shrink-0">
                        {formatPeso(item.lineTotal)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-slate-200 pt-3 space-y-1.5 text-xs sm:text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Retail Subtotal</span>
                    <span className="font-mono-num">{formatPeso(snap.totals.retailSubtotal)}</span>
                  </div>
                  {snap.totals.wholesaleSavings > 0 && (
                    <div className="flex justify-between text-indigo-700 font-semibold">
                      <span>Wholesale Savings</span>
                      <span className="font-mono-num">−{formatPeso(snap.totals.wholesaleSavings)}</span>
                    </div>
                  )}
                  {snap.totals.seniorDiscount > 0 && (
                    <div className="flex justify-between text-amber-700 font-semibold">
                      <span>SC / PWD 5% Discount</span>
                      <span className="font-mono-num">−{formatPeso(snap.totals.seniorDiscount)}</span>
                    </div>
                  )}
                  {snap.checkout.pointsDiscount > 0 && (
                    <div className="flex justify-between text-emerald-700 font-semibold">
                      <span>Suki Points Redeemed</span>
                      <span className="font-mono-num">−{formatPeso(snap.checkout.pointsDiscount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-baseline pt-2 border-t border-slate-200">
                    <span className="font-extrabold text-slate-900">Amount Due</span>
                    <span
                      data-testid="customer-display-checkout-due"
                      className="text-2xl sm:text-3xl font-mono-num font-extrabold text-emerald-700"
                    >
                      {formatPeso(snap.checkout.finalDue)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Payment Focus (Dynamic QR or Tendered/Change) */}
              <div className="lg:col-span-6 space-y-4">
                {snap.checkout.showQr ? (
                  <div className="space-y-3">
                    {snap.checkout.method === 'Split' && (
                      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center justify-between text-sm">
                        <span className="font-semibold text-slate-600">
                          Cash Portion Paid: <strong className="font-mono-num text-slate-900">{formatPeso(snap.checkout.splitCash)}</strong>
                        </span>
                        <span className="font-bold text-emerald-700 font-mono-num">
                          Scan {formatPeso(snap.checkout.splitDigital)}
                        </span>
                      </div>
                    )}
                    <MerchantQrCard qr={snap.checkout.qr} size="large" />
                  </div>
                ) : (
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center space-y-5">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                        Please Pay ({snap.checkout.method})
                      </div>
                      <div className="text-4xl sm:text-5xl font-mono-num font-extrabold text-emerald-700 mt-2">
                        {formatPeso(snap.checkout.finalDue)}
                      </div>
                    </div>

                    {snap.checkout.method === 'Cash' && (
                      <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-200 text-left">
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                          <div className="text-[11px] font-semibold text-slate-500">Cash Tendered</div>
                          <div className="text-xl font-mono-num font-extrabold text-slate-900 mt-0.5">
                            {formatPeso(snap.checkout.cashTendered)}
                          </div>
                        </div>
                        <div
                          className={`rounded-xl p-3 border ${
                            snap.checkout.cashChange >= 0
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                              : 'bg-amber-50 border-amber-200 text-amber-900'
                          }`}
                        >
                          <div className="text-[11px] font-semibold">
                            {snap.checkout.cashChange >= 0 ? 'Change Due' : 'Remaining'}
                          </div>
                          <div className="text-xl font-mono-num font-extrabold mt-0.5">
                            {formatPeso(Math.abs(snap.checkout.cashChange))}
                          </div>
                        </div>
                      </div>
                    )}

                    {snap.checkout.method === 'Utang' && (
                      <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm font-semibold text-amber-900">
                        Charging to Suki Utang Account
                        {snap.checkout.customerName ? ` (${snap.checkout.customerName})` : ''}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 4. COMPLETED SALE THANK-YOU STATE */}
          {snap.status === 'completed' && snap.completedSale && (
            <div
              data-testid="customer-display-completed"
              className="h-full min-h-[380px] flex flex-col items-center justify-center text-center bg-white border border-slate-200 rounded-2xl p-6 sm:p-10 space-y-5"
            >
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900">
                  Thank you for shopping!
                </h2>
                <div className="inline-flex items-center gap-2 text-xs sm:text-sm font-mono-num text-slate-500">
                  <Receipt className="w-4 h-4 text-slate-400" />
                  <span>Receipt #{snap.completedSale.receiptNo}</span>
                  <span aria-hidden="true">·</span>
                  <span>Paid via {snap.completedSale.paymentMethod}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-md pt-2">
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                  <div className="text-xs font-semibold text-slate-500">Total Paid</div>
                  <div className="text-2xl font-mono-num font-extrabold text-slate-900 mt-1">
                    {formatPeso(snap.completedSale.grandTotal)}
                  </div>
                </div>
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
                  <div className="text-xs font-semibold text-emerald-800">Change</div>
                  <div className="text-2xl font-mono-num font-extrabold text-emerald-700 mt-1">
                    {formatPeso(snap.completedSale.change)}
                  </div>
                </div>
              </div>

              {snap.completedSale.pointsEarned && snap.completedSale.pointsEarned > 0 ? (
                <div className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700">
                  <Award className="w-4 h-4" />
                  <span>
                    +{snap.completedSale.pointsEarned} Suki loyalty point{snap.completedSale.pointsEarned === 1 ? '' : 's'} earned!
                  </span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Please come again</span>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
