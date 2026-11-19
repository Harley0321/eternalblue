import React, { useEffect, useMemo, useState } from 'react';
import { QrBitmapCard } from '../components/CommonGraphics';
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
  const [splitCashStr, setSplitCashStr] = useState(String(PosMath.round2(cartTotals.grandTotal / 2)));
  const [selectedSukiIdx, setSelectedSukiIdx] = useState(0);
  const [dueDate, setDueDate] = useState(() => PosMath.addDaysYmd(7));

  useEffect(() => {
    if (state.checkoutOpen) {
      setTenderedStr(String(cartTotals.grandTotal));
      setSplitCashStr(String(PosMath.round2(cartTotals.grandTotal / 2)));
      setRefNo('');
    }
  }, [state.checkoutOpen, cartTotals.grandTotal]);

  const resolvedQr = useMemo(
    () => PaymentQr.resolveCheckoutQr(state.settings, cartTotals.grandTotal),
    [state.settings, cartTotals.grandTotal]
  );

  if (!state.checkoutOpen) return null;

  const selectedSuki = state.sukiCustomers[selectedSukiIdx] ?? null;
  const tendered = parseFloat(tenderedStr) || 0;
  const change = Math.max(0, tendered - cartTotals.grandTotal);
  const splitCashParsed = parseFloat(splitCashStr);
  const splitValid =
    Number.isFinite(splitCashParsed) &&
    splitCashParsed >= 0 &&
    splitCashParsed <= cartTotals.grandTotal + 0.001;
  const cashValid = Number.isFinite(tendered) && tendered + 0.001 >= cartTotals.grandTotal;

  const canConfirm =
    method === 'Cash'
      ? cashValid
      : method === 'Split'
      ? splitValid
      : method === 'Utang'
      ? selectedSuki !== null
      : true;

  const handleConfirm = () => {
    const sCash = Number.isFinite(splitCashParsed)
      ? Math.max(0, Math.min(cartTotals.grandTotal, splitCashParsed))
      : 0;
    const sDig = Math.max(0, cartTotals.grandTotal - sCash);
    completeCheckout({
      paymentMethod: method,
      tendered,
      refNo,
      splitCash: sCash,
      splitDigital: sDig,
      customerId: method === 'Utang' ? selectedSuki?.id ?? null : null,
      utangDueDate: dueDate,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden shadow-xl">
        <div className="px-5 pt-5 pb-3 border-b border-[#E2E8F0]">
          <h3 className="font-extrabold text-lg text-[#0F172A] font-mono">
            Checkout · {PosMath.formatPeso(cartTotals.grandTotal)}
          </h3>
        </div>

        <div className="p-5 overflow-y-auto space-y-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {(['Cash', 'GCash', 'Card', 'Split', 'Utang'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border whitespace-nowrap cursor-pointer ${
                  method === m
                    ? 'bg-[#ECFDF5] border-[#059669] text-[#047857]'
                    : 'bg-white border-[#E2E8F0] text-[#64748B]'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {method === 'Cash' && (
            <div className="space-y-2.5">
              <div>
                <label className="text-[11px] font-bold text-[#64748B]">Cash Tendered (₱)</label>
                <input
                  type="number"
                  value={tenderedStr}
                  onChange={(e) => setTenderedStr(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-sm font-mono rounded-xl border border-[#E2E8F0] focus:outline-none focus:border-[#059669]"
                />
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto">
                {[
                  [cartTotals.grandTotal, 'Exact'],
                  [100, '₱100'],
                  [500, '₱500'],
                  [1000, '₱1,000'],
                ].map(([amt, lbl]) => (
                  <button
                    key={String(lbl)}
                    type="button"
                    onClick={() => setTenderedStr(String(amt))}
                    className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] text-[11px] font-bold text-[#0F172A] hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                  >
                    {lbl}
                  </button>
                ))}
              </div>
              <div className="bg-[#ECFDF5] rounded-[10px] p-3 flex items-center justify-between">
                <span className="font-bold text-sm text-[#047857]">Change</span>
                <span className="font-extrabold font-mono text-base text-[#047857]">
                  {PosMath.formatPeso(change)}
                </span>
              </div>
              {!cashValid && (
                <p className="text-[11px] font-semibold text-[#E11D48]">
                  Cash tendered must be at least {PosMath.formatPeso(cartTotals.grandTotal)}
                </p>
              )}
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
                  value={splitCashStr}
                  onChange={(e) => setSplitCashStr(e.target.value)}
                  className={`w-full mt-1 px-3 py-2 text-sm font-mono rounded-xl border ${
                    splitValid ? 'border-[#E2E8F0]' : 'border-[#E11D48]'
                  }`}
                />
              </div>
              {!splitValid && (
                <p className="text-[11px] font-semibold text-[#E11D48]">
                  Cash portion must be between ₱0.00 and {PosMath.formatPeso(cartTotals.grandTotal)}
                </p>
              )}
              <div className="font-bold text-[13px] text-[#4F46E5]">
                Remaining Digital (GCash):{' '}
                {PosMath.formatPeso(
                  Math.max(
                    0,
                    cartTotals.grandTotal -
                      (Number.isFinite(splitCashParsed)
                        ? Math.max(0, Math.min(cartTotals.grandTotal, splitCashParsed))
                        : 0)
                  )
                )}
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
                  No Suki customers yet. Add one under Ops & Suki.
                </p>
              ) : (
                <>
                  <div className="text-xs font-bold text-[#0F172A]">Select Suki Customer:</div>
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                    {state.sukiCustomers.map((c, idx) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedSukiIdx(idx)}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border whitespace-nowrap cursor-pointer ${
                          selectedSukiIdx === idx
                            ? 'bg-[#ECFDF5] border-[#059669] text-[#047857]'
                            : 'bg-white border-[#E2E8F0] text-[#64748B]'
                        }`}
                      >
                        {c.name} ({PosMath.formatPeso(c.balance)})
                      </button>
                    ))}
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-[#64748B]">Due Date (YYYY-MM-DD)</label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full mt-1 px-3 py-2 text-xs rounded-xl border border-[#E2E8F0]"
                    />
                  </div>
                </>
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
